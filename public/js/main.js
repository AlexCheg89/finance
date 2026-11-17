import { router } from './router.js';
import { LoginView } from './views/LoginView.js';
import { DashboardView } from './views/DashboardView.js';
import { AccountsView } from './views/AccountsView.js';
import { AccountView } from './views/AccountView.js';
import { TransactionsView } from './views/TransactionsView.js';
import { TransactionDetailView } from './views/TransactionDetailView.js';
import { BudgetView } from './views/BudgetView.js';
import { ReportsView } from './views/ReportsView.js';
import { DebtsView } from './views/DebtsView.js';
import { DebtDetailView } from './views/DebtDetailView.js';

// Регистрируем маршруты
router.add('/login', LoginView);
router.add('/dashboard', DashboardView);
router.add('/accounts', AccountsView);
router.add('/account', AccountView);
router.add('/transactions', TransactionsView);
router.add('/transaction', TransactionDetailView);
router.add('/budget', BudgetView);
router.add('/reports', ReportsView);
router.add('/debts', DebtsView);
router.add('/debt', DebtDetailView);

// Запускаем роутер
router.init();