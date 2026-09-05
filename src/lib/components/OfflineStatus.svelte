<script>
  import OfflineCenter from './OfflineCenter.svelte';
  import { onMount } from 'svelte';
  import { WifiOff, CloudUpload, CircleAlert } from 'lucide-svelte';
  import { offlineStatus, setOfflineStatus, offlineStatusLabel, createConnectionNotice } from '$lib/stores/offlineStatus';
  import { addToast } from '$lib/stores/ui';
  let expanded = false;
  let centerOpen = false;
  $: visible = $offlineStatus.connection !== 'online' || $offlineStatus.pendingCount > 0 || $offlineStatus.reviewCount > 0 || $offlineStatus.storageError || $offlineStatus.syncing;
  onMount(() => {
    const shouldNotify = createConnectionNotice();
    const unsubscribe = offlineStatus.subscribe((state) => {
      if (shouldNotify(state.connection)) {
        addToast(state.prepared
          ? 'Conexão instável. Os próximos lançamentos serão salvos neste aparelho.'
          : 'Conexão instável. Verifique o estado do salvamento neste aparelho.', 'info', 4500);
      }
    });
    const disconnected = () => setOfflineStatus({ connection: 'offline' });
    // Browser connectivity alone is not proof that the service recovered.
    const connected = () => setOfflineStatus({ connection: 'degraded' });
    if (!navigator.onLine) disconnected();
    window.addEventListener('offline', disconnected);
    window.addEventListener('online', connected);
    return () => {
      unsubscribe();
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('online', connected);
    };
  });
</script>

{#if visible}
  <aside class="offline-status" aria-label="Estado do salvamento">
    <button type="button" aria-expanded={expanded} aria-label={offlineStatusLabel($offlineStatus)} on:click={() => expanded = !expanded}>
      {#if $offlineStatus.storageError || $offlineStatus.reviewCount}<CircleAlert size={16} />
      {:else if $offlineStatus.connection === 'offline'}<WifiOff size={16} />
      {:else}<CloudUpload size={16} />{/if}
      <span role="status" aria-live="polite">{offlineStatusLabel($offlineStatus)}</span>
    </button>
    {#if expanded}
      <p>Até sincronizar, mantenha os dados deste navegador. Não limpe os dados do site nem remova o aplicativo.</p>
      <p>Fechar normalmente não apaga lançamentos já salvos. A sincronização continua quando você abrir o sistema novamente com conexão.</p>
      {#if $offlineStatus.reviewCount}<p>Abra a central de pendências para conferir os lançamentos sinalizados.</p>{/if}
      <button type="button" on:click={() => centerOpen = true}>Abrir central de pendências</button>
    {/if}
  </aside>
{:else}
  <button class="offline-entry" type="button" on:click={() => centerOpen = true}>Vendas offline</button>
{/if}
{#if centerOpen}<OfflineCenter on:close={() => centerOpen = false} />{/if}

<style>
  .offline-entry { position: fixed; bottom: calc(0.5rem + var(--mobile-bottom-nav-offset, 0px)); right: 0.75rem; z-index: 19; width: auto; border: 1px solid var(--border-subtle); border-radius: 7px; background: var(--bg-panel); color: var(--text-muted); }
  .offline-status { position: fixed; bottom: calc(0.75rem + var(--mobile-bottom-nav-offset, 0px)); left: 50%; transform: translateX(-50%); width: min(32rem, calc(100vw - 2rem)); z-index: 19; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-panel); color: var(--text-main); box-shadow: 0 4px 16px color-mix(in srgb, var(--bg-app) 35%, transparent); }
  button { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; width: 100%; text-align: left; font-size: 0.8rem; }
  button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  p { font-size: 0.8rem; padding: 0 0.85rem 0.7rem; color: var(--text-muted); }
  @media (max-width: 767px) {
    .offline-status, .offline-entry { bottom: calc(4.75rem + var(--mobile-bottom-nav-offset, 0px)); }
  }
</style>
