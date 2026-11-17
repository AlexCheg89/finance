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

        // 2. Считаем РЕАЛЬНО выплаченные суммы (только факт) по каждому долгу
        // (Связываем транзакции с долгами через debt_id)
        $stmtPaid = $instance->db->prepare("
            SELECT debt_id, SUM(amount) as total_paid 
            FROM transactions 
            WHERE user_id = :uid 
            AND status = 'actual' 
            AND debt_id IS NOT NULL
            GROUP BY debt_id
        ");
        $stmtPaid->execute(['uid' => $userId]);
        $paidMap = $stmtPaid->fetchAll(PDO::FETCH_KEY_PAIR);

        // 3. Считаем ПЛАНОВЫЕ суммы по каждому долгу (для отображения)
        $stmtPlanned = $instance->db->prepare("
            SELECT debt_id, SUM(amount) as total_planned 
            FROM transactions 
            WHERE user_id = :uid 
            AND status = 'planned' 
            AND debt_id IS NOT NULL
            GROUP BY debt_id
        ");
        $stmtPlanned->execute(['uid' => $userId]);
        $plannedMap = $stmtPlanned->fetchAll(PDO::FETCH_KEY_PAIR);

        $tree = [];
        $children = [];

        foreach ($all as $debt) {
            // Подставляем актуальные суммы
            $debt['paid_amount'] = (float)($paidMap[$debt['id']] ?? 0); // Реальный факт
            $debt['planned_amount'] = (float)($plannedMap[$debt['id']] ?? 0); // План

            if ($debt['parent_id'] === null) {
                $tree[] = $debt;
            } else {
                $children[$debt['parent_id']][] = $debt;
            }
        }

        foreach ($tree as &$parent) {
            $parent['children'] = $children[$parent['id']] ?? [];
        }

        return $tree;
    }

    public static function getWithTransactions(int $id, int $userId): ?array {
        $instance = new static();
        $debt = self::find($id);
        
        if (!$debt || $debt['user_id'] !== $userId) return null;

        // Получаем транзакции, привязанные к этому долгу
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
}