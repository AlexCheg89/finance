<?php
namespace App\Models;

use App\Database;

class Obligation {
    
    private static $config = [
        'alimony' => [
            'child_birth_date' => '2022-05-07',
            'percent' => 25,
            'offset_minutes' => 30,
            'category_id' => 38
        ],
        'enforcement' => [
            'percent' => 50,
            'category_id' => 39,
        ]
    ];

    public static function createAutoDebts(int $userId, array $originalTx): void {
        $counterparty = mb_strtolower($originalTx['counterparty'] ?? '');
        $isSalary = str_contains($counterparty, 'зарплата') || 
                    str_contains($counterparty, 'аванс') || 
                    str_contains($counterparty, 'отпускные');

        if ($originalTx['type'] !== 'income' || !$isSalary) {
            return;
        }

        $amount = (float)$originalTx['amount'];
        $date = $originalTx['parsed_date']; 
        $time = $originalTx['parsed_time'];

        $pdo = Database::getConnection();

        // ==========================================
        // 2. ИСПОЛНИТЕЛЬНЫЕ ЛИСТЫ (50%)
        // ==========================================
        $enforcementAmount = $amount * (self::$config['enforcement']['percent'] / 100);
        
        if ($enforcementAmount > 0) {
            // ВАЖНО: Выбираем все нужные поля (total_amount, paid_amount)
            $stmtDebt = $pdo->prepare("
                SELECT id, total_amount, paid_amount 
                FROM debts 
                WHERE user_id = :uid AND type = 'enforcement' AND parent_id IS NULL 
                LIMIT 1
            ");
            $stmtDebt->execute(['uid' => $userId]);
            $debt = $stmtDebt->fetch();

            if ($debt) {

                // --- ИСПРАВЛЕНИЕ: Считаем сумму ВСЕХ уже созданных плановых удержаний ---
                $stmtPlanned = $pdo->prepare("
                    SELECT COALESCE(SUM(amount), 0) as total_planned 
                    FROM transactions 
                    WHERE user_id = :uid 
                    AND debt_id = :debt_id 
                    AND status = 'planned'
                    AND counterparty LIKE '%Исполнительные листы%'
                ");
                $stmtPlanned->execute(['uid' => $userId, 'debt_id' => $debt['id']]);
                $plannedAmount = (float)$stmtPlanned->fetch()['total_planned'];

                // Остаток = всего - оплачено (факт) - запланировано
                $remainingDebt = (float)$debt['total_amount'] - (float)$debt['paid_amount'] - $plannedAmount;                
                
                if ($remainingDebt > 0) {
                    // Если удержание больше остатка, уменьшаем его до остатка
                    $actualEnforcement = min($enforcementAmount, $remainingDebt);

                    // Сдвигаем время на 1 секунду
                    $enforcementTime = date('H:i:s', strtotime($time . ' +1 second'));
                    $enforcementDateTime = $date . ' ' . $enforcementTime;

                    $enforcementData = [
                        'account_id' => $originalTx['account_id'],
                        'debt_id' => $debt['id'], // <-- ПРИВЯЗКА К СВОДНОМУ ДЕЛУ
                        'type' => 'expense',
                        'amount' => $actualEnforcement,
                        'counterparty' => 'Исполнительные листы (авто)',
                        'transaction_date' => $enforcementDateTime,
                        'has_details' => 0,
                        'status' => 'planned',
                        'items' => [[
                            'name' => 'Удержание по ИП',
                            'category_id' => self::$config['enforcement']['category_id'],
                            'quantity' => 1,
                            'unit_price' => $actualEnforcement,
                            'total_price' => $actualEnforcement
                        ]]
                    ];
                    
                    // Создаем транзакцию. 
                    // paid_amount в таблице debts НЕ обновляем (это делает Debt.php на лету по факту)
                    Transaction::createFull($enforcementData, $userId);
                }
            }
        }

        // ==========================================
        // 3. АЛИМЕНТЫ (25%)
        // ==========================================
        $childBirthDate = new \DateTime(self::$config['alimony']['child_birth_date']);
        $now = new \DateTime($date);
        $age = $now->diff($childBirthDate)->y;
        
        if ($age < 18) {
            $alimonyAmount = $amount * (self::$config['alimony']['percent'] / 100);
            $alimonyTime = date('H:i:s', strtotime($time . ' +30 minutes'));
            $alimonyDateTime = $date . ' ' . $alimonyTime;

            $alimonyData = [
                'account_id' => $originalTx['account_id'],
                'type' => 'expense',
                'amount' => $alimonyAmount,
                'counterparty' => 'Алименты (авто)',
                'transaction_date' => $alimonyDateTime,
                'has_details' => 0,
                'status' => 'planned',
                'items' => [[
                    'name' => 'Алименты',
                    'category_id' => self::$config['alimony']['category_id'],
                    'quantity' => 1,
                    'unit_price' => $alimonyAmount,
                    'total_price' => $alimonyAmount
                ]]
            ];
            Transaction::createFull($alimonyData, $userId);
        }
    }
}