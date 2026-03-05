<script>
  import { onMount } from 'svelte';
  import { ensureActiveSubscription } from '$lib/guards';
  import GestaoSidebar from '$lib/components/GestaoSidebar.svelte';

  let ready = false;

  onMount(async () => {
    const ok = await ensureActiveSubscription({ requireProfile: true });
    if (!ok) return;
    ready = true;
  });
</script>

{#if ready}
  <div class="flex h-screen overflow-hidden" style="background: var(--bg-app);">
    <GestaoSidebar />
    <div class="flex-1 flex flex-col overflow-hidden min-w-0">
      <main class="flex-1 overflow-y-auto p-6 md:p-8" id="gestao-main-content">
        <slot />
      </main>
    </div>
  </div>
{:else}
  <div class="flex h-screen items-center justify-center" style="background: var(--bg-app);">
    <div class="flex flex-col items-center gap-3">
      <div
        class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style="border-color: var(--primary); border-top-color: transparent;"
        role="status"
        aria-label="Verificando autenticação"
      ></div>
      <p class="text-sm" style="color: var(--text-muted);">Verificando autenticação...</p>
    </div>
  </div>
{/if}
