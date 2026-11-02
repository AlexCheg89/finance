import { api } from '../api.js';
import { store } from '../store.js';
import { formatMoney, formatDateTime } from '../utils/format.js';
import { showStatus, showErrorModal } from '../utils/status.js';
import { Modal } from '../components/Modal.js';
import { createTransactionCard } from '../components/TransactionCard.js';

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
                    <button id="logout-btn" style="width:auto; padding: 5px 15px;">&#128682; Выйти</button>
                </header>
                
                <div style="margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="go-accounts">&#128179; Мои счета</button>
                    <button id="go-transactions" style="background: #6c757d;">&#128220; Все транзакции</button>
                    <button id="btn-add-tx" style="background: var(--success);">&#10133; Добавить операцию</button>
                </div>

                <h2>Общий баланс</h2>
                <div id="total-balance" style="font-size: 2em; font-weight: bold; color: var(--success); margin-bottom: 30px;">Загрузка...</div>

                <h2>Последние операции</h2>
                <div id="recent-transactions" style="margin-top: 15px;"><p>Загрузка...</p></div>
            </div>
        `;

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await api.post('/auth/logout');
            store.set('user', null);
            showStatus('Вы вышли из системы', 'info');
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        });

        document.getElementById('go-accounts').addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: '/accounts' })));
        document.getElementById('go-transactions').addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: '/transactions' })));
        document.getElementById('btn-add-tx').addEventListener('click', () => this.openAddTransactionModal());

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
            txContainer.innerHTML = '';
            
            if (recent.length === 0) {
                txContainer.innerHTML = '<p>Операций пока нет.</p>';
                return;
            }
            recent.forEach(tx => txContainer.appendChild(createTransactionCard(tx)));
        } catch (e) {
            document.getElementById('total-balance').textContent = 'Ошибка';
            showErrorModal('Не удалось загрузить данные');
        }
    }

    async openAddTransactionModal() {
        if (!store.state.accounts || store.state.accounts.length === 0) {
            showErrorModal('Сначала создайте хотя бы один счет!');
            return;
        }

        const lastAccountId = localStorage.getItem('lastAccountId');
        const accountOptions = store.state.accounts.map(acc => 
            `<option value="${acc.id}" ${lastAccountId === acc.id.toString() ? 'selected' : ''}>${acc.name}</option>`
        ).join('');

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);

        // Подгружаем категории
        const catRes = await api.get('/categories');
        const catOptions = catRes.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        const formHTML = `
            <form id="quick-tx-form">
                <select id="tx-type">
                    <option value="expense">Расход</option>
                    <option value="income">Доход</option>
                </select>
                <input type="number" id="tx-amount" placeholder="Сумма (например, 500)" step="0.01" required>
                <select id="tx-account">${accountOptions}</select>
                <input type="text" id="tx-counterparty" placeholder="Контрагент (например, Пятерочка)">
                
                <div style="display: flex; gap: 10px;">
                    <input type="date" id="tx-date" value="${today}" required style="flex: 2;">
                    <input type="time" id="tx-time" value="${currentTime}" required style="flex: 1;">
                </div>

                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(0,0,0,0.1);">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <input type="checkbox" id="tx-has-details" style="width: auto; margin: 0;">
                        <label for="tx-has-details" style="font-size: 0.9em; cursor: pointer;">Будет детализация (позиции)</label>
                    </div>
                    <div id="single-category-container">
                        <label style="font-size: 0.8em; color: var(--text-muted);">Категория</label>
                        <select id="tx-category"><option value="">Без категории</option>${catOptions}</select>
                    </div>
                </div>
                
                <button type="submit" style="margin-top: 15px; width: 100%;">Сохранить</button>
            </form>
        `;

        const modal = new Modal('Новая операция', formHTML);
        modal.open();

        // Переключение видимости категории
        document.getElementById('tx-has-details').addEventListener('change', (e) => {
            document.getElementById('single-category-container').style.display = e.target.checked ? 'none' : 'block';
        });

        document.getElementById('quick-tx-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedAccount = document.getElementById('tx-account').value;
            const hasDetails = document.getElementById('tx-has-details').checked;
            const catId = document.getElementById('tx-category').value;
            const amountVal = parseFloat(document.getElementById('tx-amount').value);

            // Если детализации нет, но категория выбрана — создаем одну позицию
            const items = (!hasDetails && catId) ? [{
                name: 'Основная сумма',
                category_id: parseInt(catId),
                quantity: 1,
                unit_price: amountVal,
                total_price: amountVal
            }] : [];

            const payload = {
                type: document.getElementById('tx-type').value,
                amount: amountVal,
                account_id: parseInt(selectedAccount),
                counterparty: document.getElementById('tx-counterparty').value,
                transaction_date: document.getElementById('tx-date').value,
                transaction_time: document.getElementById('tx-time').value,
                items: items
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
}