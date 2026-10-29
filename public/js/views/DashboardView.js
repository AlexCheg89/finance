import { api } from '../api.js';
import { store } from '../store.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { showStatus } from '../utils/status.js';
import { Modal } from '../components/Modal.js'; // Подключаем модалку

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
                
                <div style="margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="go-accounts">&#128179; Мои счета</button>
                    <button id="go-transactions" style="background: #6c757d;">&#128220; Все транзакции</button>
                    <button id="btn-add-tx" style="background: var(--success);">&#10133; Добавить операцию</button>
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

        // Обработчик кнопки добавления операции
        document.getElementById('btn-add-tx').addEventListener('click', () => {
            this.openAddTransactionModal();
        });

        await this.loadData();
    }

    async loadData() {
        try {
            const accRes = await api.get('/accounts');
            store.set('accounts', accRes.accounts);
            const total = accRes.accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
            document.getElementById('total-balance').textContent = formatMoney(total, 'RUB');

            const txRes = await api.get('/transactions');
            const recent = txRes.transactions.slice(0, 5); // Берем 5 последних
            
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

    openAddTransactionModal() {
        if (!store.state.accounts || store.state.accounts.length === 0) {
            showStatus('Сначала создайте хотя бы один счет!', 'error');
            return;
        }

        // Получаем ID последнего использованного счета из localStorage
        const lastAccountId = localStorage.getItem('lastAccountId');

        // Формируем опции для select, помечая нужный счет как selected
        const accountOptions = store.state.accounts.map(acc => {
            const isSelected = lastAccountId && acc.id.toString() === lastAccountId;
            return `<option value="${acc.id}" ${isSelected ? 'selected' : ''}>${acc.name}</option>`;
        }).join('');

        // Текущая дата и время
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5); // Формат HH:MM

        const formHTML = `
            <form id="quick-tx-form">
                <select id="tx-type">
                    <option value="expense">Расход</option>
                    <option value="income">Доход</option>
                </select>
                <input type="number" id="tx-amount" placeholder="Сумма (например, 500)" step="0.01" required>
                <select id="tx-account">
                    ${accountOptions}
                </select>
                <input type="text" id="tx-counterparty" placeholder="Контрагент (например, Пятерочка)">
                
                <div style="display: flex; gap: 10px;">
                    <input type="date" id="tx-date" value="${today}" required style="flex: 2;">
                    <input type="time" id="tx-time" value="${currentTime}" required style="flex: 1;">
                </div>
                
                <button type="submit" style="margin-top: 10px; width: 100%;">Сохранить</button>
            </form>
        `;

        const modal = new Modal('Новая операция', formHTML);
        modal.open();

        document.getElementById('quick-tx-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const selectedAccount = document.getElementById('tx-account').value;

            const payload = {
                type: document.getElementById('tx-type').value,
                amount: parseFloat(document.getElementById('tx-amount').value),
                account_id: parseInt(selectedAccount),
                counterparty: document.getElementById('tx-counterparty').value,
                transaction_date: document.getElementById('tx-date').value,
                transaction_time: document.getElementById('tx-time').value, // Передаем время
                items: [] 
            };

            try {
                await api.post('/transactions', payload);
                
                // ЗАПОМИНАЕМ ПОСЛЕДНИЙ СЧЕТ
                localStorage.setItem('lastAccountId', selectedAccount);

                modal.close();
                showStatus('Операция добавлена', 'success');
                await this.loadData(); 
            } catch (err) {
                showStatus(err.message, 'error');
            }
        });
    }

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