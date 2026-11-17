import { api } from '../api.js';
import { formatMoney, formatDateTime } from '../utils/format.js';
import { showErrorModal } from '../utils/status.js';

export class DebtDetailView {
    async mount(container) {
        const hash = window.location.hash.replace('#', '');
        const debtId = hash.split('/')[2];

        container.innerHTML = `<div class="dashboard"><p>Загрузка...</p></div>`;

        try {
            const res = await api.get(`/debts/${debtId}`);
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
                    ${debt.transactions.map(tx => `
                        <div class="account-card tx-item" data-id="${tx.id}" style="display: flex; justify-content: space-between; padding: 15px; border-bottom: 1px solid rgba(0,0,0,0.05); cursor: pointer;">
                            <div>
                                <div>${formatDateTime(tx.transaction_date)}</div>
                                <div style="font-size: 0.85em; color: var(--text-muted);">${tx.counterparty}</div>
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
                    `).join('')}
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/debts' }));
        });

        document.querySelectorAll('.tx-item').forEach(item => {
            item.addEventListener('click', () => {
                const txId = item.dataset.id;
                window.dispatchEvent(new CustomEvent('navigate', { detail: `/transaction/${txId}` }));
            });
        });
    }
}