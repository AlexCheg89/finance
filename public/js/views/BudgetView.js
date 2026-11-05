import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { showErrorModal, showStatus } from '../utils/status.js';
import { Modal } from '../components/Modal.js';

export class BudgetView {
    async mount(container) {
        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);

        container.innerHTML = `
            <div class="dashboard" style="max-width: 1300px;">
                <header>
                    <h1>Движение средств (Cash Flow)</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="margin-bottom: 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <input type="month" id="month-picker" value="${currentMonth}" style="max-width: 200px; margin-bottom: 0;">
                    <button id="add-plan-btn" style="background: var(--primary); width: auto; padding: 8px 15px;">
                        &#10133; Запланировать
                    </button>
                    <button id="close-month-btn" style="background: #6c757d; width: auto; padding: 8px 15px;" disabled>
                        &#128274; Закрыть месяц
                    </button>
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

        document.getElementById('add-plan-btn').addEventListener('click', () => {
            this.openPlanModal(monthPicker.value);
        });

        document.getElementById('close-month-btn').addEventListener('click', () => {
            this.closeMonth(monthPicker.value);
        });

        await this.loadBudget(currentMonth);
    }

    async loadBudget(month) {
        const content = document.getElementById('budget-content');
        content.innerHTML = '<p>Загрузка...</p>';

        try {
            const res = await api.get(`/budget?month=${month}`);
            const b = res.budget;
            
            // Логика блокировки кнопки
            const today = new Date();
            const isCurrentOrPastMonth = today.toISOString().slice(0, 7) >= month;
            const hasUnreconciled = b.transactions.some(tx => tx.status === 'actual' && parseInt(tx.is_reconciled) === 0);
            
            const closeBtn = document.getElementById('close-month-btn');
            if (isCurrentOrPastMonth && !hasUnreconciled) {
                closeBtn.disabled = false;
                closeBtn.style.background = '#f59e0b';
            } else {
                closeBtn.disabled = true;
                closeBtn.style.background = '#6c757d';
            }

            let headerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px; background: rgba(255,255,255,0.5); padding: 15px; border-radius: 12px;">
                    <div>
                        <p class="col-muted" style="font-size: 0.9em;">Баланс на начало месяца:</p>
                        <h3>${formatMoney(b.start_balance, 'RUB')}</h3>
                    </div>
                    <div style="text-align: right;">
                        <p class="col-muted" style="font-size: 0.9em;">Прогноз на конец месяца:</p>
                        <h2 style="color: ${b.end_balance < 0 ? 'var(--danger)' : 'var(--success)'};">
                            ${formatMoney(b.end_balance, 'RUB')}
                        </h2>
                    </div>
                </div>
            `;

