<?php
namespace App\Models;

use App\Database;
use PDO;

class Budget {
    
    public static function getTimeline(int $userId, string $month): array {
        $pdo = Database::getConnection();
        
        $startDate = $month . '-01';
        $endDate = date('Y-m-t', strtotime($startDate));

        // Предыдущий месяц
        $prevMonthDate = date('Y-m', strtotime($startDate . ' -1 month'));

        // 1. Пытаемся взять снимки за предыдущий месяц
        $stmtSnap = $pdo->prepare("SELECT account_id, balance FROM monthly_snapshots WHERE user_id = :uid AND month = :month");
        $stmtSnap->execute(['uid' => $userId, 'month' => $prevMonthDate]);
        $snapshots = $stmtSnap->fetchAll(PDO::FETCH_KEY_PAIR);

        // 2. Получаем список всех счетов
        $stmtAcc = $pdo->prepare("SELECT id, name, balance, initial_balance, created_at FROM accounts WHERE user_id = :uid");
        $stmtAcc->execute(['uid' => $userId]);
        $accounts = $stmtAcc->fetchAll();

        // 2.1. Получаем сумму ВСЕХ транзакций до начала текущего месяца (и факт, и план)
        // Это нужно для "виртуального закрытия" прошлых месяцев, если снимка нет
        $stmtPastTx = $pdo->prepare("
            SELECT account_id, 
                   SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as past_income,
                   SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as past_expense
            FROM transactions 
            WHERE user_id = :uid 
            AND transaction_date < :start
            GROUP BY account_id
        ");
        $stmtPastTx->execute([
            'uid' => $userId,
            'start' => $startDate . ' 00:00:00'
        ]);
        $pastSums = $stmtPastTx->fetchAll(PDO::FETCH_GROUP | PDO::FETCH_ASSOC);

        $runningBalances = [];
        $totalStartBalance = 0;

        foreach ($accounts as $acc) {
            // ПРОВЕРКА: Если кошелек создан позже начала запрашиваемого месяца, 
            // то в этом месяце его баланс = 0 (он еще не существовал)
            if (date('Y-m-d', strtotime($acc['created_at'])) > $startDate) {
                $runningBalances[$acc['id']] = 0;
                continue; 
            }

            // 1. Если есть снимок за прошлый месяц — берем его
            if (isset($snapshots[$acc['id']])) {
                $startBal = (float)$snapshots[$acc['id']];
            } 
            // 2. Если снимка нет — восстанавливаем баланс
            else {
                $startBal = (float)$acc['initial_balance'];
                
                // Прибавляем/вычитаем все транзакции, которые были ДО текущего месяца
                if (isset($pastSums[$acc['id']])) {
                    $pastIncome = (float)($pastSums[$acc['id']][0]['past_income'] ?? 0);
                    $pastExpense = (float)($pastSums[$acc['id']][0]['past_expense'] ?? 0);
                    $startBal = $startBal + $pastIncome - $pastExpense;
                }
            }

            $runningBalances[$acc['id']] = $startBal;
            $totalStartBalance += $startBal;
        }

        // 3. Получаем транзакции за месяц
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
            
            // Пропускаем переводы — они не влияют на общий баланс
            if ($tx['transfer_peer_id'] !== null) {
                continue;
            }

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
                        'balance_after' => $currentTotal,
                        'account_balances' => $runningBalances
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
                    'account_balances' => $runningBalances
                ];
            }
        }

        return [
            'month' => $month,
            'start_balance' => $totalStartBalance,
            'end_balance' => array_sum($runningBalances),
            'accounts' => $accounts,
            'final_balances' => $runningBalances,
            'transactions' => $timeline
        ];
    }
}