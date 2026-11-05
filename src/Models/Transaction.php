<?php
namespace App\Models;

use App\Database;
use PDO;

class Transaction extends Model {
    protected static string $table = 'transactions';

    // Получить список транзакций (с позициями)
    public static function getByUser(int $userId): array {
        $instance = new static();
        $stmt = $instance->db->prepare("
            SELECT t.*, a.name as account_name 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = :uid 
            ORDER BY t.transaction_date DESC, t.id DESC
            LIMIT 50
        ");
        $stmt->execute(['uid' => $userId]);
        $transactions = $stmt->fetchAll();

        if (empty($transactions)) return [];

        $txIds = array_column($transactions, 'id');
        $inQuery = implode(',', array_fill(0, count($txIds), '?'));
        $stmtItems = $instance->db->prepare("
            SELECT ti.*, c.name as category_name 
            FROM transaction_items ti
            LEFT JOIN categories c ON ti.category_id = c.id
            WHERE ti.transaction_id IN ($inQuery)
        ");
        $stmtItems->execute($txIds);
        $items = $stmtItems->fetchAll();

        $itemsByTx = [];
        foreach ($items as $item) {
            $itemsByTx[$item['transaction_id']][] = $item;
        }
        foreach ($transactions as &$tx) {
            $tx['items'] = $itemsByTx[$tx['id']] ?? [];
        }

        return $transactions;
    }

    // Получить одну транзакцию с позициями
    public static function findWithItems(int $id, int $userId): ?array {
        $instance = new static();
        $stmt = $instance->db->prepare("SELECT t.*, a.name as account_name FROM transactions t JOIN accounts a ON t.account_id = a.id WHERE t.id = :id AND t.user_id = :uid");
        $stmt->execute(['id' => $id, 'uid' => $userId]);
        $tx = $stmt->fetch();

        if (!$tx) return null;

        $stmtItems = $instance->db->prepare("SELECT ti.*, c.name as category_name FROM transaction_items ti LEFT JOIN categories c ON ti.category_id = c.id WHERE ti.transaction_id = :tid");
        $stmtItems->execute(['tid' => $id]);
        $tx['items'] = $stmtItems->fetchAll();

        return $tx;
    }

    // Создать транзакцию (с позициями и обновлением баланса)
    public static function createFull(array $data, int $userId): int {
        $instance = new static();
        $pdo = $instance->db;
        
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                INSERT INTO transactions (user_id, account_id, type, amount, counterparty, transaction_date, source, has_details, status) 
                VALUES (:uid, :acc, :type, :amount, :counterparty, :date, 'manual', :has_details, :status)
            ");
            $stmt->execute([
                'uid' => $userId, 'acc' => $data['account_id'], 'type' => $data['type'],
                'amount' => $data['amount'], 'counterparty' => $data['counterparty'], 
                'date' => $data['transaction_date'],
                'has_details' => $data['has_details'] ?? 1, 'status' => $data['status'] ?? 'actual'
            ]);
            
            $transactionId = $pdo->lastInsertId();

            if (!empty($data['items']) && is_array($data['items'])) {
                $stmtItem = $pdo->prepare("INSERT INTO transaction_items (transaction_id, category_id, name, quantity, unit_price, total_price) VALUES (:tid, :cat, :name, :qty, :price, :total)");
                foreach ($data['items'] as $item) {
                    $stmtItem->execute([
                        'tid' => $transactionId, 'cat' => $item['category_id'] ?? null,
                        'name' => $item['name'] ?? 'Без названия', 'qty' => $item['quantity'] ?? 1,
                        'price' => $item['unit_price'] ?? 0, 'total' => $item['total_price'] ?? 0
                    ]);
                }
            }

            if (($data['status'] ?? 'actual') === 'actual') {
                $updateBalance = $pdo->prepare($data['type'] === 'expense' 
                    ? "UPDATE accounts SET balance = balance - :amount WHERE id = :acc_id AND user_id = :uid"
                    : "UPDATE accounts SET balance = balance + :amount WHERE id = :acc_id AND user_id = :uid");
                $updateBalance->execute(['amount' => $data['amount'], 'acc_id' => $data['account_id'], 'uid' => $userId]);
            }

            $pdo->commit();
            return $transactionId;
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    // Добавить позицию к транзакции
    public static function addItem(int $txId, array $itemData): int {
        $instance = new static();
        $stmt = $instance->db->prepare("INSERT INTO transaction_items (transaction_id, category_id, name, quantity, unit_price, total_price) VALUES (:tid, :cat, :name, :qty, :price, :total)");
        $stmt->execute([
            'tid' => $txId, 'cat' => $itemData['category_id'] ?? null,
            'name' => $itemData['name'], 'qty' => $itemData['quantity'],
            'price' => $itemData['unit_price'], 'total' => $itemData['total_price']
        ]);
        return (int)$instance->db->lastInsertId();
    }

    // Удалить позицию
    public static function deleteItem(int $itemId): void {
        $instance = new static();
        $instance->db->prepare("DELETE FROM transaction_items WHERE id = :id")->execute(['id' => $itemId]);
    }

    // Обновить флаг детализации (и пересобрать позиции)
    public static function toggleDetails(int $txId, bool $hasDetails, float $amount): void {
        $instance = new static();
        $pdo = $instance->db;
        
        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE transactions SET has_details = :hd WHERE id = :id")->execute(['hd' => (int)$hasDetails, 'id' => $txId]);
            
            if (!$hasDetails) {
                $pdo->prepare("DELETE FROM transaction_items WHERE transaction_id = :id")->execute(['id' => $txId]);
                $stmtIns = $pdo->prepare("INSERT INTO transaction_items (transaction_id, name, quantity, unit_price, total_price) VALUES (:id, 'Основная сумма', 1, :amount, :amount)");
                $stmtIns->execute(['id' => $txId, 'amount' => $amount]);
            }
            $pdo->commit();
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    // Обновить транзакцию с учетом смены статуса и баланса
    public static function updateTransaction(int $id, array $data, int $userId): void {
        $instance = new static();
        $pdo = $instance->db;
        
        $oldTx = self::find($id);
        if (!$oldTx || $oldTx['user_id'] !== $userId) return;

        $oldStatus = $oldTx['status'];
        $newStatus = $data['status'] ?? $oldStatus;
        $oldAmount = (float)$oldTx['amount'];
        $newAmount = (float)($data['amount'] ?? $oldAmount);
        
        $datetime = ($data['transaction_date'] ?? date('Y-m-d')) . ' ' . ($data['transaction_time'] ?? '00:00:00');

        $pdo->beginTransaction();
        try {
            // 1. Обновляем саму транзакцию
            $stmtUpd = $pdo->prepare("
                UPDATE transactions 
                SET amount = :amount, counterparty = :counterparty, transaction_date = :date, status = :status 
                WHERE id = :id
            ");
            $stmtUpd->execute([
                'amount' => $newAmount,
                'counterparty' => trim($data['counterparty'] ?? ''),
                'date' => $datetime,
                'status' => $newStatus,
                'id' => $id
            ]);

            // 2. Корректируем баланс счета
            // Если статус был planned, а стал actual (или наоборот), или изменилась сумма у actual
            if ($oldStatus === 'planned' && $newStatus === 'actual') {
                // Списываем/прибавляем новую сумму
                $balStmt = $pdo->prepare($oldTx['type'] === 'expense' 
                    ? "UPDATE accounts SET balance = balance - :amount WHERE id = :acc" 
                    : "UPDATE accounts SET balance = balance + :amount WHERE id = :acc");
                $balStmt->execute(['amount' => $newAmount, 'acc' => $oldTx['account_id']]);
            } 
            elseif ($oldStatus === 'actual' && $newStatus === 'planned') {
                // Возвращаем старую сумму обратно
                $balStmt = $pdo->prepare($oldTx['type'] === 'expense' 
                    ? "UPDATE accounts SET balance = balance + :amount WHERE id = :acc" 
                    : "UPDATE accounts SET balance = balance - :amount WHERE id = :acc");
                $balStmt->execute(['amount' => $oldAmount, 'acc' => $oldTx['account_id']]);
            }
            elseif ($oldStatus === 'actual' && $newStatus === 'actual' && $oldAmount !== $newAmount) {
                // Если просто изменили сумму факта
                $diff = $newAmount - $oldAmount;
                $balStmt = $pdo->prepare($oldTx['type'] === 'expense' 
                    ? "UPDATE accounts SET balance = balance - :diff WHERE id = :acc" 
                    : "UPDATE accounts SET balance = balance + :diff WHERE id = :acc");
                $balStmt->execute(['diff' => $diff, 'acc' => $oldTx['account_id']]);
            }

            $pdo->commit();
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}