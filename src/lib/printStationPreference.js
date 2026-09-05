import { writable } from 'svelte/store';

const STATION_ID_KEY = 'zelopdv_print_station_id_v1';
const STATION_ENABLED_KEY = 'zelopdv_print_station_enabled_v1';
let activeOwnerId = '';

function storage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

function createUuid() {
  return globalThis.crypto?.randomUUID?.()
    || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}

function scopedKey(key) {
  return activeOwnerId ? `${key}:${activeOwnerId}` : '';
}

export function setPrintStationOwner(ownerId) {
  activeOwnerId = String(ownerId || '');
  printStationEnabled.set(isPrintStationEnabled());
}

export function getPrintStationId() {
  const target = storage();
  const key = scopedKey(STATION_ID_KEY);
  if (!key) throw new Error('Titular da estação de impressão não definido.');
  const existing = target?.getItem(key);
  if (existing) return existing;
  const id = createUuid();
  try { target?.setItem(key, id); } catch {}
  return id;
}

export function isPrintStationEnabled() {
  const key = scopedKey(STATION_ENABLED_KEY);
  return key ? storage()?.getItem(key) === 'true' : false;
}

export const printStationEnabled = writable(false, (set) => {
  set(isPrintStationEnabled());
});

export function setPrintStationEnabled(enabled) {
  const key = scopedKey(STATION_ENABLED_KEY);
  if (!key) return false;
  const next = enabled === true;
  try { storage()?.setItem(key, String(next)); } catch {}
  printStationEnabled.set(next);
  return next;
}

export { STATION_ENABLED_KEY, STATION_ID_KEY };
