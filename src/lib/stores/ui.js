import { get, writable } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { zeloSurface } from '../theme/surface.js';

// --- TOASTS ---
// Legado: wrapper sobre svelte-sonner (API mantida). Superfícies Zelo (app/brand):
// fila própria renderizada por `zelo/ZeloToaster.svelte` (docs/DESIGN_SYSTEM.md → Toast).

/** Toasts visíveis nas superfícies Zelo: { id, tone, title, detail, duration }. */
export const zeloToasts = writable([]);
const ZELO_TOAST_LIMIT = 3;
let zeloToastSeq = 0;

/**
 * Separa "Título. Detalhe…" em título curto + detalhe, como no toast da marca
 * ("Caixa fechado" / "R$ 2.418,00 · 34 vendas"). Só separa quando a primeira
 * frase é curta; decimais ("1.500") não contam porque exigem espaço após o ponto.
 * @param {unknown} message
 * @returns {{ title: string, detail: string }}
 */
export function splitToastMessage(message) {
    const text = String(message ?? '').trim();
    const match = text.match(/^([^\n]{3,60}?[.!?])\s+(\S[\s\S]*)$/);
    if (!match) return { title: text, detail: '' };
    return { title: match[1].replace(/\.$/, ''), detail: match[2].trim() };
}

/** @param {string} message @param {string} type @param {number} duration @param {{ detail?: string }} [options] */
function pushZeloToast(message, type, duration, options = {}) {
    const tone = ['success', 'error', 'warning'].includes(type) ? type : 'info';
    const parts = options.detail
        ? { title: String(message ?? ''), detail: String(options.detail) }
        : splitToastMessage(message);
    const id = ++zeloToastSeq;
    zeloToasts.update((list) => {
        // Mesma mensagem repetida reinicia o tempo em vez de empilhar.
        const rest = list.filter((t) => !(t.tone === tone && t.title === parts.title && t.detail === parts.detail));
        return [...rest, { id, tone, ...parts, duration: duration > 0 ? duration : 0 }].slice(-ZELO_TOAST_LIMIT);
    });
    return id;
}

export function dismissZeloToast(id) {
    zeloToasts.update((list) => list.filter((t) => t.id !== id));
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type]
 * @param {number} [duration] ms; 0 ou negativo = até fechar
 * @param {{ detail?: string }} [options] detalhe opcional (só nas superfícies Zelo)
 */
export function addToast(message, type = 'info', duration = 3000, options = {}) {
    if (get(zeloSurface)) {
        pushZeloToast(message, type, duration, options);
        return;
    }
    const sonnerOptions = duration > 0 ? { duration } : { duration: Infinity };
    switch (type) {
        case 'success': toast.success(message, sonnerOptions); break;
        case 'error':   toast.error(message, sonnerOptions);   break;
        case 'warning': toast.warning(message, sonnerOptions); break;
        default:        toast(message, sonnerOptions);
    }
}

// --- CONFIRM DIALOG ---
const CLOSED_CONFIRM = { isOpen: false, title: '', message: '', confirmLabel: '', cancelLabel: '', destructive: false, resolve: null, reject: null };
export const confirmModal = writable({ ...CLOSED_CONFIRM });

/**
 * Abre um modal de confirmação e retorna uma Promise.
 * @param {string} title Título do modal.
 * @param {string} message Mensagem ou pergunta.
 * @param {{ confirmLabel?: string, cancelLabel?: string, destructive?: boolean }} [options]
 *   Rótulos opcionais; `destructive` pinta a confirmação como perigo nas superfícies Zelo.
 * @returns {Promise<boolean>} Resolve true se confirmado, false se cancelado.
 */
export function confirmAction(title, message, options = {}) {
    return new Promise((resolve) => {
        confirmModal.set({
            isOpen: true,
            title,
            message,
            confirmLabel: options.confirmLabel || '',
            cancelLabel: options.cancelLabel || '',
            destructive: !!options.destructive,
            resolve: (val) => {
                confirmModal.set({ ...CLOSED_CONFIRM });
                resolve(val);
            },
            reject: () => {
                confirmModal.set({ ...CLOSED_CONFIRM });
                resolve(false);
            }
        });
    });
}
