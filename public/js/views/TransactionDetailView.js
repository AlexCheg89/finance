import { api } from '../api.js';
import { store } from '../store.js';
import { formatMoney, formatDateTime } from '../utils/format.js';
import { showStatus, showErrorModal } from '../utils/status.js';
import { Modal } from '../components/Modal.js';

export class TransactionDetailView {
    async mount(container) {
        const hash = window.location.hash.replace('#', '');
        const txId = hash.split('/')[2];

        container.innerHTML = `<div class="dashboard"><p>Загрузка...</p></div>`;

        try {
            const [txRes, catRes] = await Promise.all([
                api.get(`/transactions/${txId}`),
                api.get('/categories/tree')
            ]);
            this.tx = txRes.transaction;
            this.categories = catRes.categories;
            this.render(container);
        } catch (err) {
            showErrorModal(err.message);
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        }
    }

    render(container) {
        const tx = this.tx;
        const isExpense = tx.type === 'expense';
        const sign = isExpense ? '-' : '+';
        const color = isExpense ? 'var(--danger)' : 'var(--success)';
        
        const itemsSum = tx.items.reduce((sum, item) => sum + parseFloat(item.total_price), 0);
        const remaining = tx.amount - itemsSum;
        const isFullyParsed = remaining <= 0.01;
        const isReconciled = parseInt(tx.is_reconciled) === 1;
        const hasDetails = parseInt(tx.has_details) === 1;
        
        const userRole = store.state.user?.role || 'user';
        const canEdit = userRole === 'admin' || !isReconciled;

        const catOptions = this.categories
            .filter(c => c.parent_id === null)
            .map(c => `<option value="${c.id}">${c.name}</option>`)
            .join('');

        // Блок "Осталось разобрать" показываем только для расходов, если детализация включена и не разобрано
        const remainingHTML = (isExpense && hasDetails && !isFullyParsed) ? `
            <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 1.2em;">
                <span>Осталось разобрать:</span>
                <strong style="color: var(--primary);">${formatMoney(remaining, 'RUB')}</strong>
            </div>
        ` : '';

        const reconciledHTML = isReconciled ? `<span style="color:var(--success); margin-left: 10px; font-size: 1.2em;" title="Сверено">&#10004;</span>` : '';

        container.innerHTML = `
            <div class="dashboard">
                <header>
                    <h1>Детализация операции</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; margin-bottom: 20px; position: relative;">
                    ${canEdit ? `<div style="position: absolute; top: 20px; right: 20px;"><button id="edit-tx-btn" style="background: none; box-shadow: none; color: var(--primary); padding: 0; font-size: 1.2em;" title="Редактировать">&#9998;</button></div>` : ''}
                    
                    <h2>${tx.counterparty || 'Без контрагента'}</h2>
                    <p style="color: var(--text-muted);">${tx.account_name} • ${formatDateTime(tx.transaction_date)}</p>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; font-size: 1.2em;">
                        <span>Сумма операции:</span>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <!-- Кнопка переключения статуса -->
                            ${canEdit ? `
                                <button id="toggle-status-btn" style="width: auto; padding: 5px 10px; font-size: 0.8em; background: ${tx.status === 'planned' ? 'var(--success)' : '#6c757d'};">
                                    ${tx.status === 'planned' ? '&#10004; Сделать фактом' : '&#8635; Вернуть в план'}
                                </button>
                            ` : ''}
                            
                            <strong style="color: ${color}">${sign}${formatMoney(tx.amount, 'RUB')}</strong>
                            ${reconciledHTML}
                        </div>
                    </div>
                    ${remainingHTML}

                    ${canEdit ? `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; gap: 10px;">
                            <input type="checkbox" id="tx-details-toggle" ${hasDetails ? 'checked' : ''} style="width: auto; margin: 0;">
                            <label for="tx-details-toggle" style="font-size: 0.9em; cursor: pointer;">С детализацией (позиции)</label>
                        </div>
                    ` : ''}
                </div>

                <h3>Позиции</h3>
                <div id="items-list" style="margin-bottom: 20px;">
                    ${tx.items.length === 0 ? '<p style="color: var(--text-muted);">Позиций пока нет</p>' : ''}
                    ${tx.items.map(item => `
                        <div class="account-card" style="margin-bottom: 10px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span>${item.name} (${item.quantity} x ${formatMoney(item.unit_price, 'RUB')})</span>
                                ${item.category_name ? `<div style="font-size: 0.85em; color: var(--text-muted);">${item.category_name}</div>` : ''}
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <strong>${formatMoney(item.total_price, 'RUB')}</strong>
                                ${canEdit ? `
                                    <button class="edit-item-btn" data-id="${item.id}" data-name="${item.name}" data-price="${item.unit_price}" data-qty="${item.quantity}" data-cat="${item.category_id}" style="background: none; color: var(--primary); padding: 5px; font-size: 1.1em; box-shadow: none;" title="Редактировать">&#9998;</button>
                                    <button class="delete-item-btn" data-id="${item.id}" style="background: none; color: var(--danger); padding: 5px; font-size: 1.1em; box-shadow: none;" title="Удалить">&#10006;</button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${canEdit ? `
                    <!-- Кнопка "Сверить" теперь показывается, когда всё РАЗОБРАНО (isFullyParsed), но еще не сверено -->
                    ${isFullyParsed && !isReconciled ? `
                        <button id="reconcile-btn" style="width: 100%; margin-bottom: 20px; background: var(--success);">
                            &#10004; Сверить операцию
                        </button>
                    ` : ''}
                    
                    ${hasDetails ? `
                        <div id="add-item-form-container" style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px;">
                            <h3>Добавить позицию</h3>
                            <form id="add-item-form">
                                <input type="text" id="item-name" placeholder="Название (Молоко)" required>
                                <div style="display: flex; gap: 10px;">
                                    <input type="number" id="item-price" placeholder="Цена" step="0.01" required style="flex: 1;">
                                    <input type="number" id="item-qty" placeholder="Кол-во" step="1" value="1" required style="flex: 1;">
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    <select id="item-cat-parent" style="flex: 1;">
                                        <option value="">Без категории</option>
                                        ${this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                    </select>
                                    <select id="item-cat-child" style="flex: 1;">
                                        <option value="">-- Подкатегория --</option>
                                    </select>
                                </div>
                                <button type="submit" style="margin-top: 10px; width: 100%;">Добавить</button>
                            </form>
                        </div>
                    ` : `
                        <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; text-align: center;">
                            <h3>Нет детализации</h3>
                            <p style="color: var(--text-muted); margin-bottom: 15px;">Вы можете сразу назначить категорию на всю сумму.</p>
                            <button id="assign-category-btn" style="width: 100%;">Назначить категорию на всю сумму</button>
                        </div>
                    `}
                ` : `
                    <div style="text-align: center; padding: 20px; color: var(--success); font-weight: bold; background: rgba(255,255,255,0.5); border-radius: 12px;">
                        &#10004; Операция сверена и заблокирована
                    </div>
                `}
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' })));

        if (canEdit) {
            document.getElementById('edit-tx-btn')?.addEventListener('click', () => this.openEditModal(container));
            document.getElementById('reconcile-btn')?.addEventListener('click', () => this.handleReconcile(container));
            document.getElementById('add-item-form')?.addEventListener('submit', (e) => this.handleAddItem(e, container));
            
            const assignBtn = document.getElementById('assign-category-btn');
            if (assignBtn) assignBtn.addEventListener('click', () => this.openAssignCategoryModal(container));

            const detailsToggle = document.getElementById('tx-details-toggle');
            if (detailsToggle) {
                detailsToggle.addEventListener('change', (e) => this.handleToggleDetails(e.target.checked, container));
            }

            document.querySelectorAll('.delete-item-btn').forEach(btn => {
                btn.addEventListener('click', () => this.handleDeleteItem(btn.dataset.id, container));
            });

            document.querySelectorAll('.edit-item-btn').forEach(btn => {
                btn.addEventListener('click', () => this.openEditItemModal(btn.dataset, container));
            });
        }
        const toggleStatusBtn = document.getElementById('toggle-status-btn');
        if (toggleStatusBtn) {
            toggleStatusBtn.addEventListener('click', async () => {
                const newStatus = tx.status === 'planned' ? 'actual' : 'planned';
                try {
                    await api.put(`/transactions/${tx.id}`, { 
                        amount: tx.amount, 
                        counterparty: tx.counterparty, 
                        transaction_date: tx.transaction_date.split(' ')[0],
                        transaction_time: tx.transaction_date.split(' ')[1] || '12:00',
                        status: newStatus 
                    });
                    showStatus('Статус изменен', 'success');
                    const res = await api.get(`/transactions/${tx.id}`);
                    this.tx = res.transaction;
                    this.render(container);
                } catch (err) {
                    showErrorModal(err.message);
                }
            });
        }

        const catParentSelect = document.getElementById('item-cat-parent');
        const catChildSelect = document.getElementById('item-cat-child');

        if (catParentSelect) {
            catParentSelect.addEventListener('change', (e) => {
                const parentId = parseInt(e.target.value);
                const parentCat = this.categories.find(c => c.id === parentId);
                
                // Очищаем подкатегории
                catChildSelect.innerHTML = '<option value="">-- Подкатегория --</option>';
                
                if (parentCat && parentCat.children && parentCat.children.length > 0) {
                    parentCat.children.forEach(child => {
                        catChildSelect.innerHTML += `<option value="${child.id}">${child.name}</option>`;
                    });
                }
            });
        }
    }

    async handleToggleDetails(checked, container) {
        if (!checked) {
            if (!confirm('Удалить все текущие позиции и назначить одну общую категорию на всю сумму?')) {
                document.getElementById('tx-details-toggle').checked = true;
                return;
            }
        }

        try {
            await api.put(`/transactions/${this.tx.id}`, { has_details: checked ? 1 : 0 });
            showStatus('Режим изменен', 'success');
            const res = await api.get(`/transactions/${this.tx.id}`);
            this.tx = res.transaction;
            this.render(container);
        } catch (err) {
            showErrorModal(err.message);
            document.getElementById('tx-details-toggle').checked = !checked;
        }
    }

    async switchToSingleCategory(container) {
        if (!confirm('Удалить все текущие позиции и назначить одну общую категорию на всю сумму?')) {
            document.getElementById('tx-details-toggle').checked = true;
            return;
        }

        try {
            // Удаляем все текущие позиции
            for (const item of this.tx.items) {
                await api.delete(`/transactions/items/${item.id}`);
            }

            // Создаем одну общую позицию
            await api.post(`/transactions/${this.tx.id}/items`, {
                name: 'Основная сумма',
                unit_price: this.tx.amount,
                quantity: 1,
                total_price: this.tx.amount,
                category_id: null
            });

            showStatus('Позиции объединены', 'success');
            const res = await api.get(`/transactions/${this.tx.id}`);
            this.tx = res.transaction;
            this.render(container);
        } catch (err) {
            showErrorModal(err.message);
            document.getElementById('tx-details-toggle').checked = true;
        }
    }

    async handleReconcile(container) {
        try {
            await api.post(`/transactions/${this.tx.id}/reconcile`);
            showStatus('Операция сверена', 'success');
            const res = await api.get(`/transactions/${this.tx.id}`);
            this.tx = res.transaction;
            this.render(container);
        } catch (err) { showErrorModal(err.message); }
    }

    async handleAddItem(e, container) {
        e.preventDefault();
        const parentId = document.getElementById('item-cat-parent').value;
        const childId = document.getElementById('item-cat-child').value;
        const finalCategoryId = childId ? childId : parentId;
        try {
            await api.post(`/transactions/${this.tx.id}/items`, {
                name: document.getElementById('item-name').value,
                unit_price: parseFloat(document.getElementById('item-price').value),
                quantity: parseFloat(document.getElementById('item-qty').value),
                total_price: parseFloat(document.getElementById('item-price').value) * parseFloat(document.getElementById('item-qty').value),
                category_id: finalCategoryId || null
            });
            const res = await api.get(`/transactions/${this.tx.id}`);
            this.tx = res.transaction;
            this.render(container);
        } catch (err) { showErrorModal(err.message); }
    }

    async handleDeleteItem(itemId, container) {
        try {
            await api.delete(`/transactions/items/${itemId}`);
            const res = await api.get(`/transactions/${this.tx.id}`);
            this.tx = res.transaction;
            this.render(container);
        } catch (err) { showErrorModal(err.message); }
    }

    openEditModal(container) {
        const tx = this.tx;
        const dateObj = new Date(tx.transaction_date.replace(' ', 'T'));
        const dateStr = dateObj.toISOString().split('T')[0];
        const timeStr = dateObj.toTimeString().slice(0, 5);

        const modal = new Modal('Редактировать операцию', `
            <form id="edit-tx-form">
                <label class="col-muted" style="font-size: 0.85em;">Статус</label>
                <select id="edit-status">
                    <option value="actual" ${tx.status === 'actual' ? 'selected' : ''}>Факт (деньги ушли)</option>
                    <option value="planned" ${tx.status === 'planned' ? 'selected' : ''}>План (ожидается)</option>
                </select>

                <label class="col-muted" style="font-size: 0.85em;">Сумма</label>
                <input type="number" id="edit-amount" value="${tx.amount}" step="0.01" required>
                
                <label class="col-muted" style="font-size: 0.85em;">Контрагент</label>
                <input type="text" id="edit-counterparty" value="${tx.counterparty || ''}">
                
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 2;">
                        <label class="col-muted" style="font-size: 0.85em;">Дата</label>
                        <input type="date" id="edit-date" value="${dateStr}" required style="margin-bottom: 0;">
                    </div>
                    <div style="flex: 1;">
                        <label class="col-muted" style="font-size: 0.85em;">Время</label>
                        <input type="time" id="edit-time" value="${timeStr}" required style="margin-bottom: 0;">
                    </div>
                </div>
                
                <button type="submit" style="margin-top: 15px; width: 100%;">Сохранить</button>
            </form>
        `);
        modal.open();

        document.getElementById('edit-tx-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await api.put(`/transactions/${tx.id}`, {
                    amount: parseFloat(document.getElementById('edit-amount').value),
                    counterparty: document.getElementById('edit-counterparty').value,
                    transaction_date: document.getElementById('edit-date').value,
                    transaction_time: document.getElementById('edit-time').value,
                    status: document.getElementById('edit-status').value
                });
                modal.close();
                showStatus('Редактировать позицию', 'success');
                const res = await api.get(`/transactions/${tx.id}`);
                this.tx = res.transaction;
                this.render(container);
            } catch (err) { showErrorModal(err.message); }
        });
    }

    openEditItemModal(itemData, container) {
        const catOptions = this.categories.filter(c => c.parent_id === null).map(c => 
            `<option value="${c.id}" ${parseInt(itemData.cat) === c.id ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        const modal = new Modal('Редактировать позицию', `
            <form id="edit-item-form">
                <input type="text" id="edit-item-name" value="${itemData.name}" required>
                <div style="display: flex; gap: 10px;">
                    <input type="number" id="edit-item-price" value="${itemData.price}" step="0.01" required style="flex: 1;">
                    <input type="number" id="edit-item-qty" value="${itemData.qty}" step="1" required style="flex: 1;">
                </div>
                <select id="edit-item-category"><option value="">Без категории</option>${catOptions}</select>
                <button type="submit" style="margin-top: 10px; width: 100%;">Добавить</button>
            </form>
        `);
        modal.open();

        document.getElementById('edit-item-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await api.put(`/transactions/items/${itemData.id}`, {
                    name: document.getElementById('edit-item-name').value,
                    unit_price: parseFloat(document.getElementById('edit-item-price').value),
                    quantity: parseFloat(document.getElementById('edit-item-qty').value),
                    category_id: document.getElementById('edit-item-category').value || null
                });
                modal.close();
                showStatus('Позиция обновлена', 'success');
                const res = await api.get(`/transactions/${this.tx.id}`);
                this.tx = res.transaction;
                this.render(container);
            } catch (err) { showErrorModal(err.message); }
        });
    }

    openAssignCategoryModal(container) {
        const catOptions = this.categories
            .filter(c => c.parent_id === null)
            .map(c => `<option value="${c.id}">${c.name}</option>`)
            .join('');

        const modal = new Modal('Назначить категорию', `
            <form id="assign-category-form">
                <p style="margin-bottom: 15px;">Выберите категорию для суммы ${formatMoney(this.tx.amount, 'RUB')}:</p>
                <select id="assign-cat-id" required>
                    <option value="">-- Выберите --</option>
                    ${catOptions}
                </select>
                <button type="submit" style="margin-top: 10px; width: 100%;">Сохранить</button>
            </form>
        `);
        modal.open();

        document.getElementById('assign-category-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const catId = document.getElementById('assign-cat-id').value;
            
            try {
                await api.post(`/transactions/${this.tx.id}/items`, {
                    name: 'Основная сумма',
                    unit_price: this.tx.amount,
                    quantity: 1,
                    total_price: this.tx.amount,
                    category_id: parseInt(catId)
                });
                modal.close();
                showStatus('Категория назначена', 'success');
                const res = await api.get(`/transactions/${this.tx.id}`);
                this.tx = res.transaction;
                this.render(container);
            } catch (err) {
                showErrorModal(err.message);
            }
        });
    }
}