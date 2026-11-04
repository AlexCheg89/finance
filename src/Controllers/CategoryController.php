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
}