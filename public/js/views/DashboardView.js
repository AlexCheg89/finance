import { api } from '../api.js';
import { store } from '../store.js';
import { formatMoney, formatDateTime } from '../utils/format.js';
import { showStatus, showErrorModal } from '../utils/status.js';
import { Modal } from '../components/Modal.js';

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
            const recent = txRes.transactions.slice(0, 5);
            
            const txContainer = document.getElementById('recent-transactions');
            if (recent.length === 0) {
                txContainer.innerHTML = '<p>Операций пока нет.</p>';
                return;
            }

            txContainer.innerHTML = recent.map(tx => this.renderTransaction(tx)).join('');

            // Добавляем обработчики кликов
            document.querySelectorAll('.tx-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.id;
                    window.dispatchEvent(new CustomEvent('navigate', { detail: `/transaction/${id}` }));
                });
            });

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

        const lastAccountId = localStorage.getItem('lastAccountId');
        const accountOptions = store.state.accounts.map(acc => {
            const isSelected = lastAccountId && acc.id.toString() === lastAccountId;
            return `<option value="${acc.id}" ${isSelected ? 'selected' : ''}>${acc.name}</option>`;
        }).join('');

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);

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
                transaction_time: document.getElementById('tx-time').value,
                items: [] 
            };

            try {
                await api.post('/transactions', payload);
                localStorage.setItem('lastAccountId', selectedAccount);
                modal.close();
                showStatus('Операция добавлена', 'success');
                await this.loadData(); 
            } catch (err) {
                showErrorModal(err.message);
            }
        });
    }

    renderTransaction(tx) {
        const isExpense = tx.type === 'expense';
        const color = isExpense ? 'var(--danger)' : 'var(--success)';
        const sign = isExpense ? '-' : '+';
        
        // Форматируем дату и время
        const formattedDate = formatDateTime(tx.transaction_date);
        
        // Проверяем, сверена ли
        const reconciledIcon = parseInt(tx.is_reconciled) === 1 ? ' &#10004;' : '';

        return `
            <div class="account-card tx-card" data-id="${tx.id}" style="margin-bottom: 10px; cursor: pointer; padding: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${tx.counterparty || 'Без контрагента'}${reconciledIcon}</strong>
                        <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">
                            ${formattedDate} &bull; ${tx.account_name}
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