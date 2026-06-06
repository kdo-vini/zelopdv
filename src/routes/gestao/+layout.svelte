<script>
  import { onMount } from 'svelte';
  import { ensureActiveSubscription } from '$lib/guards';
  import GestaoSidebar from '$lib/components/GestaoSidebar.svelte';
  import AssistantChat from '$lib/components/AssistantChat.svelte';
  import InAppSupportChat from '$lib/components/InAppSupportChat.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

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
      <main class="flex-1 overflow-y-auto p-6 pt-16 md:p-8" id="gestao-main-content">
        <slot />
      </main>
    </div>
  </div>
{:else}
  <div class="flex h-screen items-center justify-center" style="background: var(--bg-app);">
    <div class="flex flex-col items-center gap-3">
      <Spinner label="Verificando autenticação" />
      <p class="text-sm" style="color: var(--text-muted);">Verificando autenticação...</p>
    </div>
  </div>
{/if}
<AssistantChat />
<InAppSupportChat />
