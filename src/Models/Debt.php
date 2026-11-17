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

        // 3. Считаем ПЛАНОВЫЕ суммы по каждому долгу
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
            $debt['paid_amount'] = (float)($paidMap[$debt['id']] ?? 0);
            $debt['planned_amount'] = (float)($plannedMap[$debt['id']] ?? 0);

            if ($debt['parent_id'] === null) {
                $tree[] = $debt;
            } else {
                $children[$debt['parent_id']][] = $debt;
            }
        }

        // 4. Пересчитываем суммы для родительских долгов (Сводных дел)
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

                // Подменяем суммы родителя на суммы детей
                $parent['principal_amount'] = $sumPrincipal;
                $parent['fee_amount'] = $sumFee;
                $parent['total_amount'] = $sumTotal;
                $parent['paid_amount'] = $sumPaid;
                $parent['planned_amount'] = $sumPlanned;
            }
            
            // Прикрепляем детей
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