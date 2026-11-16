<?php
namespace App\Models;

use App\Database;

class Report {
    
    public static function getCategorySummary(int $userId, string $startDate, string $endDate): array {
        $pdo = Database::getConnection();
        
        // 1. Получаем все категории для маппинга
        $stmtCats = $pdo->prepare("SELECT id, parent_id, name, type FROM categories WHERE (user_id IS NULL OR user_id = :uid)");
        $stmtCats->execute(['uid' => $userId]);
        $allCats = $stmtCats->fetchAll(\PDO::FETCH_ASSOC);
        
        $catsById = [];
        foreach ($allCats as $cat) {
            $catsById[$cat['id']] = $cat;
        }

        // 2. Получаем транзакции за период (только факт)
        $stmtTx = $pdo->prepare("
            SELECT t.id, t.type, t.amount, t.has_details, t.counterparty, t.transaction_date
            FROM transactions t
            WHERE t.user_id = :uid 
            AND t.transaction_date >= :start 
            AND t.transaction_date <= :end
            AND t.status = 'actual'
            ORDER BY t.transaction_date ASC
        ");
        $stmtTx->execute([
            'uid' => $userId,
            'start' => $startDate . ' 00:00:00',
            'end' => $endDate . ' 23:59:59'
        ]);
        $transactions = $stmtTx->fetchAll();

        if (empty($transactions)) {
            return ['expenses' => [], 'incomes' => [], 'total_expense' => 0, 'total_income' => 0];
        }

        // 3. Получаем позиции для этих транзакций
        $txIds = array_column($transactions, 'id');
        $inQuery = implode(',', array_fill(0, count($txIds), '?'));
        $stmtItems = $pdo->prepare("
            SELECT transaction_id, category_id, name, total_price 
            FROM transaction_items 
            WHERE transaction_id IN ($inQuery)
        ");
        $stmtItems->execute($txIds);
        $items = $stmtItems->fetchAll();

        $itemsByTx = [];
        foreach ($items as $item) {
            $itemsByTx[$item['transaction_id']][] = $item;
        }

        // 4. Считаем суммы и строим деревья
        $totalExpense = 0;
        $totalIncome = 0;
        
        $expenseTree = [];
        $incomeTree = [];

        foreach ($transactions as $tx) {
            $txAmount = (float)$tx['amount'];
            $txItems = $itemsByTx[$tx['id']] ?? [];
            $isExpense = ($tx['type'] === 'expense');

            if ($isExpense) $totalExpense += $txAmount;
            else $totalIncome += $txAmount;

            $targetTree = $isExpense ? 'expenseTree' : 'incomeTree';

            if (!empty($txItems)) {
                foreach ($txItems as $item) {
                    $catId = $item['category_id'] ?? 0;
                    $amount = (float)$item['total_price'];
                    $itemName = $item['name'];

                    $parentId = null;
                    $childId = null;
                    
                    if ($catId > 0 && isset($catsById[$catId])) {
                        if ($catsById[$catId]['parent_id'] !== null) {
                            $childId = $catId;
                            $parentId = $catsById[$catId]['parent_id'];
                        } else {
                            $parentId = $catId;
                        }
                    } else {
                        $parentId = 0;
                    }

                    if (!isset($$targetTree[$parentId])) $$targetTree[$parentId] = ['sum' => 0, 'children' => [], 'transactions' => []];
                    
                    $txData = [
                        'id' => $tx['id'],
                        'date' => $tx['transaction_date'],
                        'description' => $itemName . ' (' . ($tx['counterparty'] ?: 'Без контрагента') . ')',
                        'amount' => $amount
                    ];

                    if ($childId !== null) {
                        if (!isset($$targetTree[$parentId]['children'][$childId])) {
                            $$targetTree[$parentId]['children'][$childId] = ['sum' => 0, 'transactions' => []];
                        }
                        $$targetTree[$parentId]['children'][$childId]['sum'] += $amount;
                        $$targetTree[$parentId]['children'][$childId]['transactions'][] = $txData;
                    } else {
                        $$targetTree[$parentId]['transactions'][] = $txData;
                    }
                }
            } else {
                $parentId = 0;
                if (!isset($$targetTree[$parentId])) $$targetTree[$parentId] = ['sum' => 0, 'children' => [], 'transactions' => []];
                
                $txData = [
                    'id' => $tx['id'],
                    'date' => $tx['transaction_date'],
                    'description' => $tx['counterparty'] ?: 'Без описания',
                    'amount' => $txAmount
                ];
                $$targetTree[$parentId]['transactions'][] = $txData;
            }
        }

        // 5. Преобразуем деревья
        $formatTree = function($tree, $catsById) {
            $result = [];
            foreach ($tree as $parentId => $data) {
                $parentName = $parentId == 0 ? 'Без категории' : ($catsById[$parentId]['name'] ?? 'Неизвестно');
                
                $children = [];
                $childrenSum = 0;
                $directTxSum = 0;

                foreach ($data['transactions'] as $tx) {
                    $directTxSum += $tx['amount'];
                }

                foreach ($data['children'] as $childId => $childData) {
                    $childName = $catsById[$childId]['name'] ?? 'Неизвестно';
                    $children[] = [
                        'name' => $childName,
                        'sum' => $childData['sum'],
                        'transactions' => $childData['transactions']
                    ];
                    $childrenSum += $childData['sum'];
                }

                // Если есть прямые транзакции И есть дети, добавляем "Прочее"
                if ($directTxSum > 0 && count($children) > 0) {
                    $children[] = [
                        'name' => 'Прочее (без подкатегории)',
                        'sum' => $directTxSum,
                        'transactions' => $data['transactions']
                    ];
                }

                usort($children, function($a, $b) { return $b['sum'] <=> $a['sum']; });

                $totalParentSum = $childrenSum + $directTxSum;

                $result[] = [
                    'name' => $parentName,
                    'sum' => $totalParentSum,
                    'children' => $children,
                    // Если детей нет, транзакции передаем на уровень родителя
                    'transactions' => (empty($children)) ? $data['transactions'] : []
                ];
            }
            usort($result, function($a, $b) { return $b['sum'] <=> $a['sum']; });
            return $result;
        };

        return [
            'expenses' => $formatTree($expenseTree, $catsById),
            'incomes' => $formatTree($incomeTree, $catsById),
            'total_expense' => $totalExpense,
            'total_income' => $totalIncome
        ];
    }
}