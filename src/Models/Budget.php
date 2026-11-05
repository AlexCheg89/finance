<?php
namespace App\Models;

use App\Database;

class Budget {
    
    public static function getTimeline(int $userId, string $month): array {
        $pdo = Database::getConnection();
        
        $startDate = $month . '-01';
        $endDate = date('Y-m-t', strtotime($startDate));
        
        // Вычисляем предыдущий месяц
        $prevMonthDate = date('Y-m', strtotime($startDate . ' -1 month'));

        // 1. Пытаемся взять баланс из снимка предыдущего месяца
        $stmtSnap = $pdo->prepare("SELECT total_balance FROM monthly_snapshots WHERE user_id = :uid AND month = :month");
        $stmtSnap->execute(['uid' => $userId, 'month' => $prevMonthDate]);
        $snapshot = $stmtSnap->fetch();

        if ($snapshot) {
            $startBalance = (float)$snapshot['total_balance'];
        } else {
            // Если снимка нет (например, это первый месяц), берем initial_balance всех счетов
            $stmtInit = $pdo->prepare("SELECT COALESCE(SUM(initial_balance), 0) as total FROM accounts WHERE user_id = :uid");
            $stmtInit->execute(['uid' => $userId]);
            $startBalance = (float)$stmtInit->fetch()['total'];
        }

        // 2. Получаем транзакции за месяц
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
        $runningBalance = $startBalance;

        foreach ($transactions as $tx) {
            $isFuture = strtotime($tx['transaction_date']) > time() || $tx['status'] === 'planned';
            
            // Получаем позиции
            $stmtItems = $pdo->prepare("
                SELECT ti.*, c.name as category_name 
                FROM transaction_items ti
                LEFT JOIN categories c ON ti.category_id = c.id
                WHERE ti.transaction_id = :tid
            ");
            $stmtItems->execute(['tid' => $tx['id']]);
            $items = $stmtItems->fetchAll();

            if (!empty($items)) {
                foreach ($items as $item) {
                    // Меняем баланс
                    if ($tx['type'] === 'income') {
                        $runningBalance += (float)$item['total_price'];
                    } else {
                        $runningBalance -= (float)$item['total_price'];
                    }

                    $timeline[] = [
                        'id' => $tx['id'], // <-- ДОБАВЛЕНО
                        'is_reconciled' => $tx['is_reconciled'], // <-- ДОБАВЛЕНО
                        'transaction_date' => $tx['transaction_date'],
                        'counterparty' => $tx['counterparty'],
                        'account_name' => $tx['account_name'],
                        'type' => $tx['type'],
                        'amount' => (float)$item['total_price'],
                        'status' => $tx['status'],
                        'category_name' => $item['category_name'] ?? null,
                        'description' => $item['name'],
                        'is_future' => $isFuture,
                        'balance_after' => $runningBalance
                    ];
                }
            } else {
                if ($tx['type'] === 'income') {
                    $runningBalance += (float)$tx['amount'];
                } else {
                    $runningBalance -= (float)$tx['amount'];
                }

                $timeline[] = [
                    'id' => $tx['id'], // <-- ДОБАВЛЕНО
                    'is_reconciled' => $tx['is_reconciled'],
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

        return [
            'month' => $month,
            'start_balance' => $startBalance,
            'end_balance' => $runningBalance,
            'transactions' => $timeline
        ];
    }
}