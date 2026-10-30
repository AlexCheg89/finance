<?php
namespace App\Controllers;

use App\Response;
use App\Auth;
use App\Database;
use PDO;

class TransactionController {
    
    // GET /api/transactions
    public function index(): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT t.*, a.name as account_name 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = :uid 
            ORDER BY t.transaction_date DESC, t.id DESC
            LIMIT 50
        ");
        $stmt->execute(['uid' => $user['id']]);
        $transactions = $stmt->fetchAll();

        Response::json(['status' => 'ok', 'transactions' => $transactions]);
    }

    // GET /api/transactions/{id}
    public function show(array $params): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $id = (int)$params['id'];
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("
            SELECT t.*, a.name as account_name 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.id = :id AND t.user_id = :uid
        ");
        $stmt->execute(['id' => $id, 'uid' => $user['id']]);
        $transaction = $stmt->fetch();

        if (!$transaction) {
            Response::error('Транзакция не найдена', 404);
        }

        $stmtItems = $pdo->prepare("
            SELECT ti.*, c.name as category_name 
            FROM transaction_items ti
            LEFT JOIN categories c ON ti.category_id = c.id
            WHERE ti.transaction_id = :tid
        ");
        $stmtItems->execute(['tid' => $id]);
        $transaction['items'] = $stmtItems->fetchAll();

        Response::json(['status' => 'ok', 'transaction' => $transaction]);
    }

    // POST /api/transactions
    public function store(): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $data = json_decode(file_get_contents('php://input'), true);
        
        $accountId = $data['account_id'] ?? null;
        $type = $data['type'] ?? 'expense';
        $amount = $data['amount'] ?? 0;
        $counterparty = trim($data['counterparty'] ?? '');
        $date = $data['transaction_date'] ?? date('Y-m-d');
        $time = $data['transaction_time'] ?? date('H:i:s');
        $datetime = $date . ' ' . $time;
        $items = $data['items'] ?? [];

        if (!$accountId || $amount <= 0) {
            Response::error('Укажите счет и сумму больше нуля', 400);
        }

        $pdo = Database::getConnection();

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("
                INSERT INTO transactions (user_id, account_id, type, amount, counterparty, transaction_date, source) 
                VALUES (:uid, :acc, :type, :amount, :counterparty, :date, 'manual')
            ");
            $stmt->execute([
                'uid' => $user['id'],
                'acc' => $accountId,
                'type' => $type,
                'amount' => $amount,
                'counterparty' => $counterparty,
                'date' => $datetime
            ]);
            
            $transactionId = $pdo->lastInsertId();

            if (!empty($items) && is_array($items)) {
                $stmtItem = $pdo->prepare("
                    INSERT INTO transaction_items (transaction_id, category_id, name, quantity, unit_price, total_price) 
                    VALUES (:tid, :cat, :name, :qty, :price, :total)
                ");
                
                foreach ($items as $item) {
                    $stmtItem->execute([
                        'tid' => $transactionId,
                        'cat' => $item['category_id'] ?? null,
                        'name' => $item['name'] ?? 'Без названия',
                        'qty' => $item['quantity'] ?? 1,
                        'price' => $item['unit_price'] ?? 0,
                        'total' => $item['total_price'] ?? 0
                    ]);
                }
            }

            if ($type === 'expense') {
                $updateBalance = $pdo->prepare("UPDATE accounts SET balance = balance - :amount WHERE id = :acc_id AND user_id = :uid");
            } elseif ($type === 'income') {
                $updateBalance = $pdo->prepare("UPDATE accounts SET balance = balance + :amount WHERE id = :acc_id AND user_id = :uid");
            } else {
                $updateBalance = null;
            }

            if ($updateBalance) {
                $updateBalance->execute(['amount' => $amount, 'acc_id' => $accountId, 'uid' => $user['id']]);
            }

            $pdo->commit();
            Response::json(['status' => 'ok', 'id' => $transactionId], 201);

        } catch (\Exception $e) {
            $pdo->rollBack();
            error_log("Transaction Error: " . $e->getMessage());
            Response::error('Ошибка при создании транзакции', 500);
        }
    }

    // POST /api/transactions/{id}/items
    public function addItem(array $params): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $txId = (int)$params['id'];
        $pdo = Database::getConnection();

        // Проверяем, что транзакция не сверена
        $stmt = $pdo->prepare("SELECT amount, is_reconciled FROM transactions WHERE id = :id AND user_id = :uid");
        $stmt->execute(['id' => $txId, 'uid' => $user['id']]);
        $tx = $stmt->fetch();

        if (!$tx) {
            Response::error('Транзакция не найдена', 404);
        }
        if ($tx['is_reconciled']) {
            Response::error('Транзакция уже сверена, редактирование запрещено', 403);
        }

        $stmtSum = $pdo->prepare("SELECT COALESCE(SUM(total_price), 0) as current_sum FROM transaction_items WHERE transaction_id = :tid");
        $stmtSum->execute(['tid' => $txId]);
        $currentSum = (float)$stmtSum->fetch()['current_sum'];

        $data = json_decode(file_get_contents('php://input'), true);
        $name = trim($data['name'] ?? '');
        $unitPrice = (float)($data['unit_price'] ?? 0);
        $quantity = (float)($data['quantity'] ?? 1);
        $totalPrice = $unitPrice * $quantity;
        $categoryId = $data['category_id'] ?? null;

        if (empty($name) || $totalPrice <= 0) {
            Response::error('Укажите название и корректную сумму позиции', 400);
        }

        $remaining = (float)$tx['amount'] - $currentSum;
        if ($totalPrice > $remaining + 0.01) {
            Response::error("Сумма позиции превышает остаток по чеку (" . number_format($remaining, 2) . " руб.)", 400);
        }

        $stmtInsert = $pdo->prepare("
            INSERT INTO transaction_items (transaction_id, category_id, name, quantity, unit_price, total_price)
            VALUES (:tid, :cat, :name, :qty, :price, :total)
        ");
        $stmtInsert->execute([
            'tid' => $txId,
            'cat' => $categoryId,
            'name' => $name,
            'qty' => $quantity,
            'price' => $unitPrice,
            'total' => $totalPrice
        ]);

        Response::json(['status' => 'ok', 'id' => $pdo->lastInsertId()], 201);
    }

    // POST /api/transactions/{id}/reconcile
    public function reconcile(array $params): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);
        
        $id = (int)$params['id'];
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("UPDATE transactions SET is_reconciled = TRUE WHERE id = :id AND user_id = :uid");
        $stmt->execute(['id' => $id, 'uid' => $user['id']]);
        
        Response::json(['status' => 'ok']);
    }

    // DELETE /api/transactions/items/{itemId}
    public function deleteItem(array $params): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $itemId = (int)$params['itemId'];
        $pdo = Database::getConnection();

        // Проверяем, что позиция принадлежит транзакции пользователя и транзакция не сверена
        $stmt = $pdo->prepare("
            SELECT ti.id, t.is_reconciled 
            FROM transaction_items ti
            JOIN transactions t ON ti.transaction_id = t.id
            WHERE ti.id = :item_id AND t.user_id = :uid
        ");
        $stmt->execute(['item_id' => $itemId, 'uid' => $user['id']]);
        $item = $stmt->fetch();

        if (!$item) Response::error('Позиция не найдена', 404);
        
        // Если сверено, проверяем права (пока разрешаем только админу, если добавим роли)
        if ($item['is_reconciled']) {
             // Здесь позже будет проверка: if ($user['role'] !== 'admin') ...
             Response::error('Транзакция сверена, редактирование запрещено', 403);
        }

        $stmtDel = $pdo->prepare("DELETE FROM transaction_items WHERE id = :id");
        $stmtDel->execute(['id' => $itemId]);

        Response::json(['status' => 'ok']);
    }
}