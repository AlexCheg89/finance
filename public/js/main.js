import { router } from './router.js';
import { LoginView } from './views/LoginView.js';
import { DashboardView } from './views/DashboardView.js';

// Регистрируем маршруты
router.add('/login', LoginView);
router.add('/dashboard', DashboardView);

// Запускаем
router.init();