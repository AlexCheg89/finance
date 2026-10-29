export function formatMoney(amount, currency = 'RUB') {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(amount);
}

export function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ru-RU');
}

export function formatDateTime(dateTimeString) {
    if (!dateTimeString) return '';
    // Приводим строку к формату, который понимает JS (заменяем пробел на T)
    const safeString = dateTimeString.replace(' ', 'T');
    const date = new Date(safeString);
    
    if (isNaN(date.getTime())) return dateTimeString; // Если не распарсилось, отдаем как есть

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}