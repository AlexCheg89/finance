import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { showStatus, showErrorModal } from '../utils/status.js';

export class AccountView {
    constructor() {
        this.filter = 'all'; // 'all', 'actual', 'planned'
    }

    async mount(container) {
        const hash = window.location.hash.replace('#', '');
        const accountId = hash.split('/')[2];

        container.innerHTML = `<div class="dashboard"><p>Загрузка...</p></div>`;

        try {
            const res = await api.get(`/accounts/${accountId}`);
            this.account = res.account;
            this.render(container);
        } catch (err) {
            showErrorModal(err.message);
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/accounts' }));
        }
    }

    render(container) {
        const acc = this.account;
        
        // Фильтруем транзакции
        let transactions = acc.transactions;
        if (this.filter === 'actual') {
            transactions = transactions.filter(t => t.status === 'actual');
        } else if (this.filter === 'planned') {
            transactions = transactions.filter(t => t.status === 'planned');
        }

        // Считаем баланс с учетом фильтра? Нет, баланс всегда общий (фактический).
        // Но для наглядности можно пересчитать "бегущий остаток" только для выбранных.
        // Пока оставим баланс из бэкенда, он привязан к каждой транзакции.

        container.innerHTML = `
            <div class="dashboard" style="max-width: 1100px;">
                <header>
                    <h1>${acc.name}</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: rgba(255,255,255,0.5); padding: 15px; border-radius: 12px;">
                    <div>
                        <p style="color: var(--text-muted); font-size: 0.9em;">Текущий баланс</p>
                        <h2 style="color: var(--success);">${formatMoney(acc.balance, acc.currency)}</h2>
                    </div>
                    <div>
                        <p style="color: var(--text-muted); font-size: 0.9em;">Начальный баланс</p>
                        <h3>${formatMoney(acc.initial_balance, acc.currency)}</h3>
                    </div>
                    <div>
                        <button id="recalc-btn" style="background: #6c757d; width: auto; padding: 8px 15px; font-size: 0.9em;">
                            &#9881; Пересчитать начальный баланс
                        </button>
                    </div>
                </div>

                <!-- Фильтры -->
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button class="filter-btn ${this.filter === 'all' ? 'active' : ''}" data-filter="all" style="width: auto; padding: 5px 15px; background: ${this.filter === 'all' ? 'var(--primary)' : '#6c757d'}; font-size: 0.9em;">Все</button>
                    <button class="filter-btn ${this.filter === 'actual' ? 'active' : ''}" data-filter="actual" style="width: auto; padding: 5px 15px; background: ${this.filter === 'actual' ? 'var(--primary)' : '#6c757d'}; font-size: 0.9em;">Факт</button>
                    <button class="filter-btn ${this.filter === 'planned' ? 'active' : ''}" data-filter="planned" style="width: auto; padding: 5px 15px; background: ${this.filter === 'planned' ? 'var(--primary)' : '#6c757d'}; font-size: 0.9em;">План</button>
                </div>

                <h3>История операций</h3>
                <div style="background: rgba(255,255,255,0.5); border-radius: 12px; overflow-x: auto; margin-top: 10px;">
                    <div style="display: grid; grid-template-columns: 80px 1fr 120px 140px; gap: 10px; padding: 15px; font-weight: bold; background: rgba(0,0,0,0.05); font-size: 0.9em; color: var(--text-muted); min-width: 700px;">
                        <div>Дата</div>
                        <div>Описание</div>
                        <div style="text-align: right;">Сумма</div>
                        <div style="text-align: right;">Баланс</div>
                    </div>

                    ${transactions.length === 0 ? '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Нет операций</div>' : ''}

                    ${transactions.map(tx => {
                        const isIncome = tx.type === 'income';
                        const sign = isIncome ? '+' : '-';
                        const amountColor = isIncome ? 'var(--success)' : 'var(--danger)';
                        const balanceColor = tx.balance_after < 0 ? 'var(--danger)' : 'var(--text-main)';
                        
                        // Выделяем плановые операции
                        const isPlanned = tx.status === 'planned';
                        const rowStyle = isPlanned ? 'opacity: 0.6; font-style: italic;' : '';
                        const plannedBadge = isPlanned ? '<span style="font-size: 0.8em; color: #f59e0b; margin-left: 5px;">(План)</span>' : '';

                        const dateObj = new Date(tx.transaction_date.replace(' ', 'T'));
                        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + dateObj.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});

                        return `
                            <div style="display: grid; grid-template-columns: 80px 1fr 120px 140px; gap: 10px; padding: 10px 15px; border-bottom: 1px solid rgba(0,0,0,0.05); align-items: center; font-size: 0.95em; ${rowStyle}">
                                <div style="color: var(--text-muted);">${dateStr}</div>
                                <div>
                                    <div style="font-weight: 500;">${tx.items_names ? tx.items_names : (tx.counterparty || 'Без описания')} ${plannedBadge}</div>
                                </div>
                                <div style="text-align: right; font-weight: bold; color: ${amountColor};">
                                    ${sign}${formatMoney(tx.amount, acc.currency)}
                                </div>
                                <div style="text-align: right; font-weight: 600; color: ${balanceColor};">
                                    ${formatMoney(tx.balance_after, acc.currency)}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/accounts' }));
        });

        // Обработчики фильтров
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filter = e.target.dataset.filter;
                this.render(container); // Перерисовываем страницу с новым фильтром
            });
        });

        // Кнопка пересчета
        document.getElementById('recalc-btn').addEventListener('click', async () => {
            if (!confirm('Пересчитать начальный баланс на основе текущего и всех операций?')) return;
            
            try {
                await api.post(`/accounts/${acc.id}/recalculate-balance`);
                showStatus('Начальный баланс пересчитан', 'success');
                const res = await api.get(`/accounts/${acc.id}`);
                this.account = res.account;
                this.render(container);
            } catch (err) {
                showErrorModal(err.message);
            }
        });
    }
}