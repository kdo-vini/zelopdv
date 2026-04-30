// src/lib/printer.js
// Driver de impressora térmica via WebUSB (Chrome/Edge desktop).
// Substitui o QZ Tray — sem instalação, sem servidor de assinatura.
//
// Modelo "lease per job": só abrimos + claimamos a interface durante a
// impressão, liberando logo depois. Isso permite coexistir com outros apps
// no mesmo computador (ex: Zelo Chat) que também usam WebUSB — apenas um
// processo por vez consegue claimar o device no Windows.
//
// Cai num fallback de impressão via iframe (HTML + window.print) quando:
//   - navegador não suporta WebUSB (Firefox/Safari/iOS)
//   - usuário ainda não pareou nenhuma impressora
//   - claim falhou mesmo após os retries curtos

import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'zelo_printer_v1';

let pairingInFlight = false;

/** Store reativo: { name, vendorId, productId } | null */
export const printerStatus = writable(readStored());

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function hex4(n) { return Number(n).toString(16).padStart(4, '0'); }

const BUSY_RX = /already.*claimed|busy|in use/i;
const ACCESS_BLOCKED_RX = /access denied|blocked|insufficient permissions|protected/i;

/**
 * Detecta interface + endpoint OUT a partir dos descritores USB.
 * @param {USBDevice} device
 */
function detectInterface(device) {
  const configurations = Array.from(device.configurations || []);

  // 1ª tentativa: interface de classe Printer (0x07) com endpoint OUT
  for (const conf of configurations) {
    for (const iface of conf.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== 0x07) continue;
        const out = alt.endpoints.find(e => e.direction === 'out');
        if (out) {
          return {
            configurationValue: conf.configurationValue,
            interfaceNumber: iface.interfaceNumber,
            endpointNumber: out.endpointNumber,
          };
        }
      }
    }
  }
  // 2ª tentativa: qualquer interface vendor-specific com endpoint OUT bulk
  for (const conf of configurations) {
    for (const iface of conf.interfaces) {
      for (const alt of iface.alternates) {
        const out = alt.endpoints.find(e => e.direction === 'out' && (e.type === 'bulk' || !e.type));
        if (out) {
          return {
            configurationValue: conf.configurationValue,
            interfaceNumber: iface.interfaceNumber,
            endpointNumber: out.endpointNumber,
          };
        }
      }
    }
  }
  throw new Error('Não encontrei endpoint de saída na impressora. Modelo pode não ser compatível.');
}

function isAccessBlockedError(error) {
  return ACCESS_BLOCKED_RX.test(String(error?.message || error));
}

function isBusyError(error) {
  return BUSY_RX.test(String(error?.message || error));
}

function formatAccessBlockedMessage() {
  return (
    'O navegador encontrou a impressora, mas o Windows bloqueou o acesso USB direto. ' +
    'Isso pode acontecer quando o driver/spooler do Windows, outro aplicativo de impressão, ' +
    'ou uma permissão antiga do navegador ficou segurando a porta. Desconecte e conecte o cabo USB, ' +
    'feche outros apps de impressão e tente novamente. Se continuar, remova a permissão USB do site no Chrome/Edge e pareie de novo.'
  );
}

function formatBusyMessage() {
  return (
    'A impressora está ocupada por outro processo neste momento. ' +
    'Aguarde alguns segundos, feche outros apps que imprimem nessa mesma impressora e tente novamente.'
  );
}

/**
 * Pareia a impressora com o navegador e salva SOMENTE os metadados.
 * Não abrimos nem claimamos a interface aqui: no Windows isso pode falhar por
 * driver/permissão mesmo quando a impressora não está ocupada. O claim acontece
 * sob demanda em cada chamada de sendBytes().
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
    let device;
    try {
      device = await navigator.usb.requestDevice({ filters: USB_FILTERS });
    } catch (e) {
      if (e?.name === 'NotFoundError') {
        throw new Error('Nenhuma impressora foi selecionada.');
      }
      throw new Error('Falha ao abrir o seletor USB: ' + (e?.message || e));
    }
    if (!device) throw new Error('Nenhuma impressora foi selecionada.');
    detectInterface(device);

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
 * Esquece a impressora pareada — limpa metadados locais e revoga o consentimento
 * USB do navegador via device.forget() (se disponível).
 */
