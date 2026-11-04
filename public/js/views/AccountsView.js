import { api } from '../api.js';
import { store } from '../store.js';
import { formatMoney } from '../utils/format.js';
import { showStatus, showErrorModal } from '../utils/status.js';

export class AccountsView {
    async mount(container) {
        container.innerHTML = `
            <div class="dashboard">
                <header>
                    <h1>Мои счета</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div class="account-form" style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <h3>Добавить счет</h3>
                    <form id="add-account-form" style="display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px;">
                            <input type="text" id="acc-name" placeholder="Название (Тинькофф, Наличные...)" required style="margin-bottom: 0;">
                        </div>
                        <div style="flex: 1; min-width: 150px;">
                            <select id="acc-type" style="margin-bottom: 0;">
                                <option value="card">Карта</option>
                                <option value="cash">Наличные</option>
                                <option value="bank">Банковский счет</option>
                                <option value="savings">Накопления</option>
                            </select>
                        </div>
                        <div style="flex: 1; min-width: 150px;">
                            <input type="number" id="acc-balance" placeholder="Начальный баланс" step="0.01" value="0.00" style="margin-bottom: 0;">
                        </div>
                        <button type="submit" style="width: auto;">Создать</button>
                    </form>
                </div>

                <div class="accounts-grid" id="accounts-grid">
                    <p>Загрузка...</p>
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });

        document.getElementById('add-account-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('acc-name').value;
            const type = document.getElementById('acc-type').value;
            const initialBalance = parseFloat(document.getElementById('acc-balance').value) || 0;

            try {
                await api.post('/accounts', { name, type, currency: 'RUB', initial_balance: initialBalance });
                document.getElementById('acc-name').value = '';
                document.getElementById('acc-balance').value = '0.00';
                showStatus('Счет успешно создан', 'success');
                await this.loadAccounts();
            } catch (err) {
                showErrorModal(err.message);
            }
        });

        await this.loadAccounts();
    }

    async loadAccounts() {
        const grid = document.getElementById('accounts-grid');
        try {
            const res = await api.get('/accounts');
            store.set('accounts', res.accounts);

            if (res.accounts.length === 0) {
                grid.innerHTML = '<p>Счетов пока нет. Создайте первый!</p>';
                return;
            }

            grid.innerHTML = res.accounts.map(acc => `
                <div class="account-card" data-id="${acc.id}">
                    <h3>${acc.name}</h3>
                    <p style="color: var(--text-muted); font-size: 0.9em;">${this.translateType(acc.type)}</p>
                    <p style="font-size: 1.3em; font-weight: bold; color: var(--success); margin-top: 10px;">
                        ${formatMoney(acc.balance, acc.currency)}
                    </p>
                </div>
            `).join('');

            grid.querySelectorAll('.account-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.id;
                    window.dispatchEvent(new CustomEvent('navigate', { detail: `/account/${id}` }));
                });
            });

        } catch (err) {
            grid.innerHTML = `<p style="color: var(--danger)">Ошибка: ${err.message}</p>`;
        }
    }

    translateType(type) {
        const map = { card: 'Карта', cash: 'Наличные', bank: 'Банк', savings: 'Накопления' };
        return map[type] || type;
    }
}