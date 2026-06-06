<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { X, CheckCircle2, Circle } from 'lucide-svelte';

  let visible = false;
  let userId = null;
  let hasProdutos = false;
  let hasCaixa = false;
  let hasVenda = false;
  let hasRelatorio = false;
  let completing = false;

  $: activationDone = hasProdutos && hasCaixa && hasVenda;
  $: doneCount = [hasProdutos, hasCaixa, hasVenda].filter(Boolean).length;
  const totalSteps = 3;

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
    const [prodRes, caixaRes, vendaRes] = await Promise.all([
      supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('id_usuario', userId),
      supabase.from('caixas').select('id', { count: 'exact', head: true }).eq('id_usuario', userId),
      supabase.from('vendas').select('id', { count: 'exact', head: true }).eq('id_usuario', userId),
    ]);

    hasProdutos = (prodRes.count ?? 0) > 0;
    hasCaixa = (caixaRes.count ?? 0) > 0;
    hasVenda = (vendaRes.count ?? 0) > 0;
    hasRelatorio = localStorage.getItem('zelo_relatorio_visited') === 'true';

    visible = true;

    // If already all done from the start (e.g. just refreshed after doing everything), complete immediately
    if (hasProdutos && hasCaixa && hasVenda) {
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

  // Auto-complete when the core activation steps become true.
  $: if (activationDone && visible && !completing) {
    markComplete();
  }
</script>

{#if visible}
  <div class="checklist-card" role="region" aria-label="Primeiros passos">
    <div class="checklist-header">
      <div>
        <p class="checklist-title">Primeiros passos</p>
        <p class="checklist-sub">{doneCount} de {totalSteps} etapas concluídas</p>
      </div>
      <button class="dismiss-btn" on:click={dismiss} aria-label="Dispensar">
        <X class="size-4" />
      </button>
    </div>

    <!-- Progress bar -->
    <div class="progress-track" role="progressbar" aria-valuenow={doneCount} aria-valuemin="0" aria-valuemax={totalSteps}>
      <div class="progress-fill" style="width: {(doneCount / totalSteps) * 100}%"></div>
    </div>

    <!-- Steps -->
    <ul class="steps-list">
      <li class="step" class:done={hasProdutos}>
        <span class="step-icon" aria-hidden="true">
          {#if hasProdutos}
            <CheckCircle2 class="size-4" />
          {:else}
            <Circle class="size-4" />
          {/if}
        </span>
        <span class="step-label">Cadastre seus produtos</span>
        {#if !hasProdutos}
          <a href="/gestao/produtos" class="step-link">Ir →</a>
        {/if}
      </li>

      <li class="step" class:done={hasCaixa}>
        <span class="step-icon" aria-hidden="true">
          {#if hasCaixa}
            <CheckCircle2 class="size-4" />
          {:else}
            <Circle class="size-4" />
          {/if}
        </span>
        <span class="step-label">Abra o caixa do dia</span>
        {#if !hasCaixa}
          <a href="/app" class="step-link">Abrir →</a>
        {/if}
      </li>

      <li class="step" class:done={hasVenda}>
        <span class="step-icon" aria-hidden="true">
          {#if hasVenda}
            <CheckCircle2 class="size-4" />
          {:else}
            <Circle class="size-4" />
          {/if}
        </span>
        <span class="step-label">Registre a primeira venda e recibo</span>
        {#if !hasVenda}
          <a href="/app" class="step-link">Ir →</a>
        {/if}
      </li>

      <li class="step" class:done={hasRelatorio}>
        <span class="step-icon" aria-hidden="true">
          {#if hasRelatorio}
            <CheckCircle2 class="size-4" />
          {:else}
            <Circle class="size-4" />
          {/if}
        </span>
        <span class="step-label">Opcional: veja seu relatório do dia</span>
        {#if !hasRelatorio}
          <a href="/relatorios" class="step-link">Ir →</a>
        {/if}
      </li>
    </ul>

    {#if activationDone}
      <p class="all-done-msg">Tudo pronto para vender. Bom trabalho.</p>
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
