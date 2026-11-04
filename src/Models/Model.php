<?php
namespace App\Models;

use App\Database;
use PDO;

abstract class Model {
    protected static string $table = '';
    protected static string $primaryKey = 'id';
    protected PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // Поисе по ID
    public static function find(int $id): ?array {
        $instance = new static();
        $stmt = $instance->db->prepare("SELECT * FROM " . static::$table . " WHERE " . static::$primaryKey . " = :id LIMIT 1");
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    // Получить все записи (с условием)
    public static function where(string $column, $value): array {
        $instance = new static();
         $stmt = $instance->db->prepare("SELECT * FROM " . static::$table . " WHERE $column = :value");
         $stmt->execute(['value' => $value]);
         return $stmt->fetchAll();
    }
}