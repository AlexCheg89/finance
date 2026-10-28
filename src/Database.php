<?php
namespace App;

use PDO;
use PDOException;

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $host = Env::get('DB_HOST', 'localhost');
            $db   = Env::get('DB_NAME', 'finance');
            $user = Env::get('DB_USER', 'finance_user');
            $pass = Env::get('DB_PASS', '');
            $charset = 'utf8mb4';

            $dsn = "mysql:host=$host;dbname=$db;charset=$charset";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
            } catch (PDOException $e) {
                // Логируем ошибку и отдаем 500
                error_log("DB Connection Error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(['error' => 'Internal Server Error']);
                exit;
            }
        }
        return self::$instance;
    }
}
