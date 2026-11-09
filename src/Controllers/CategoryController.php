<?php
namespace App\Controllers;

use App\Models\Category;

class CategoryController extends Controller {
    // GET /api/categories
    public function index(): void {
        $user = $this->requireAuth();
        $categories = Category::getGlobalAndUser($user['id']);
        $this->success(['categories' => $categories]);
    }

    // GET /api/category/tree
    public function tree(): void {
        $user = $this->requireAuth();
        // Берем тип из GET-параметра (income или expense)
        $type= $_GET['type'] ?? null;
        $tree = Category::getTree($user['id'], $type);
        $this->success(['categories' => $tree]);
    }
}