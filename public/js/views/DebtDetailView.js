import { api } from '../api.js';
import { formatMoney, formatDateTime } from '../utils/format.js';
import { showErrorModal, showStatus } from '../utils/status.js';
import { Modal } from '../components/Modal.js';

export class DebtDetailView {
    async mount(container) {
        this.container = container;
        const hash = window.location.hash.replace('#', '');
        this.debtId = hash.split('/')[2];

        container.innerHTML = `<div class="dashboard"><p>Загрузка...</p></div>`;

        try {
            const res = await api.get(`/debts/${this.debtId}`);
            this.debt = res.debt;
            this.render(container);
        } catch (err) {
            showErrorModal(err.message);
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/debts' }));
        }
    }

    render(container) {
        const debt = this.debt;
        
        // Считаем проценты
        const paid = parseFloat(debt.paid_amount) || 0;
        const planned = parseFloat(debt.planned_amount) || 0;
        const total = parseFloat(debt.total_amount) || 0;
        
        const progress = total > 0 ? (paid / total) * 100 : 0;
        const plannedProgress = total > 0 ? ((paid + planned) / total) * 100 : 0;
        const remaining = total - paid;

        container.innerHTML = `
            <div class="dashboard" style="max-width: 1100px;">
                <header>
                    <h1>${debt.name}</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>Общая сумма:</span>
                        <strong>${formatMoney(total, 'RUB')}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>Выплачено (факт):</span>
                        <strong style="color: var(--success);">${formatMoney(paid, 'RUB')}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>Запланировано:</span>
                        <strong style="color: #6b7280;">${formatMoney(planned, 'RUB')}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                        <span>Остаток:</span>
                        <strong style="color: var(--danger);">${formatMoney(remaining, 'RUB')}</strong>
                    </div>
                    
                    <!-- Трехцветный прогресс-бар -->
                    <div style="background: rgba(0,0,0,0.1); border-radius: 10px; height: 10px; overflow: hidden; margin-bottom: 5px;">
                        <div style="width: 100%; height: 100%; background: linear-gradient(to right, 
                            var(--success) 0%, 
                            var(--success) ${Math.min(progress, 100)}%, 
                            #d1d5db ${Math.min(progress, 100)}%, 
                            #d1d5db ${Math.min(plannedProgress, 100)}%, 
                            #e5e7eb ${Math.min(plannedProgress, 100)}%, 
                            #e5e7eb 100%
                        );"></div>
                    </div>
                    
                    <!-- Легенда под прогресс-баром -->
                    <div style="display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-muted); margin-top: 5px;">
                        <span><span style="display:inline-block; width:8px; height:8px; background:var(--success); border-radius:50%; margin-right:4px;"></span>Факт</span>
                        <span><span style="display:inline-block; width:8px; height:8px; background:#d1d5db; border-radius:50%; margin-right:4px;"></span>План</span>
                        <span><span style="display:inline-block; width:8px; height:8px; background:#e5e7eb; border-radius:50%; margin-right:4px;"></span>Остаток</span>
                    </div>
                </div>

                <h3>История платежей</h3>
                <div style="background: rgba(255,255,255,0.5); border-radius: 12px; overflow: hidden; margin-top: 10px;">
                    ${debt.transactions.length === 0 ? '<p style="padding: 20px; text-align: center; color: var(--text-muted);">Нет платежей</p>' : ''}
                    ${debt.transactions.map(tx => {
                        // Статус распределения
                        let distStatusHTML = '';
                        if (tx.debt_id) {
                            if (tx.debt_payment_status === 'pending') {
                                distStatusHTML = `<div style="font-size: 0.75em; color: #f59e0b; margin-top: 2px;">&#9888; Ожидает распределения</div>`;
                            } else if (tx.debt_payment_status === 'confirmed') {
                                distStatusHTML = `<div style="font-size: 0.75em; color: var(--success); margin-top: 2px;">&#10004; Распределено</div>`;
                            } else if (tx.debt_payment_status === 'disputed') {
                                distStatusHTML = `<div style="font-size: 0.75em; color: var(--danger); margin-top: 2px;">&#10006; Оспаривается</div>`;
                            }
                        }

                        return `
                            <div class="account-card tx-item" 
                                 data-id="${tx.id}" 
                                 data-has-debt="${tx.debt_id ? '1' : '0'}"
                                 data-dist-status="${tx.debt_payment_status || 'none'}"
                                 style="display: flex; justify-content: space-between; padding: 15px; border-bottom: 1px solid rgba(0,0,0,0.05); cursor: pointer;">
                                <div>
                                    <div>${formatDateTime(tx.transaction_date)}</div>
                                    <div style="font-size: 0.85em; color: var(--text-muted);">${tx.counterparty}</div>
                                    ${distStatusHTML}
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-weight: bold; color: ${tx.type === 'income' ? 'var(--success)' : 'var(--danger)'};">
                                        ${tx.type === 'income' ? '+' : '-'}${formatMoney(tx.amount, 'RUB')}
                                    </div>
                                    <div style="font-size: 0.85em; color: ${tx.status === 'actual' ? 'var(--success)' : '#f59e0b'};">
                                        ${tx.status === 'actual' ? 'Факт' : 'План'}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/debts' }));
        });

        // Обработчик клика по транзакции
        document.querySelectorAll('.tx-item').forEach(item => {
            item.addEventListener('click', () => {
                const txId = item.dataset.id;
                const hasDebt = item.dataset.hasDebt === '1';
                const distStatus = item.dataset.distStatus;
                
                if (hasDebt && distStatus === 'pending') {
                    this.openDistributionModal(txId);
                } else if (hasDebt) {
                    window.dispatchEvent(new CustomEvent('navigate', { detail: `/transaction/${txId}` }));
                } else {
                    window.dispatchEvent(new CustomEvent('navigate', { detail: `/transaction/${txId}` }));
                }
            });
        });
    }

    async openDistributionModal(txId) {
        const res = await api.get(`/debts/distribution/${txId}`);
        const { transaction, distributions } = res;

        if (res.error) {
            showErrorModal(res.error);
            return;
        }

        const debtType = distributions[0]?.debt_type || 'enforcement';
        const isCredit = (debtType === 'credit_card' || debtType === 'loan');
        const totalAmount = parseFloat(transaction.amount);

        const principalLabel = 'Основной долг';
        const feeLabel = isCredit ? 'Проценты' : 'Исп сбор';

        let rowsHTML = '';

        if (isCredit) {
            // Для кредитки — одна строка с двумя полями
            const d = distributions[0];
            rowsHTML = `
                <tr>
                    <td style="padding: 8px;">${d.debt_name}</td>
                    <td style="padding: 8px;">
                        <input type="number" id="dist-principal-0" data-debt="${d.debt_id}" value="${parseFloat(d.principal_amount) || 0}" step="0.01" style="width: 100%;">
                    </td>
                    <td style="padding: 8px;">
                        <input type="number" id="dist-fee-0" data-debt="${d.debt_id}" value="${parseFloat(d.fee_amount) || 0}" step="0.01" style="width: 100%;">
                    </td>
                </tr>
            `;
        } else {
            // Для сводного дела — несколько строк
            rowsHTML = distributions.map(d => `
                <tr>
                    <td style="padding: 8px;">${d.debt_name}</td>
                    <td style="padding: 8px;">
                        <input type="number" class="dist-principal" data-debt="${d.debt_id}" value="${parseFloat(d.principal_amount) || 0}" step="0.01" style="width: 100%;">
                    </td>
                    <td style="padding: 8px;">
                        <input type="number" class="dist-fee" data-debt="${d.debt_id}" value="${parseFloat(d.fee_amount) || 0}" step="0.01" style="width: 100%;">
                    </td>
                </tr>
            `).join('');
        }

        const modal = new Modal('Сверить распределение', `
            <p>Сумма платежа: <strong>${formatMoney(totalAmount, 'RUB')}</strong></p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <thead>
                    <tr style="background: rgba(0,0,0,0.05);">
                        <th style="padding: 8px; text-align: left;">Лист</th>
                        <th style="padding: 8px; text-align: left;">${principalLabel}</th>
                        <th style="padding: 8px; text-align: left;">${feeLabel}</th>
                    </tr>
                </thead>
                <tbody>${rowsHTML}</tbody>
            </table>
            <p style="font-size: 0.85em; color: var(--text-muted); margin-top: 10px;">
                Проверьте суммы. Если банк/пристав распределил иначе — исправьте.
            </p>
            <button id="confirm-dist-btn" style="margin-top: 15px; width: 100%;">Подтвердить распределение</button>
            <div style="display: flex; gap: 10px; margin-top:15px;">
                ${transaction.status === 'planned' ? `
                        <button id="edit-tx-btn" style="flex 1; background: #6c757d;">Редактировать</button>
                    ` : ''}
                
                <button id="delete-tx-btn" style="flex 1; background: var(--danger);">Удалить</button>
            </div>
        `);
        modal.open();

        // --- ЛОГИКА «СООБЩАЮЩИХСЯ СОСУДОВ» для кредиток ---
        if (isCredit) {
            const principalInput = document.getElementById('dist-principal-0');
            const feeInput = document.getElementById('dist-fee-0');

            principalInput.addEventListener('input', () => {
                const principal = parseFloat(principalInput.value) || 0;
                const fee = Math.max(0, totalAmount - principal);
                feeInput.value = fee.toFixed(2);
            });

            feeInput.addEventListener('input', () => {
                const fee = parseFloat(feeInput.value) || 0;
                const principal = Math.max(0, totalAmount - fee);
                principalInput.value = principal.toFixed(2);
            });
        }

        // --- ОТПРАВКА ---
        document.getElementById('confirm-dist-btn').addEventListener('click', async () => {
            let distributionsData = [];

            if (isCredit) {
                const principal = parseFloat(document.getElementById('dist-principal-0').value) || 0;
                const fee = parseFloat(document.getElementById('dist-fee-0').value) || 0;
                
                if (Math.abs((principal + fee) - totalAmount) > 0.01) {
                    showErrorModal('Сумма долга и процентов должна равняться сумме платежа');
                    return;
                }

                distributionsData.push({
                    debt_id: parseInt(document.getElementById('dist-principal-0').dataset.debt),
                    principal: principal,
                    fee: fee
                });
            } else {
                document.querySelectorAll('.dist-principal').forEach(inp => {
                    const debtId = inp.dataset.debt;
                    const principal = parseFloat(inp.value) || 0;
                    const fee = parseFloat(document.querySelector(`.dist-fee[data-debt="${debtId}"]`).value) || 0;
                    distributionsData.push({ debt_id: debtId, principal, fee });
                });
            }

            try {
                await api.post(`/debts/confirm-distribution/${txId}`, { distributions: distributionsData });
                modal.close();
                showStatus('Распределение подтверждено', 'success');
                this.mount(this.container);
            } catch (err) {
                showErrorModal(err.message);
            }
        });

        document.getElementById('edit-tx-btn').addEventListener('click', async () => {
            modal.close();
            window.dispatchEvent(new CustomEvent('navigate', {detail: `/transaction/${txId}` }));
        });
        document.getElementById('delete-tx-btn').addEventListener('click', async () => {
            if (!confirm('Удалить этот платеж?')) return;
            try {
                await api.delete(`/transactions/${txId}`);
                modal.close();
                showStatus('Платёж удален', 'success');
                this.mount(this.container);
            } catch (err) {
                showErrorModal(err.message);
            }
        });
    }
}