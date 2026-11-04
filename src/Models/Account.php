<?php
namespace App\Models;

class Account extends Model {
    protected static string $table = 'accounts';

    // Специфичный метод для получения счетов пользователя
    public static function getByUser(int $userId): array {
        return self::where('user_id', $userId);
    }
}