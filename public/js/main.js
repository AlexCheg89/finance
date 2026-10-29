import { router } from './router.js';
import { LoginView } from './views/LoginView.js';
import { DashboardView } from './views/DashboardView.js';
import { AccountsView } from './views/AccountsView.js';
import { AccountView } from './views/AccountView.js';

// Регистрируем маршруты
router.add('/login', LoginView);
router.add('/dashboard', DashboardView);
router.add('/accounts', AccountsView);
router.add('/account/1', AccountView);

// Запускаем роутер
router.init();