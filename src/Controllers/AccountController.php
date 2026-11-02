<?php
namespace App\Controllers;

use App\Response;
use App\Auth;
use App\Database;

class AccountController {
    
    // GET /api/accounts
    public function index(): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT id, name, type, currency, balance, is_active 
            FROM accounts 
            WHERE user_id = :uid 
            ORDER BY id DESC
        ");
        $stmt->execute(['uid' => $user['id']]);
        $accounts = $stmt->fetchAll();

        Response::json(['status' => 'ok', 'accounts' => $accounts]);
    }

    // GET /api/accounts/{id}
    public function show(array $params): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $id = (int)$params['id'];
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("
            SELECT id, name, type, currency, balance, is_active, created_at, updated_at 
            FROM accounts 
            WHERE id = :id AND user_id = :uid
        ");
        $stmt->execute(['id' => $id, 'uid' => $user['id']]);
        $account = $stmt->fetch();

        if (!$account) {
            Response::error('Счет не найден', 404);
        }

        Response::json(['status' => 'ok', 'account' => $account]);
    }

    // POST /api/accounts
    public function store(): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

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

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO accounts (user_id, name, type, currency, balance) 
            VALUES (:uid, :name, :type, :currency, 0)
        ");
        $stmt->execute([
            'uid' => $user['id'],
            'name' => $name,
            'type' => $type,
            'currency' => $currency
        ]);

        Response::json([
            'status' => 'ok', 
            'id' => $pdo->lastInsertId()
        ], 201);
    }
}