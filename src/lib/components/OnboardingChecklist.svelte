<script>
  import { onMount } from 'svelte';
  import { CheckCircle2, Circle, ChevronRight } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { getAccessContext } from '$lib/accessControl';
  import { buildChecklistState } from '$lib/onboardingChecklist';
  import { zeloSurface } from '$lib/theme/surface';

  let visible = false;
  let items = [];

  // Presentation-only: same `items` the legacy branch reads, just counted for the header/progress bar.
  $: doneCount = items.filter((i) => i.done).length;
  $: total = items.length;

  onMount(async () => {
    if (!supabase) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const accessContext = await getAccessContext();
      // Falha fechada: sem contexto confiável não assumimos que a sessão é do
      // proprietário, evitando consultar/exibir o checklist para um subusuário.
      if (!accessContext || accessContext.isSubUser) return;
      const ownerUserId = accessContext.ownerUserId;

      const [profileResult, productsResult] = await Promise.all([
        supabase
          .from('empresa_perfil')
          .select('documento, logo_url, largura_bobina')
          .eq('user_id', ownerUserId)
          .maybeSingle(),
        supabase
          .from('produtos')
          .select('id', { count: 'exact', head: true })
          .eq('id_usuario', ownerUserId),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (productsResult.error) throw productsResult.error;

      const state = buildChecklistState({
        hasProdutos: (productsResult.count ?? 0) > 0,
        documento: profileResult.data?.documento,
        logoUrl: profileResult.data?.logo_url,
        larguraBobina: profileResult.data?.largura_bobina,
      });

      items = state.items;
      visible = !state.allDone;
    } catch (error) {
      console.warn('[OnboardingChecklist] load failed:', error?.message || error);
      visible = false;
    }
  });
</script>

{#if visible}
  {#if $zeloSurface}
    <!-- Zelo Design System (mockup 06, frames 16/25). Same visible/items/handlers as the legacy branch below. -->
    <div class="zck-card" role="region" aria-label="Terminar de configurar">
      <div class="zck-head">
        <div>
          <p class="zck-title">Terminar de configurar</p>
          <p class="zck-sub">Nada disso trava o caixa. Faça quando sobrar um tempo.</p>
        </div>
        <span class="zck-count" aria-label={`${doneCount} de ${total} concluídos`}><b>{doneCount}</b>/{total}</span>
      </div>

      <div class="zck-bar" role="presentation"><i style="width: {total ? (doneCount / total) * 100 : 0}%"></i></div>

      <ul class="zck-list">
        {#each items as item}
          <li class="zck-row" class:done={item.done}>
            <a href={item.href}>
              <span class="zck-ic" aria-hidden="true">
                {#if item.done}
                  <CheckCircle2 size={20} strokeWidth={1.75} />
                {:else}
                  <Circle size={20} strokeWidth={1.75} />
                {/if}
              </span>
              <span class="zck-label">{item.label}</span>
              <span class="zck-chevron" aria-hidden="true"><ChevronRight size={16} strokeWidth={1.75} /></span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <div class="checklist-card" role="region" aria-label="Terminar de configurar">
      <div class="checklist-header">
        <p class="checklist-title">Terminar de configurar</p>
        <p class="checklist-sub">Nada disso trava o caixa. Faça quando sobrar um tempo.</p>
      </div>

      <ul class="steps-list">
        {#each items as item}
          <li class="step" class:done={item.done}>
            <a href={item.href}>
              <span class="step-icon" aria-hidden="true">
                {#if item.done}
                  <CheckCircle2 class="size-4" />
                {:else}
                  <Circle class="size-4" />
                {/if}
              </span>
              <span class="step-label">{item.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
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
    margin-bottom: 12px;
  }

  .checklist-title {
    margin: 0 0 3px;
    color: var(--text-main);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .checklist-sub {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .steps-list {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step a {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 5px 7px;
    border-radius: 6px;
    color: var(--text-main);
    font-size: 0.875rem;
    text-decoration: none;
    transition: background var(--transition-fast);
  }

  .step a:hover {
    background: var(--accent-light);
  }

  .step-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .step.done .step-icon {
    color: var(--success);
  }

  .step.done .step-label {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .step-label {
    line-height: 1.35;
  }

  /* ═══ Zelo Design System (only when $zeloSurface; mockup 06, frames 16/25) — tokens only ═══ */
  .zck-card {
    border-radius: var(--zelo-radius-card);
    padding: 16px 16px 6px;
    border: 1px solid var(--border-card);
    background: var(--bg-panel);
  }

  .zck-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .zck-title {
    margin: 0 0 3px;
    font: var(--type-heading);
    letter-spacing: var(--type-heading-tracking);
    color: var(--text-main);
  }

  .zck-sub {
    margin: 0;
    font: var(--type-caption);
    letter-spacing: var(--type-caption-tracking);
    color: var(--text-muted);
  }

  .zck-count {
    white-space: nowrap;
    font: var(--type-num-sm);
    letter-spacing: var(--type-num-sm-tracking);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .zck-count b {
    font-weight: 600;
    color: var(--text-main);
  }

  .zck-bar {
    height: 4px;
    margin: 12px 0 4px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--bg-sunken);
  }

  .zck-bar i {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--primary);
    transition: width var(--zelo-dur-slow) var(--zelo-ease-spring);
  }

  .zck-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .zck-row a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 50px;
    padding: 0 6px;
    border-top: 1px solid var(--border-card);
    border-radius: var(--zelo-radius-control);
    color: var(--text-main);
    font: var(--type-body-strong);
    letter-spacing: var(--type-body-strong-tracking);
    text-decoration: none;
    transition: background var(--zelo-dur-fast), transform var(--zelo-dur-slow) var(--zelo-ease-spring);
  }

  .zck-row:first-child a {
    border-top: 0;
  }

  .zck-row a:hover {
    background: var(--bg-sunken);
  }

  .zck-row a:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px var(--focus);
  }

  .zck-row a:active {
    transform: scale(var(--zelo-press-scale));
    transition-duration: var(--zelo-dur-fast);
  }

  .zck-ic {
    flex-shrink: 0;
    display: grid;
    color: var(--border-strong);
  }

  .zck-row.done .zck-ic {
    color: var(--status-success-text);
  }

  .zck-label {
    flex: 1;
    min-width: 0;
  }

  .zck-row.done .zck-label {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .zck-chevron {
    flex-shrink: 0;
    display: grid;
    margin-left: auto;
    color: var(--text-muted);
  }
</style>
