<?php
namespace App\Controllers;

use App\Models\Budget;

class BudgetController extends Controller {
    
    // GET /api/budget?month=YYYY-MM
    public function index(): void {
        $user = $this->requireAuth();
        
        // Если месяц не передан, берем текущий
        $month = $_GET['month'] ?? date('Y-m');
        
        $data = Budget::getTimeline($user['id'], $month);
        
        $this->success(['budget' => $data]);
    }
}