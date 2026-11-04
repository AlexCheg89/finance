<?php
namespace App\Controllers;

use App\Response;
use App\Auth;

abstract class Controller {
    // Проверка авторизации (возвращает изера или превышает запрос с 401)
    protected function requireAuth(): array {
        $user = Auth::user();
        if (!$user) {
            Response::error('Unauthorized', 401);
        }
        return $user;
    }

    // Отправка успешного ответа
    protected function success(array $data = [], int $status = 200): void {
        Response::json(array_merge(['status' => 'ok'], $data), $status);
    }
}