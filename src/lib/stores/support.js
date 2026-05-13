import { writable } from 'svelte/store';

export const isSupportOpen = writable(false);
export const supportMessages = writable([]);

export function toggleSupport() {
  isSupportOpen.update(v => !v);
}

export function openSupport() {
  isSupportOpen.set(true);
}

export function closeSupport() {
  isSupportOpen.set(false);
}
