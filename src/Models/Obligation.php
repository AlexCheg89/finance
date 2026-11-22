<?php
namespace App\Models;

use App\Database;

class Obligation {

    // Вспомогательный метод для получения конфигурации пользователя из БД
    private static function getUserConfig(int $userId): array {
        $settings = Setting::getAll($userId);

        $keywordsRaw = $settings['obligation_income_keywords'] ?? 'зарплата,аванс,отпускные';
        $keywords = array_filter(array_map(
            fn($w) => mb_strtolower(trim($w)),
            explode(',', $keywordsRaw)
        ));

        return [
            'keywords' => $keywords,
            'alimony' => [
                'child_birth_date' => $settings['alimony_child_birth_date'] ?? null,
                'percent'          => (float)($settings['alimony_percent'] ?? 0),
                'offset_minutes'   => (int)($settings['alimony_offset_minutes'] ?? 30),
                'category_id'      => !empty($settings['alimony_category_id']) ? (int)$settings['alimony_category_id'] : null,
            ],
            'enforcement' => [
                'percent'     => (float)($settings['enforcement_percent'] ?? 0),
                'category_id' => !empty($settings['enforcement_category_id']) ? (int)$settings['enforcement_category_id'] : null,
            ]
        ];
    }

    // Проверка попадает ли под ключевые слова в контрагенте
    private static function isEligibleIncome(array $tx, array $keywords): bool {
        if (($tx['type'] ?? '') !== 'income' || empty($keywords)) {
            return false;
        }

        $counterparty = mb_strtolower(trim($tx['counterparty'] ?? ''));
        if ($counterparty === '') {
            return false;
        }

        foreach ($keywords as $word) {
            if (str_contains($counterparty, $word)) {
                return true;
            }
        }

        return false;
    }

