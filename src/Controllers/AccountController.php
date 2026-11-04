<?php
namespace App\Controllers;

use App\Models\Account;
use App\Response;

class AccountController extends Controller{
    
    // GET /api/accounts
    public function index(): void {
        $user = $this->requireAuth();
        $accounts = Account::getByUser($user['id']);
        $this->success(['accounts' => $accounts]);
    }

    // GET /api/accounts/{id}
    public function show(array $params): void {
        $user = $this->requireAuth();
        $account = Account::find((int)$params['id']);

        if (!$account || $account['user_id'] !== $user['id']) {
            Response::error('Счет не найден', 404);
        }

        $this->success(['account' => $account]);
    }

    // POST /api/accounts
    public function store(): void {
        $user = $this->requireAuth();
        $data = json_decode(file_get_contents('php://input'), true);
        
        $name = trim($data['name'] ?? '');
        $type = $data['type'] ?? 'card';
        $currency = $data['currency'] ?? 'RUB';

        if (empty($name)) {
            Response::error('Название счета обязательно', 400);
        }

        // Проверяем допустимые типы
        if (!in_array($type, ['cash', 'card', 'bank', 'savings'])) {
            Response::error('Недопустимый тип счета', 400);
        }

        $id = Account::create($user['id'], $name, $type, $currency);
        $this->success(['id' => $id], 201);
    }
}