<?php
namespace App\Controllers;

use App\Models\Budget;
use App\Database;
use App\Response;
use Exception;

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

        // 1. Получаем расчет на этот месяц (включая final_balances)
        $result = Budget::getTimeline($user['id'], $month);
        
        if (!isset($result['final_balances'])) {
            Response::error('Ошибка: не удалось получить балансы для закрытия', 500);
        }

        $pdo = Database::getConnection();

        try {
            $pdo->beginTransaction();

            // 2. Удаляем старые снимки за этот месяц (если закрываем повторно)
            $stmtDel = $pdo->prepare("DELETE FROM monthly_snapshots WHERE user_id = :uid AND month = :month");
            $stmtDel->execute(['uid' => $user['id'], 'month' => $month]);

            // 3. Сохраняем новые снимки для каждого кошелька

            $stmtIns = $pdo->prepare("
                INSERT INTO monthly_snapshots (user_id, account_id, month, balance) 
                VALUES (:uid, :acc, :month, :balance)
            ");
            foreach ($result['final_balances'] as $accountId => $balance) {
                $stmtIns->execute([
                    'uid' => $user['id'],
                    'acc' => $accountId,
                    'month' => $month,
                    'balance' => $balance
                ]);
            }
        
            $pdo->commit();
            $this->success(['message' => "Месяц $month успешно закрыт. Снимок балансов сохранен."]);
        } catch (Exception $e) {
            $pdo->rollBack();
            Response::error('Ошибка при закрытии месяца: ' . $e->getMessage(), 500);
        }
    }
}