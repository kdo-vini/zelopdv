import { supabase } from '../supabaseClient';
import { commitOperation, getDeviceId, listOperations, readSnapshot, saveSnapshot, prepareStorage, migrateLegacyOperations } from './operations.js';
import { buscarProdutosLocal } from '../offlineDb.js';
import { isNetworkError } from '../netStatus.js';
import { createSyncCoordinator } from './synchronizer.js';
import { setOfflineStatus } from '../stores/offlineStatus.js';

let context = null;
let coordinator = null;
let interval = null;
let generation = 0;
let starting = null;
let startingKey = null;
let refreshConnection = null;
let lastProbe = 0;
let probing = false;
const GRACE = 7 * 86400000;
const listeners = new Set();
export const getOfflineContext = () => context;
export function onOfflineChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { for (const listener of listeners) { try { listener(); } catch { /* UI cannot break a committed operation */ } } }

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!context || data?.session?.user?.id !== context.userId) throw Object.assign(new Error('Entre novamente para sincronizar.'), { status: 401, localAuth: true });
  return data.session.access_token;
}

export async function offlineRequest(path, options = {}) {
  const controller = new AbortController();
  const revision = generation;
  let timeout;
  try {
    const request = async () => {
    const token = await accessToken();
    if (revision !== generation || controller.signal.aborted) throw new Error('Conta alterada durante a conexão.');
    const response = await fetch(path, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
    const body = await response.json().catch(() => null);
    if (revision === generation) setOfflineStatus({ connection: response.status >= 500 ? 'degraded' : 'online' });
    if (!response.ok) throw Object.assign(new Error(String(body?.error || body?.message || `Não foi possível concluir a solicitação (${response.status}).`).slice(0, 500)), { status: response.status, code: body?.code });
    return body;
    };
    return await Promise.race([request(), new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('Tempo de conexão esgotado. Os registros locais continuam preservados.')); }, 10000); })]);
  } catch (error) {
    if (revision === generation && !error.status) setOfflineStatus({ connection: globalThis.navigator?.onLine === false ? 'offline' : 'degraded' });
    throw error;
  } finally { clearTimeout(timeout); }
}

export function stopOfflineRuntime() {
  generation++;
  coordinator?.stop(); coordinator = null;
  clearInterval(interval); interval = null;
  context = null; starting = null; startingKey = null;
  refreshConnection = null; lastProbe = 0; probing = false;
  setOfflineStatus({ pendingCount: 0, reviewCount: 0, syncing: false, committing: false, prepared: false, storageError: null });
}

export async function refreshOfflineCounts() {
  const current = context;
  if (!current) return;
  const rows = await listOperations(current.ownerUserId);
  if (current !== context) return;
  const catalog = await buscarProdutosLocal('', current.ownerUserId).catch(() => []);
  const readiness = await readSnapshot(current.ownerUserId, `readiness:${current.userId}`);
  if (current !== context) return;
  const ready = !!(current.enabled && current.storage?.writable && catalog.length && readiness?.catalog && readiness?.cash && Date.now() - readiness.completedAt <= GRACE && globalThis.navigator?.serviceWorker?.controller);
  setOfflineStatus({ pendingCount: rows.filter(r => r.status !== 'acked').length, reviewCount: rows.filter(r => ['needs_review', 'needs_auth'].includes(r.status)).length, prepared: ready });
  notify();
}

function activateCoordinator() {
  if ((!context?.enabled && !context?.registered) || context?.revoked || coordinator) return;
  const revision = generation;
  coordinator = createSyncCoordinator({ ownerUserId: context.ownerUserId, getAccessToken: accessToken,
    onConnection: connection => { if (revision === generation) setOfflineStatus({ connection }); },
    refreshAuth: async () => { const { data, error } = await supabase.auth.refreshSession(); return !error && data?.session?.user?.id === context?.userId; },
    onChange: () => { void refreshOfflineCounts().catch(() => {}); },
  });
  interval = setInterval(() => {
    void runOfflineSync().catch(() => {});
    // Also confirm recovery when the queue is empty; navigator.onLine is only a hint.
    if (!probing && refreshConnection && globalThis.navigator?.onLine !== false && Date.now() - lastProbe >= 30000) {
      probing = true; lastProbe = Date.now();
      void refreshConnection().finally(() => { if (revision === generation) probing = false; });
    }
  }, 2000);
  interval?.unref?.();
}

