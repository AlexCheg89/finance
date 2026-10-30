import { api } from '../api.js';
import { createTransactionCard } from '../components/TransactionCard.js';
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

            // Группируем по дате
            const grouped = res.transactions.reduce((acc, tx) => {
                const date = tx.transaction_date.split(' ')[0]; // Берем только YYYY-MM-DD
                if (!acc[date]) acc[date] = [];
                acc[date].push(tx);
                return acc;
            }, {});

            list.innerHTML = ''; // Очищаем

            // Рендерим группы
            for (const [date, txs] of Object.entries(grouped)) {
                // Считаем сумму расходов за день
                const dayExpenses = txs
                    .filter(t => t.type === 'expense')
                    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
                
                // Форматируем дату для заголовка (ДД.ММ.ГГГГ)
                const [y, m, d] = date.split('-');
                const formattedDate = `${d}.${m}.${y}`;

                const groupHeader = document.createElement('div');
                groupHeader.style.cssText = 'margin: 20px 0 10px 0; font-weight: bold; color: var(--text-main); display: flex; justify-content: space-between;';
                groupHeader.innerHTML = `
                    <span>${formattedDate}</span>
                    <span style="color: var(--danger);">Потрачено: ${formatMoney(dayExpenses, 'RUB')}</span>
                `;
                list.appendChild(groupHeader);

                txs.forEach(tx => {
                    list.appendChild(createTransactionCard(tx));
                });
            }

        } catch (err) {
            showErrorModal(err.message);
            document.getElementById('tx-list').innerHTML = `<p style="color:var(--danger)">Ошибка: ${err.message}</p>`;
        }
    }
}