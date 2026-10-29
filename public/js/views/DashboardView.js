import { api } from '../api.js';
import { store } from '../store.js';

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
            <div class="dashboard">
                <h1>Привет, ${store.state.user.username}!</h1>
                <button id="logout-btn">Выйти</button>
                <h2>Мои счета</h2>
                <ul id="accounts-list"><li>Загрузка...</li></ul>
            </div>
        `;

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await api.post('/auth/logout');
            store.set('user', null);
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        });

        try {
            const res = await api.get('/accounts');
            const list = document.getElementById('accounts-list');
            if (res.accounts.length === 0) {
                list.innerHTML = '<li>Счетов пока нет</li>';
            } else {
                list.innerHTML = res.accounts.map(acc => `
                    <li><strong>${acc.name}</strong> (${acc.type}): ${acc.balance} ${acc.currency}</li>
                `).join('');
            }
        } catch (e) {
            console.error(e);
        }
    }
}