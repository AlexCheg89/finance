import { api } from '../api.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { showStatus } from '../utils/status.js';

export class TransactionsView {
    async mount(container) {
        container.innerHTML = `
            <div class="dashboard">
                <header>
                    <h1>История операций</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>
                <div id="tx-list" style="margin-top: 20px;">
                    <p>Загрузка...</p>
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });

        try {
            const res = await api.get('/transactions');
            const list = document.getElementById('tx-list');

            if (res.transactions.length === 0) {
                list.innerHTML = '<p>Транзакций пока нет.</p>';
                return;
            }

            // Рендерим список
            list.innerHTML = res.transactions.map(tx => {
                const isExpense = tx.type === 'expense';
                const color = isExpense ? 'var(--danger)' : 'var(--success)';
                const sign = isExpense ? '-' : '+';
                
                return `
                    <div class="account-card" style="margin-bottom: 10px; cursor: default;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${tx.counterparty || 'Без контрагента'}</strong>
                                <div style="font-size: 0.85em; color: var(--text-muted);">
                                    ${formatDate(tx.transaction_date)} | ${tx.account_name}
                                </div>
                            </div>
                            <div style="font-weight: bold; color: ${color}; font-size: 1.2em;">
                                ${sign}${formatMoney(tx.amount, 'RUB')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (err) {
            showStatus(err.message, 'error');
            document.getElementById('tx-list').innerHTML = `<p style="color:var(--danger)">Ошибка: ${err.message}</p>`;
        }
    }
}