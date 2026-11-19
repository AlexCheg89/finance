<?php
namespace App\Models;

use App\Database;

class Obligation {

    // Вспомогательный метод для получения конфигурации пользователя из БД
    private static function getUserConfig(int $userId): array {
        $settings = Setting::getAll($userId);

        return [
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

    public static function createAutoDebts(int $userId, array $originalTx): void {
        $counterparty = mb_strtolower($originalTx['counterparty'] ?? '');
        $isSalary = str_contains($counterparty, 'зарплата') || 
                    str_contains($counterparty, 'аванс') || 
                    str_contains($counterparty, 'отпускные');

        if ($originalTx['type'] !== 'income' || !$isSalary) {
            return;
        }

        $config = self::getUserConfig($userId);
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
                WHERE user_id = :uid AND type = 'enforcement' AND parent_id IS NULL AND actual_close_date IS NULL
                LIMIT 1
            ");
            $stmtDebt->execute(['uid' => $userId]);
            $debt = $stmtDebt->fetch();

            if ($debt) {
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
                        'items' => [[
                            'name' => 'Удержание по ИП',
                            'category_id' => $config['enforcement']['category_id'],
                            'quantity' => 1,
                            'unit_price' => $actualEnforcement,
                            'total_price' => $actualEnforcement
                        ]]
                    ];
                    
                    Transaction::createFull($enforcementData, $userId);
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

    // Пересчет обязательств при изменении суммы дохода
    public static function recalculateDebts(int $userId, array $originalTx): void {
        $config = self::getUserConfig($userId);
        $amount = (float)$originalTx['amount'];
        $date = date('Y-m-d', strtotime($originalTx['transaction_date']));
        $pdo = Database::getConnection();

        // 1. Пересчитываем Алименты
        if ($config['alimony']['percent'] > 0) {
            $alimonyAmount = $amount * ($config['alimony']['percent'] / 100);
            self::updatePlannedTransactionAmount($pdo, $userId, '%Алименты%', $date, $alimonyAmount);
        }

        // 2. Пересчитываем Исполнительные листы
        if ($config['enforcement']['percent'] > 0) {
            $enforcementAmount = $amount * ($config['enforcement']['percent'] / 100);
            self::updatePlannedTransactionAmount($pdo, $userId, '%Исполнительные листы%', $date, $enforcementAmount);
        }
    }

    // Синхронное обновление суммы в transactions и transaction_items
    private static function updatePlannedTransactionAmount(\PDO $pdo, int $userId, string $counterpartyPattern, string $date, float $newAmount): void {
        // Находим ID нужной плановой транзакции за этот день
        $stmtFind = $pdo->prepare("
            SELECT id 
            FROM transactions 
            WHERE user_id = :uid 
              AND status = 'planned' 
              AND counterparty LIKE :pattern 
              AND transaction_date LIKE :date 
            LIMIT 1
        ");
        $stmtFind->execute([
            'uid'     => $userId,
            'pattern' => $counterpartyPattern,
            'date'    => $date . '%'
        ]);
        
        $tx = $stmtFind->fetch();
        if (!$tx) {
            return;
        }

        $txId = (int)$tx['id'];

        // 1. Обновляем основную сумму транзакции
        $stmtUpdTx = $pdo->prepare("UPDATE transactions SET amount = :amount WHERE id = :id");
        $stmtUpdTx->execute(['amount' => $newAmount, 'id' => $txId]);

        // 2. Обновляем цену и итоговую стоимость позиции в чеке
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
