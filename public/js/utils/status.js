export function showStatus(message, type = 'info') {
    const el = document.getElementById('status-message');
    if (!el) return;
    
    el.textContent = message;
    el.className = `status-message status-${type}`;
    
    // Очищаем через 3 секунды
    clearTimeout(el.timer);
    el.timer = setTimeout(() => {
        el.classList.add('hidden');
    }, 3000);
}