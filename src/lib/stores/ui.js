import { writable } from 'svelte/store';
import { toast } from 'svelte-sonner';

// --- TOASTS — wrapper sobre svelte-sonner, mantém API legada ---
export function addToast(message, type = 'info', duration = 3000) {
    const options = duration > 0 ? { duration } : { duration: Infinity };
    switch (type) {
        case 'success': toast.success(message, options); break;
        case 'error':   toast.error(message, options);   break;
        case 'warning': toast.warning(message, options); break;
        default:        toast(message, options);
    }
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
            reject: () => {
                confirmModal.set({ isOpen: false, title: '', message: '', resolve: null, reject: null });
                resolve(false);
            }
        });
    });
}
