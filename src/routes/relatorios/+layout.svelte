<script>
  import { onMount } from 'svelte';
  import { ensureActiveSubscription } from '$lib/guards';
  import GestaoSidebar from '$lib/components/GestaoSidebar.svelte';
  import AssistantChat from '$lib/components/AssistantChat.svelte';
  import { isOpen as isZelinhoOpen } from '$lib/stores/assistant';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  let ready = false;

  onMount(async () => {
    const ok = await ensureActiveSubscription({ requireProfile: true });
    if (!ok) return;
    ready = true;
    // Track that user visited relatorios — used by onboarding checklist step 3
    localStorage.setItem('zelo_relatorio_visited', 'true');
  });
</script>

{#if ready}
  <div class:zelinho-open={$isZelinhoOpen} class="app-navigation-workspace zelinho-workspace relatorios-workspace flex overflow-visible" style="background: var(--bg-app); color: var(--text-main);">
    <GestaoSidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <main class="relatorios-content flex-1 p-6 md:p-8">
        <slot />
      </main>
    </div>
  </div>
{:else}
  <div class="relatorios-workspace flex items-center justify-center" style="background: var(--bg-app); color: var(--text-main);">
    <div class="flex flex-col items-center gap-3">
      <Spinner label="Carregando" />
      <p class="text-sm" style="color: var(--text-muted);">Carregando...</p>
    </div>
  </div>
{/if}
<AssistantChat />

<style>
  .relatorios-workspace {
    min-height: 100vh;
    min-height: 100dvh;
  }

  @media (min-width: 1280px) {
    .zelinho-workspace { padding-right: 24rem; }
    .zelinho-workspace:not(.zelinho-open) { padding-right: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .zelinho-workspace { transition: none; } }
</style>
