import { formatMoney, formatDateTime } from '../utils/format.js';

export function createTransactionCard(tx) {
    const isExpense = tx.type === 'expense';
    const color = isExpense ? 'var(--danger)' : 'var(--success)';
    const sign = isExpense ? '-' : '+';

    // Форматируем дату и время
    const formattedDate = formatDateTime(tx.transaction_date);

    // Статус сверки
    const reconciledIcon = parseInt(tx.is_reconciled) === 1 ? '<span style="color:var(--success);" title="Сверено">&#10004;</span>' : '';

    const div = document.createElement('div');
    div.className = 'account-card tx-card';
    div.dataset.id = tx.id;
    div.style.csstext = 'margin-bottom: 10px; cursor: pointer; padding: 15px;';

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${tx.counterparty || 'Без контрагента'}${reconciledIcon}</strong>
                <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">
                    ${formattedDate} &bull; ${tx.account_name}
                </div>
            </div>
            <div style="font-weight: bold; color: ${color}; font-size: 1.1em;">
                ${sign}${formatMoney(tx.amount, 'RUB')}
            </div>
        </div>
    `;

    // Добавляем обработчик клика прямо в компонент
    div.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navigate', { detail: `/transaction/${tx.id}` }));
    });

    return div;
}