<?php
namespace App\Models;

class Category extends Model {
    protected static string $table = 'categories';

    // Получение дерева категорий
    public static function getTree(int $userId, ?string $type = null): array {
        $instance = new static();
        // Берем все категории (и голобалыные, и личные)
        $sql ="
            SELECT id, name, type, parent_id 
            FROM categories 
            WHERE (user_id IS NULL OR user_id = :uid) 
            ORDER BY name ASC
        ";

        $params = ['uid' => $userId];

        // Если передан тип, фильтруем
        if ($type) {
            $sql .= " AND type = :type ";
            $params['type'] = $type;
        }

        $sql .= " ORDER BY name ASC";
        $stmt = $instance->db->prepare($sql);
        $stmt->execute($params);
        $all = $stmt->fetchAll();

        // Строим дерево
        $tree = [];
        $children = [];

        foreach ($all as $cat) {
            if ($cat['parent_id'] === null) {
                $tree[] = $cat;
            } else {
                $children[$cat['parent_id']][] = $cat;
            }
        }

        foreach ($tree as &$parent) {
            $parent['children'] = $children[$parent['id']] ?? [];
        }

        return $tree;
    }

    // Глобальные + личные категории (возвращает только родителей)
    public static function getGlobalAndUser(int $userId): array {
        $instance = new static();
        $stmt = $instance->db->prepare("
            SELECT id, name, type, parent_id 
            FROM categories 
            WHERE (user_id IS NULL OR user_id = :uid) 
            AND parent_id IS NULL
            ORDER BY type DESC, name
        ");
        $stmt->execute(['uid' => $userId]);
        return $stmt->fetchAll();
    } 
}