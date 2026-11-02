import { formatMoney, formatDateTime } from '../utils/format.js';

export function createTransactionCard(tx) {
    const isExpense = tx.type === 'expense';
    const color = isExpense ? 'var(--danger)' : 'var(--success)';
    const sign = isExpense ? '-' : '+';
    const formattedDate = formatDateTime(tx.transaction_date);
    const reconciledIcon = parseInt(tx.is_reconciled) === 1 ? ' <span style="color:var(--success);" title="Сверено">&#10004;</span>' : '';

    const items = tx.items || [];
    const hasMultipleItems = items.length > 1;
    const hasSingleItem = items.length === 1;

    const div = document.createElement('div');
    div.className = 'account-card tx-card';
    div.dataset.id = tx.id;
    div.style.cssText = 'margin-bottom: 10px; padding: 15px; cursor: pointer;';

    let itemsHTML = '';
    if (hasSingleItem) {
        const item = items[0];
        const catName = item.category_name ? ` • ${item.category_name}` : '';
        itemsHTML = `<div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">${item.name}${catName}</div>`;
    } else if (hasMultipleItems) {
        const itemsList = items.map(item => `
            <div style="display: flex; justify-content: space-between; font-size: 0.85em; padding: 4px 0; border-bottom: 1px dashed rgba(0,0,0,0.05);">
                <span>${item.name} ${item.category_name ? `(${item.category_name})` : ''}</span>
                <span>${formatMoney(item.total_price, 'RUB')}</span>
            </div>
        `).join('');

        itemsHTML = `
            <div style="margin-top: 8px;">
                <div class="accordion-toggle" style="cursor: pointer; font-size: 0.85em; color: var(--primary); display: flex; align-items: center; gap: 5px;">
                    <span class="arrow">&#9654;</span> Показать детали (${items.length})
                </div>
                <div class="accordion-content" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.05);">
                    ${itemsList}
                </div>
            </div>
        `;
    }

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
                <strong>${tx.counterparty || 'Без контрагента'}${reconciledIcon}</strong>
                ${itemsHTML}
                <div style="font-size: 0.8em; color: #999; margin-top: 5px;">
                    ${formattedDate} &bull; ${tx.account_name}
                </div>
            </div>
            <div style="font-weight: bold; color: ${color}; font-size: 1.1em; white-space: nowrap; margin-left: 10px;">
                ${sign}${formatMoney(tx.amount, 'RUB')}
            </div>
        </div>
    `;

    div.addEventListener('click', (e) => {
        if (e.target.closest('.accordion-toggle')) return;
        window.dispatchEvent(new CustomEvent('navigate', { detail: `/transaction/${tx.id}` }));
    });

    if (hasMultipleItems) {
        const toggle = div.querySelector('.accordion-toggle');
        const content = div.querySelector('.accordion-content');
        const arrow = div.querySelector('.arrow');

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            arrow.innerHTML = isHidden ? '&#9660;' : '&#9654;';
        });
    }

    return div;
}