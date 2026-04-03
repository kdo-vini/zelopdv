import { writable } from 'svelte/store';

export const isOpen = writable(false);
export const messages = writable([]);
export const contextType = writable('geral');

export function toggleAssistant() {
  isOpen.update(v => !v);
}

export function openAssistant() {
  isOpen.set(true);
}

export function closeAssistant() {
  isOpen.set(false);
}
