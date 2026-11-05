<?php
declare(strict_types=1);

ini_set('display_errors', '1');
error_reporting(E_ALL);

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
use App\Response;
use App\Router;
use App\Controllers\AuthController;
use App\Controllers\AccountController;
use App\Controllers\TransactionController;
use App\Controllers\CategoryController;
use App\Controllers\BudgetController;

Env::load(__DIR__ . '/../../.env');

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

$router = new Router();

// Auth
$router->add('POST', '/api/auth/login', function() { (new AuthController())->login(); });
$router->add('POST', '/api/auth/logout', function() { (new AuthController())->logout(); });
$router->add('GET',  '/api/auth/me', function() { (new AuthController())->me(); });

// Accounts
$router->add('GET',  '/api/accounts', function() { (new AccountController())->index(); });
$router->add('POST', '/api/accounts', function() { (new AccountController())->store(); });
$router->add('GET',  '/api/accounts/{id}', function($p) { (new AccountController())->show($p); });
$router->add('POST', '/api/accounts/{id}/recalculate-balance', function($p) { (new AccountController())->recalculateBalance($p); });

// Categories
$router->add('GET', '/api/categories', function() { (new CategoryController())->index(); });

// Transactions
$router->add('GET',  '/api/transactions', function() { (new TransactionController())->index(); });
$router->add('POST', '/api/transactions', function() { (new TransactionController())->store(); });
$router->add('GET', '/api/transactions/templates', function() { (new TransactionController())->templates(); });
$router->add('GET',  '/api/transactions/{id}', function($p) { (new TransactionController())->show($p); });
$router->add('PUT',  '/api/transactions/{id}', function($p) { (new TransactionController())->update($p); });

// Transaction Items
$router->add('POST',   '/api/transactions/{id}/items', function($p) { (new TransactionController())->addItem($p); });
$router->add('PUT',    '/api/transactions/items/{itemId}', function($p) { (new TransactionController())->updateItem($p); });
$router->add('DELETE', '/api/transactions/items/{itemId}', function($p) { (new TransactionController())->deleteItem($p); });

// Reconcile
$router->add('POST', '/api/transactions/{id}/reconcile', function($p) { (new TransactionController())->reconcile($p); });

// BudgetView
$router->add('GET', '/api/budget', function() { (new BudgetController())->index(); });
$router->add('POST', '/api/budget/close-month', function() { (new BudgetController())->closeMonth(); });

$router->dispatch($method, $uri);