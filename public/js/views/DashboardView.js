import { api } from '../api.js';
import { store } from '../store.js';
import { formatMoney } from '../utils/format.js';
import { showStatus } from '../utils/status.js';

export class DashboardView {
    async mount(container) {
        // Проверяем, есть ли пользователь
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
            <header>
                    <h1>Привет, ${store.state.user.username}!</h1>
                    <button id="logout-btn">
                        &#128682;
                        Выйти
                    </button>
                </header>
                <div style="margin-bottom: 20px;">
                    <button id="go-accounts">&#128179; Мои счета</button>
                </div>

                <h2>Общий баланс</h2>
                <div id="total-balance" style="font-size: 2em; font-weight: bold; color: var(--success);">
                    Загрузка...
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

         try {
            const res = await api.get('/accounts');
            store.set('accounts', res.accounts);
            
            const total = res.accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
            document.getElementById('total-balance').textContent = formatMoney(total, 'RUB');
        } catch (e) {
            document.getElementById('total-balance').textContent = 'Ошибка';
            showStatus('Не удалось загрузить счета', 'error');
        }
    }
}