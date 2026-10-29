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
        $items = $data['items'] ?? []; // Массив позиций

        if (!$accountId || $amount <=0) {
            Response::error('Укажите счет или сумму больше нуля', 400);
        }

        $pdo = Database::getConnection();

        try {
            $pdo->beginTransaction();
            // 1. Создаем шапку транзакции

            // 2. Сохраняем позицию если есть

            // 3. Обновляем баланс счета (если это расход, вычитаем; если доход, прибавляем)

            // Фиксируем измененияв
        } catch (\Exception $e) {
            
            // Логируем ошибку, но наружу отдаем общую
            error_log("Transaction Error: " . $e->getMessage());
            Response::error('Ошибка при созаднии транкзации', 500);
        }
    }
}