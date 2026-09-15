<script>
  import { onMount } from 'svelte';
  import { CheckCircle2, Circle } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { getAccessContext } from '$lib/accessControl';
  import { buildChecklistState } from '$lib/onboardingChecklist';

  let visible = false;
  let items = [];

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
</style>
