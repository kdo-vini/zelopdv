import { writable } from 'svelte/store';

export const isOpen = writable(false);
export const messages = writable([]);
export const contextType = writable('geral');
export const signalContext = writable(null);

export function toggleAssistant() {
  isOpen.update(v => !v);
}

export function openAssistant() {
  isOpen.set(true);
}

export function closeAssistant() {
  isOpen.set(false);
}

export function openAssistantWithSignal(signal) {
  if (!signal?.id) return false;
  signalContext.set(signal);
  isOpen.set(true);
  return true;
}

export function clearSignalContext() {
  signalContext.set(null);
}
