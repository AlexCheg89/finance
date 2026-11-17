import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { showErrorModal, showStatus } from '../utils/status.js';

export class DebtsView {
    async mount(container) {
        this.container = container;
        container.innerHTML = `<div class="dashboard"><p>Загрузка...</p></div>`;

        try {
            const res = await api.get('/debts');
            this.debts = res.debts;
            this.render(container);
        } catch (err) {
            showErrorModal(err.message);
        }
    }

    render(container) {
        // 1. СЧИТАЕМ ОБЩИЕ СУММЫ
        let totalDebt = 0;
        let totalPaid = 0;
        let totalPlanned = 0;

        this.debts.forEach(debt => {
            if (!debt.parent_id) {
                totalDebt += parseFloat(debt.total_amount);
                totalPaid += parseFloat(debt.paid_amount || 0);
                totalPlanned += parseFloat(debt.planned_amount || 0);
            }
        });

        const totalProgress = totalDebt > 0 ? (totalPaid / totalDebt) * 100 : 0;
        const totalPlannedProgress = totalDebt > 0 ? ((totalPaid + totalPlanned) / totalDebt) * 100 : 0;
        const totalRemaining = totalDebt - totalPaid;

        // 2. ГРУППИРУЕМ ПО КАТЕГОРИЯМ
        const grouped = {};
        this.debts.forEach(d => {
            const cat = d.category_name || 'Без категории';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(d);
        });

        // 3. ФОРМИРУЕМ HTML
        let html = `
            <div class="dashboard" style="max-width: 1100px;">
                <header>
                    <h1>Долги и обязательства</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; margin-bottom: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h2>Общая задолженность</h2>
                        <span style="font-size: 1.5em; font-weight: bold; color: var(--danger);">${formatMoney(totalRemaining, 'RUB')}</span>
                    </div>
                    
                    <!-- Трехцветный прогресс-бар -->
                    <div style="background: rgba(0,0,0,0.1); border-radius: 10px; height: 20px; overflow: hidden; margin-bottom: 10px;">
                        <div style="width: 100%; height: 100%; background: linear-gradient(to right, 
                            var(--success) 0%, 
                            var(--success) ${Math.min(totalProgress, 100)}%, 
                            #d1d5db ${Math.min(totalProgress, 100)}%, 
                            #d1d5db ${Math.min(totalPlannedProgress, 100)}%, 
                            #e5e7eb ${Math.min(totalPlannedProgress, 100)}%, 
                            #e5e7eb 100%
                        );"></div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: var(--text-muted);">
                        <span>Выплачено: ${formatMoney(totalPaid, 'RUB')}</span>
                        <span>Общая сумма долга: ${formatMoney(totalDebt, 'RUB')}</span>
                    </div>
                </div>

                <div style="margin-bottom: 20px; text-align: right;">
                    <button id="fix-payments-btn" style="background: #f59e0b; width: auto; padding: 8px 15px;">
                        &#9881; Распределить старые платежи
                    </button>
                </div>
        `;

        for (const [catName, debts] of Object.entries(grouped)) {
            html += `<h2 style="margin-top: 20px; border-bottom: 2px solid var(--primary); padding-bottom: 5px;">${catName}</h2>`;
            
            debts.forEach(debt => {
                const paid = parseFloat(debt.paid_amount) || 0;
                const planned = parseFloat(debt.planned_amount) || 0;
                const total = parseFloat(debt.total_amount) || 0;

                const progress = total > 0 ? (paid / total) * 100 : 0;
                const plannedProgress = total > 0 ? ((paid + planned) / total) * 100 : 0;
                const remaining = total - paid;
                
                html += `
                    <div class="account-card debt-card" data-id="${debt.id}" style="margin-bottom: 15px; padding: 15px; cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <strong>${debt.name}</strong>
                            <span style="font-weight: bold; color: ${remaining <= 0 ? 'var(--success)' : 'var(--text-main)'};">${formatMoney(total, 'RUB')}</span>
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
                        
                        <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-muted);">
                            <span>Выплачено: ${formatMoney(paid, 'RUB')}</span>
                            <span>Остаток: ${formatMoney(remaining, 'RUB')}</span>
                        </div>
                `;

                // Дочерние листы
                if (debt.children && debt.children.length > 0) {
                    html += `<div style="margin-top: 15px; padding-left: 20px; border-left: 2px solid rgba(0,0,0,0.1);">`;
                    debt.children.forEach(child => {
                        const childPaid = parseFloat(child.paid_amount) || 0;
                        const childPlanned = parseFloat(child.planned_amount) || 0;
                        const childTotal = parseFloat(child.total_amount) || 0;

                        const childProgress = childTotal > 0 ? (childPaid / childTotal) * 100 : 0;
                        const childPlannedProgress = childTotal > 0 ? ((childPaid + childPlanned) / childTotal) * 100 : 0;
                        
                        html += `
                            <div style="margin-bottom: 10px; font-size: 0.9em;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span>${child.name}</span>
                                    <span>${formatMoney(childTotal, 'RUB')}</span>
                                </div>
                                <div style="background: rgba(0,0,0,0.1); border-radius: 5px; height: 5px; margin-top: 3px;">
                                    <div style="width: 100%; height: 100%; background: linear-gradient(to right, 
                                        var(--primary) 0%, 
                                        var(--primary) ${Math.min(childProgress, 100)}%, 
                                        #d1d5db ${Math.min(childProgress, 100)}%, 
                                        #d1d5db ${Math.min(childPlannedProgress, 100)}%, 
                                        #e5e7eb ${Math.min(childPlannedProgress, 100)}%, 
                                        #e5e7eb 100%
                                    );"></div>
                                </div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                }

                html += `</div>`;
            });
        }

        html += `</div>`;
        container.innerHTML = html;

        // Обработчики
        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });

        document.querySelectorAll('.debt-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    const id = card.dataset.id;
                    window.dispatchEvent(new CustomEvent('navigate', { detail: `/debt/${id}` }));
                }
            });
        });

        document.getElementById('fix-payments-btn').addEventListener('click', async () => {
            if (!confirm('Распределить старые платежи по листам? Это действие необратимо.')) return;
            
            try {
                const res = await api.post('/debts/fix-payments');
                showStatus(res.message, 'success');
                this.mount(this.container);
            } catch (err) {
                showErrorModal(err.message);
            }
        });
    }
}