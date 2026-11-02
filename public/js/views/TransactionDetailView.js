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
                api.get('/categories')
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
        
        // Проверка прав
        const userRole = store.state.user?.role || 'user';
        const canEdit = userRole === 'admin' || !isReconciled;

        const catOptions = this.categories
            .filter(c => c.parent_id === null)
            .map(c => `<option value="${c.id}">${c.name}</option>`)
            .join('');

        const remainingHTML = (isExpense && !isFullyParsed) ? `
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
                        <div style="display: flex; align-items: center;">
                            <strong style="color: ${color}">${sign}${formatMoney(tx.amount, 'RUB')}</strong>
                            ${reconciledHTML}
                        </div>
                    </div>
                    ${remainingHTML}
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
                    ${isExpense && !isFullyParsed ? `<button id="reconcile-btn" style="width: 100%; margin-bottom: 20px; background: var(--success);">&#10004; Сверить операцию</button>` : ''}
                    
                    <div id="add-item-form-container" style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px;">
                        <h3>Добавить позицию</h3>
                        <form id="add-item-form">
                            <input type="text" id="item-name" placeholder="Название (Молоко)" required>
                            <div style="display: flex; gap: 10px;">
                                <input type="number" id="item-price" placeholder="Цена" step="0.01" required style="flex: 1;">
                                <input type="number" id="item-qty" placeholder="Кол-во" step="1" value="1" required style="flex: 1;">
                            </div>
                            <select id="item-category"><option value="">Без категории</option>${catOptions}</select>
                            <button type="submit" style="margin-top: 10px; width: 100%;">Добавить</button>
                        </form>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px; color: var(--success); font-weight: bold; background: rgba(255,255,255,0.5); border-radius: 12px;">
                        &#10004; Операция сверена и заблокирована
                    </div>
                `}
            </div>
        `;

        // Обработчики
        document.getElementById('back-btn').addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' })));

        if (canEdit) {
            document.getElementById('edit-tx-btn')?.addEventListener('click', () => this.openEditModal(container));
            document.getElementById('reconcile-btn')?.addEventListener('click', () => this.handleReconcile(container));
            document.getElementById('add-item-form')?.addEventListener('submit', (e) => this.handleAddItem(e, container));
            
            document.querySelectorAll('.delete-item-btn').forEach(btn => {
                btn.addEventListener('click', () => this.handleDeleteItem(btn.dataset.id, container));
            });

            document.querySelectorAll('.edit-item-btn').forEach(btn => {
                btn.addEventListener('click', () => this.openEditItemModal(btn.dataset, container));
            });
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
        try {
            await api.post(`/transactions/${this.tx.id}/items`, {
                name: document.getElementById('item-name').value,
                unit_price: parseFloat(document.getElementById('item-price').value),
                quantity: parseFloat(document.getElementById('item-qty').value),
                total_price: parseFloat(document.getElementById('item-price').value) * parseFloat(document.getElementById('item-qty').value),
                category_id: document.getElementById('item-category').value || null
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
                <input type="number" id="edit-amount" value="${tx.amount}" step="0.01" required>
                <input type="text" id="edit-counterparty" value="${tx.counterparty || ''}">
                <div style="display: flex; gap: 10px;">
                    <input type="date" id="edit-date" value="${dateStr}" required style="flex: 2;">
                    <input type="time" id="edit-time" value="${timeStr}" required style="flex: 1;">
                </div>
                <button type="submit" style="margin-top: 10px; width: 100%;">Сохранить</button>
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
                    transaction_time: document.getElementById('edit-time').value
                });
                modal.close();
                showStatus('Операция обновлена', 'success');
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
                <button type="submit" style="margin-top: 10px; width: 100%;">Сохранить</button>
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
}