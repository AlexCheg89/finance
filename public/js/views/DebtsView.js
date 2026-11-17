import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { showErrorModal } from '../utils/status.js';

export class DebtsView {
    async mount(container) {
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
        // Группируем по категориям (Долги, Кредиты, Кредитные карты)
        const grouped = {};
        this.debts.forEach(d => {
            const cat = d.category_name || 'Без категории';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(d);
        });

        let html = `
            <div class="dashboard" style="max-width: 1100px;">
                <header>    
                    <h1>Долги и обязательства</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>
        `;
        for (const [catName, debts] of Object.entries(grouped)) {
            html += `<h2 style="margin-top: 20px; border-bottom: 2px solid var(--primary); padding-bottom: 5px;">${catName}</h2>`;

            debts.forEach(debt => {
                // Считаем прогресс по ФАКТУ
                const progress = debt.total_amount > 0 ? (debt.paid_amount / debt.total_amount) * 100 : 0;
                // Считаем прогресс по ПЛАНУ (факт + план)
                const plannedProgress = debt.total_amount > 0 ? ((debt.paid_amount + debt.planned_amount) / debt.total_amount) * 100 : 0;
                
                const remaining = debt.total_amount - debt.paid_amount;

                html += `
                    <div class="account-card" style="margin-bottom: 15px; padding: 15px; cursor: default;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <strong>${debt.name}</strong>
                            <span style="font-weight: bold; color: ${remaining <= 0 ? 'var(--success)' : 'var(--text-main)'};">${formatMoney(debt.total_amount, 'RUB')}</span>
                        </div>

                        <!-- Прогресс-бар (Факт + План) -->
                        <div style="background: rgba(0,0,0,0.1); border-radius: 10px; height: 10px; overflow: hidden; margin-bottom: 5px; position: relative;">
                            <!-- Серый фон для плана -->
                            <div style="width: ${Math.min(plannedProgress, 100)}%; height: 100%; background: #d1d5db; position: absolute; top: 0; left: 0;"></div>
                            <!-- Зеленый для факта -->
                            <div style="width: ${Math.min(progress, 100)}%; height: 100%; background: var(--success); position: absolute; top: 0; left: 0;"></div>
                        </div>

                        <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-muted);">
                            <span>Выплачено: ${formatMoney(debt.paid_amount, 'RUB')}</span>
                            <span>Остаток: ${formatMoney(remaining, 'RUB')}</span>
                        </div>
                `;

                // Если есть дочерние листы (внутри сводного дела)
                if (debt.children && debt.children.length > 0) {
                    html += `<div style="margin-top: 15px; padding-left: 20px; border-left: 2px solid rgba(0,0,0,0.1);">`;
                    debt.children.forEach(child => {
                        const childProgress = child.total_amount > 0 ? (child.paid_amount / child.total_amount) * 100 : 0;
                        html += `
                            <div style="margin-bottom: 10px; font-size: 0.9em;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span>${child.name}</span>
                                    <span>${formatMoney(child.total_amount, 'RUB')}</span>
                                </div>
                                <div style="background: rgba(0,0,0,0.1); border-radius: 5px; height: 5px; margin-top: 3px;">
                                    <div style="width: ${Math.min(childProgress, 100)}%; height: 100%; background: var(--primary);"></div>
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

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });
    }
}
