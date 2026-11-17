<?php
namespace App\Models;

use App\Database;
use PDO;

class Debt extends Model {
    protected static string $table = 'debts';

    public static function getTree(int $userId): array {
        $instance = new static();
        $stmt = $instance->db->prepare("
            SELECT d.*, c.name as category_name 
            FROM debts d
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE d.user_id = :uid
            ORDER BY d.type ASC, d.name ASC
        ");
        $stmt->execute(['uid' => $userId]);
        $all = $stmt->fetchAll();

        $tree = [];
        $children = [];

        foreach ($all as $debt) {
            if ($debt['parent_id'] === null) {
                $tree[] = $debt;
            } else {
                $children[$debt['parent_id']][] = $debt;
            }
        }

        foreach ($tree as &$parent) {
            $parent['children'] = $children[$parent['id']] ?? [];
        }

        return $tree;
    }
}