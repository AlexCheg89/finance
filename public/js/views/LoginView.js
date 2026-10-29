import { api } from '../api.js';
import { store } from '../store.js';

export class LoginView {
    mount(container) {
        container.innerHTML = `
            <div class="auth-container">
                <h1>Вход в систему</h1>
                <form id="login-form">
                    <input type="text" id="username" placeholder="Логин" required>
                    <input type="password" id="password" placeholder="Пароль" required>
                    <button type="submit">Войти</button>
                </form>
                <p id="error-msg" style="color:red;"></p>
            </div>
        `;

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const res = await api.post('/auth/login', { username, password });
                store.set('user', res.user);
                // Перенаправляем на главную через наше кастомное событие
                window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
            } catch (err) {
                document.getElementById('error-msg').textContent = err.message;
            }
        });
    }
}