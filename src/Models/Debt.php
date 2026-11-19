<?php
namespace App\Models;

use App\Database;
use PDO;

class Debt extends Model {
    protected static string $table = 'debts';

    public static function getTree(int $userId): array {
        $instance = new static();
        
        // 1. Получаем все долги
        $stmt = $instance->db->prepare("
            SELECT d.*, c.name as category_name 
            FROM debts d
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE d.user_id = :uid
            ORDER BY d.type ASC, d.name ASC
        ");
        $stmt->execute(['uid' => $userId]);
        $all = $stmt->fetchAll();

        // 2. Считаем РЕАЛЬНО выплаченные суммы (только факт)
        $stmtPaid = $instance->db->prepare("
            SELECT 
                d.id,
                COALESCE(SUM(CASE WHEN t.status = 'actual' THEN t.amount ELSE 0 END), 0) as direct_paid,
                COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp JOIN transactions t2 ON dp.transaction_id = t2.id WHERE dp.debt_id = d.id AND t2.status = 'actual'), 0) as distributed_paid
            FROM debts d
            LEFT JOIN transactions t ON t.debt_id = d.id
            WHERE d.user_id = :uid
            GROUP BY d.id
        ");
        $stmtPaid->execute(['uid' => $userId]);
        $paidMap = [];
        foreach ($stmtPaid->fetchAll() as $row) {
            $paidMap[$row['id']] = (float)$row['direct_paid'] + (float)$row['distributed_paid'];
        }

        // 3. Считаем ПЛАНОВЫЕ суммы
        $stmtPlanned = $instance->db->prepare("
            SELECT 
                d.id,
                COALESCE(SUM(CASE WHEN t.status = 'planned' THEN t.amount ELSE 0 END), 0) as direct_planned,
                COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp JOIN transactions t2 ON dp.transaction_id = t2.id WHERE dp.debt_id = d.id AND t2.status = 'planned'), 0) as distributed_planned
            FROM debts d
            LEFT JOIN transactions t ON t.debt_id = d.id
            WHERE d.user_id = :uid
            GROUP BY d.id
        ");
        $stmtPlanned->execute(['uid' => $userId]);
        $plannedMap = [];
        foreach ($stmtPlanned->fetchAll() as $row) {
            $plannedMap[$row['id']] = (float)$row['direct_planned'] + (float)$row['distributed_planned'];
        }

        $tree = [];
        $children = [];

        foreach ($all as $debt) {
            $debt['paid_amount'] = (float)($paidMap[$debt['id']] ?? 0);
            $debt['planned_amount'] = (float)($plannedMap[$debt['id']] ?? 0);

            if ($debt['parent_id'] === null) {
                $tree[] = $debt;
            } else {
                $children[$debt['parent_id']][] = $debt;
            }
        }

        // 4. Пересчитываем суммы для родительских долгов
        foreach ($tree as &$parent) {
            if (!empty($children[$parent['id']])) {
                $sumPrincipal = 0;
                $sumFee = 0;
                $sumTotal = 0;
                $sumPaid = 0;
                $sumPlanned = 0;

                foreach ($children[$parent['id']] as $child) {
                    $sumPrincipal += (float)$child['principal_amount'];
                    $sumFee += (float)$child['fee_amount'];
                    $sumTotal += (float)$child['total_amount'];
                    $sumPaid += (float)$child['paid_amount'];
                    $sumPlanned += (float)$child['planned_amount'];
                }

                $parent['principal_amount'] = $sumPrincipal;
                $parent['fee_amount'] = $sumFee;
                $parent['total_amount'] = $sumTotal;
                $parent['paid_amount'] = $sumPaid;
                $parent['planned_amount'] = $sumPlanned;
            }
            
            $parent['children'] = $children[$parent['id']] ?? [];
        }

