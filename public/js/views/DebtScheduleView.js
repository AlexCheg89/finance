import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { showErrorModal } from '../utils/status.js';

export class DebtScheduleView {
    async mount(container) {
        this.container = container;
        container.innerHTML = `<div class="dashboard"><p>Загрузка...</p></div>`;

        try {
            const res = await api.get('/debts/schedule');
            this.data = res.schedule;
            this.render(container);
        } catch (err) {
            showErrorModal(err.message);
        }

    }

    render(container) {
        const { months, schedule } = this.data;

        // Собираем все уникальные долги (по ID) для строк
        const debtMap = new Map();
        months.forEach(month => {
            Object.entries(schedule[month]).forEach(([debtId, debtData]) => {
                if (!debtMap.has(debtId)) {
                    debtMap.set(debtId, debtData);
                }
            });
        });

        // Сортируем: сначала родительские, потом дочерние
        const sortedDebts = Array.from(debtMap.values()).sort((a, b) => {
            if (a.parent_id === null && b.parent_id !== null) return -1;
            if (a.parent_id !== null && b.parent_id === null) return 1;
            return a.name.localeCompare(b.name);
        });

        // Формируем HTML-таблицу
        let html = `
            <div class="dashboard" style="max-width: 1400px;">
                <header>
                    <h1>График платежей</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="overflow-x: auto; background: rgba(255,255,255,0.5); border-radius: 12px; margin-top: 20px;">
                    <table style="width: 100%; border-collapse: collapse; min-width: 1200px;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.05);">
                                <th style="padding: 10px; text-align: left; position: sticky; left: 0; background: #f0f2f5; z-index: 1;">Долг</th>
                                ${months.map(m => `<th style="padding: 10px; text-align: right; min-width: 100px;">${m}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
        `;

        sortedDebts.forEach(debt => {
            const isChild = debt.parent_id !== null;
            html += `<tr>`;
            html += `<td style="padding: 10px; border-bottom: 1px solid rgba(0,0,0,0.05); ${isChild ? 'padding-left: 30px; font-size: 0.9em;' : 'font-weight: bold;'}">
                ${isChild ? '└ ' : ''}${debt.name}
            </td>`;

            months.forEach(month => {
            const cell = schedule[month][debt.total !== undefined ? debt.total : ''] || 
                             Object.values(schedule[month]).find(d => d.name === debt.name);
            
            // Если не нашли по имени, ищем по ID (упрощенно)
            let remaining = 0;
            for (const [id, d] of Object.entries(schedule[month])) {
                if (d.name === debt.name) {
                    remaining = d.remaining;
                    break;
                }
            }

            let bgColor = 'transparent';
            let textColor = 'var(--text-main)';

            if (remaining === 0) {
                bgColor = 'rgba(46, 125, 50, 0.15)';
                textColor = 'var(--success)';
            } else {
                bgColor = 'rgba(0,0,0,0.02)';
            }

            html += `<td style="padding: 10px; text-align: right; border-bottom: 1px solid rgba(0,0,0,0.05); background: ${bgColor}; color: ${textColor};">
                    ${remaining > 0 ? formatMoney(remaining, 'RUB') : '✓'}
                </td>`;
            });

            html += `</td>`;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = html;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/debts' }));
        });
    }
}