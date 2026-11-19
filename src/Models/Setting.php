<?php
namespace App\Models;

use App\Database;

class Setting {

    // Получить одну настройку пользователя
    public static function get(int $userId, string $key, $default = null) {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT `value` FROM settings WHERE user_id = :uid AND `key` = :key LIMIT 1");
        $stmt->execute([
            'uid' => $userId,
            'key' => $key
        ]);
        $row = $stmt->fetch();

        return ($row && $row['value'] !== null && $row['value'] !== '') ? $row['value'] : $default;
    }

    // Получить все настройки полльзователя в виде ассооциативнного массива
    public static function getAll(int $userId): array {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT `key`, `value` FROM settings WHERE user_id = :uid");
        $stmt->execute(['uid' => $userId]);

        return $stmt->fetchAll(\PDO::FETCH_KEY_PAIR) ?: [];
    }

    // Сохранить или обновить настройку
    public static function set(int $userId, string $key, ?string $value): void {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO settings (user_id, `key`, `value`) 
            VALUES (:uid, :key, :val) 
            ON DUPLICATE KEY UPDATE `value` = :val_upd
        ");
        $stmt->execute([
            'uid' => $userId,
            'key' => $key,
            'val' => $value,
            'val_upd' => $value
        ]);
    }
}