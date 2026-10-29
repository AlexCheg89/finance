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
        
        // Обработка динамических ID (например, /transaction/2)
        if (path.startsWith('/transaction/')) {
            path = '/transaction';
        }

        if (!this.routes[path]) {
            path = '/login';
        }

        // Проверка авторизации
        if (path !== '/login') {
            try {
                const response = await fetch('/api/auth/me', { credentials: 'include' });
                if (!response.ok) {
                    window.location.hash = '/login';
                    return;
                }
                const data = await response.json();
                // Динамический импорт, чтобы избежать циклической зависимости
                const { store } = await import('./store.js');
                store.set('user', data.user);
            } catch (e) {
                window.location.hash = '/login';
                return;
            }
        }
        
        const app = document.getElementById('app');
        app.innerHTML = ''; 
        
        const ViewClass = this.routes[path];
        const view = new ViewClass();
        view.mount(app);
    }
};