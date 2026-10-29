<?php
namespace App;

class Auth {
    public static function startSession(): void {
        if (session_status() === PHP_SESSION_NONE) {
            // Настройки безопасности сессии
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => '/',
                'domain' => '', // текущий домен
                'secure' => false, // Поставьте true, если перейдете на HTTPS
                'httponly' => true, // Запрет доступа из JS
                'samesite' => 'Lax' // Защита от CSRF 
            ]);
            session_start();
        }
    }

    public static function login(string $username, string $password): bool {
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE username = :username LIMIT 1");
        $stmt->execute(['username' => $username]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            self::startSession();
            // Защита от фиксации сессии
            session_regenerate_id(true);

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $username;
            return true;
        }

        return false;
    }

    public static function logout(): void {
        self::startSession();
        $_SESSION = [];
        session_destroy();
    }

    public static function check(): bool {
        self::startSession();
        return isset($_SESSION['user_id']);
    }

    public static function user(): ?array {
        self::startSession();
        if (!self::check()) return null;

        return [
            'id' => $_SESSION['user_id'],
            'username' => $_SESSION['username']
        ];
    }
}
