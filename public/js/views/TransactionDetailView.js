import { api } from '../api.js';
import { formatMoney, formatDateTime } from '../utils/format.js';
import { showStatus, showErrorModal } from '../utils/status.js';

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
        
        // Считаем остаток
        const itemsSum = tx.items.reduce((sum, item) => sum + parseFloat(item.total_price), 0);
        const remaining = tx.amount - itemsSum;
        const isFullyParsed = remaining <= 0.01;
        const isReconciled = parseInt(tx.is_reconciled) === 1;

        // Опции для категорий (только глобальные, без вложенности пока)
        const catOptions = this.categories
            .filter(c => c.parent_id === null) // Показываем только верхний уровень
            .map(c => `<option value="${c.id}">${c.name}</option>`)
            .join('');

        container.innerHTML = `
            <div class="dashboard">
                <header>
                    <h1>Детализация операции</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <h2>${tx.counterparty || 'Без контрагента'}</h2>
                    <p style="color: var(--text-muted);">${tx.account_name} • ${formatDateTime(tx.transaction_date)}</p>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 15px; font-size: 1.2em;">
                        <span>Сумма операции:</span>
                        <strong style="color: ${color}">${sign}${formatMoney(tx.amount, 'RUB')}</strong>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 1.2em;">
                        <span>Осталось разобрать:</span>
                        <strong style="color: ${isFullyParsed ? 'var(--success)' : 'var(--primary)'}; display: flex; align-items: center; gap: 5px;">
                            ${formatMoney(remaining, 'RUB')}
                            ${isFullyParsed ? '<span style="font-size: 1.2em;" title="Разобрано">&#10004;</span>' : ''}
                        </strong>
                    </div>
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
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <strong>${formatMoney(item.total_price, 'RUB')}</strong>
                                ${!isReconciled ? `<button class="delete-item-btn" data-id="${item.id}" style="background: none; color: var(--danger); padding: 5px; font-size: 1.2em; box-shadow: none;" title="Удалить">&#10006;</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${isReconciled ? `
                    <div style="text-align: center; padding: 20px; color: var(--success); font-weight: bold; background: rgba(255,255,255,0.5); border-radius: 12px;">
                        &#10004; Операция сверена и заблокирована для редактирования
                    </div>
                ` : `
                    ${isFullyParsed ? `
                        <button id="reconcile-btn" style="width: 100%; margin-bottom: 20px; background: var(--success);">
                            &#10004; Сверить операцию
                        </button>
                    ` : `
                        <div id="add-item-form-container" style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px;">
                            <h3>Добавить позицию</h3>
                            <form id="add-item-form">
                                <input type="text" id="item-name" placeholder="Название (Молоко)" required>
                                <div style="display: flex; gap: 10px;">
                                    <input type="number" id="item-price" placeholder="Цена" step="0.01" required style="flex: 1;">
                                    <input type="number" id="item-qty" placeholder="Кол-во" step="1" value="1" required style="flex: 1;">
                                </div>
                                <select id="item-category">
                                    <option value="">Без категории</option>
                                    ${catOptions}
                                </select>
                                <button type="submit" style="margin-top: 10px; width: 100%;">Добавить</button>
                            </form>
                        </div>
                    `}
                `}
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });

        document.querySelectorAll('.delete-item-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Чтобы не сработал клик по карточке
                const itemId = btn.dataset.id;
                try {
                    await api.delete(`/transactions/items/${itemId}`);
                    const res = await api.get(`/transactions/${tx.id}`);
                    this.tx = res.transaction;
                    this.render(container);
                } catch (err) {
                    showErrorModal(err.message);
                }
            });
        });

        // Кнопка "Сверить"
        const reconcileBtn = document.getElementById('reconcile-btn');
        if (reconcileBtn) {
            reconcileBtn.addEventListener('click', async () => {
                try {
                    await api.post(`/transactions/${tx.id}/reconcile`);
                    showStatus('Операция сверена', 'success');
                    // Перерисовываем
                    const res = await api.get(`/transactions/${tx.id}`);
                    this.tx = res.transaction;
                    this.render(container);
                } catch (err) {
                    showErrorModal(err.message);
                }
            });
        }

        // Форма добавления
        const form = document.getElementById('add-item-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('item-name').value;
                const price = parseFloat(document.getElementById('item-price').value);
                const qty = parseFloat(document.getElementById('item-qty').value);
                const catId = document.getElementById('item-category').value;
                const total = price * qty;

                try {
                    await api.post(`/transactions/${tx.id}/items`, {
                        name, 
                        unit_price: price, 
                        quantity: qty, 
                        total_price: total, 
                        category_id: catId ? parseInt(catId) : null
                    });
                    
                    // Перезагружаем
                    const res = await api.get(`/transactions/${tx.id}`);
                    this.tx = res.transaction;
                    this.render(container);
                } catch (err) {
                    showErrorModal(err.message);
                }
            });
        }
    }
}