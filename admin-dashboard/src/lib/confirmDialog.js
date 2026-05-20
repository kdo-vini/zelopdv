// Replaces window.confirm()/prompt() which browsers can suppress after
// repeated dialogs. Single global instance is mounted in the root layout.
import { writable } from 'svelte/store'

export const dialogState = writable(null)

let pending = null

export function confirmDialog({
    title = 'Confirmar ação',
    message = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    confirmStyle = 'primary', // 'primary' | 'danger' | 'warning'
    requireType = null,       // require user to type this exact string
    requireTypeHint = null,
} = {}) {
    return new Promise((resolve) => {
        pending?.resolve(false)
        pending = { resolve }
        dialogState.set({
            mode: 'confirm',
            title,
            message,
            confirmLabel,
            cancelLabel,
            confirmStyle,
            requireType,
            requireTypeHint,
        })
    })
}

export function promptDialog({
    title = 'Informe um valor',
    message = '',
    defaultValue = '',
    placeholder = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancelar',
    multiline = false,
    required = false,
} = {}) {
    return new Promise((resolve) => {
        pending?.resolve(null)
        pending = { resolve }
        dialogState.set({
            mode: 'prompt',
            title,
            message,
            defaultValue,
            placeholder,
            confirmLabel,
            cancelLabel,
            multiline,
            required,
        })
    })
}

export function _resolveDialog(value) {
    const p = pending
    pending = null
    dialogState.set(null)
    p?.resolve(value)
}
