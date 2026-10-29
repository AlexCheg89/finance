<?php
namespace App\Controllers;

use App\Response;
use App\Auth;
use App\Database;

class AuthController {

    // POST /api/auth/login
    public function login(): void {
        // Получаем "сырое" тело запроса
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);

        $username = trim($data['username'] ?? '');
        $password = trim($data['password'] ?? '');

        if (empty($username) || empty($password)) {
            Response::error('Введите логин и пароль', 400);
        }

        if (Auth::login($username, $password)) {
            Response::json([
                'status' => 'ok',
                'user' => Auth::user()
            ]);
        } else {
            Response::error('Неверный логин или пароль', 401);
        }
    }

    // POST /api/auth/logout
    public function logout(): void {
        Auth::logout();
        Response::json(['status' => 'ok', 'message' => 'Вы вышли из системы']);
    }

    // GET /api/auth/me
    public function me(): void {
        $user = Auth::user();
        if ($user) {
            Response::json(['status' => 'ok', 'user' => $user]);
        } else {
            Response::error('Не авторизован', 401);
        }
    }
}