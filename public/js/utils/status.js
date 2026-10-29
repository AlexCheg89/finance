import { Modal } from '../components/Modal.js';

export function showStatus(message, type = 'info') {
    const el = document.getElementById('status-message');
    if (!el) return;
    
    el.textContent = message;
    el.className = `status-message status-${type}`;
    
    clearTimeout(el.timer);
    el.timer = setTimeout(() => {
        el.classList.add('hidden');
    }, 3000);
}

export function showErrorModal(message) {
    const modal = new Modal('Ошибка', `
        <div style="text-align: center; padding: 10px;">
            <p style="color: var(--danger); font-size: 1.1em; margin-bottom: 20px;">${message}</p>
            <button id="close-error-btn" style="width: 100%;">Понятно</button>
        </div>
    `);
    modal.open();
    
    document.getElementById('close-error-btn').addEventListener('click', () => modal.close());
}