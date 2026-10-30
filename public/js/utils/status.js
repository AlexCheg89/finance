import { Modal } from '../components/Modal.js';

// Единая функция для показа уведомлений (вместо старых тостов)
export function showStatus(message, type = 'info') {
    // Определяем иконку и цвет в зависимости от типа
    let icon = '&#8505;'; // Информация
    let color = 'var(--primary)';
    
    if (type === 'success') {
        icon = '&#10004;'; // Галочка
        color = 'var(--success)';
    } else if (type === 'error') {
        icon = '&#10006;'; // Крестик
        color = 'var(--danger)';
    }

    const modal = new Modal('Уведомление', `
        <div style="text-align: center; padding: 10px;">
            <div style="font-size: 2.5em; color: ${color}; margin-bottom: 15px;">${icon}</div>
            <p style="font-size: 1.1em; margin-bottom: 20px;">${message}</p>
            <button id="close-status-btn" style="width: 100%;">ОК</button>
        </div>
    `);
    modal.open();
    
    document.getElementById('close-status-btn').addEventListener('click', () => modal.close());
}

// Оставляем старую функцию для ошибок валидации, она тоже использует модалку
export function showErrorModal(message) {
    const modal = new Modal('Ошибка', `
        <div style="text-align: center; padding: 10px;">
            <div style="font-size: 2.5em; color: var(--danger); margin-bottom: 15px;">&#10006;</div>
            <p style="color: var(--danger); font-size: 1.1em; margin-bottom: 20px;">${message}</p>
            <button id="close-error-btn" style="width: 100%;">Понятно</button>
        </div>
    `);
    modal.open();
    
    document.getElementById('close-error-btn').addEventListener('click', () => modal.close());
}