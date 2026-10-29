export class AccountView {
    mount(container) {
        // Получаем ID счета из URL (например, /account/1)
        const hash = window.location.hash.replace('#', '');
        const parts = hash.split('/');
        const accountId = parts[2]; // '1'

        container.innerHTML = `
            <div class="dashboard">
                <header>
                    <h1>Счет #${accountId}</h1>
                    <button id="back-btn" style="width:auto; padding: 5px 15px;">← Назад к счетам</button>
                </header>
                <div style="text-align: center; padding: 50px; color: #888;">
                    <h2>&#128679; Раздел в разработке</h2>
                    <p>Здесь будет история транзакций и детализация по этому счету.</p>
                    <p>Скоро мы это напишем!</p>
                </div>
            </div>
        `;

        document.getElementById('back-btn').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/accounts' }));
        });
    }
}