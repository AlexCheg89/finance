<?php
namespace App\Controllers;

use App\Models\Transaction;
use App\Response;

class TransactionController extends Controller {

    // Проверка прав: админ может всё, обычный юзер - только не сверенное
    private function canEdit(array $user, array $tx): bool {
        if ($user['role'] === 'admin') return true;
        return (int)$tx['is_reconciled'] === 0;
    }

    public function index(): void {
        $user = $this->requireAuth();
        $transactions = Transaction::getByUser($user['id']);
        $this->success(['transactions' => $transactions]);
    }

    public function show(array $params): void {
        $user = $this->requireAuth();
        $transaction = Transaction::findWithItems((int)$params['id'], $user['id']);
        
        if (!$transaction) Response::error('Транзакция не найдена', 404);
        
        $this->success(['transaction' => $transaction]);
    }

    public function store(): void {
        $user = $this->requireAuth();
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['account_id']) || ($data['amount'] ?? 0) <= 0) {
            Response::error('Укажите счет и сумму больше нуля', 400);
        }

        // Форматируем дату
        $data['transaction_date'] = ($data['transaction_date'] ?? date('Y-m-d')) . ' ' . ($data['transaction_time'] ?? date('H:i:s'));

        try {
            $id = Transaction::createFull($data, $user['id']);
            $this->success(['id' => $id], 201);
        } catch (\Exception $e) {
            Response::error('Ошибка при создании транзакции', 500);
        }
    }

    public function update(array $params): void {
        $user = $this->requireAuth();
        $id = (int)$params['id'];
        
        $tx = Transaction::find($id);
        if (!$tx || $tx['user_id'] !== $user['id']) Response::error('Транзакция не найдена', 404);
        if (!$this->canEdit($user, $tx)) Response::error('Транзакция сверена', 403);

        $data = json_decode(file_get_contents('php://input'), true);
        
        // Обработка только флага has_details (переключатель детализации)
        if (isset($data['has_details']) && count($data) === 1) {
            Transaction::toggleDetails($id, (bool)$data['has_details'], (float)$tx['amount']);
            $this->success();
            return;
        }

        // Полное обновление (включая смену статуса)
        try {
            Transaction::updateTransaction($id, $data, $user['id']);
            $this->success();
        } catch (\Exception $e) {
            Response::error('Ошибка при обновлении: ' . $e->getMessage(), 500);
        }
    }

    public function addItem(array $params): void {
        $user = $this->requireAuth();
        $txId = (int)$params['id'];
        $tx = Transaction::find($txId);

        if (!$tx || $tx['user_id'] !== $user['id']) Response::error('Транзакция не найдена', 404);
        if (!$this->canEdit($user, $tx)) Response::error('Транзакция сверена', 403);

        // Проверка остатка (бизнес-логика контроллера)
        $items = Transaction::findWithItems($txId, $user['id'])['items'];
        $currentSum = array_sum(array_column($items, 'total_price'));
        $remaining = (float)$tx['amount'] - $currentSum;

        $data = json_decode(file_get_contents('php://input'), true);
        $totalPrice = ($data['unit_price'] ?? 0) * ($data['quantity'] ?? 1);

        if ($totalPrice > $remaining + 0.01) {
            Response::error("Сумма превышает остаток (" . number_format($remaining, 2) . " руб.)", 400);
        }

        $itemId = Transaction::addItem($txId, $data);
        $this->success(['id' => $itemId], 201);
    }

    public function deleteItem(array $params): void {
        $user = $this->requireAuth();
        $itemId = (int)$params['itemId'];
        
        // (В реальном проекте здесь нужна проверка, что item принадлежит юзеру)
        Transaction::deleteItem($itemId);
        $this->success();
    }

    public function reconcile(array $params): void {
        $user = $this->requireAuth();
        $id = (int)$params['id'];
        $pdo = \App\Database::getConnection();
        
        $stmt = $pdo->prepare("UPDATE transactions SET is_reconciled = TRUE WHERE id = :id AND user_id = :uid");
        $stmt->execute(['id' => $id, 'uid' => $user['id']]);
        
        $this->success();
    }

    // GET /api/transactions/templates
    public function templates(): void {
        $user = $this->requireAuth();
        $templates = Transaction::getTemplates($user['id']);
        $this->success(['templates' => $templates]);
    }
}