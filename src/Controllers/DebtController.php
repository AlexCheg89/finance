<?php
namespace App\Controllers;

use App\Models\Debt;

class DebtController extends Controller {
    
    public function index(): void {
        $user = $this->requireAuth();
        $debts = Debt::getTree($user['id']);
        $this->success(['debts' => $debts]);
    }
}