export async function unpairPrinter() {
  const stored = readStored();
  if (stored && isWebUsbSupported()) {
    try {
      const devices = await navigator.usb.getDevices();
      const dev = devices.find(d => d.vendorId === stored.vendorId && d.productId === stored.productId);
      if (dev) {
        try { if (dev.opened) await dev.close(); } catch {}
        if (typeof dev.forget === 'function') {
          try { await dev.forget(); } catch {}
        }
      }
    } catch {}
  }
  clearStoredInfo();
}

/**
 * Procura entre os devices já autorizados pelo usuário (sem prompt).
 * @returns {Promise<USBDevice|null>}
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
 * Abre o device, seleciona configuração, detecta interface e claima.
 * Tenta até 4× (1 inicial + 3 retries com 200/500/1000ms) se outro app estiver usando.
 *
 * @returns {Promise<{ device: USBDevice, interfaceNumber: number, endpointNumber: number }>}
 */
async function acquireForJob() {
  const dev = await findPairedDevice();
  if (!dev) throw new Error('Impressora térmica não está conectada.');

  const delays = [200, 500, 1000];
  let lastErr = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const { configurationValue, interfaceNumber, endpointNumber } = detectInterface(dev);
      if (!dev.opened) await dev.open();
      if (dev.configuration?.configurationValue !== configurationValue) {
        await dev.selectConfiguration(configurationValue);
      }
      await dev.claimInterface(interfaceNumber);
      return { device: dev, interfaceNumber, endpointNumber };
    } catch (e) {
      lastErr = e;
      const isBusy = isBusyError(e);
      // Fecha antes do próximo retry (ou antes de surfacing do erro)
      try { if (dev.opened) await dev.close(); } catch {}
      if (!isBusy || attempt === delays.length) break;
      await sleep(delays[attempt]);
    }
  }

  if (isBusyError(lastErr)) {
    throw new Error(formatBusyMessage());
  }
  if (isAccessBlockedError(lastErr)) {
    throw new Error(formatAccessBlockedMessage());
  }
  const msg = String(lastErr?.message || lastErr);
  throw new Error('Falha ao acessar a impressora: ' + msg);
}

/**
 * Libera interface e fecha o device. Chamado em finally após cada job.
 */
async function releaseAfterJob(device, interfaceNumber) {
  try { await device.releaseInterface(interfaceNumber); } catch {}
  try { if (device.opened) await device.close(); } catch {}
}

/**
 * @returns {Promise<boolean>} true se há uma impressora pareada conectada (sem testar abertura).
 */
export async function isPrinterReady() {
  if (!isWebUsbSupported()) return false;
  const dev = await findPairedDevice();
  return !!dev;
}

/** Fila serializada — evita interleaving de bytes em impressões simultâneas. */
let queue = Promise.resolve();

/**
 * Envia bytes ESC/POS para a impressora pareada. Cada chamada:
 *   1. acquire (open + claim) com retry curto se outro app estiver usando
 *   2. transferOut em chunks de 64 bytes
 *   3. release (release + close) — sempre, mesmo em caso de erro
 *
 * @param {Uint8Array} bytes
 */
export function sendBytes(bytes) {
  const next = queue.then(async () => {
    const lease = await acquireForJob();
    try {
      const CHUNK = 64;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.slice(i, i + CHUNK);
        await lease.device.transferOut(lease.endpointNumber, slice);
      }
    } finally {
      await releaseAfterJob(lease.device, lease.interfaceNumber);
    }
  });
  queue = next.catch(() => {});
  return next;
}
