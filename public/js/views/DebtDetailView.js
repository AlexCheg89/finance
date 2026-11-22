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
        try {
            const res = await api.get(`/debts/distribution/${txId}`);
            const { transaction, distributions } = res;

            if (!distributions || distributions.length === 0) {
                showErrorModal('Нет данных для распределения');
                return;
            }

            // Формируем строки таблицы
            let rowsHTML = distributions.map((d, idx) => `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.05);">${d.debt_name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <input type="number" class="dist-principal" data-debt="${d.debt_id}" value="${parseFloat(d.principal_amount || 0).toFixed(2)}" step="0.01" style="width: 100%; margin-bottom: 0;">
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <input type="number" class="dist-fee" data-debt="${d.debt_id}" value="${parseFloat(d.fee_amount || 0).toFixed(2)}" step="0.01" style="width: 100%; margin-bottom: 0;">
                    </td>
                </tr>
            `).join('');

            const totalPrincipal = distributions.reduce((sum, d) => sum + parseFloat(d.principal_amount || 0), 0);
            const totalFee = distributions.reduce((sum, d) => sum + parseFloat(d.fee_amount || 0), 0);

            const modal = new Modal('Сверить распределение', `
                <p style="margin-bottom: 10px;">Сумма платежа: <strong>${formatMoney(transaction.amount, 'RUB')}</strong></p>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                    <thead>
                        <tr style="background: rgba(0,0,0,0.05);">
                            <th style="padding: 8px; text-align: left;">Лист</th>
                            <th style="padding: 8px; text-align: left;">Основной долг</th>
                            <th style="padding: 8px; text-align: left;">Исполнительский сбор</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                    <tfoot>
                        <tr style="font-weight: bold; background: rgba(0,0,0,0.02);">
                            <td style="padding: 8px;">Итого:</td>
                            <td style="padding: 8px;" id="total-principal">${formatMoney(totalPrincipal, 'RUB')}</td>
                            <td style="padding: 8px;" id="total-fee">${formatMoney(totalFee, 'RUB')}</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="margin-top: 10px; font-size: 0.85em; color: var(--text-muted);">
                    Проверьте суммы. Если пристав распределил иначе — исправьте.
                </div>
                <button id="confirm-dist-btn" style="margin-top: 15px; width: 100%;">Подтвердить распределение</button>
            `);
            modal.open();

            // Пересчёт итогов при изменении полей
            const updateTotals = () => {
                let tp = 0, tf = 0;
                document.querySelectorAll('.dist-principal').forEach(inp => tp += parseFloat(inp.value) || 0);
                document.querySelectorAll('.dist-fee').forEach(inp => tf += parseFloat(inp.value) || 0);
                document.getElementById('total-principal').textContent = formatMoney(tp, 'RUB');
                document.getElementById('total-fee').textContent = formatMoney(tf, 'RUB');
            };

            document.querySelectorAll('.dist-principal, .dist-fee').forEach(inp => {
                inp.addEventListener('input', updateTotals);
            });

            // Обработчик подтверждения
            document.getElementById('confirm-dist-btn').addEventListener('click', async () => {
                const distributionsData = [];
                document.querySelectorAll('.dist-principal').forEach(inp => {
                    const debtId = parseInt(inp.dataset.debt);
                    const principal = parseFloat(inp.value) || 0;
                    const feeInput = document.querySelector(`.dist-fee[data-debt="${debtId}"]`);
                    const fee = parseFloat(feeInput.value) || 0;
                    
                    distributionsData.push({ 
                        debt_id: debtId, 
                        principal: principal, 
                        fee: fee 
                    });
                });

                try {
                    await api.post(`/debts/confirm-distribution/${txId}`, { distributions: distributionsData });
                    modal.close();
                    showStatus('Распределение подтверждено', 'success');
                    
                    // Перезагружаем страницу
                    const res = await api.get(`/debts/${this.debtId}`);
                    this.debt = res.debt;
                    this.render(container);
                } catch (err) {
                    showErrorModal(err.message);
                }
            });

        } catch (err) {
            showErrorModal(err.message);
        }
    }
}