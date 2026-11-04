import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { showErrorModal } from '../utils/status.js';

export class BudgetView {
    async mount(container) {
        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);

        container.innerHTML = `
            <div class="dashboard" style="max-width: 1100px;">
                <header>
                    <h1>Движение средств (Cash Flow)</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="margin-bottom: 20px;">
                    <input type="month" id="month-picker" value="${currentMonth}" style="max-width: 200px;">
                </div>

                <div id="budget-content">
                    <p>Загрузка...</p>
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });

        const monthPicker = document.getElementById('month-picker');
        monthPicker.addEventListener('change', (e) => this.loadBudget(e.target.value));

        await this.loadBudget(currentMonth);
    }

    async loadBudget(month) {
        const content = document.getElementById('budget-content');
        content.innerHTML = '<p>Загрузка...</p>';

        try {
            const res = await api.get(`/budget?month=${month}`);
            const b = res.budget;
            
            const [year, m] = month.split('-');
            const monthName = new Date(year, m - 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

            // Шапка с итогами
            let headerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px; background: rgba(255,255,255,0.5); padding: 15px; border-radius: 12px;">
                    <div>
                        <p style="color: var(--text-muted);">Баланс на начало: <strong>${formatMoney(b.start_balance, 'RUB')}</strong></p>
                    </div>
                    <div style="text-align: right;">
                        <p style="color: var(--text-muted);">Прогноз на конец:</p>
                        <h2 style="color: ${b.end_balance < 0 ? 'var(--danger)' : 'var(--success)'};">
                            ${formatMoney(b.end_balance, 'RUB')}
                        </h2>
                    </div>
                </div>
            `;

            // Таблица
            let tableHTML = `
                <div style="background: rgba(255,255,255,0.5); border-radius: 12px; overflow-x: auto;">
                    <!-- Шапка таблицы -->
                    <div style="display: grid; grid-template-columns: 80px 150px 1fr 120px 120px 140px; gap: 10px; padding: 15px; font-weight: bold; background: rgba(0,0,0,0.05); font-size: 0.9em; color: var(--text-muted); min-width: 900px;">
                        <div>Дата</div>
                        <div>Категория</div>
                        <div>Описание</div>
                        <div style="text-align: right;">План</div>
                        <div style="text-align: right;">Факт</div>
                        <div style="text-align: right;">Баланс</div>
                    </div>

                    <!-- Строки -->
                    ${b.transactions.map(tx => {
                        const isIncome = tx.type === 'income';
                        const sign = isIncome ? '+' : '-';
                        const amountColor = isIncome ? 'var(--success)' : 'var(--danger)';
                        const balanceColor = tx.balance_after < 0 ? 'var(--danger)' : 'var(--text-main)';
                        
                        // Разделяем на План и Факт
                        const planAmount = tx.status === 'planned' ? `${sign}${formatMoney(tx.amount, 'RUB')}` : '';
                        const factAmount = tx.status === 'actual' ? `${sign}${formatMoney(tx.amount, 'RUB')}` : '';
                        
                        const planColor = tx.status === 'planned' ? amountColor : 'transparent';
                        const factColor = tx.status === 'actual' ? amountColor : 'transparent';

                        const dateObj = new Date(tx.transaction_date.replace(' ', 'T'));
                        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

                        return `
                            <div style="display: grid; grid-template-columns: 80px 150px 1fr 120px 120px 140px; gap: 10px; padding: 10px 15px; border-bottom: 1px solid rgba(0,0,0,0.05); align-items: center; font-size: 0.95em; ${tx.is_future ? 'background: rgba(255,255,255,0.3);' : ''}">
                                <div style="color: var(--text-muted);">${dateStr}</div>
                                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tx.category_name || '-'}</div>
                                <div>
                                    <div style="font-weight: 500;">${tx.description}</div>
                                    <div style="font-size: 0.8em; color: var(--text-muted);">${tx.account_name}</div>
                                </div>
                                <div style="text-align: right; font-weight: bold; color: ${planColor};">
                                    ${planAmount}
                                </div>
                                <div style="text-align: right; font-weight: bold; color: ${factColor};">
                                    ${factAmount}
                                </div>
                                <div style="text-align: right; font-weight: 600; color: ${balanceColor};">
                                    ${formatMoney(tx.balance_after, 'RUB')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    ${b.transactions.length === 0 ? `
                        <div style="padding: 20px; text-align: center; color: var(--text-muted);">
                            Нет операций за этот период.
                        </div>
                    ` : ''}
                </div>
            `;

            content.innerHTML = headerHTML + tableHTML;
            
        } catch (err) {
            showErrorModal(err.message);
            content.innerHTML = `<p style="color: var(--danger);">Ошибка загрузки бюджета</p>`;
        }
    }
}