<?php
namespace App;

class Router {
    private array $routes = [];

    // Регистрация маршрута
    public function add(string $method, string $path, callable $handler): void {
        // Превразаем /api/accounts/{$id} в регулярные выражения
        $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[^/]+)', $path);
        $pattern = '#^' . $pattern . '$#';

        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'handler' => $handler
        ];
    }

    // Поиск и выполнение маршрута
    public function dispatch(string $method, string $uri): void {
        $method = strtoupper($method);

        foreach ($this->routes as $route) {
            if ($route['method'] === $method && preg_match($route['pattern'], $uri, $matches)) {
                // Очищаем $matches от числовых ключей, оставляем только именнование (id и т.д.)
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

                // Вызываем обработчик, передавая ему параметры
                call_user_func($route['handler'], $params);
                return;
            }
        }

        // Если ничего не нашли
        Response::error('Not Found', 404);
    }
}