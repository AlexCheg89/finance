const BASE_URL = '/api';

async function request(method, endpoint, data = null) {
    // Формируем заголовки сразу, если есть данные
    const headers = {};
    if (data) {
        headers['Content-Type'] = 'application/json';
    }

    const options = {
        method,
        headers,
        credentials: 'include'
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const text = await response.text();
    
    let result;
    try {
        result = JSON.parse(text);
    } catch (e) {
        console.error("Сервер вернул не JSON:", text);
        throw new Error('Ошибка на сервере. Проверьте консоль.');
    }

    if (!response.ok) {
        throw new Error(result.error || 'Ошибка сервера');
    }

    return result;
}

export const api = {
    get: (url) => request('GET', url),
    post: (url, data) => request('POST', url, data),
    put: (url, data) => request('PUT', url, data),
    delete: (url) => request('DELETE', url)
};