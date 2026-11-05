<?php
namespace App\Controllers;

use App\Models\Budget;
use App\Database;

class BudgetController extends Controller {
    
    public function index(): void {
        $user = $this->requireAuth();
        $month = $_GET['month'] ?? date('Y-m');
        
        $data = Budget::getTimeline($user['id'], $month);
        
        $this->success(['budget' => $data]);
    }

    // POST /api/budget/close-month
    public function closeMonth(): void {
        $user = $this->requireAuth();
        $data = json_decode(file_get_contents('php://input'), true);
        $month = $data['month'] ?? date('Y-m');

        // Получаем расчет на этот месяц, чтобы узнать конечный баланс
        $result = Budget::getTimeline($user['id'], $month);
        $endBalance = $result['end_balance'];

        // Сохраняем снимок
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO monthly_snapshots (user_id, month, total_balance) 
            VALUES (:uid, :month, :balance)
            ON DUPLICATE KEY UPDATE total_balance = :balance
        ");
        $stmt->execute(['uid' => $user['id'], 'month' => $month, 'balance' => $endBalance]);

        $this->success(['message' => "Месяц $month закрыт. Баланс: " . number_format($endBalance, 2)]);
    }
}