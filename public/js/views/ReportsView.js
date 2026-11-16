import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { showErrorModal } from '../utils/status.js';

export class ReportsView {
    async mount(container) {
        const now = new Date();
        const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const endOfMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`;

        container.innerHTML = `
            <div class="dashboard" style="max-width: 1100px;">
                <header>
                    <h1>Отчеты</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">&#8592; Назад</button>
                </header>

                <div style="display: flex; gap: 10px; margin-bottom: 20px; background: rgba(255,255,255,0.5); padding: 15px; border-radius: 12px; align-items: flex-end;">
                    <div style="flex: 1;">
                        <label class="col-muted" style="font-size: 0.85em;">С даты</label>
                        <input type="date" id="report-start" value="${startOfMonth}" style="margin-bottom: 0;">
                    </div>
                    <div style="flex: 1;">
                        <label class="col-muted" style="font-size: 0.85em;">По дату</label>
                        <input type="date" id="report-end" value="${endOfMonth}" style="margin-bottom: 0;">
                    </div>
                    <button id="build-report-btn" style="width: auto; padding: 10px 20px;">Построить</button>
                </div>

                <div id="report-content">
                    <p>Загрузка...</p>
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
        });

        document.getElementById('build-report-btn').addEventListener('click', () => {
            this.loadReport(container);
        });

        await this.loadReport(container);
    }

    async loadReport(container) {
        const content = document.getElementById('report-content');
        content.innerHTML = '<p>Загрузка...</p>';

        const start = document.getElementById('report-start').value;
        const end = document.getElementById('report-end').value;

        try {
            const res = await api.get(`/reports/summary?start=${start}&end=${end}`);
            const data = res.summary;

            if (data.total_expense === 0 && data.total_income === 0) {
                content.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Нет данных за выбранный период.</p>';
                return;
            }

            content.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <!-- Диаграмма + Легенда -->
                    <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; display: flex; flex-direction: column; align-items: center;">
                        <h3>Структура расходов</h3>
                        <canvas id="expense-chart" width="250" height="250" style="margin-top: 20px;"></canvas>
                        <div id="chart-legend" style="margin-top: 20px; width: 100%; display: flex; flex-direction: column; gap: 8px;"></div>
                    </div>
                    
                    <!-- Итоги -->
                    <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px;">
                        <h3>Итоги за период</h3>
                        <div style="margin-top: 20px;">
                            <p style="font-size: 1.1em; margin-bottom: 10px;">Общие расходы: <strong style="color: var(--danger);">${formatMoney(data.total_expense, 'RUB')}</strong></p>
                            <p style="font-size: 1.1em;">Общие доходы: <strong style="color: var(--success);">${formatMoney(data.total_income, 'RUB')}</strong></p>
                        </div>
                    </div>
                </div>

                <!-- Детализация расходов -->
                <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <h3>Детализация расходов</h3>
                    <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 150px 100px; gap: 10px; font-weight: bold; border-bottom: 2px solid rgba(0,0,0,0.1); padding-bottom: 10px; color: var(--text-muted); font-size: 0.9em;">
                        <div>Категория</div>
                        <div style="text-align: right;">Сумма</div>
                        <div style="text-align: right;">Доля</div>
                    </div>
                    <div id="expense-tree"></div>
                </div>

                <!-- Детализация доходов -->
                <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 12px;">
                    <h3>Детализация доходов</h3>
                    <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 150px 100px; gap: 10px; font-weight: bold; border-bottom: 2px solid rgba(0,0,0,0.1); padding-bottom: 10px; color: var(--text-muted); font-size: 0.9em;">
                        <div>Категория</div>
                        <div style="text-align: right;">Сумма</div>
                        <div style="text-align: right;">Доля</div>
                    </div>
                    <div id="income-tree"></div>
                </div>
            `;

            this.drawChart(data.expenses, data.total_expense);
            this.drawLegend(data.expenses);

            this.renderTree('expense-tree', data.expenses, data.total_expense);
            this.renderTree('income-tree', data.incomes, data.total_income);

        } catch (err) {
            showErrorModal(err.message);
            content.innerHTML = `<p style="color: var(--danger); text-align: center;">Ошибка загрузки отчета</p>`;
        }
    }

    renderTree(containerId, treeData, totalSum) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        treeData.forEach(parent => {
            const row = document.createElement('div');
            row.className = 'report-tree-row';
            row.style.fontWeight = 'bold';
            
            const hasChildren = parent.children && parent.children.length > 0;
            const hasTransactions = parent.transactions && parent.transactions.length > 0;
            const isExpandable = hasChildren || hasTransactions;
            
            const parentPercent = totalSum > 0 ? ((parent.sum / totalSum) * 100).toFixed(1) : 0;
            const parentIdStr = parent.name.replace(/\s+/g, '-');

            row.innerHTML = `
                <div>
                    <span class="report-toggle-icon" data-target="parent-${parentIdStr}">${isExpandable ? '&#9654;' : ''}</span>
                    ${parent.name}
                </div>
                <div style="text-align: right;">${formatMoney(parent.sum, 'RUB')}</div>
                <div style="text-align: right; color: var(--text-muted);">${parentPercent}%</div>
            `;
            container.appendChild(row);

            if (isExpandable) {
                const childContainer = document.createElement('div');
                childContainer.style.display = 'none';
                childContainer.id = `parent-${parentIdStr}`;

                // Дети (подкатегории)
                if (hasChildren) {
                    parent.children.forEach(child => {
                        const childRow = document.createElement('div');
                        childRow.className = 'report-tree-row report-child-row';
                        
                        const childHasTx = child.transactions && child.transactions.length > 0;
                        const childIdStr = child.name.replace(/\s+/g, '-');
                        const childPercent = totalSum > 0 ? ((child.sum / totalSum) * 100).toFixed(1) : 0;
                        
                        childRow.innerHTML = `
                            <div>
                                <span class="report-toggle-icon" data-target="child-${childIdStr}">${childHasTx ? '&#9654;' : ''}</span>
                                ${child.name}
                            </div>
                            <div style="text-align: right;">${formatMoney(child.sum, 'RUB')}</div>
                            <div style="text-align: right; color: var(--text-muted);">${childPercent}%</div>
                        `;
                        childContainer.appendChild(childRow);

                        if (childHasTx) {
                            const txContainer = document.createElement('div');
                            txContainer.style.display = 'none';
                            txContainer.id = `child-${childIdStr}`;
                            
                            child.transactions.forEach(tx => {
                                const txRow = document.createElement('div');
                                txRow.className = 'report-tree-row report-detail-row';
                                const dateStr = new Date(tx.date.replace(' ', 'T')).toLocaleDateString('ru-RU');
                                const txPercent = totalSum > 0 ? ((tx.amount / totalSum) * 100).toFixed(1) : 0;
                                
                                txRow.innerHTML = `
                                    <div>${tx.description} <span style="font-size: 0.8em; color: var(--text-muted);">(${dateStr})</span></div>
                                    <div style="text-align: right;">${formatMoney(tx.amount, 'RUB')}</div>
                                    <div style="text-align: right; color: var(--text-muted);">${txPercent}%</div>
                                `;
                                txContainer.appendChild(txRow);
                            });
                            childContainer.appendChild(txContainer);
                            
                            childRow.querySelector('.report-toggle-icon').addEventListener('click', (e) => {
                                e.stopPropagation();
                                const icon = e.target;
                                const target = icon.dataset.target;
                                const el = document.getElementById(target);
                                if (el) {
                                    const isHidden = el.style.display === 'none';
                                    el.style.display = isHidden ? 'block' : 'none';
                                    icon.classList.toggle('expanded', isHidden);
                                }
                            });
                        }
                    });
                }

                // Если нет детей, но есть транзакции у родителя
                if (!hasChildren && hasTransactions) {
                    parent.transactions.forEach(tx => {
                        const txRow = document.createElement('div');
                        txRow.className = 'report-tree-row report-child-row';
                        const dateStr = new Date(tx.date.replace(' ', 'T')).toLocaleDateString('ru-RU');
                        const txPercent = totalSum > 0 ? ((tx.amount / totalSum) * 100).toFixed(1) : 0;
                        
                        txRow.innerHTML = `
                            <div>${tx.description} <span style="font-size: 0.8em; color: var(--text-muted);">(${dateStr})</span></div>
                            <div style="text-align: right;">${formatMoney(tx.amount, 'RUB')}</div>
                            <div style="text-align: right; color: var(--text-muted);">${txPercent}%</div>
                        `;
                        childContainer.appendChild(txRow);
                    });
                }

                container.appendChild(childContainer);

                row.querySelector('.report-toggle-icon').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const icon = e.target;
                    const target = icon.dataset.target;
                    const el = document.getElementById(target);
                    if (el) {
                        const isHidden = el.style.display === 'none';
                        el.style.display = isHidden ? 'block' : 'none';
                        icon.classList.toggle('expanded', isHidden);
                    }
                });
            }
        });
    }

    drawChart(categories, totalExpense) {
        const canvas = document.getElementById('expense-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;

        const colors = ['#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6c757d'];
        
        let startAngle = -Math.PI / 2;
        const sumForChart = categories.reduce((sum, c) => sum + c.sum, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        categories.forEach((cat, index) => {
            if (cat.sum === 0) return;
            
            const sliceAngle = (cat.sum / sumForChart) * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;
            const color = colors[index % colors.length];

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            startAngle = endAngle;
        });

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Расход', centerX, centerY - 10);
        ctx.font = '14px sans-serif';
        ctx.fillText(formatMoney(totalExpense, 'RUB'), centerX, centerY + 15);
    }

    drawLegend(categories) {
        const legendContainer = document.getElementById('chart-legend');
        if (!legendContainer) return;

        const colors = ['#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6c757d'];
        const total = categories.reduce((sum, c) => sum + c.sum, 0);
        
        legendContainer.innerHTML = '';
        
        categories.forEach((cat, index) => {
            if (cat.sum === 0) return;
            
            const color = colors[index % colors.length];
            const percent = ((cat.sum / total) * 100).toFixed(1);
            
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 0.9em;';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: ${color};"></span>
                    <span>${cat.name}</span>
                </div>
                <span style="font-weight: 500;">${percent}%</span>
            `;
            legendContainer.appendChild(item);
        });
    }
}