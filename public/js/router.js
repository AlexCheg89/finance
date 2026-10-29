export const router = {
    routes: {},
    
    init() {
        window.addEventListener('hashchange', () => this.handleRouting());
        window.addEventListener('navigate', (e) => {
            window.location.hash = e.detail;
        });
        this.handleRouting();
    },
    
    add(path, viewClass) {
        this.routes[path] = viewClass;
    },
    
    async handleRouting() {
        let path = window.location.hash.replace('#', '') || '/dashboard';
        
        // Если путь не найден, кидаем на дашборд (или логин)
        if (!this.routes[path]) {
            path = '/login';
        }

        // ГЛОБАЛЬНАЯ ПРОВЕРКА АВТОРИЗАЦИИ
        // Если мы идем не на /login, проверяем, есть ли пользователь
        if (path !== '/login') {
            try {
                // Делаем запрос к API, чтобы узнать, жива ли сессия
                const response = await fetch('/api/auth/me', { credentials: 'include' });
                if (!response.ok) {
                    // Если 401, значит сессия истекла или куки не пришли
                    window.location.hash = '/login';
                    return;
                }
                // Если все ок, сохраняем пользователя в стор
                const data = await response.json();
                const { store } = await import('./store.js');
                store.set('user', data.user);
            } catch (e) {
                // Если сервер недоступен, тоже кидаем на логин
                window.location.hash = '/login';
                return;
            }
        }
        
        // Очищаем app перед рендером
        const app = document.getElementById('app');
        app.innerHTML = ''; 
        
        const ViewClass = this.routes[path];
        const view = new ViewClass();
        view.mount(app);
    }
};