            let tableHTML = `
                <div class="budget-table">
                    <!-- Шапка -->
                    <div class="budget-table-header">
                        <div>Дата</div>
                        <div>Категория</div>
                        <div>Описание</div>
                        <div class="col-right">План</div>
                        <div class="col-right">Факт</div>
                        <div class="col-right">Баланс</div>
                        <div class="col-center">Сверено</div>
                    </div>

                    <!-- Строки -->
                    ${b.transactions.map(tx => {
                        const isIncome = tx.type === 'income';
                        const sign = isIncome ? '+' : '-';
                        const amountClass = isIncome ? 'text-income' : 'text-expense';
                        const balanceClass = tx.balance_after < 0 ? 'text-balance-negative' : 'text-balance-normal';
                        
                        // Если плана нет, выводим 0
                        const planAmount = tx.status === 'planned' 
                            ? `${sign}${formatMoney(tx.amount, 'RUB')}` 
                            : `0,00 ₽`;
                        const factAmount = tx.status === 'actual' 
                            ? `${sign}${formatMoney(tx.amount, 'RUB')}` 
                            : `0,00 ₽`;
                        
                        const planColor = tx.status === 'planned' ? amountClass : 'col-muted';
                        const factColor = tx.status === 'actual' ? amountClass : 'col-muted';

                        const dateObj = new Date(tx.transaction_date.replace(' ', 'T'));
                        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

                        let reconciledHTML = '';
                        if (tx.status === 'actual') {
                            if (parseInt(tx.is_reconciled) === 1) {
                                reconciledHTML = `<span class="text-income" style="font-size: 1.2em;">&#10004;</span>`;
                            } else {
                                reconciledHTML = `<a href="#/transaction/${tx.id}" class="text-expense" style="font-size: 1.2em; text-decoration: none;">&#10006;</a>`;
                            }
                        } else {
                            reconciledHTML = `<span class="col-muted">-</span>`;
                        }

                        return `
                            <div class="budget-table-row ${tx.is_future ? 'future' : ''}">
                                <div class="col-muted">${dateStr}</div>
                                <div class="col-ellipsis" title="${tx.category_name || ''}">
                                    ${tx.category_name || '-'}
                                </div>
                                <div>
                                    <div style="font-weight: 500;">${tx.description}</div>
                                    <div class="col-muted" style="font-size: 0.8em;">${tx.account_name}</div>
                                </div>
                                <div class="col-right ${planColor}">${planAmount}</div>
                                <div class="col-right ${factColor}">${factAmount}</div>
                                <div class="col-right ${balanceClass}">
                                    ${tx.account_balances ? `
                                        <div class="balance-tooltip">
                                            ${formatMoney(tx.balance_after, 'RUB')}
                                            <div class="tooltip-content">
                                                <strong>Балансы кошельков:</strong><br>
                                                ${Object.entries(tx.account_balances).map(([accId, bal]) => {
                                                    // Находим название счета
                                                    const account = b.accounts.find(a => a.id == accId);
                                                    const accName = account ? account.name : 'Счет #' + accId;
                                                    const color = bal < 0 ? 'color: var(--danger);' : '';
                                                    return `<div style="display:flex; justify-content:space-between; margin-top:4px;">
                                                        <span>${accName}:</span>
                                                        <span style="${color} margin-left: 10px;">${formatMoney(bal, 'RUB')}</span>
                                                    </div>`;
                                                }).join('')}
                                            </div>
                                        </div>
                                    ` : formatMoney(tx.balance_after, 'RUB')}
                                </div>
                                <div class="col-center">${reconciledHTML}</div>
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
            content.innerHTML = `<p class="text-expense" style="text-align: center;">Ошибка загрузки бюджета</p>`;
        }
    }

    async openPlanModal(month) {
        const accRes = await api.get('/accounts');
        if (accRes.accounts.length === 0) {
            showErrorModal('Сначала создайте хотя бы один счет!');
            return;
        }

        const accountOptions = accRes.accounts.map(acc => 
            `<option value="${acc.id}">${acc.name}</option>`
        ).join('');

        const today = new Date();
        const isCurrentMonth = month === today.toISOString().slice(0, 7);
        const defaultDate = isCurrentMonth ? today.toISOString().split('T')[0] : `${month}-01`;

        const formHTML = `
            <form id="plan-tx-form">
                <div class="col-muted" style="margin-bottom: 10px; font-size: 0.9em;">
                    Эта операция будет добавлена как <strong>План</strong> и не изменит текущий баланс.
                </div>
                
                <select id="plan-type">
                    <option value="expense">Расход (План)</option>
                    <option value="income">Доход (План)</option>
                </select>
                
                <input type="number" id="plan-amount" placeholder="Сумма" step="0.01" required>
                <select id="plan-account">${accountOptions}</select>
                <input type="text" id="plan-counterparty" placeholder="Контрагент (например, Кредит)">
                
                <div style="display: flex; gap: 10px;">
                    <input type="date" id="plan-date" value="${defaultDate}" required style="flex: 2;">
                    <input type="time" id="plan-time" value="12:00" required style="flex: 1;">
                </div>
                
                <button type="submit" style="margin-top: 10px; width: 100%;">Сохранить в план</button>
            </form>
        `;

        const modal = new Modal('Запланировать операцию', formHTML);
        modal.open();

        document.getElementById('plan-tx-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                type: document.getElementById('plan-type').value,
                amount: parseFloat(document.getElementById('plan-amount').value),
                account_id: parseInt(document.getElementById('plan-account').value),
                counterparty: document.getElementById('plan-counterparty').value,
                transaction_date: document.getElementById('plan-date').value,
                transaction_time: document.getElementById('plan-time').value,
                has_details: 0, 
                status: 'planned' 
            };

            try {
                await api.post('/transactions', payload);
                modal.close();
                showStatus('Операция запланирована', 'success');
                this.loadBudget(document.getElementById('month-picker').value);
            } catch (err) {
                showErrorModal(err.message);
            }
        });
    }

    async closeMonth(month) {
        if (!confirm(`Вы уверены, что хотите закрыть месяц ${month}?`)) return;

        try {
            await api.post('/budget/close-month', { month });
            showStatus(`Месяц ${month} успешно закрыт`, 'success');
            this.loadBudget(month); 
        } catch (err) {
            showErrorModal(err.message);
        }
    }
}