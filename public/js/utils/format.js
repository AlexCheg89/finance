export function formatMoney(amount, currency = 'RUB') {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(amount);
}

export function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ru-RU');
}