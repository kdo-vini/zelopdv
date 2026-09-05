import { writable } from 'svelte/store';

export const offlineStatus = writable({
  connection: 'online', pendingCount: 0, reviewCount: 0,
  syncing: false, committing: false, storageError: null, prepared: false,
});
export function setOfflineStatus(patch) {
  offlineStatus.update((state) => ({ ...state, ...patch }));
}
export function blocksOfflineUpdate(state) {
  return !!(state.committing || state.syncing || state.pendingCount || state.reviewCount || state.storageError || state.connection !== 'online');
}
export function offlineStatusLabel(state) {
  if (state.storageError) return 'Não foi possível salvar neste aparelho. A operação ainda não foi registrada.';
  if (state.reviewCount) return `${state.reviewCount} lançamento(s) precisam de conferência`;
  if (state.syncing) return 'Sincronizando lançamentos…';
  if (state.pendingCount) return `${state.pendingCount} lançamento(s) salvos neste aparelho · aguardando sincronização`;
  if (state.connection === 'offline') return state.prepared ? 'Sem conexão · salvamento neste aparelho disponível' : 'Sem conexão · verificando preparação deste aparelho';
  if (state.connection === 'degraded') return 'Conexão com o sistema instável';
  return 'Tudo sincronizado';
}

/** At most one loss notification per episode, and two minutes between episodes. */
export function createConnectionNotice() {
  let previous = 'online';
  let lastNotice = -Infinity;
  return (connection, now = Date.now()) => {
    const lost = connection === 'offline' || connection === 'degraded';
    const wasLost = previous === 'offline' || previous === 'degraded';
    previous = connection;
    if (!lost || wasLost || now - lastNotice < 120000) return false;
    lastNotice = now;
    return true;
  };
}
