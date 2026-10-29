export function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key.startsWith('on')) {
            el.addEventListener(key.toLowerCase().slice(2), value);
        } else {
            el.setAttribute(key, value);
        }
    }
    if (typeof children === 'string') {
        el.textContent = children;
    } else if (Array.isArray(children)) {
        children.forEach(child => {
            el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
    }
    return el;
}