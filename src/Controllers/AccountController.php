<?php
namespace App\Controllers;

use App\Models\Account;
use App\Response;
use App\Database;

class AccountController extends Controller {
    
    public function index(): void {
        $user = $this->requireAuth();
        $accounts = Account::getByUser($user['id']);
        $this->success(['accounts' => $accounts]);
    }

    // GET /api/accounts/{id}
    public function show(array $params): void {
        $user = $this->requireAuth();
        $account = Account::findWithTransactions((int)$params['id'], $user['id']);

        if (!$account) {
            Response::error('Счет не найден', 404);
        }

        $this->success(['account' => $account]);
    }

    public function store(): void {
        $user = $this->requireAuth();
        $data = json_decode(file_get_contents('php://input'), true);
        
        $name = trim($data['name'] ?? '');
        $type = $data['type'] ?? 'card';
        $currency = $data['currency'] ?? 'RUB';
        $initialBalance = (float)($data['initial_balance'] ?? 0);

        if (empty($name)) Response::error('Название счета обязательно', 400);
        if (!in_array($type, ['cash', 'card', 'bank', 'savings'])) Response::error('Недопустимый тип счета', 400);

        $id = Account::create($user['id'], $name, $type, $currency, $initialBalance);
        $this->success(['id' => $id], 201);
    }

    // POST /api/accounts/{id}/recalculate-balance
    public function recalculateBalance(array $params): void {
        $user = $this->requireAuth();
        $id = (int)$params['id'];
        $account = Account::find($id);

        if (!$account || $account['user_id'] !== $user['id']) {
            Response::error('Счет не найден', 404);
        }

        $pdo = Database::getConnection();

        // 1. Считаем сумму всех доходов и расходов по этому счету
        $stmt = $pdo->prepare("
            SELECT 
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense
            FROM transactions 
            WHERE account_id = :acc_id
        ");
        $stmt->execute(['acc_id' => $id]);
        $sums = $stmt->fetch();

        $totalIncome = (float)$sums['total_income'];
        $totalExpense = (float)$sums['total_expense'];

        // 2. Вычисляем initial_balance: Текущий баланс - (Доходы - Расходы)
        $newInitialBalance = (float)$account['balance'] - $totalIncome + $totalExpense;

        // 3. Сохраняем
        $stmtUpd = $pdo->prepare("UPDATE accounts SET initial_balance = :init WHERE id = :id");
        $stmtUpd->execute(['init' => $newInitialBalance, 'id' => $id]);

        $this->success(['initial_balance' => $newInitialBalance]);
    }
}