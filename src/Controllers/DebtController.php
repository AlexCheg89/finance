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

    // GET /api/debts/distribution/{transactionId}
    public function getDistribution(array $params): void {
        $user = $this->requireAuth();
        $data = Debt::getDistribution((int)$params['transactionId'], $user['id']);
        
        if (isset($data['error'])) {
            Response::error($data['error'], 404);
        }
        
        $this->success($data);
    }

    // POST /api/debts/confirm-distribution/{transactionId}
    public function confirmDistribution(array $params): void {
        $user = $this->requireAuth();
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (empty($data['distributions'])) {
            Response::error('Нет данных для распределения', 400);
        }

        try {
            Debt::confirmDistribution((int)$params['transactionId'], $data['distributions'], $user['id']);
            $this->success(['message' => 'Распределение подтверждено']);
        } catch (\Exception $e) {
            Response::error('Ошибка: ' . $e->getMessage(), 500);
        }
    }
}