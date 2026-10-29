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
use App\Controllers\AuthController;

// Загружаем переменные окружения
Env::load(__DIR__ . '/../../.env');

// Простой роутинг для проверки
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Простой роутинг
switch (true) {
    // ---- АУТЕНТИФИКАЦИЯ ----
    case ($uri == '/api/auth/login' && $method === 'POST'):
        $controller = new AuthController();
        $controller->login();
        break;

    case ($uri == '/api/auth/logout' && $method === 'POST'):
        $controller = new AuthController();
        $controller->logout();
        break;
    
    case ($uri == '/api/auth/me' && $method === 'GET'):
        $controller = new AuthController();
        $controller->me();
        break;

    // ---- ТЕСТОВЫЕ ЭНДПОИНТЫ ----
    case ($uri === '/api/ping'):
        Response::json(['status' => 'ok', 'message' => 'API is working']);
        break;

    case ($uri === '/api/db-test'):
        try {
        $pdo = Database::getConnection();
        $stmt = $pdo->query("SELECT username FROM users LIMIT 1");
        $user = $stmt->fetch();
        Response::json(['status' => 'ok', 'db_user' => $user['username'] ?? 'no users']);
        } catch (\Exception $e) {
            Response::error('DB Error: ' . $e->getMessage(), 500);
        }
        break;

    // ---- 404 ----
    default:
        Response::error('Not Found', 404);
        break;
}