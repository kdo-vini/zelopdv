<script>
  import { onMount } from 'svelte';
  import { Undo2 } from 'lucide-svelte';
  import { canUndo, describeStatus } from '$lib/gerente/agentActions.js';
  import { addToast } from '$lib/stores/ui.js';

  export let supabase;
  export let getToken;

  let actions = [];
  let loading = true;
  let busyId = null;

  async function load() {
    loading = true;
    const { data, error } = await supabase
      .from('gerente_agent_actions')
      .select('id, tool_name, summary, status, channel, created_at, executed_at, before_state')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) addToast('Não foi possível carregar as ações do Zelinho.', 'warning');
    actions = data || [];
    loading = false;
  }

  async function undo(action) {
    if (busyId) return;
    busyId = action.id;
    try {
      const token = await getToken();
      const response = await fetch('/api/gerente/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ undo_action_id: action.id }),
      });
      const data = await response.json().catch(() => ({}));
      addToast(data?.reply || data?.error || 'Não foi possível desfazer.', data?.ok ? 'success' : 'error');
      await load();
    } catch {
      addToast('Erro de conexão ao desfazer.', 'error');
    } finally {
      busyId = null;
    }
  }

  function when(action) {
    const value = action.executed_at || action.created_at;
    return value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  }

  onMount(load);
</script>

<section class="actions-card" aria-labelledby="agent-actions-title">
  <h2 id="agent-actions-title">Ações do Zelinho</h2>
  <p class="hint">O que o Zelinho fez ou propôs a pedido seu, no app ou no WhatsApp.</p>
  {#if loading}
    <div class="row skeleton"></div>
  {:else if actions.length === 0}
    <p class="empty">Nenhuma ação ainda. Peça algo ao Zelinho, como "pausa o refri no cardápio".</p>
  {:else}
    <ul>
      {#each actions as action (action.id)}
        <li class="row">
          <div class="row-main">
            <span class="summary">{action.summary}</span>
            <span class="meta">{describeStatus(action.status)} · {action.channel === 'whatsapp' ? 'WhatsApp' : 'App'} · {when(action)}</span>
          </div>
          {#if canUndo(action)}
            <button type="button" class="undo" disabled={busyId === action.id} on:click={() => undo(action)}><Undo2 size={14} aria-hidden="true" /> Desfazer</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .actions-card { margin-top: 24px; padding: 20px; border: 1px solid var(--border-card); border-radius: 8px; background: var(--bg-card); }
  h2 { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--text-main); }
  .hint, .empty { margin: 0; font-size: 12px; color: var(--text-muted); }
  ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 8px 0; border-top: 1px solid var(--border-subtle); }
  .row-main { display: grid; gap: 2px; min-width: 0; }
  .summary { font-size: 13px; color: var(--text-main); }
  .meta { font-size: 11px; color: var(--text-muted); }
  .undo { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-input); color: var(--text-main); font-size: 12px; font-weight: 600; cursor: pointer; }
  .undo:disabled { opacity: .6; cursor: not-allowed; }
  .skeleton { height: 44px; border-radius: 8px; background: var(--bg-input); }
</style>
