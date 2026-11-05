<?php
namespace App\Models;

use App\Database;

class Budget {
    
    public static function getTimeline(int $userId, string $month): array {
        $pdo = Database::getConnection();
        
        $startDate = $month . '-01';
        $endDate = date('Y-m-t', strtotime($startDate));
        $prevMonthDate = date('Y-m', strtotime($startDate . ' -1 month'));

        // 1. Получаем счета и их начальные балансы
        $stmtAcc = $pdo->prepare("SELECT id, name, initial_balance FROM accounts WHERE user_id = :uid");
        $stmtAcc->execute(['uid' => $userId]);
        $accounts = $stmtAcc->fetchAll();
        
        // Если есть снимок прошлого месяца, берем общий баланс из него (пока не разбиваем снимок по кошелькам)
        $stmtSnap = $pdo->prepare("SELECT total_balance FROM monthly_snapshots WHERE user_id = :uid AND month = :month");
        $stmtSnap->execute(['uid' => $userId, 'month' => $prevMonthDate]);
        $snapshot = $stmtSnap->fetch();

        // Формируем стартовые балансы по кошелькам
        $runningBalances = [];
        $totalStartBalance = 0;
        
        // Пока для простоты берем initial_balance каждого счета. 
        // В будущем, если будет снимок, нужно будет разбивать его по кошелькам.
        foreach ($accounts as $acc) {
            $runningBalances[$acc['id']] = (float)$acc['initial_balance'];
            $totalStartBalance += (float)$acc['initial_balance'];
        }

        // Если есть снимок, используем его как общий стартовый (упрощение)
        if ($snapshot) {
            $totalStartBalance = (float)$snapshot['total_balance'];
            // ВАЖНО: Это упрощение. Правильнее было бы хранить снимок по каждому кошельку.
            // Но пока оставим так, чтобы не усложнять.
        }

        // 2. Получаем транзакции
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
                    $amount = (float)$item['total_price'];
                    
                    // Меняем баланс конкретного кошелька
                    if ($tx['type'] === 'income') {
                        $runningBalances[$tx['account_id']] += $amount;
                    } else {
                        $runningBalances[$tx['account_id']] -= $amount;
                    }

                    // Считаем общий баланс на текущий момент
                    $currentTotal = array_sum($runningBalances);

                    $timeline[] = [
                        'id' => $tx['id'],
                        'account_id' => $tx['account_id'],
                        'is_reconciled' => $tx['is_reconciled'],
                        'transaction_date' => $tx['transaction_date'],
                        'counterparty' => $tx['counterparty'],
                        'account_name' => $tx['account_name'],
                        'type' => $tx['type'],
                        'amount' => $amount,
                        'status' => $tx['status'],
                        'category_name' => $item['category_name'] ?? null,
                        'description' => $item['name'],
                        'is_future' => $isFuture,
                        'balance_after' => $currentTotal, // Общий баланс
                        'account_balances' => $runningBalances // <-- ПЕРЕДАЕМ БАЛАНСЫ ВСЕХ КОШЕЛЬКОВ!
                    ];
                }
            } else {
                $amount = (float)$tx['amount'];
                if ($tx['type'] === 'income') {
                    $runningBalances[$tx['account_id']] += $amount;
                } else {
                    $runningBalances[$tx['account_id']] -= $amount;
                }

                $currentTotal = array_sum($runningBalances);

                $timeline[] = [
                    'id' => $tx['id'],
                    'account_id' => $tx['account_id'],
                    'is_reconciled' => $tx['is_reconciled'],
                    'transaction_date' => $tx['transaction_date'],
                    'counterparty' => $tx['counterparty'],
                    'account_name' => $tx['account_name'],
                    'type' => $tx['type'],
                    'amount' => $amount,
                    'status' => $tx['status'],
                    'category_name' => null,
                    'description' => $tx['counterparty'] ?: 'Без описания',
                    'is_future' => $isFuture,
                    'balance_after' => $currentTotal,
                    'account_balances' => $runningBalances // <-- ПЕРЕДАЕМ БАЛАНСЫ ВСЕХ КОШЕЛЬКОВ!
                ];
            }
        }

        return [
            'month' => $month,
            'start_balance' => $totalStartBalance,
            'end_balance' => array_sum($runningBalances), // Общий итог
            'accounts' => $accounts,
            'transactions' => $timeline
        ];
    }
}