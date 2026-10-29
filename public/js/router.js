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
    
    handleRouting() {
        let path = window.location.hash.replace('#', '') || '/dashboard';
        
        // По умолчанию, если не авторизован, кидаем на логин
        if (!this.routes[path]) {
            path = '/login';
        }
        
        // Очищаем app перед рендером
        const app = document.getElementById('app');
        app.innerHTML = ''; 
        
        const ViewClass = this.routes[path];
        const view = new ViewClass();
        view.mount(app);
    }
};