        return $tree;
    }

    public static function getWithTransactions(int $id, int $userId): ?array {
        $instance = new static();
        $debt = self::find($id);
        
        if (!$debt || $debt['user_id'] !== $userId) return null;

        // Считаем ФАКТ по этому долгу
        $stmtPaid = $instance->db->prepare("
            SELECT 
                COALESCE(SUM(CASE WHEN t.status = 'actual' THEN t.amount ELSE 0 END), 0) as direct_paid,
                COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp JOIN transactions t2 ON dp.transaction_id = t2.id WHERE dp.debt_id = :id_inner AND t2.status = 'actual'), 0) as distributed_paid
            FROM transactions t
            WHERE t.debt_id = :id_outer AND t.user_id = :uid_paid
        ");
        $stmtPaid->execute([
            'id_inner' => $id,
            'id_outer' => $id,
            'uid_paid' => $userId
        ]);
        $paidRow = $stmtPaid->fetch();
        $debt['paid_amount'] = (float)$paidRow['direct_paid'] + (float)$paidRow['distributed_paid'];

        // Считаем ПЛАН по этому долгу
        $stmtPlanned = $instance->db->prepare("
            SELECT 
                COALESCE(SUM(CASE WHEN t.status = 'planned' THEN t.amount ELSE 0 END), 0) as direct_planned,
                COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp JOIN transactions t2 ON dp.transaction_id = t2.id WHERE dp.debt_id = :id_inner AND t2.status = 'planned'), 0) as distributed_planned
            FROM transactions t
            WHERE t.debt_id = :id_outer AND t.user_id = :uid_planned
        ");
        $stmtPlanned->execute([
            'id_inner' => $id,
            'id_outer' => $id,
            'uid_planned' => $userId
        ]);
        $plannedRow = $stmtPlanned->fetch();
        $debt['planned_amount'] = (float)$plannedRow['direct_planned'] + (float)$plannedRow['distributed_planned'];

        // Получаем транзакции
        $stmt = $instance->db->prepare("
            SELECT * FROM transactions 
            WHERE debt_id = :debt_id 
            AND user_id = :uid
            ORDER BY transaction_date ASC
        ");
        $stmt->execute(['debt_id' => $id, 'uid' => $userId]);
        $debt['transactions'] = $stmt->fetchAll();

        return $debt;
    }

    // Автоматическое распределение старых транзакций по дочерним листам
    public static function fixOldPayments(int $userId): array {
        $instance = new static();
        $pdo = $instance->db;
        
        // 1. Находим Сводное дело
        $stmtParent = $pdo->prepare("
            SELECT id FROM debts 
            WHERE user_id = :uid AND type = 'enforcement' AND parent_id IS NULL 
            LIMIT 1
        ");
        $stmtParent->execute(['uid' => $userId]);
        $parent = $stmtParent->fetch();
        
        if (!$parent) return ['message' => 'Сводное дело не найдено'];
        
        $parentId = $parent['id'];

        // 2. Находим дочерние листы
        $stmtChildren = $pdo->prepare("
            SELECT id, total_amount 
            FROM debts 
            WHERE parent_id = :parent_id AND user_id = :uid
        ");
        $stmtChildren->execute(['parent_id' => $parentId, 'uid' => $userId]);
        $children = $stmtChildren->fetchAll();

        if (empty($children)) return ['message' => 'Нет дочерних листов'];

        // 3. Находим транзакции с debt_id = parentId, у которых нет записей в debt_payments
        // Учитываем и actual, и planned (чтобы распределить и планы тоже)
        $stmtTx = $pdo->prepare("
            SELECT t.id, t.amount 
            FROM transactions t
            LEFT JOIN debt_payments dp ON dp.transaction_id = t.id
            WHERE t.user_id = :uid 
            AND t.debt_id = :parent_id
            AND dp.id IS NULL
        ");
        $stmtTx->execute(['uid' => $userId, 'parent_id' => $parentId]);
        $transactions = $stmtTx->fetchAll();

        if (empty($transactions)) return ['message' => 'Нет новых транзакций для распределения'];

        // 4. Распределяем каждую транзакцию пропорционально остаткам детей
        $count = 0;
        $stmtIns = $pdo->prepare("
            INSERT INTO debt_payments (transaction_id, debt_id, amount) 
            VALUES (:tx_id, :debt_id, :amount)
        ");

        foreach ($transactions as $tx) {
            // Считаем общий остаток по всем детям (по total_amount, так как paid_amount может быть 0)
            $totalRemaining = 0;
            foreach ($children as $child) {
                $totalRemaining += (float)$child['total_amount'];
            }

            if ($totalRemaining > 0) {
                foreach ($children as $child) {
                    $childRemaining = (float)$child['total_amount'];
                    $share = ($childRemaining / $totalRemaining) * (float)$tx['amount'];
                    
                    if ($share > 0) {
                        $stmtIns->execute([
                            'tx_id' => $tx['id'],
                            'debt_id' => $child['id'],
                            'amount' => $share
                        ]);
                    }
                }
                $count++;
            }
        }

        return ['message' => "Распределено транзакций: $count"];
    }

    public static function reducePrincipal(int $debtId, float $amount): void {
        $instance = new static();
        $stmt = $instance->db->prepare("
            UPDATE debts 
            SET principal_amount = GREATEST(0, principal_amount - :amount) 
            WHERE id = :id
        ");
        $stmt->execute(['amount' => $amount, 'id' => $debtId]);
    }
}