export function startOfflineRuntime(authCtx) {
  if (!authCtx?.ownerUserId || !authCtx?.userId) return Promise.resolve(null);
  const key = `${authCtx.ownerUserId}:${authCtx.userId}`;
  if (starting && startingKey === key) return starting;
  if (context?.ownerUserId === authCtx.ownerUserId && context?.userId === authCtx.userId) return starting || Promise.resolve(context);
  stopOfflineRuntime();
  startingKey = key;
  const revision = generation;
  starting = (async () => {
    const deviceId = await getDeviceId();
    const cached = await readSnapshot(authCtx.ownerUserId, `bootstrap:${authCtx.userId}`);
    if (revision !== generation) return null;
    const valid = cached?.ownerUserId === authCtx.ownerUserId && cached?.userId === authCtx.userId && Date.now() - cached.validatedAt >= 0 && Date.now() - cached.validatedAt <= GRACE;
    context = { ...authCtx, deviceId, enabled: false, ...(valid ? cached : {}), deviceId };
    activateCoordinator();
    if (context.enabled) await migrateLegacyOperations(context.ownerUserId);
    await refreshOfflineCounts();
    // A validated local context renders immediately; remote preparation is refreshed in background.
    const refresh = async () => {
      if (globalThis.navigator?.onLine === false) return;
      try {
        const result = await offlineRequest(`/api/offline/bootstrap?deviceId=${encodeURIComponent(deviceId)}`);
        if (revision !== generation) return;
        context = { ...context, ...authCtx, ...result, deviceId, revoked: false, validatedAt: Date.now() };
        await saveSnapshot(authCtx.ownerUserId, `bootstrap:${authCtx.userId}`, context);
        activateCoordinator();
        if (!context.enabled && !context.registered) { coordinator?.stop(); coordinator = null; clearInterval(interval); interval = null; }
        if (context.enabled) await migrateLegacyOperations(context.ownerUserId);
        await refreshOfflineCounts();
        notify();
      } catch (error) {
        if (revision !== generation) return;
        // Confirmed revocation is authoritative; transport failure preserves the validated context.
        if (error.status === 403 && !error.localAuth) {
          context.enabled = false;
          context.revoked = true;
          coordinator?.stop(); coordinator = null;
          await saveSnapshot(authCtx.ownerUserId, `bootstrap:${authCtx.userId}`, context);
        }
      }
    };
    refreshConnection = refresh;
    lastProbe = Date.now();
    if (valid) void refresh(); else await refresh();
    if (revision !== generation) return null;
    await refreshOfflineCounts();
    return context;
  })().finally(() => { if (revision === generation) starting = null; });
  return starting;
}

export async function prepareOfflineDevice({ primary = false } = {}) {
  if (!context) throw new Error('Entre na loja para preparar este aparelho.');
  const captured = context;
  const storage = await prepareStorage();
  const result = await offlineRequest('/api/offline/bootstrap', { method: 'POST', body: JSON.stringify({ deviceId: captured.deviceId, action: primary ? 'set_primary' : 'register' }) });
  if (context !== captured) throw new Error('Conta alterada durante a preparação.');
  context = { ...captured, ...result, validatedAt: Date.now(), storage };
  await saveSnapshot(context.ownerUserId, `bootstrap:${context.userId}`, context);
  activateCoordinator();
  if (context.enabled) await migrateLegacyOperations(context.ownerUserId);
  const revision = generation;
  const { prepareOperationalData } = await import('./preparation.js');
  let timer;
  let expired = false;
  try {
    await Promise.race([
      prepareOperationalData(supabase, context, () => { if (revision !== generation || expired) throw new Error('Preparação interrompida. Tente novamente com conexão.'); }),
      new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('A preparação demorou demais. Verifique a conexão e tente novamente.')); }, 20000); })
    ]);
  } finally { clearTimeout(timer); }
  setOfflineStatus({ storageError: null });
  await refreshOfflineCounts();
  notify();
  return context;
}

