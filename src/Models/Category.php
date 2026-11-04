<?php
namespace App\Models;

class Category extends Model {
    protected static string $table = 'categories';

    // Глобальные + личные категории
    public static function getGlobalAndUser(int $userId): array {
        $instance = new static();
        $stmt = $instance->db->prepare("
            SELECT id, name, type, parent_id 
            FROM categories 
            WHERE (user_id IS NULL OR user_id = :uid) 
            AND parent_id IS NULL
            ORDER BY type DESC, name
        ");
        $stmt->execute(['uid' => $userId]);
        return $stmt->fetchAll();
    } 
}