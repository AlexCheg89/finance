<?php
declare(strict_types=1);

// Включаем отображение ошибок только в режиме разработки
ini_set('display_errors', '1');
error_reporting(E_ALL);

// Автозагрузчик (простой PSR-4 для нашей папки src)
spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/../../src/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';
    if (file_exists($file)) require $file;
});

use App\Env;
use App\Database;
use App\Response;

// Загружаем переменные окружения
Env::load(__DIR__ . '/../../.env');

// Простой роутинг для проверки
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($uri === '/api/ping') {
    Response::json(['status' => 'ok', 'message' => 'API is working']);
}

if ($uri === '/api/db-test') {
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->query("SELECT username FROM users LIMIT 1");
        $user = $stmt->fetch();
        Response::json(['status' => 'ok', 'db_user' => $user['username'] ?? 'no users']);
    } catch (\Exception $e) {
        Response::error('DB Error: ' . $e->getMessage(), 500);
    }
}

// Если ничего не совпало
Response::error('Not Found', 404);