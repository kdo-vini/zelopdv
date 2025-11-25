import { writable } from 'svelte/store';

// --- TOASTS ---
export const toasts = writable([]);

/**
 * Adiciona um toast à fila.
 * @param {string} message Mensagem a ser exibida.
 * @param {'info'|'success'|'error'|'warning'} type Tipo do toast.
 * @param {number} duration Duração em ms (padrão 3000).
 */
export function addToast(message, type = 'info', duration = 3000) {
    const id = Math.random().toString(36).substring(2);
    toasts.update((all) => [...all, { id, message, type, duration }]);

    if (duration > 0) {
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }
}

export function removeToast(id) {
    toasts.update((all) => all.filter((t) => t.id !== id));
}

// --- CONFIRM DIALOG ---
export const confirmModal = writable({
    isOpen: false,
    title: '',
    message: '',
    resolve: null,
    reject: null
});

/**
 * Abre um modal de confirmação e retorna uma Promise.
 * @param {string} title Título do modal.
 * @param {string} message Mensagem ou pergunta.
 * @returns {Promise<boolean>} Resolve true se confirmado, false se cancelado.
 */
export function confirmAction(title, message) {
    return new Promise((resolve) => {
        confirmModal.set({
            isOpen: true,
            title,
            message,
            resolve: (val) => {
                confirmModal.set({ isOpen: false, title: '', message: '', resolve: null, reject: null });
                resolve(val);
            },
            reject: () => { // Caso precise lidar com rejeição explícita, mas aqui usaremos resolve(false)
                confirmModal.set({ isOpen: false, title: '', message: '', resolve: null, reject: null });
                resolve(false);
            }
        });
    });
}
