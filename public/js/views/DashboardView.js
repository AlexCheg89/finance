import { api } from '../api.js';
import { store } from '../store.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { showStatus } from '../utils/status.js';

export class DashboardView {
    async mount(container) {
        if (!store.state.user) {
            try {
                const res = await api.get('/auth/me');
                store.set('user', res.user);
            } catch (e) {
                window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
                return;
            }
        }

        container.innerHTML = `
            <div class="dashboard">
                <header>
                    <h1>Привет, ${store.state.user.username}!</h1>
                    <button id="logout-btn" style="width:auto; padding: 5px 15px;">
                        &#128682; Выйти
                    </button>
                </header>
                
                <div style="margin-bottom: 20px; display: flex; gap: 10px;">
                    <button id="go-accounts">&#128179; Мои счета</button>
                    <button id="go-transactions" style="background: #6c757d;">&#128220; Все транзакции</button>
                </div>

                <h2>Общий баланс</h2>
                <div id="total-balance" style="font-size: 2em; font-weight: bold; color: var(--success); margin-bottom: 30px;">
                    Загрузка...
                </div>

                <h2>Последние операции</h2>
                <div id="recent-transactions" style="margin-top: 15px;">
                    <p>Загрузка...</p>
                </div>
            </div>
        `;

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await api.post('/auth/logout');
            store.set('user', null);
            showStatus('Вы вышли из системы', 'info');
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        });

        document.getElementById('go-accounts').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/accounts' }));
        });

        document.getElementById('go-transactions').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/transactions' }));
        });

        await this.loadData();
    }

    async loadData() {
        try {
            // 1. Загружаем счета и считаем баланс
            const accRes = await api.get('/accounts');
            store.set('accounts', accRes.accounts);
            const total = accRes.accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
            document.getElementById('total-balance').textContent = formatMoney(total, 'RUB');

            // 2. Загружаем транзакции
            const txRes = await api.get('/transactions');
            const recent = txRes.transactions.slice(0, 5); // Берем только 5 последних
            
            const txContainer = document.getElementById('recent-transactions');
            if (recent.length === 0) {
                txContainer.innerHTML = '<p>Операций пока нет.</p>';
                return;
            }

            txContainer.innerHTML = recent.map(tx => this.renderTransaction(tx)).join('');

        } catch (e) {
            document.getElementById('total-balance').textContent = 'Ошибка';
            showStatus('Не удалось загрузить данные', 'error');
        }
    }

    // Вспомогательный метод для рендера одной транзакции (чтобы не дублировать код)
    renderTransaction(tx) {
        const isExpense = tx.type === 'expense';
        const color = isExpense ? 'var(--danger)' : 'var(--success)';
        const sign = isExpense ? '-' : '+';
        
        return `
            <div class="account-card" style="margin-bottom: 10px; cursor: default; padding: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${tx.counterparty || 'Без контрагента'}</strong>
                        <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">
                            ${formatDate(tx.transaction_date)} &bull; ${tx.account_name}
                        </div>
                    </div>
                    <div style="font-weight: bold; color: ${color}; font-size: 1.1em;">
                        ${sign}${formatMoney(tx.amount, 'RUB')}
                    </div>
                </div>
            </div>
        `;
    }
}