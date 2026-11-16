<?php
namespace App\Controllers;

use App\Models\Report;

class ReportController extends Controller {
    // GET /api/reports/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
    public function summary(): void {
        $user = $this->requireAuth();
        
        $start = $_GET['start'] ?? date('Y-m-01'); // Начало текущего месяца
        $end = $_GET['end'] ?? date('Y-m-t');      // Конец текущего месяца

        $data = Report::getCategorySummary($user['id'], $start, $end);
        
        $this->success([
            'start' => $start,
            'end' => $end,
            'summary' => $data
        ]);
    }
}