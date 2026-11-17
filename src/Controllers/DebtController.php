<?php
namespace App\Controllers;

use App\Models\Debt;
use App\Response;

class DebtController extends Controller {
    
    public function index(): void {
        $user = $this->requireAuth();
        $debts = Debt::getTree($user['id']);
        $this->success(['debts' => $debts]);
    }

    public function show(array $params): void {
        $user = $this->requireAuth();
        $debt = Debt::getWithTransactions((int)$params['id'], $user['id']);
        
        if (!$debt) Response::error('Долг не найден', 404);
        
        $this->success(['debt' => $debt]);
    }

    public function fixPayments(): void {
        $user = $this->requireAuth();
        $result = \App\Models\Debt::fixOldPayments($user['id']);
        $this->success($result);
    }
}