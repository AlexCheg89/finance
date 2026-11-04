<?php
namespace App\Models;

class Account extends Model {
    protected static string $table = 'accounts';

    // Получить все счета пользователя
    public static function getByUser(int $userId): array {
        return self::where('user_id', $userId);
    }

    // Создать новый счет
     public static function create(int $userId, string $name, string $type, string $currency = 'RUB'): int {
        $instance = new static();
        $stmt = $instance->db->prepare("
            INSERT INTO accounts (user_id, name, type, currency, balance) 
            VALUES (:uid, :name, :type, :currency, 0)
        ");
        $stmt->execute([
            'uid' => $userId,
            'name' => $name,
            'type' => $type,
            'currency' => $currency
        ]);
        
        return (int)$instance->db->lastInsertId();
    }
}