export async function runOfflineSync() {
  if (!coordinator || globalThis.navigator?.onLine === false) return;
  const captured = coordinator;
  const rows = await listOperations(context.ownerUserId);
  if (captured !== coordinator || !rows.some(row => ['pending', 'inflight'].includes(row.status) && row.nextAttemptAt <= Date.now())) return;
  setOfflineStatus({ syncing: true });
  try { await captured.syncNow(); }
  catch { /* Durable coordinator owns retry/error classification. */ }
  finally { if (captured === coordinator) { setOfflineStatus({ syncing: false }); await refreshOfflineCounts().catch(() => {}); } }
}

export async function submitOfflineOperation(type, entityId, payload, options = {}) {
  const captured = context;
  if (!captured?.enabled || Date.now() - captured.validatedAt > GRACE) throw new Error('Prepare este aparelho com internet antes de operar offline.');
  if (type.startsWith('caixa.') && !captured.isPrimaryDevice) throw new Error('Use o aparelho principal para abrir, movimentar ou encerrar o caixa.');
  if (captured.isSubUser) {
    const permissions = captured.permissions || {};
    const required = {
      'sale.create': ['pdv.vender', 'pdv.receber'], 'caixa.open': ['caixa.abrir'], 'caixa.move': ['caixa.movimentar'], 'caixa.close': ['caixa.fechar'],
      'mesa.open': ['mesas.acessar', 'mesas.abrir_comanda'], 'mesa.close': ['mesas.acessar', 'mesas.fechar'],
      'mesa.cancel': ['mesas.acessar', 'mesas.cancelar'], 'mesa.transfer': ['mesas.acessar', 'mesas.editar_itens'],
      'mesa.item.add': ['mesas.acessar', 'mesas.editar_itens'], 'mesa.item.delta': ['mesas.acessar', 'mesas.editar_itens'],
      'mesa.update': ['mesas.acessar', 'mesas.editar_itens'], 'mesa.payment.add': ['mesas.acessar'], 'mesa.payment.remove': ['mesas.acessar'],
    }[type];
    if (!required || required.some(cap => !permissions[cap]) || ((type.startsWith('mesa.payment.') || type === 'mesa.close') && !permissions['pdv.receber'] && !permissions['pedidos.receber']) || (type === 'sale.create' && Number(payload.valor_desconto) > 0 && !permissions['pdv.desconto'])) {
      throw new Error('Seu cargo não tem permissão para esta operação.');
    }
  }
  setOfflineStatus({ committing: true, storageError: null });
  try {
    const operation = await commitOperation({ ...options, ownerUserId: captured.ownerUserId, operatorId: captured.userId, deviceId: captured.deviceId, type, entityId: String(entityId), payload });
    await refreshOfflineCounts().catch(() => {});
    // Never await remote work on the payment path.
    return operation;
  } catch (error) {
    setOfflineStatus({ storageError: 'Não foi possível salvar neste aparelho. Esta operação ainda não foi registrada.' });
    throw error;
  } finally { setOfflineStatus({ committing: false }); }
}

/** Cache-first reads for an already prepared tenant; no HTTP cache of private data. */
export async function readOperationalSnapshot(key, loader, { refresh = false } = {}) {
  const captured = context;
  if (!captured) return loader();
  const cached = await readSnapshot(captured.ownerUserId, key);
  if (cached !== null && !refresh) return cached;
  try {
    const value = await loader();
    if (captured !== context) throw new Error('Conta alterada durante o carregamento.');
    await saveSnapshot(captured.ownerUserId, key, value);
    return value;
  } catch (error) {
    if (captured !== context) throw new Error('Conta alterada durante o carregamento.');
    if (cached !== null && ![401, 403].includes(error.status) && isNetworkError(error)) return cached;
    throw error;
  }
}
