<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  let visible = false;
  let userId = null;
  let hasProdutos = false;
  let hasVenda = false;
  let hasRelatorio = false;
  let completing = false;

  $: allDone = hasProdutos && hasVenda && hasRelatorio;
  $: doneCount = [hasProdutos, hasVenda, hasRelatorio].filter(Boolean).length;

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userId = user.id;

    // Check if already completed in DB — if yes, skip silently
    const { data: perfil } = await supabase
      .from('empresa_perfil')
      .select('onboarding_completed')
      .eq('user_id', userId)
      .maybeSingle();

    if (perfil?.onboarding_completed) return;

    // Check each step in parallel
    const [prodRes, vendaRes] = await Promise.all([
      supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('id_usuario', userId),
      supabase.from('vendas').select('id', { count: 'exact', head: true }).eq('id_usuario', userId),
    ]);

    hasProdutos = (prodRes.count ?? 0) > 0;
    hasVenda = (vendaRes.count ?? 0) > 0;
    hasRelatorio = localStorage.getItem('zelo_relatorio_visited') === 'true';

    visible = true;

    // If already all done from the start (e.g. just refreshed after doing everything), complete immediately
    if (hasProdutos && hasVenda && hasRelatorio) {
      markComplete();
    }
  });

  async function markComplete() {
    if (completing || !userId) return;
    completing = true;
    await supabase
      .from('empresa_perfil')
      .update({ onboarding_completed: true })
      .eq('user_id', userId);
    // Small delay so user sees the "all done" state before it disappears
    setTimeout(() => { visible = false; }, 1400);
  }

  async function dismiss() {
    visible = false;
    if (userId) {
      await supabase
        .from('empresa_perfil')
        .update({ onboarding_completed: true })
        .eq('user_id', userId);
    }
  }

  // Auto-complete when all steps become true
  $: if (allDone && visible && !completing) {
    markComplete();
  }
</script>

{#if visible}
  <div class="checklist-card" role="region" aria-label="Primeiros passos">
    <div class="checklist-header">
      <div>
        <p class="checklist-title">Primeiros passos</p>
        <p class="checklist-sub">{doneCount} de 3 etapas concluídas</p>
      </div>
      <button class="dismiss-btn" on:click={dismiss} aria-label="Dispensar">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>

    <!-- Progress bar -->
    <div class="progress-track" role="progressbar" aria-valuenow={doneCount} aria-valuemin="0" aria-valuemax="3">
      <div class="progress-fill" style="width: {(doneCount / 3) * 100}%"></div>
    </div>

    <!-- Steps -->
    <ul class="steps-list">
      <li class="step" class:done={hasProdutos}>
        <span class="step-icon" aria-hidden="true">
          {#if hasProdutos}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4"><circle cx="10" cy="10" r="7.25" /></svg>
          {/if}
        </span>
        <span class="step-label">Cadastre seus produtos</span>
        {#if !hasProdutos}
          <a href="/gestao/produtos" class="step-link">Ir →</a>
        {/if}
      </li>

      <li class="step" class:done={hasVenda}>
        <span class="step-icon" aria-hidden="true">
          {#if hasVenda}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4"><circle cx="10" cy="10" r="7.25" /></svg>
          {/if}
        </span>
        <span class="step-label">Registre sua primeira venda</span>
        {#if !hasVenda}
          <a href="/app" class="step-link">Ir →</a>
        {/if}
      </li>

      <li class="step" class:done={hasRelatorio}>
        <span class="step-icon" aria-hidden="true">
          {#if hasRelatorio}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4"><circle cx="10" cy="10" r="7.25" /></svg>
          {/if}
        </span>
        <span class="step-label">Veja seu relatório do dia</span>
        {#if !hasRelatorio}
          <a href="/relatorios" class="step-link">Ir →</a>
        {/if}
      </li>
    </ul>

    {#if allDone}
      <p class="all-done-msg">Tudo pronto! Bom trabalho.</p>
    {/if}
  </div>
{/if}

<style>
  .checklist-card {
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 20px;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
  }

  .checklist-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .checklist-title {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin: 0 0 2px;
  }

  .checklist-sub {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0;
  }

  .dismiss-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    color: var(--text-muted);
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
    flex-shrink: 0;
  }
  .dismiss-btn:hover { color: var(--text-main); }

  .progress-track {
    height: 4px;
    border-radius: 2px;
    background: var(--border-subtle);
    margin-bottom: 12px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--primary);
    transition: width 0.4s ease;
  }

  .steps-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: var(--text-main);
  }

  .step.done .step-label {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .step-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .step.done .step-icon {
    color: var(--success);
  }

  .step-label {
    flex: 1;
    line-height: 1.3;
  }

  .step-link {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--primary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background 0.15s;
  }
  .step-link:hover { background: var(--accent-light); }

  .all-done-msg {
    margin: 10px 0 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--success);
    text-align: center;
  }
</style>
