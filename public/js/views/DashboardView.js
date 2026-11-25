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
                    <button id="btn-transfer" style="background: #17a2b8;">&#128257; Перевод</button>
                    <button id="go-budget" style="background: #007bff;">&#128200; Бюджет</button>
                    <button id="go-reports" style="background: #17a2b8;">&#128200; Отчеты</button>
                    <button id="go-debts" style="background: #e67e22;">&#128176; Долги</button>
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
        document.getElementById('go-reports').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/reports' }));
        });
        document.getElementById('go-debts').addEventListener('click', ()=> {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/debts' }));
        });
        document.getElementById('btn-add-tx').addEventListener('click', () => this.openAddTransactionModal());
        document.getElementById('btn-transfer').addEventListener('click', () => this.openTransferModal());
        document.getElementById('go-budget').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/budget' }));            
    });

        await this.loadData();
    }

        async loadData() {
        try {
            const accRes = await api.get('/accounts');
            store.set('accounts', accRes.accounts);
            const total = accRes.accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
            document.getElementById('total-balance').textContent = formatMoney(total, 'RUB');

            const txRes = await api.get('/transactions?status=actual');
            
            // --- СКЛЕИВАЕМ ПЕРЕВОДЫ ---
            const processed = [];
            const transferPairs = new Set();

            txRes.transactions.forEach(tx => {
                if (tx.transfer_peer_id) {
                    const pairId = Math.min(tx.id, tx.transfer_peer_id);
                    if (transferPairs.has(pairId)) return;
                    transferPairs.add(pairId);

                    const peer = txRes.transactions.find(t => t.id === tx.transfer_peer_id);
                    
                    const fromAccount = tx.type === 'expense' ? tx.account_name : (peer ? peer.account_name : '?');
                    const toAccount = tx.type === 'income' ? tx.account_name : (peer ? peer.account_name : '?');

                    processed.push({
                        ...tx,
                        isTransfer: true,
                        fromAccount: fromAccount,
                        toAccount: toAccount,
                        displayAmount: tx.amount,
                        displayDate: tx.transaction_date
                    });
                } else {
                    processed.push(tx);
                }
            });

            const recent = processed.slice(0, 5);
            const txContainer = document.getElementById('recent-transactions');
            txContainer.innerHTML = '';
            
            if (recent.length === 0) {
                txContainer.innerHTML = '<p>Операций пока нет.</p>';
                return;
            }

            recent.forEach(tx => {
                if (tx.isTransfer) {
                    // Кастомная карточка для перевода
                    const card = document.createElement('div');
                    card.className = 'account-card';
                    card.style.cssText = 'margin-bottom: 10px; padding: 15px; cursor: default;';
                    
                    const dateObj = new Date(tx.transaction_date.replace(' ', 'T'));
                    const dateStr = dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + dateObj.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});

                    card.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>Перевод</strong>
                                <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">
                                    ${tx.fromAccount} → ${tx.toAccount} &bull; ${dateStr}
                                </div>
                            </div>
                            <div style="font-weight: bold; color: var(--primary); font-size: 1.1em;">
                                ${formatMoney(tx.displayAmount, 'RUB')}
                            </div>
                        </div>
                    `;
                    txContainer.appendChild(card);
                } else {
                    txContainer.appendChild(createTransactionCard(tx));
                }
            });

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

        // УБИРАЕМ отсюда загрузку catOptions. Мы будем делать это динамически.

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
                        <select id="tx-category-parent" style="margin-bottom: 5px;">
                            <option value="">Без категории</option>
                        </select>
                        <select id="tx-category-child">
                            <option value="">-- Подкатегория --</option>
                        </select>
                    </div>
                </div>
                
                <button type="submit" style="margin-top: 15px; width: 100%;">Сохранить</button>
            </form>
        `;

        const modal = new Modal('Новая операция', formHTML);
        modal.open();

        // --- ЛОГИКА КАТЕГОРИЙ ---
        const typeSelect = document.getElementById('tx-type');
        const parentSelect = document.getElementById('tx-category-parent');
        const childSelect = document.getElementById('tx-category-child');

        // Функция загрузки родительских категорий
        const loadParentCategories = async () => {
            const type = typeSelect.value;
            const catRes = await api.get(`/categories/tree?type=${type}`);
            const cats = catRes.categories;

            parentSelect.innerHTML = '<option value="">Без категории</option>';
            childSelect.innerHTML = '<option value="">-- Подкатегория --</option>';
            
            cats.forEach(c => {
                parentSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
            });
        };

        // Обработчик смены типа (Расход/Доход)
        typeSelect.addEventListener('change', loadParentCategories);

        // Обработчик выбора родителя (загружаем подкатегории)
        parentSelect.addEventListener('change', async (e) => {
            const parentId = parseInt(e.target.value);
            const type = typeSelect.value;
            
            childSelect.innerHTML = '<option value="">-- Подкатегория --</option>';
            
            if (parentId) {
                const catRes = await api.get(`/categories/tree?type=${type}`);
                const parentCat = catRes.categories.find(c => c.id === parentId);
                
                if (parentCat && parentCat.children) {
                    parentCat.children.forEach(child => {
                        childSelect.innerHTML += `<option value="${child.id}">${child.name}</option>`;
                    });
                }
            }
        });

        // Переключение видимости блока категорий
        document.getElementById('tx-has-details').addEventListener('change', (e) => {
            document.getElementById('single-category-container').style.display = e.target.checked ? 'none' : 'block';
        });

        // Первичная загрузка категорий
        await loadParentCategories();

        // --- ОТПРАВКА ФОРМЫ ---
        document.getElementById('quick-tx-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedAccount = document.getElementById('tx-account').value;
            const hasDetails = document.getElementById('tx-has-details').checked;
            
            const parentCatId = document.getElementById('tx-category-parent').value;
            const childCatId = document.getElementById('tx-category-child').value;
            const finalCategoryId = childCatId ? childCatId : parentCatId;
            
            const amountVal = parseFloat(document.getElementById('tx-amount').value);

            const items = (!hasDetails && finalCategoryId) ? [{
                name: 'Основная сумма',
                category_id: parseInt(finalCategoryId),
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
                items: items,
                has_details: hasDetails ? 1 : 0,
                status: 'actual'
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

    async openTransferModal() {
        if (!store.state.accounts || store.state.accounts.length < 2) {
            showErrorModal('Для перевода нужно минимум два счета!');
            return;
        }

        const accountOptions = store.state.accounts.map(acc => 
            `<option value="${acc.id}">${acc.name} (${formatMoney(acc.balance, acc.currency)})</option>`
        ).join('');

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);

        const formHTML = `
            <form id="transfer-form">
                <label class="col-muted" style="font-size: 0.85em;">Со счета</label>
                <select id="transfer-from" required>
                    ${accountOptions}
                </select>

                <label class="col-muted" style="font-size: 0.85em;">На счет</label>
                <select id="transfer-to" required>
                    ${accountOptions}
                </select>

                <label class="col-muted" style="font-size: 0.85em;">Сумма</label>
                <input type="number" id="transfer-amount" placeholder="Сумма" step="0.01" required>
                
                <label class="col-muted" style="font-size: 0.85em;">Комментарий</label>
                <input type="text" id="transfer-comment" placeholder="Перевод" value="Перевод">
                
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 2;">
                        <label class="col-muted" style="font-size: 0.85em;">Дата</label>
                        <input type="date" id="transfer-date" value="${today}" required style="margin-bottom: 0;">
                    </div>
                    <div style="flex: 1;">
                        <label class="col-muted" style="font-size: 0.85em;">Время</label>
                        <input type="time" id="transfer-time" value="${currentTime}" required style="margin-bottom: 0;">
                    </div>
                </div>
                
                <button type="submit" style="margin-top: 15px; width: 100%;">Перевести</button>
            </form>
        `;

        const modal = new Modal('Перевод между счетами', formHTML);
        modal.open();

        // Обработчик смены "Со счета" (чтобы нельзя было выбрать тот же счет)
        document.getElementById('transfer-from').addEventListener('change', (e) => {
            const fromId = e.target.value;
            const toSelect = document.getElementById('transfer-to');
            Array.from(toSelect.options).forEach(opt => {
                opt.disabled = (opt.value === fromId);
            });
            if (toSelect.value === fromId) {
                toSelect.value = Array.from(toSelect.options).find(opt => opt.value !== fromId)?.value || '';
            }
        });

        document.getElementById('transfer-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fromId = parseInt(document.getElementById('transfer-from').value);
            const toId = parseInt(document.getElementById('transfer-to').value);
            const amount = parseFloat(document.getElementById('transfer-amount').value);

            if (fromId === toId) {
                showErrorModal('Нельзя перевести на тот же счет');
                return;
            }

            try {
                await api.post('/transactions/transfer', {
                    from_account_id: fromId,
                    to_account_id: toId,
                    amount: amount,
                    transaction_date: document.getElementById('transfer-date').value,
                    transaction_time: document.getElementById('transfer-time').value,
                    comment: document.getElementById('transfer-comment').value
                });
                modal.close();
                showStatus('Перевод выполнен', 'success');
                await this.loadData();
            } catch (err) {
                showErrorModal(err.message);
            }
        });
    }
}