import { api } from '../api.js';
import { createTransactionCard } from '../components/TransactionCard.js';
import { formatMoney } from '../utils/format.js';
import { showErrorModal } from '../utils/status.js';
import { store } from '../store.js';

export class TransactionsView {
    async mount(container) {
        this.container = container;
        
        // По умолчанию текущий месяц
        const now = new Date();
        this.currentMonth = now.toISOString().slice(0, 7);
        this.currentAccount = '';
        this.currentStatus = '';

        // Загружаем счета для фильтра
        let accounts = store.state.accounts;
        if (!accounts || accounts.length === 0) {
            const res = await api.get('/accounts');
            accounts = res.accounts;
            store.set('accounts', accounts);
        }

        const accountOptions = accounts.map(acc => 
            `<option value="${acc.id}">${acc.name}</option>`
        ).join('');

        container.innerHTML = `
            <div class="dashboard" style="max-width: 1100px;">
                <header>
                    <h1>История операций</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="display: flex; gap: 10px; margin-bottom: 20px; background: rgba(255,255,255,0.5); padding: 15px; border-radius: 12px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px;">
                        <label class="col-muted" style="font-size: 0.85em;">Месяц</label>
                        <input type="month" id="filter-month" value="${this.currentMonth}" style="margin-bottom: 0;">
                    </div>
                    <div style="flex: 1; min-width: 150px;">
                        <label class="col-muted" style="font-size: 0.85em;">Счет</label>
                        <select id="filter-account" style="margin-bottom: 0;">
                            <option value="">Все счета</option>
                            ${accountOptions}
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 150px;">
                        <label class="col-muted" style="font-size: 0.85em;">Тип</label>
                        <select id="filter-status" style="margin-bottom: 0;">
                            <option value="">Все</option>
                            <option value="actual">Только факт</option>
                            <option value="planned">Только план</option>
                        </select>
                    </div>
                    <div style="display: flex; align-items: flex-end;">
                        <button id="apply-filter-btn" style="width: auto; padding: 10px 20px;">Применить</button>
                    </div>
                </div>

                <div id="tx-list" style="margin-top: 20px;">
                    <p>Загрузка...</p>
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });

        document.getElementById('apply-filter-btn').addEventListener('click', () => {
            this.currentMonth = document.getElementById('filter-month').value;
            this.currentAccount = document.getElementById('filter-account').value;
            this.currentStatus = document.getElementById('filter-status').value;
            this.loadTransactions();
        });

        await this.loadTransactions();
    }

    async loadTransactions() {
        const list = document.getElementById('tx-list');
        list.innerHTML = '<p>Загрузка...</p>';

        try {
            let url = `/transactions?`;
            if (this.currentMonth) url += `month=${this.currentMonth}&`;
            if (this.currentAccount) url += `account_id=${this.currentAccount}&`;
            if (this.currentStatus) url += `status=${this.currentStatus}&`;

            const res = await api.get(url);
            
            if (res.transactions.length === 0) {
                list.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Нет операций по выбранным фильтрам.</p>';
                return;
            }

            // Группируем по дате
            const grouped = res.transactions.reduce((acc, tx) => {
                const date = tx.transaction_date.split(' ')[0];
                if (!acc[date]) acc[date] = [];
                acc[date].push(tx);
                return acc;
            }, {});

            list.innerHTML = '';

            for (const [date, txs] of Object.entries(grouped)) {
                const dayExpenses = txs
                    .filter(t => t.type === 'expense' && t.status === 'actual')
                    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
                
                const [y, m, d] = date.split('-');
                const formattedDate = `${d}.${m}.${y}`;

                const groupHeader = document.createElement('div');
                groupHeader.style.cssText = 'margin: 20px 0 10px 0; font-weight: bold; color: var(--text-main); display: flex; justify-content: space-between;';
                groupHeader.innerHTML = `
                    <span>${formattedDate}</span>
                    <span style="color: var(--danger);">Расход (факт): ${formatMoney(dayExpenses, 'RUB')}</span>
                `;
                list.appendChild(groupHeader);

                txs.forEach(tx => {
                    list.appendChild(createTransactionCard(tx));
                });
            }

        } catch (err) {
            showErrorModal(err.message);
            list.innerHTML = `<p style="color:var(--danger)">Ошибка: ${err.message}</p>`;
        }
    }
}