<?php
namespace App\Controllers;

use App\Models\Transaction;
use App\Response;

class TransactionController extends Controller {

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
        
        if (isset($data['has_details']) && count($data) === 1) {
            Transaction::toggleDetails($id, (bool)$data['has_details'], (float)$tx['amount']);
            $this->success();
            return;
        }

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

    public function updateItem(array $params): void {
        $user = $this->requireAuth();
        $itemId = (int)$params['itemId'];
        $pdo = \App\Database::getConnection();

        $stmt = $pdo->prepare("SELECT ti.*, t.user_id, t.amount as tx_amount, t.is_reconciled FROM transaction_items ti JOIN transactions t ON ti.transaction_id = t.id WHERE ti.id = :item_id");
        $stmt->execute(['item_id' => $itemId]);
        $item = $stmt->fetch();

        if (!$item || $item['user_id'] !== $user['id']) Response::error('Позиция не найдена', 404);
        if (!$this->canEdit($user, $item)) Response::error('Транзакция сверена', 403);

        $data = json_decode(file_get_contents('php://input'), true);
        $totalPrice = ($data['unit_price'] ?? 0) * ($data['quantity'] ?? 1);

        $stmtSum = $pdo->prepare("SELECT COALESCE(SUM(total_price), 0) as current_sum FROM transaction_items WHERE transaction_id = :tid AND id != :item_id");
        $stmtSum->execute(['tid' => $item['transaction_id'], 'item_id' => $itemId]);
        $currentSum = (float)$stmtSum->fetch()['current_sum'];

        $remaining = (float)$item['tx_amount'] - $currentSum;
        if ($totalPrice > $remaining + 0.01) Response::error("Сумма превышает остаток (" . number_format($remaining, 2) . " руб.)", 400);

        Transaction::updateItem($itemId, $data);
        $this->success();
    }

    public function deleteItem(array $params): void {
        $user = $this->requireAuth();
        $itemId = (int)$params['itemId'];
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