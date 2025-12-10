// Toast notification system for admin dashboard
import { writable } from 'svelte/store';

export const toasts = writable([]);

let nextId = 0;

export function addToast(message, type = 'info', duration = 3000) {
    const id = nextId++;
    const toast = { id, message, type };

    toasts.update(t => [...t, toast]);

    if (duration > 0) {
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }

    return id;
}

export function removeToast(id) {
    toasts.update(t => t.filter(toast => toast.id !== id));
}

export function success(message, duration = 3000) {
    return addToast(message, 'success', duration);
}

export function error(message, duration = 5000) {
    return addToast(message, 'error', duration);
}

export function info(message, duration = 3000) {
    return addToast(message, 'info', duration);
}

export function warning(message, duration = 4000) {
    return addToast(message, 'warning', duration);
}
