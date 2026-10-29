export class Modal {
    constructor(title, contentHTML) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        
        this.modal = document.createElement('div');
        this.modal.className = 'modal-window';
        
        this.modal.innerHTML = `
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close" type="button">&times;</button>
            </div>
            <div class="modal-body">
                ${contentHTML}
            </div>
        `;
        
        this.overlay.appendChild(this.modal);
        
        // Закрытие по клику на крестик
        this.modal.querySelector('.modal-close').addEventListener('click', () => this.close());
        
        // Закрытие по клику на затемненный фон
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
    }

    open() {
        document.body.appendChild(this.overlay);
    }

    close() {
        this.overlay.remove();
    }
}