        public static function createAutoDebts(int $userId, array $originalTx): void {
        $config = self::getUserConfig($userId);

        if (!self::isEligibleIncome($originalTx, $config['keywords'])) {
            return;
        }

        $amount = (float)$originalTx['amount'];
        $date = $originalTx['parsed_date']; 
        $time = $originalTx['parsed_time'];

        $pdo = Database::getConnection();

        // ==========================================
        // 1. ИСПОЛНИТЕЛЬНЫЕ ЛИСТЫ
        // ==========================================
        $enfPercent = $config['enforcement']['percent'];
        $enforcementAmount = $amount * ($enfPercent / 100);
        
        if ($enforcementAmount > 0) {
            $stmtDebt = $pdo->prepare("
                SELECT id, total_amount, paid_amount 
                FROM debts 
                WHERE user_id = :uid 
                  AND type = 'enforcement' 
                  AND parent_id IS NULL 
                  AND actual_close_date IS NULL
                LIMIT 1
            ");
            $stmtDebt->execute(['uid' => $userId]);
            $debt = $stmtDebt->fetch();

            if ($debt) {
                // Считаем сумму всех уже созданных плановых удержаний (чтобы не превысить остаток)
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

                $remainingDebt = (float)$debt['total_amount'] - (float)$debt['paid_amount'] - $plannedAmount;                
                
                if ($remainingDebt > 0) {
                    $actualEnforcement = min($enforcementAmount, $remainingDebt);
                    $enforcementTime = date('H:i:s', strtotime($time . ' +1 second'));
                    $enforcementDateTime = $date . ' ' . $enforcementTime;

                    $enforcementData = [
                        'account_id' => $originalTx['account_id'],
                        'debt_id' => $debt['id'],
                        'type' => 'expense',
                        'amount' => $actualEnforcement,
                        'counterparty' => 'Исполнительные листы (авто)',
                        'transaction_date' => $enforcementDateTime,
                        'has_details' => 0,
                        'status' => 'planned',
                        'debt_payment_status' => 'pending',
                        'items' => [[
                            'name' => 'Удержание по ИП',
                            'category_id' => $config['enforcement']['category_id'],
                            'quantity' => 1,
                            'unit_price' => $actualEnforcement,
                            'total_price' => $actualEnforcement
                        ]]
                    ];
                    
                    $txId = Transaction::createFull($enforcementData, $userId);

                    // --- РАСПРЕДЕЛЕНИЕ ПО ДОЧЕРНИМ ЛИСТАМ (ПЛАНОВОЕ) ---
                    $stmtChildren = $pdo->prepare("
                        SELECT id, total_amount, principal_amount, fee_amount, paid_amount 
                        FROM debts 
                        WHERE parent_id = :parent_id AND user_id = :uid
                    ");
                    $stmtChildren->execute(['parent_id' => $debt['id'], 'uid' => $userId]);
                    $children = $stmtChildren->fetchAll();

                    if (!empty($children)) {
                        $totalRemaining = 0;
                        foreach ($children as $child) {
                            $totalRemaining += (float)$child['total_amount'] - (float)$child['paid_amount'];
                        }

                        if ($totalRemaining > 0) {
                            $stmtIns = $pdo->prepare("
                                INSERT INTO debt_payments (transaction_id, debt_id, amount, principal_amount, fee_amount, is_planned) 
                                VALUES (:tx_id, :debt_id, :amount, :principal, :fee, 1)
                            ");

                            foreach ($children as $child) {
                                $childRemaining = (float)$child['total_amount'] - (float)$child['paid_amount'];
                                $share = ($childRemaining / $totalRemaining) * $actualEnforcement;

                                $childPrincipal = (float)$child['principal_amount'];
                                $childFee = (float)$child['fee_amount'];
                                $childTotal = $childPrincipal + $childFee;

                                $sharePrincipal = 0;
                                $shareFee = 0;
                                
                                if ($childTotal > 0) {
                                    $sharePrincipal = ($childPrincipal / $childTotal) * $share;
                                    $shareFee = ($childFee / $childTotal) * $share;
                                }

                                if ($share > 0) {
                                    $stmtIns->execute([
                                        'tx_id' => $txId,
                                        'debt_id' => $child['id'],
                                        'amount' => $share,
                                        'principal' => $sharePrincipal,
                                        'fee' => $shareFee
                                    ]);
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================
        // 2. АЛИМЕНТЫ
        // ==========================================
        $birthDateStr = $config['alimony']['child_birth_date'];
        $alimonyPercent = $config['alimony']['percent'];

        if ($birthDateStr && $alimonyPercent > 0) {
            $childBirthDate = new \DateTime($birthDateStr);
            $now = new \DateTime($date);
            $age = $now->diff($childBirthDate)->y;
            
            if ($age < 18) {
                $alimonyAmount = $amount * ($alimonyPercent / 100);
                $offset = $config['alimony']['offset_minutes'];
                $alimonyTime = date('H:i:s', strtotime($time . " +{$offset} minutes"));
                $alimonyDateTime = $date . ' ' . $alimonyTime;

                $alimonyData = [
                    'account_id' => $originalTx['account_id'],
                    'type' => 'expense',
                    'amount' => $alimonyAmount,
                    'counterparty' => 'Алименты (авто)',
                    'transaction_date' => $alimonyDateTime,
                    'has_details' => 0,
                    'status' => 'planned',
                    'debt_payment_status' => 'none',
                    'items' => [[
                        'name' => 'Алименты',
                        'category_id' => $config['alimony']['category_id'],
                        'quantity' => 1,
                        'unit_price' => $alimonyAmount,
                        'total_price' => $alimonyAmount
                    ]]
                ];
                Transaction::createFull($alimonyData, $userId);
            }
        }
    }

    // Пересчет обязательств при изменении суммы официального дохода
    public static function recalculateDebts(int $userId, array $originalTx): void {
        $config = self::getUserConfig($userId);

        // Игнорируем неофициальные доходы (например, "Конверт")
        if (!self::isEligibleIncome($originalTx, $config['keywords'])) {
            return;
        }

        $amount = (float)$originalTx['amount'];
        $accountId = (int)$originalTx['account_id'];
        $date = date('Y-m-d', strtotime($originalTx['transaction_date']));
        $pdo = Database::getConnection();

        // 1. Пересчитываем Алименты
        if ($config['alimony']['percent'] > 0) {
            $alimonyAmount = $amount * ($config['alimony']['percent'] / 100);
            self::updatePlannedTransactionAmount($pdo, $userId, $accountId, '%Алименты%', $date, $alimonyAmount);
        }

        // 2. Пересчитываем Исполнительные листы
        if ($config['enforcement']['percent'] > 0) {
            $enforcementAmount = $amount * ($config['enforcement']['percent'] / 100);
            self::updatePlannedTransactionAmount($pdo, $userId, $accountId, '%Исполнительные листы%', $date, $enforcementAmount);
        }
    }

    // Синхронное обновление суммы в transactions и transaction_items с привязкой к счету
    private static function updatePlannedTransactionAmount(\PDO $pdo, int $userId, int $accountId, string $counterpartyPattern, string $date, float $newAmount): void {
        $stmtFind = $pdo->prepare("
            SELECT id 
            FROM transactions 
            WHERE user_id = :uid 
              AND account_id = :acc_id
              AND status = 'planned' 
              AND counterparty LIKE :pattern 
              AND transaction_date LIKE :date 
            LIMIT 1
        ");
        $stmtFind->execute([
            'uid'     => $userId,
            'acc_id'  => $accountId,
            'pattern' => $counterpartyPattern,
            'date'    => $date . '%'
        ]);
        
        $tx = $stmtFind->fetch();
        if (!$tx) {
            return;
        }

        $txId = (int)$tx['id'];

        $stmtUpdTx = $pdo->prepare("UPDATE transactions SET amount = :amount WHERE id = :id");
        $stmtUpdTx->execute(['amount' => $newAmount, 'id' => $txId]);

        $stmtUpdItem = $pdo->prepare("
            UPDATE transaction_items 
            SET unit_price = :price, total_price = :total 
            WHERE transaction_id = :tid
        ");
        $stmtUpdItem->execute([
            'price' => $newAmount,
            'total' => $newAmount,
            'tid'   => $txId
        ]);
    }
}
