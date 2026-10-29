export const store = {
    state: {
        user: null,
        accounts: []
    },

    listeners: [],

    subscribe(callback) {
        this.listeners.push(callback);
    },

    notify() {
        this.listeners.forEach(cb => cb(this.state));
    },

    set(key, value) {
        this.state[key] = value;
        this.notify();
    }
};