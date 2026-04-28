// src/lib/printer.js
// Driver de impressora térmica via WebUSB (Chrome/Edge desktop).
// Substitui o QZ Tray — sem instalação, sem servidor de assinatura.
// Cai num fallback de impressão via iframe (HTML + window.print) quando:
//   - navegador não suporta WebUSB (Firefox/Safari/iOS)
//   - usuário ainda não pareou nenhuma impressora
//   - a impressora paread não está conectada / claim falhou

import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'zelo_printer_v1';

/** @type {USBDevice|null} */
let cachedDevice = null;
/** @type {number|null} */
let cachedEndpoint = null;
/** @type {number|null} */
let cachedInterface = null;
let pairingInFlight = false;

/** Store reativo: { paired, name, vendorId, productId } | null */
export const printerStatus = writable(readStored());

/**
 * @returns {{ vendorId:number, productId:number, name:string }|null}
 */
function readStored() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeStored(info) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(info)); } catch {}
  printerStatus.set(info);
}

function clearStoredInfo() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  printerStatus.set(null);
}

/** WebUSB existe (Chrome / Edge / Opera desktop). */
export function isWebUsbSupported() {
  return typeof navigator !== 'undefined' && !!navigator.usb;
}

/** Snapshot síncrono do par armazenado. */
export function getPairedInfo() {
  return get(printerStatus);
}

/**
 * Lista filtros agressivos cobrindo VendorIDs comuns de impressoras térmicas
 * brasileiras + classe USB de impressora (0x07).
 */
const USB_FILTERS = [
  { classCode: 0x07 },          // USB Printer class (cobre 95% dos casos)
  { vendorId: 0x04b8 },         // Epson
  { vendorId: 0x0519 },         // Star Micronics
  { vendorId: 0x1504 },         // Bixolon
  { vendorId: 0x1fc9 },         // NXP / Elgin / clones
  { vendorId: 0x0fe6 },         // ICS Advent / clones chineses (Knup, Daruma OEM)
  { vendorId: 0x0416 },         // Winbond / Tanca clones
  { vendorId: 0x0483 },         // STMicro / clones
  { vendorId: 0x28e9 },         // Sunmi / GD32
  { vendorId: 0x154f },         // Daruma
  { vendorId: 0x0dd4 },         // Custom / Bematech
  { vendorId: 0x067b },         // Prolific (alguns adaptadores)
];

/**
 * Solicita ao usuário escolher uma impressora USB.
 * Após pareada, salva no localStorage para auto-reconexão silenciosa.
 *
 * @returns {Promise<{ vendorId:number, productId:number, name:string }>}
 */
export async function pairPrinter() {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB não está disponível neste navegador. Use Chrome ou Edge no desktop.');
  }
  if (pairingInFlight) {
    throw new Error('Já existe um pareamento em andamento.');
  }
  pairingInFlight = true;
  try {
    const device = await navigator.usb.requestDevice({ filters: USB_FILTERS });
    if (!device) throw new Error('Nenhuma impressora foi selecionada.');
    await openDevice(device);
    cachedDevice = device;
    const info = {
      vendorId: device.vendorId,
      productId: device.productId,
      name: device.productName || device.manufacturerName || `USB ${hex4(device.vendorId)}:${hex4(device.productId)}`,
    };
    writeStored(info);
    return info;
  } finally {
    pairingInFlight = false;
  }
}

/**
 * Esquece a impressora pareada (não revoga o consentimento USB do navegador,
 * apenas limpa nossa preferência local — usuário pode parear de novo a qualquer momento).
 */
export async function unpairPrinter() {
  try {
    if (cachedDevice && cachedInterface != null) {
      try { await cachedDevice.releaseInterface(cachedInterface); } catch {}
    }
    if (cachedDevice && cachedDevice.opened) {
      try { await cachedDevice.close(); } catch {}
    }
    if (cachedDevice && typeof cachedDevice.forget === 'function') {
      try { await cachedDevice.forget(); } catch {}
    }
  } finally {
    cachedDevice = null;
    cachedInterface = null;
    cachedEndpoint = null;
    clearStoredInfo();
  }
}

/**
 * Procura entre os devices já autorizados pelo usuário (sem prompt).
 */
async function findPairedDevice() {
  if (!isWebUsbSupported()) return null;
  const stored = readStored();
  if (!stored) return null;
  try {
    const devices = await navigator.usb.getDevices();
    return devices.find(d => d.vendorId === stored.vendorId && d.productId === stored.productId) || null;
  } catch { return null; }
}

