<?php
namespace App\Models;

use App\Database;

class Budget {
    
    public static function getTimeline(int $userId, string $month): array {
        $pdo = Database::getConnection();
        
        $startDate = $month . '-01';
        $endDate = date('Y-m-t', strtotime($startDate));

        // 1. Текущий баланс (реальные деньги на счетах)
        $stmtBal = $pdo->prepare("SELECT COALESCE(SUM(balance), 0) as total_balance FROM accounts WHERE user_id = :uid");
        $stmtBal->execute(['uid' => $userId]);
        $currentBalance = (float)$stmtBal->fetch()['total_balance'];

        // 2. Получаем все транзакции за месяц
        $stmt = $pdo->prepare("
            SELECT t.*, a.name as account_name 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = :uid 
            AND t.transaction_date >= :start 
            AND t.transaction_date <= :end
            ORDER BY t.transaction_date ASC, t.id ASC
        ");
        $stmt->execute([
            'uid' => $userId,
            'start' => $startDate . ' 00:00:00',
            'end' => $endDate . ' 23:59:59'
        ]);
        $transactions = $stmt->fetchAll();

        $timeline = [];
        $runningBalance = $currentBalance;

        foreach ($transactions as $tx) {
            $isFuture = strtotime($tx['transaction_date']) > time() || $tx['status'] === 'planned';
            
            // Получаем позиции для этой транзакции
            $stmtItems = $pdo->prepare("
                SELECT ti.*, c.name as category_name 
                FROM transaction_items ti
                LEFT JOIN categories c ON ti.category_id = c.id
                WHERE ti.transaction_id = :tid
            ");
            $stmtItems->execute(['tid' => $tx['id']]);
            $items = $stmtItems->fetchAll();

            if (!empty($items)) {
                // Если есть детализация, разворачиваем каждую позицию в отдельную строку
                foreach ($items as $item) {
                    $timeline[] = [
                        'id' => $tx['id'],
                        'transaction_date' => $tx['transaction_date'],
                        'counterparty' => $tx['counterparty'],
                        'account_name' => $tx['account_name'],
                        'type' => $tx['type'],
                        'amount' => (float)$item['total_price'], // Сумма позиции
                        'status' => $tx['status'],
                        'category_name' => $item['category_name'] ?? null,
                        'description' => $item['name'], // Название товара
                        'is_future' => $isFuture,
                        'balance_after' => $runningBalance // Временно
                    ];
                }
            } else {
                // Если детализации нет, создаем одну строку из шапки
                $timeline[] = [
                    'id' => $tx['id'],
                    'transaction_date' => $tx['transaction_date'],
                    'counterparty' => $tx['counterparty'],
                    'account_name' => $tx['account_name'],
                    'type' => $tx['type'],
                    'amount' => (float)$tx['amount'],
                    'status' => $tx['status'],
                    'category_name' => null,
                    'description' => $tx['counterparty'] ?: 'Без описания',
                    'is_future' => $isFuture,
                    'balance_after' => $runningBalance
                ];
            }
        }

        // Пересчитываем бегущий баланс
        $runningBalance = $currentBalance;
        
        foreach ($timeline as &$row) {
            if ($row['is_future']) {
                if ($row['type'] === 'income') {
                    $runningBalance += $row['amount'];
                } else {
                    $runningBalance -= $row['amount'];
                }
            }
            // Для фактических операций баланс уже изменен, показываем текущий runningBalance
            $row['balance_after'] = $runningBalance;
        }

        return [
            'month' => $month,
            'start_balance' => $currentBalance,
            'end_balance' => $runningBalance,
            'transactions' => $timeline
        ];
    }
}