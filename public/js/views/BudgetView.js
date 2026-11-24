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
                            <div class="budget-table-row tx-row ${tx.is_future ? 'future' : ''}" data-id="${tx.id}" data-status="${tx.status}" style="cursor: pointer;">
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

            // Обработчик клика по строке (только для плановых)
            document.querySelectorAll('.tx-row').forEach(row => {
                row.addEventListener('click', (e) => {
                    // Не реагируем на клики по ссылкам (сверка)
                    if (e.target.closest('a')) return;
                    
                    const txId = row.dataset.id;
                    const status = row.dataset.status;
                    
                    if (status === 'planned') {
                        this.openEditPlanModal(txId);
                    }
                });
            });
            
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

        // Загружаем шаблоны
        const tmplRes = await api.get('/transactions/templates');
        const templates = tmplRes.templates || [];

        // Загружаем долги для выпадающего списка
        const debtRes = await api.get('/debts');
        const debts = debtRes.debts || [];

        const accountOptions = accRes.accounts.map(acc => 
            `<option value="${acc.id}">${acc.name}</option>`
        ).join('');

        // Формируем опции для шаблонов
        const templateOptions = templates.map(t => 
            `<option value="${t.id}" data-type="${t.type}" data-amount="${t.amount}" data-counterparty="${t.counterparty}" data-account="${t.account_id}" data-details="${t.has_details}">
                ${t.counterparty} (${t.type === 'income' ? '+' : '-'}${t.amount} ₽)
            </option>`
        ).join('');

        const today = new Date();
        const isCurrentMonth = month === today.toISOString().slice(0, 7);
        const defaultDate = isCurrentMonth ? today.toISOString().split('T')[0] : `${month}-01`;

        const formHTML = `
            <form id="plan-tx-form">
                ${templates.length > 0 ? `
                    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid rgba(0,0,0,0.1);">
                        <label class="col-muted" style="font-size: 0.85em;">Выбрать из шаблонов (регулярные):</label>
                        <select id="template-select">
                            <option value="">-- Новый план --</option>
                            ${templateOptions}
                        </select>
                    </div>
                ` : ''}

                <div class="col-muted" style="margin-bottom: 10px; font-size: 0.9em;">
                    Эта операция будет добавлена как <strong>План</strong>.
                </div>
                
                <select id="plan-type">
                    <option value="expense">Расход (План)</option>
                    <option value="income">Доход (План)</option>
                    <option value="debt">Вернуть долг (План)</option>
                </select>

                <!-- Блок для выбора долга (скрыт по умолчанию) -->
                <div id="debt-select-container" style="display: none; margin-bottom: 10px;">
                    <label class="col-muted" style="font-size: 0.85em;">Выберите долг</label>
                    <select id="plan-debt">
                        <option value="">-- Выберите --</option>
                        ${debts.filter(d => !d.parent_id).map(d => {
                            const factRemaining = parseFloat(d.total_amount) - parseFloat(d.paid_amount || 0);
                            const planRemaining = factRemaining - parseFloat(d.planned_amount || 0);
                            return `<option value="${d.id}">
                                ${d.name} (факт: ${formatMoney(factRemaining, 'RUB')}, план: ${formatMoney(planRemaining, 'RUB')})
                            </option>`;
                        }).join('')}
                    </select>
                </div>
                
                <input type="number" id="plan-amount" placeholder="Сумма" step="0.01" required>
                <select id="plan-account">${accountOptions}</select>
                <input type="text" id="plan-counterparty" placeholder="Контрагент (например, Кредит)">
                
                <div style="display: flex; gap: 10px;">
                    <input type="date" id="plan-date" value="${defaultDate}" required style="flex: 2;">
                    <input type="time" id="plan-time" value="12:00" required style="flex: 1;">
                </div>

                <div style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="plan-is-regular" style="width: auto; margin: 0;">
                    <label for="plan-is-regular" style="font-size: 0.9em; cursor: pointer;">Сделать шаблоном (регулярная)</label>
                </div>
                
                <button type="submit" style="margin-top: 15px; width: 100%;">Сохранить в план</button>
            </form>
        `;

        const modal = new Modal('Запланировать операцию', formHTML);
        modal.open();

        // --- ЛОГИКА ПОКАЗА/СКРЫТИЯ ВЫБОРА ДОЛГА ---
        const typeSelect = document.getElementById('plan-type');
        const debtContainer = document.getElementById('debt-select-container');

        typeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'debt') {
                debtContainer.style.display = 'block';
            } else {
                debtContainer.style.display = 'none';
            }
        });

        // --- ОБРАБОТЧИК ВЫБОРА ШАБЛОНА ---
        const templateSelect = document.getElementById('template-select');
        if (templateSelect) {
            templateSelect.addEventListener('change', (e) => {
                const option = e.target.selectedOptions[0];
                if (!option.value) return;

                // Заполняем поля данными из шаблона
                document.getElementById('plan-type').value = option.dataset.type;
                document.getElementById('plan-amount').value = option.dataset.amount;
                document.getElementById('plan-counterparty').value = option.dataset.counterparty;
                document.getElementById('plan-account').value = option.dataset.account;
                document.getElementById('plan-is-regular').checked = false; 
            });
        }

        // --- ОТПРАВКА ФОРМЫ ---
        document.getElementById('plan-tx-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            const type = document.getElementById('plan-type').value;
            const debtId = document.getElementById('plan-debt').value;

            if (type ==='debt' && !debtId) {
                showErrorModal('Выберите долг для возврата');
                return;
            }

            const payload = {
                type: type === 'debt' ? 'expense' : type,
                amount: parseFloat(document.getElementById('plan-amount').value),
                account_id: parseInt(document.getElementById('plan-account').value),
                counterparty: document.getElementById('plan-counterparty').value,
                transaction_date: document.getElementById('plan-date').value,
                transaction_time: document.getElementById('plan-time').value,
                has_details: 0, 
                status: 'planned',
                is_regular: document.getElementById('plan-is-regular').checked ? 1:0,
                debt_id: (type === 'debt') ? parseInt(debtId):null
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

    async openEditPlanModal(txId) {
        try {
            // Загружаем транзакцию
            const res = await api.get(`/transactions/${txId}`);
            const tx = res.transaction;

            if (!tx) {
                showErrorModal('Транзакция не найдена');
                return;
            }

            // Загружаем счета (если нужно)
            const accRes = await api.get('/accounts');
            const accounts = accRes.accounts;

            const accountOptions = accounts.map(acc => 
                `<option value="${acc.id}" ${tx.account_id === acc.id ? 'selected' : ''}>${acc.name}</option>`
            ).join('');

            // Форматируем дату и время
            const dateObj = new Date(tx.transaction_date.replace(' ', 'T'));
            const dateStr = dateObj.toISOString().split('T')[0];
            const timeStr = dateObj.toTimeString().slice(0, 5);

            const modal = new Modal('Редактировать план', `
                <form id="edit-plan-form">
                    <label class="col-muted" style="font-size: 0.85em;">Счет</label>
                    <select id="edit-plan-account">
                        ${accountOptions}
                    </select>

                    <label class="col-muted" style="font-size: 0.85em;">Сумма</label>
                    <input type="number" id="edit-plan-amount" value="${tx.amount}" step="0.01" required>
                    
                    <label class="col-muted" style="font-size: 0.85em;">Контрагент</label>
                    <input type="text" id="edit-plan-counterparty" value="${tx.counterparty || ''}">
                    
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 2;">
                            <label class="col-muted" style="font-size: 0.85em;">Дата</label>
                            <input type="date" id="edit-plan-date" value="${dateStr}" required style="margin-bottom: 0;">
                        </div>
                        <div style="flex: 1;">
                            <label class="col-muted" style="font-size: 0.85em;">Время</label>
                            <input type="time" id="edit-plan-time" value="${timeStr}" required style="margin-bottom: 0;">
                        </div>
                    </div>

                    <div style="margin-top: 15px; display: flex; gap: 10px;">
                        <button type="submit" style="flex: 1;">Сохранить</button>
                        <button type="button" id="delete-plan-btn" style="flex: 1; background: var(--danger);">Удалить</button>
                    </div>
                </form>
            `);
            modal.open();

            // Обработчик сохранения
            document.getElementById('edit-plan-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    await api.put(`/transactions/${txId}`, {
                        account_id: parseInt(document.getElementById('edit-plan-account').value),
                        amount: parseFloat(document.getElementById('edit-plan-amount').value),
                        counterparty: document.getElementById('edit-plan-counterparty').value,
                        transaction_date: document.getElementById('edit-plan-date').value,
                        transaction_time: document.getElementById('edit-plan-time').value,
                        status: 'planned' // Оставляем планом
                    });
                    modal.close();
                    showStatus('План обновлён', 'success');
                    this.loadBudget(document.getElementById('month-picker').value);
                } catch (err) {
                    showErrorModal(err.message);
                }
            });

            // Обработчик удаления
            document.getElementById('delete-plan-btn').addEventListener('click', async () => {
                if (!confirm('Удалить эту плановую операцию?')) return;
                try {
                    // Нужен метод DELETE /api/transactions/{id}
                    await api.delete(`/transactions/${txId}`);
                    modal.close();
                    showStatus('План удалён', 'success');
                    this.loadBudget(document.getElementById('month-picker').value);
                } catch (err) {
                    showErrorModal(err.message);
                }
            });

        } catch (err) {
            showErrorModal(err.message);
        }
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