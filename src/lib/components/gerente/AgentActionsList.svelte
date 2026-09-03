<script>
  import { onMount } from 'svelte';
  import { canUndo, describeStatus, describeUndo } from '$lib/gerente/agentActions.js';
  import { addToast } from '$lib/stores/ui.js';

  export let supabase;
  export let getToken;
  export let onExample = () => {};

  let actions = [];
  let loading = true;
  let busyId = null;
  let confirmingId = null;

  async function load() {
    loading = true;
    const { data, error } = await supabase
      .from('gerente_agent_actions')
      .select('id, tool_name, summary, status, channel, created_at, executed_at, before_state, arguments')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) addToast('Não foi possível carregar as ações do Zelinho.', 'warning');
    actions = data || [];
    loading = false;
  }

  function askUndo(action) {
    confirmingId = confirmingId === action.id ? null : action.id;
  }

  function cancelUndo() {
    confirmingId = null;
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
      confirmingId = null;
    }
  }

  function when(action) {
    const value = action.executed_at || action.created_at;
    return value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  }

  onMount(load);
</script>

<section class="acts-wrap" aria-labelledby="agent-actions-title">
  <div class="section-h"><h2 id="agent-actions-title">Ações do Zelinho</h2><span class="hint">o que foi feito a pedido seu, com hora e opção de desfazer</span></div>
  <div class="acts">
    {#if loading}
      <div class="skeleton" aria-hidden="true"></div>
    {:else if actions.length === 0}
      <div class="empty"><strong>Nada ainda.</strong><span>Quando você pedir algo ao Zelinho e confirmar, a ação aparece aqui com hora, canal e a opção de desfazer.</span><div class="examples">{#each ['cria a categoria Sobremesas', 'preço do X-Bacon para 30', 'esconde o refri da frente de caixa'] as ex}<button type="button" on:click={() => onExample(ex)}>{ex}</button>{/each}</div></div>
    {:else}
      {#each actions as action (action.id)}
        <div class="act">
          <div class="main">
            <span class="summary">{action.summary}</span>
            <span class="meta"><span class="pill {action.status === 'executed' ? 'ok' : action.status === 'pending' ? 'warn' : 'mute'}">{describeStatus(action.status)}</span><span>{action.channel === 'whatsapp' ? 'WhatsApp' : 'App'} · {when(action)}</span></span>
            {#if confirmingId === action.id}
              <div class="confirm">
                <span class="confirm-text">{describeUndo(action)}</span>
                <div class="confirm-actions">
                  <button type="button" class="confirm-yes" disabled={busyId === action.id} on:click={() => undo(action)}>Sim, desfazer</button>
                  <button type="button" class="confirm-no" disabled={busyId === action.id} on:click={cancelUndo}>Agora não</button>
                </div>
              </div>
            {/if}
          </div>
          {#if canUndo(action)}<button type="button" class="undo" disabled={busyId === action.id} on:click={() => askUndo(action)}>Desfazer</button>{/if}
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .acts-wrap { margin-top: 26px; }
  .section-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 10px; }
  .section-h h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-main); }
  .hint { font-size: 12px; color: var(--text-muted); }
  .acts { border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); overflow: hidden; }
  .act { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--border-card); }
  .act:first-child { border-top: 0; }
  .main { display: grid; gap: 4px; min-width: 0; }
  .summary { font-size: 13px; color: var(--text-main); }
  .meta { font-size: 12px; color: var(--text-muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pill { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  .pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .pill.ok { background: var(--status-success-bg); color: var(--status-success-text); }
  .pill.warn { background: var(--status-warning-bg); color: var(--status-warning-text); }
  .pill.mute { background: var(--bg-input); color: var(--text-muted); }
  .undo { min-height: 36px; padding: 0 12px; border: 1px solid var(--border-subtle); border-radius: 6px; background: transparent; color: var(--text-label); font-size: 13px; font-weight: 500; cursor: pointer; }
  .undo:hover { color: var(--text-main); border-color: var(--border-strong); }
  .undo:disabled { opacity: .5; cursor: not-allowed; }
  .confirm { display: grid; gap: 8px; margin-top: 6px; padding: 10px 12px; border-radius: 8px; background: var(--bg-input); }
  .confirm-text { font-size: 12px; color: var(--text-main); }
  .confirm-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .confirm-yes { min-height: 36px; padding: 0 14px; border: none; border-radius: 6px; background: var(--primary); color: var(--primary-text); font-size: 13px; font-weight: 600; cursor: pointer; }
  .confirm-yes:disabled { opacity: .5; cursor: not-allowed; }
  .confirm-no { min-height: 36px; padding: 0 14px; border: 1px solid var(--border-subtle); border-radius: 6px; background: transparent; color: var(--text-label); font-size: 13px; font-weight: 500; cursor: pointer; }
  .confirm-no:hover { color: var(--text-main); border-color: var(--border-strong); }
  .confirm-no:disabled { opacity: .5; cursor: not-allowed; }
  .empty { padding: 22px 18px; display: grid; gap: 6px; color: var(--text-muted); font-size: 13px; }
  .empty strong { color: var(--text-label); font-weight: 600; }
  .examples { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .examples button { min-height: 32px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); font-size: 12px; cursor: pointer; }
  .examples button:hover { border-color: var(--primary); color: var(--text-main); }
  .skeleton { height: 56px; margin: 12px 18px; border-radius: 8px; background: var(--bg-input); }
</style>
