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

        // 2. Считаем РЕАЛЬНО выплаченные суммы (только факт, только is_planned = FALSE)
        $stmtPaid = $instance->db->prepare("
            SELECT 
                d.id,
                COALESCE(SUM(
                    CASE 
                        WHEN t.status = 'actual' 
                        AND (t.counterparty IS NULL OR t.counterparty != 'Проценты по кредиту')
                        THEN t.amount 
                        ELSE 0 
                    END
                ), 0) as direct_paid,
                COALESCE((
                    SELECT SUM(dp.amount) 
                    FROM debt_payments dp 
                    JOIN transactions t2 ON dp.transaction_id = t2.id 
                    WHERE dp.debt_id = d.id 
                      AND t2.status = 'actual'
                      AND dp.is_planned = FALSE   -- <-- ТОЛЬКО ФАКТ
                ), 0) as distributed_paid
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

        // 3. Считаем ПЛАНОВЫЕ суммы (только is_planned = TRUE)
        $stmtPlanned = $instance->db->prepare("
            SELECT 
                d.id,
                COALESCE(SUM(CASE WHEN t.status = 'planned' THEN t.amount ELSE 0 END), 0) as direct_planned,
                COALESCE((
                    SELECT SUM(dp.amount) 
                    FROM debt_payments dp 
                    JOIN transactions t2 ON dp.transaction_id = t2.id 
                    WHERE dp.debt_id = d.id 
                      AND t2.status = 'planned'
                      AND dp.is_planned = TRUE    -- <-- ТОЛЬКО ПЛАН
                ), 0) as distributed_planned
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
                $sumPlanned = 0;
                $sumPaid = 0;

                foreach ($children[$parent['id']] as $child) {
                    $sumPrincipal += (float)$child['principal_amount'];
                    $sumFee += (float)$child['fee_amount'];
                    $sumTotal += (float)$child['total_amount'];
                    $sumPlanned += (float)$child['planned_amount'];
                    $sumPaid += (float)$child['paid_amount'];
                }

                $parent['principal_amount'] = $sumPrincipal;
                $parent['fee_amount'] = $sumFee;
                $parent['total_amount'] = $sumTotal;
                $parent['planned_amount'] = $sumPlanned;
                $parent['paid_amount'] = $sumPaid;
            }
            
            $parent['children'] = $children[$parent['id']] ?? [];
        }

        return $tree;
    }

    public static function getWithTransactions(int $id, int $userId): ?array {
        $instance = new static();
        $debt = self::find($id);
        
        if (!$debt || $debt['user_id'] !== $userId) return null;

        // Если это родительский долг (сводное дело) — считаем paid_amount как сумму детей
        if ($debt['parent_id'] === null) {
            $stmtChildren = $instance->db->prepare("
                SELECT id FROM debts WHERE parent_id = :id AND user_id = :uid
            ");
            $stmtChildren->execute(['id' => $id, 'uid' => $userId]);
            $children = $stmtChildren->fetchAll();

            if (!empty($children)) {
                $totalPaid = 0;
                $totalPlanned = 0;
                foreach ($children as $child) {
                    $childData = self::getWithTransactions((int)$child['id'], $userId);
                    if ($childData) {
                        $totalPaid += (float)$childData['paid_amount'];
                        $totalPlanned += (float)$childData['planned_amount'];
                    }
                }
                $debt['paid_amount'] = $totalPaid;
                $debt['planned_amount'] = $totalPlanned;

                // Получаем транзакции для родителя (как обычно)
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

        // Считаем ФАКТ по этому долгу
        $stmtPaid = $instance->db->prepare("
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN t.status = 'actual' 
                        AND NOT EXISTS (SELECT 1 FROM debt_payments dp WHERE dp.transaction_id = t.id)
                        AND (t.counterparty IS NULL OR t.counterparty != 'Проценты по кредиту')
                        THEN t.amount 
                        ELSE 0 
                    END
                ), 0) as direct_paid,
                COALESCE((
                    SELECT SUM(dp.amount) 
                    FROM debt_payments dp 
                    JOIN transactions t2 ON dp.transaction_id = t2.id 
                    WHERE dp.debt_id = :id_inner 
                      AND t2.status = 'actual'
                      AND dp.is_planned = FALSE
                ), 0) as distributed_paid
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
                COALESCE(SUM(
                    CASE 
                        WHEN t.status = 'planned' 
                        AND NOT EXISTS (SELECT 1 FROM debt_payments dp WHERE dp.transaction_id = t.id)
                        THEN t.amount 
                        ELSE 0 
                    END
                ), 0) as direct_planned,
                COALESCE((
                    SELECT SUM(dp.amount) 
                    FROM debt_payments dp 
                    JOIN transactions t2 ON dp.transaction_id = t2.id 
                    WHERE dp.debt_id = :id_inner 
                      AND t2.status = 'planned'
                      AND dp.is_planned = TRUE
                ), 0) as distributed_planned
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

    // Фиксация фактических выплат в колонке paid_amount таблицы debts
    public static function syncPaidAmount(int $debtId): void {
        $instance = new static();
        $pdo = $instance->db;

        // Считаем только ФАКТ (status = 'actual'), исключая проценты по кредиту
        $stmt = $pdo->prepare("
            SELECT 
                d.parent_id,
                d.total_amount,
                COALESCE((
                    SELECT SUM(t.amount) 
                    FROM transactions t 
                    WHERE t.debt_id = d.id 
                      AND t.status = 'actual'
                      AND (t.counterparty IS NULL OR t.counterparty != 'Проценты по кредиту')
                ), 0) +
                COALESCE((
                    SELECT SUM(dp.amount) 
                    FROM debt_payments dp 
                    JOIN transactions t2 ON dp.transaction_id = t2.id 
                    WHERE dp.debt_id = d.id 
                    AND t2.status = 'actual'
                    AND dp.is_planned = FALSE
                ), 0) AS actual_paid
            FROM debts d
            WHERE d.id = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $debtId]);
        $row = $stmt->fetch();

        if (!$row) {
            return;
        }

        $actualPaid = (float)$row['actual_paid'];
        $totalAmount = (float)$row['total_amount'];
        $closeDate = ($totalAmount > 0 && $actualPaid >= $totalAmount) ? date('Y-m-d') : null;

        // Записываем актуальный факт в paid_amount и ставим дату закрытия, если долг погашен
        $stmtUpd = $pdo->prepare("
            UPDATE debts 
            SET paid_amount = :paid,
                actual_close_date = IF(:close_date_check IS NOT NULL, COALESCE(actual_close_date, :close_date_val), NULL)
            WHERE id = :id
        ");
        $stmtUpd->execute([
            'paid'             => $actualPaid,
            'close_date_check' => $closeDate,
            'close_date_val'   => $closeDate,
            'id'               => $debtId
        ]);

        // Если это дочерний лист сводного дела — пересчитываем родителя
        if (!empty($row['parent_id'])) {
            self::syncPaidAmount((int)$row['parent_id']);
        }
    }

    public static function getDistribution(int $transactionId, int $userId): array {
        $instance = new static();
        $pdo = $instance->db;

        // 1. Получаем транзакцию
        $stmtTx = $pdo->prepare("SELECT * FROM transactions WHERE id = :id AND user_id = :uid");
        $stmtTx->execute(['id' => $transactionId, 'uid' => $userId]);
        $tx = $stmtTx->fetch();

        if (!$tx) return ['error' => 'Транзакция не найдена'];

        $debtId = $tx['debt_id'];
        if (!$debtId) return ['error' => 'Транзакция не привязана к долгу'];

        // 2. Получаем распределение из debt_payments (is_planned = TRUE)
        $stmtDist = $pdo->prepare("
            SELECT 
                dp.*, 
                d.name as debt_name, 
                d.type as debt_type,
                d.principal_amount as debt_principal, 
                d.fee_amount as debt_fee,
                d.interest_category_id
            FROM debt_payments dp
            JOIN debts d ON dp.debt_id = d.id
            WHERE dp.transaction_id = :tx_id AND dp.is_planned = 1
        ");
        $stmtDist->execute(['tx_id' => $transactionId]);
        $distributions = $stmtDist->fetchAll();

        // Если распределения нет — создаём "виртуальное"
        if (empty($distributions)) {
            $stmtDebt = $pdo->prepare("SELECT * FROM debts WHERE id = :id");
            $stmtDebt->execute(['id' => $debtId]);
            $debt = $stmtDebt->fetch();

            if ($debt) {
                if ($debt['type'] === 'credit_card' || $debt['type'] === 'loan') {
                    // Для кредиток/кредитов: вся сумма в тело, проценты = 0
                    $distributions[] = [
                        'debt_id' => $debt['id'],
                        'debt_name' => $debt['name'],
                        'debt_type' => $debt['type'],
                        'amount' => $tx['amount'],
                        'principal_amount' => (float)$tx['amount'], // <-- ВСЯ СУММА В ТЕЛО
                        'fee_amount' => 0,                          // <-- ПРОЦЕНТЫ = 0
                        'debt_principal' => $debt['principal_amount'],
                        'debt_fee' => $debt['fee_amount'],
                        'interest_category_id' => $debt['interest_category_id']
                    ];
                } else {
                    // Для исполнительных листов (без детей) — вся сумма в сбор
                    $distributions[] = [
                        'debt_id' => $debt['id'],
                        'debt_name' => $debt['name'],
                        'debt_type' => $debt['type'],
                        'amount' => $tx['amount'],
                        'principal_amount' => 0,
                        'fee_amount' => (float)$tx['amount'],
                        'debt_principal' => $debt['principal_amount'],
                        'debt_fee' => $debt['fee_amount'],
                        'interest_category_id' => $debt['interest_category_id']
                    ];
                }
            }
        }

        return [
            'transaction' => $tx,
            'distributions' => $distributions
        ];
    }
    
    public static function confirmDistribution(int $transactionId, array $data, int $userId): void {
        $instance = new static();
        $pdo = $instance->db;

        // 1. Получаем транзакцию
        $stmtTx = $pdo->prepare("SELECT * FROM transactions WHERE id = :id AND user_id = :uid");
        $stmtTx->execute(['id' => $transactionId, 'uid' => $userId]);
        $tx = $stmtTx->fetch();

        if (!$tx) throw new \Exception('Транзакция не найдена');

        $debtId = $tx['debt_id'];
        if (!$debtId) throw new \Exception('Транзакция не привязана к долгу');

        // 2. Получаем долг
        $stmtDebt = $pdo->prepare("SELECT * FROM debts WHERE id = :id");
        $stmtDebt->execute(['id' => $debtId]);
        $debt = $stmtDebt->fetch();

        if (!$debt) throw new \Exception('Долг не найден');

        if (!$pdo->inTransaction()) {
            $pdo->beginTransaction();
        }

        try {
            // ==========================================
            // КРЕДИТКА / КРЕДИТ
            // ==========================================
            if ($debt['type'] === 'credit_card' || $debt['type'] === 'loan') {
                $principal = (float)$data[0]['principal'];
                $fee = (float)$data[0]['fee'];

                // 1. Уменьшаем тело долга
                if ($principal > 0) {
                    self::reducePrincipal($debtId, $principal);
                }

                // 2. Создаём транзакцию на проценты (если есть)
                if ($fee > 0 && $debt['interest_category_id']) {
                    $interestData = [
                        'account_id' => $tx['account_id'],
                        'debt_id' => $debtId,
                        'type' => 'expense',
                        'amount' => $fee,
                        'counterparty' => 'Проценты по кредиту',
                        'transaction_date' => $tx['transaction_date'],
                        'has_details' => 0,
                        'status' => 'actual',
                        'debt_payment_status' => 'confirmed',
                        'items' => [[
                            'name' => 'Проценты',
                            'category_id' => $debt['interest_category_id'],
                            'quantity' => 1,
                            'unit_price' => $fee,
                            'total_price' => $fee
                        ]]
                    ];
                    Transaction::createFull($interestData, $userId);
                }

                // 3. Пишем историю
                $stmtHist = $pdo->prepare("
                    INSERT INTO debt_payment_history (transaction_id, debt_id, principal_amount, fee_amount, changed_by) 
                    VALUES (:tx_id, :debt_id, :principal, :fee, :user_id)
                ");
                $stmtHist->execute([
                    'tx_id' => $transactionId,
                    'debt_id' => $debtId,
                    'principal' => $principal,
                    'fee' => $fee,
                    'user_id' => $userId
                ]);
            }
            // ==========================================
            // ИСПОЛНИТЕЛЬНЫЕ ЛИСТЫ (СВОДНОЕ ДЕЛО)
            // ==========================================
            else {
                // 1. Удаляем старые плановые записи
                $stmtDel = $pdo->prepare("DELETE FROM debt_payments WHERE transaction_id = :tx_id AND is_planned = 1");
                $stmtDel->execute(['tx_id' => $transactionId]);

                // 2. Создаём новые фактические и пишем историю
                $stmtIns = $pdo->prepare("
                    INSERT INTO debt_payments (transaction_id, debt_id, amount, principal_amount, fee_amount, is_planned) 
                    VALUES (:tx_id, :debt_id, :amount, :principal, :fee, 0)
                ");
                $stmtHist = $pdo->prepare("
                    INSERT INTO debt_payment_history (transaction_id, debt_id, principal_amount, fee_amount, changed_by) 
                    VALUES (:tx_id, :debt_id, :principal, :fee, :user_id)
                ");

                foreach ($data as $row) {
                    $amount = (float)$row['principal'] + (float)$row['fee'];
                    
                    $stmtIns->execute([
                        'tx_id' => $transactionId,
                        'debt_id' => $row['debt_id'],
                        'amount' => $amount,
                        'principal' => $row['principal'],
                        'fee' => $row['fee']
                    ]);

                    $stmtHist->execute([
                        'tx_id' => $transactionId,
                        'debt_id' => $row['debt_id'],
                        'principal' => $row['principal'],
                        'fee' => $row['fee'],
                        'user_id' => $userId
                    ]);
                }
            }

            // 3. Ставим статус confirmed
            $stmtUpd = $pdo->prepare("UPDATE transactions SET debt_payment_status = 'confirmed' WHERE id = :id");
            $stmtUpd->execute(['id' => $transactionId]);

            // 4. Пересчитываем paid_amount у затронутых долгов
            $stmtDebts = $pdo->prepare("SELECT DISTINCT debt_id FROM debt_payments WHERE transaction_id = :tx_id");
            $stmtDebts->execute(['tx_id' => $transactionId]);
            foreach ($stmtDebts->fetchAll() as $row) {
                self::syncPaidAmount((int)$row['debt_id']);
            }

            // 5. Для кредиток тоже синхронизируем paid_amount
            if ($debt['type'] === 'credit_card' || $debt['type'] === 'loan') {
                self::syncPaidAmount($debtId);
            }

            if ($pdo->inTransaction()) {
                $pdo->commit();
            }

        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public static function getSchedule(int $userId, string $startMonth, string $endMonth): array {
        $instance = new static();
        $pdo = $instance->db;

        // 1. Получаем все долги пользователя
        $stmtDebts = $pdo->prepare("
            SELECT d.*, c.name as category_name 
            FROM debts d
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE d.user_id = :uid
            ORDER BY d.type ASC, d.name ASC
        ");
        $stmtDebts->execute(['uid' => $userId]);
        $allDebts = $stmtDebts->fetchAll();

        // 2. Получаем все транзакции по долгам (и план, и факт)
        $stmtTx = $pdo->prepare("
            SELECT t.debt_id, t.amount, t.status, t.transaction_date
            FROM transactions t
            WHERE t.user_id = :uid 
              AND t.debt_id IS NOT NULL
              AND t.type = 'expense'
        ");
        $stmtTx->execute(['uid' => $userId]);
        $allTx = $stmtTx->fetchAll();

        // Группируем транзакции по долгу и месяцу
        $txByDebt = [];
        foreach ($allTx as $tx) {
            $month = date('Y-m', strtotime($tx['transaction_date']));
            $txByDebt[$tx['debt_id']][$month][] = $tx;
        }

        // 3. Формируем список месяцев
        $months = [];
        $current = strtotime($startMonth . '-01');
        $end = strtotime($endMonth . '-01');
        while ($current <= $end) {
            $months[] = date('Y-m', $current);
            $current = strtotime('+1 month', $current);
        }

        // 4. Считаем остаток по каждому долгу на каждый месяц
        $schedule = [];

        foreach ($months as $month) {
            $schedule[$month] = [];
            
            foreach ($allDebts as $debt) {
                // Считаем, сколько выплачено (факт) до этого месяца
                $paidBefore = 0;
                foreach ($txByDebt[$debt['id']] ?? [] as $m => $txs) {
                    if ($m <= $month) {
                        foreach ($txs as $tx) {
                            if ($tx['status'] === 'actual') {
                                $paidBefore += (float)$tx['amount'];
                            }
                        }
                    }
                }

                // Считаем, сколько запланировано до этого месяца (включая этот)
                $plannedBefore = 0;
                foreach ($txByDebt[$debt['id']] ?? [] as $m => $txs) {
                    if ($m <= $month) {
                        foreach ($txs as $tx) {
                            if ($tx['status'] === 'planned') {
                                $plannedBefore += (float)$tx['amount'];
                            }
                        }
                    }
                }

                $remaining = (float)$debt['total_amount'] - $paidBefore - $plannedBefore;
                $remaining = max(0, $remaining);

                $schedule[$month][$debt['id']] = [
                    'name' => $debt['name'],
                    'type' => $debt['type'],
                    'parent_id' => $debt['parent_id'],
                    'total' => (float)$debt['total_amount'],
                    'paid' => $paidBefore,
                    'planned' => $plannedBefore,
                    'remaining' => $remaining
                ];
            }
        }

        return [
            'months' => $months,
            'schedule' => $schedule
        ];
    }
}