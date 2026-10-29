<?php
namespace App\Controllers;

use App\Response;
use App\Auth;
use App\Database;
use PDO;

class TransactionController {
    
    // POST /api/transactions
    public function store(): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $data = json_decode(file_get_contents('php://input'), true);
        
        // Валидация базовых полей
        $accountId = $data['account_id'] ?? null;
        $type = $data['type'] ?? 'expense';
        $amount = $data['amount'] ?? 0;
        $counterparty = trim($data['counterparty'] ?? '');
        $date = $data['transaction_date'] ?? date('Y-m-d');
        $time = $data['transaction_time'] ?? date('H:i:s');
        $items = $data['items'] ?? []; // Массив позиций

        // Объединяем дату и время
        $datetime = $date . ' ' . $time;

        if (!$accountId || $amount <= 0) {
            Response::error('Укажите счет и сумму больше нуля', 400);
        }

        $pdo = Database::getConnection();

        try {
            $pdo->beginTransaction();

            // 1. Создаем шапку транзакции
            $stmt = $pdo->prepare("
                INSERT INTO transactions (user_id, account_id, type, amount, counterparty, transaction_date, source) 
                VALUES (:uid, :acc, :type, :amount, :counterparty, :date, 'manual')
            ");
            $stmt->execute([
                'uid' => $user['id'],
                'acc' => $accountId,
                'type' => $type,
                'amount' => $amount,
                'counterparty' => $counterparty,
                'date' => $datetime
            ]);
            
            $transactionId = $pdo->lastInsertId();

            // 2. Сохраняем позиции (если есть)
            if (!empty($items) && is_array($items)) {
                $stmtItem = $pdo->prepare("
                    INSERT INTO transaction_items (transaction_id, category_id, name, quantity, unit_price, total_price) 
                    VALUES (:tid, :cat, :name, :qty, :price, :total)
                ");
                
                foreach ($items as $item) {
                    $stmtItem->execute([
                        'tid' => $transactionId,
                        'cat' => $item['category_id'] ?? null,
                        'name' => $item['name'] ?? 'Без названия',
                        'qty' => $item['quantity'] ?? 1,
                        'price' => $item['unit_price'] ?? 0,
                        'total' => $item['total_price'] ?? 0
                    ]);
                }
            }

            // 3. Обновляем баланс счета (если это расход, вычитаем; если доход, прибавляем)
            if ($type === 'expense') {
                $updateBalance = $pdo->prepare("UPDATE accounts SET balance = balance - :amount WHERE id = :acc_id AND user_id = :uid");
            } elseif ($type === 'income') {
                $updateBalance = $pdo->prepare("UPDATE accounts SET balance = balance + :amount WHERE id = :acc_id AND user_id = :uid");
            } else {
                $updateBalance = null; // Переводы пока не обрабатываем здесь
            }

            if ($updateBalance) {
                $updateBalance->execute(['amount' => $amount, 'acc_id' => $accountId, 'uid' => $user['id']]);
            }

            // Фиксируем изменения
            $pdo->commit();

            Response::json(['status' => 'ok', 'id' => $transactionId], 201);

        } catch (\Exception $e) {
            $pdo->rollBack();
            // Логируем ошибку, но наружу отдаем общую
            error_log("Transaction Error: " . $e->getMessage());
            Response::error('Ошибка при создании транзакции', 500);
        }
    }

        // GET /api/transactions
    public function index(): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $pdo = Database::getConnection();
        // Берем транзакции вместе с названием счета
        $stmt = $pdo->prepare("
            SELECT t.*, a.name as account_name 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = :uid 
            ORDER BY t.transaction_date DESC, t.id DESC
            LIMIT 50
        ");
        $stmt->execute(['uid' => $user['id']]);
        $transactions = $stmt->fetchAll();

        Response::json(['status' => 'ok', 'transactions' => $transactions]);
    }
}