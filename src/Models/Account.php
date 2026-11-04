<?php
namespace App\Models;

class Account extends Model {
    protected static string $table = 'accounts';

    public static function getByUser(int $userId): array {
        return self::where('user_id', $userId);
    }

    public static function create(int $userId, string $name, string $type, string $currency = 'RUB', float $initialBalance = 0): int {
        $instance = new static();
        $stmt = $instance->db->prepare("
            INSERT INTO accounts (user_id, name, type, currency, balance, initial_balance) 
            VALUES (:uid, :name, :type, :currency, :balance, :initial_balance)
        ");
        $stmt->execute([
            'uid' => $userId,
            'name' => $name,
            'type' => $type,
            'currency' => $currency,
            'balance' => $initialBalance, // Текущий баланс = начальному при создании
            'initial_balance' => $initialBalance
        ]);
        
        return (int)$instance->db->lastInsertId();
    }

    // Новый метод: получить счет и его транзакции
    public static function findWithTransactions(int $id, int $userId): ?array {
        $instance = new static();
        $account = self::find($id);

        if (!$account || $account['user_id'] !== $userId) {
            return null;
        }

        // Получаем транзакции по этому счету
        $stmt = $instance->db->prepare("
            SELECT t.*, 
                   (SELECT GROUP_CONCAT(ti.name SEPARATOR ', ') FROM transaction_items ti WHERE ti.transaction_id = t.id) as items_names
            FROM transactions t
            WHERE t.account_id = :acc_id
            ORDER BY t.transaction_date ASC, t.id ASC
        ");
        $stmt->execute(['acc_id' => $id]);
        $transactions = $stmt->fetchAll();

        // Считаем баланс на лету (чтобы показать в таблице)
        $runningBalance = (float)$account['initial_balance'];
        
        foreach ($transactions as &$tx) {
            if ($tx['type'] === 'income') {
                $runningBalance += (float)$tx['amount'];
            } else {
                $runningBalance -= (float)$tx['amount'];
            }
            $tx['balance_after'] = $runningBalance;
        }

        $account['transactions'] = $transactions;
        return $account;
    }
}