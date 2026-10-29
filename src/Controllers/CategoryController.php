<?php
namespace App\Controllers;

use App\Response;
use App\Auth;
use App\Database;

class CategoryController {
    // GET /api/categories
    public function index(): void {
        $user = Auth::user();
        if (!$user) Response::error('Unauthorized', 401);

        $pdo = Database::getConnection();
        // Пока отдаем только верхний уровень (parent_id IS NULL)
        $stmt = $pdo->prepare("
            SELECT id, name, type, parent_id 
            FROM categories 
            WHERE (user_id IS NULL OR user_id = :uid) 
            AND parent_id IS NULL
            ORDER BY type DESC, name
        ");
        $stmt->execute(['uid' => $user['id']]);
        
        Response::json(['status' => 'ok', 'categories' => $stmt->fetchAll()]);
    }
}