/**
 * Abre o device, seleciona configuração e claima a interface de impressão.
 * Detecta endpoint OUT (bulk) e guarda em cache.
 *
 * @param {USBDevice} device
 */
async function openDevice(device) {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  /** @type {{interfaceNumber:number, endpointNumber:number}|null} */
  let chosen = null;

  // 1ª tentativa: interface de classe Printer (0x07) com endpoint OUT
  outer: for (const conf of device.configurations) {
    for (const iface of conf.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== 0x07) continue;
        const out = alt.endpoints.find(e => e.direction === 'out');
        if (out) { chosen = { interfaceNumber: iface.interfaceNumber, endpointNumber: out.endpointNumber }; break outer; }
      }
    }
  }
  // 2ª tentativa: qualquer interface vendor-specific com endpoint OUT bulk
  if (!chosen) {
    outer2: for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        const out = alt.endpoints.find(e => e.direction === 'out' && (e.type === 'bulk' || !e.type));
        if (out) { chosen = { interfaceNumber: iface.interfaceNumber, endpointNumber: out.endpointNumber }; break outer2; }
      }
    }
  }
  if (!chosen) throw new Error('Não encontrei endpoint de saída na impressora. Modelo pode não ser compatível.');

  try {
    await device.claimInterface(chosen.interfaceNumber);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/already.*claimed|busy|access denied/i.test(msg)) {
      throw new Error('Impressora ocupada — feche outro programa que esteja usando ela (ou desinstale o driver de impressora do Windows) e pareie de novo.');
    }
    throw new Error('Falha ao acessar a impressora: ' + msg);
  }
  cachedInterface = chosen.interfaceNumber;
  cachedEndpoint = chosen.endpointNumber;
}

/**
 * Garante device aberto e endpoint cacheado. Retorna null se não houver impressora pareada
 * ou se ela não estiver mais conectada.
 */
async function ensureOpen() {
  if (cachedDevice && cachedDevice.opened && cachedEndpoint != null) return cachedDevice;
  const dev = cachedDevice || await findPairedDevice();
  if (!dev) return null;
  try {
    await openDevice(dev);
    cachedDevice = dev;
    return dev;
  } catch (e) {
    console.warn('[printer] openDevice falhou:', e?.message || e);
    cachedDevice = null;
    cachedInterface = null;
    cachedEndpoint = null;
    return null;
  }
}

/**
 * @returns {Promise<boolean>} true se há uma impressora pareada conectada e pronta.
 */
export async function isPrinterReady() {
  if (!isWebUsbSupported()) return false;
  const dev = await findPairedDevice();
  return !!dev;
}

/** Fila serializada — evita interleaving de bytes em impressões simultâneas. */
let queue = Promise.resolve();

/**
 * Envia bytes ESC/POS para a impressora pareada. Lança erro se não estiver pronta.
 * @param {Uint8Array} bytes
 */
export function sendBytes(bytes) {
  const next = queue.then(async () => {
    const dev = await ensureOpen();
    if (!dev) throw new Error('Impressora térmica não está conectada.');
    const CHUNK = 64;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.slice(i, i + CHUNK);
      await dev.transferOut(cachedEndpoint, slice);
    }
  });
  // Mantém a fila viva mesmo se um envio falhar.
  queue = next.catch(() => {});
  return next;
}

function hex4(n) { return Number(n).toString(16).padStart(4, '0'); }

/* --------------------------------------------------------------------------
 * Auto-reconexão silenciosa: sempre que o usuário pluga/desplug a impressora,
 * o navegador dispara connect/disconnect. Atualizamos o cache.
 * -------------------------------------------------------------------------- */
if (typeof navigator !== 'undefined' && navigator.usb && typeof navigator.usb.addEventListener === 'function') {
  navigator.usb.addEventListener('disconnect', (ev) => {
    if (cachedDevice && ev.device === cachedDevice) {
      cachedDevice = null;
      cachedInterface = null;
      cachedEndpoint = null;
    }
  });
  navigator.usb.addEventListener('connect', (ev) => {
    const stored = readStored();
    if (stored && ev.device.vendorId === stored.vendorId && ev.device.productId === stored.productId) {
      cachedDevice = ev.device;
    }
  });
}
