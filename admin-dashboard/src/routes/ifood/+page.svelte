<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient.js';

  let loading = true;
  let error = '';
  let connections = [];
  let selectedId = null;
  let replayable = [];
  let actionBusy = false;
  let actionMessage = '';

  $: selected = connections.find((c) => c.connectionId === selectedId) || null;

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sessão expirada');
    return {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
  }

  async function loadConnections() {
    loading = true;
    error = '';
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/ifood/connections', { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar conexões');
      connections = Array.isArray(body.connections) ? body.connections : [];
      if (selectedId && !connections.some((c) => c.connectionId === selectedId)) {
        selectedId = null;
        replayable = [];
      }
    } catch (err) {
      error = err?.message || 'Erro ao carregar';
      connections = [];
    } finally {
      loading = false;
    }
  }

  async function loadReplayable(connectionId) {
    if (!connectionId) {
      replayable = [];
      return;
    }
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/ifood/connections?connectionId=${encodeURIComponent(connectionId)}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Falha ao listar replay');
      replayable = Array.isArray(body.items) ? body.items : [];
    } catch (err) {
      actionMessage = err?.message || 'Falha ao listar itens reprocessáveis';
      replayable = [];
    }
  }

  async function selectConnection(connectionId) {
    selectedId = connectionId;
    actionMessage = '';
    await loadReplayable(connectionId);
  }

  async function runAction(payload) {
    if (actionBusy) return;
    actionBusy = true;
    actionMessage = '';
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/ifood/actions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Ação falhou');
      actionMessage = `OK: ${body.outcome || payload.action}`;
      await loadConnections();
      if (selectedId) await loadReplayable(selectedId);
    } catch (err) {
      actionMessage = err?.message || 'Ação falhou';
    } finally {
      actionBusy = false;
    }
  }

  function lagLabel(iso) {
    if (!iso) return '—';
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h`;
  }

  onMount(() => {
    void loadConnections();
  });
</script>

<div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-white tracking-tight">iFood — Operações</h1>
      <p class="text-sm text-slate-400 mt-1">
        Saúde cross-tenant sem PII. Kill switches e replay da mesma identidade.
      </p>
    </div>
    <button
      type="button"
      class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-50"
      disabled={loading}
      on:click={() => loadConnections()}
    >
      Atualizar
    </button>
  </div>

  {#if error}
    <div class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
  {/if}
  {#if actionMessage}
    <div class="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">{actionMessage}</div>
  {/if}

  {#if loading}
    <div class="text-slate-400 text-sm">Carregando conexões…</div>
  {:else if connections.length === 0}
    <div class="text-slate-400 text-sm">Nenhuma conexão iFood cadastrada.</div>
  {:else}
    <div class="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50">
      <table class="min-w-full text-sm">
        <thead class="text-left text-slate-400 border-b border-slate-800">
          <tr>
            <th class="px-4 py-3 font-medium">Merchant</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Print</th>
            <th class="px-4 py-3 font-medium">Fila</th>
            <th class="px-4 py-3 font-medium">DLQ</th>
            <th class="px-4 py-3 font-medium">Cmds</th>
            <th class="px-4 py-3 font-medium">Unmapped</th>
            <th class="px-4 py-3 font-medium">Lag webhook</th>
            <th class="px-4 py-3 font-medium">Heartbeat</th>
          </tr>
        </thead>
        <tbody>
          {#each connections as row}
            <tr
              class="border-b border-slate-800/80 hover:bg-slate-800/40 cursor-pointer {selectedId === row.connectionId ? 'bg-sky-500/10' : ''}"
              on:click={() => selectConnection(row.connectionId)}
            >
              <td class="px-4 py-3 font-mono text-xs text-slate-200">{row.merchantId}</td>
              <td class="px-4 py-3">
                <span class="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium
                  {row.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' :
                   row.status === 'paused' ? 'bg-amber-500/15 text-amber-300' :
                   row.status === 'degraded' ? 'bg-orange-500/15 text-orange-300' :
                   'bg-slate-700 text-slate-300'}">{row.status}</span>
              </td>
              <td class="px-4 py-3 text-slate-300">{row.printOwner || '—'}</td>
              <td class="px-4 py-3 text-slate-300">{row.queuedEvents}</td>
              <td class="px-4 py-3 text-slate-300">{row.deadLetterEvents}</td>
              <td class="px-4 py-3 text-slate-300">{row.queuedCommands}/{row.failedCommands}</td>
              <td class="px-4 py-3 text-slate-300">{row.unmappedProducts}</td>
              <td class="px-4 py-3 text-slate-400">{lagLabel(row.lastWebhookAt)}</td>
              <td class="px-4 py-3 text-slate-400">{lagLabel(row.workerHeartbeatAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if selected}
    <div class="grid gap-4 md:grid-cols-2">
      <section class="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <h2 class="text-lg font-semibold text-white">Kill switches</h2>
        <p class="text-xs text-slate-400 font-mono break-all">{selected.connectionId}</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-3 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-sm disabled:opacity-50"
            disabled={actionBusy || selected.status === 'paused'}
            on:click={() => runAction({ action: 'pause', connectionId: selected.connectionId })}
          >Pausar</button>
          <button
            type="button"
            class="px-3 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
            disabled={actionBusy || selected.status === 'active'}
            on:click={() => runAction({ action: 'resume', connectionId: selected.connectionId })}
          >Retomar</button>
          <button
            type="button"
            class="px-3 py-2 rounded-lg bg-red-700/80 hover:bg-red-600 text-white text-sm disabled:opacity-50"
            disabled={actionBusy || selected.status === 'revoked'}
            on:click={() => runAction({ action: 'revoke', connectionId: selected.connectionId })}
          >Revogar</button>
        </div>
        <p class="text-xs text-slate-500">
          Pause e revoke são separados: pause é contingência; revoke corta a loja até nova conexão.
        </p>
      </section>

      <section class="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <h2 class="text-lg font-semibold text-white">Replay (mesma identidade)</h2>
        {#if replayable.length === 0}
          <p class="text-sm text-slate-400">Nenhum evento/comando reprocessável nesta conexão.</p>
        {:else}
          <ul class="space-y-2 max-h-72 overflow-y-auto">
            {#each replayable as item}
              <li class="flex items-center justify-between gap-3 rounded-xl border border-slate-800 px-3 py-2">
                <div class="min-w-0">
                  <div class="text-xs font-mono text-slate-200 truncate">{item.kind}: {item.externalRef}</div>
                  <div class="text-[11px] text-slate-500">{item.status} · attempts={item.attempts} · {item.lastErrorCode || 'sem erro'}</div>
                </div>
                <button
                  type="button"
                  class="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-white disabled:opacity-50"
                  disabled={actionBusy}
                  on:click={() => runAction(
                    item.kind === 'command'
                      ? { action: 'replay_command', commandId: item.rowId }
                      : { action: 'replay_event', inboxId: item.rowId }
                  )}
                >Replay</button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</div>
