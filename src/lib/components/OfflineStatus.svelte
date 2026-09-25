<script>
  import OfflineCenter from './OfflineCenter.svelte';
  import { onMount } from 'svelte';
  import { WifiOff, CloudUpload, CircleAlert } from 'lucide-svelte';
  import { offlineStatus, setOfflineStatus, offlineStatusLabel, createConnectionNotice } from '$lib/stores/offlineStatus';
  import { addToast } from '$lib/stores/ui';
  let expanded = false;
  let centerOpen = false;
  // Tom do indicador nas superfícies Zelo (StatusPill): erro > atenção > neutro.
  $: tone = $offlineStatus.storageError || $offlineStatus.reviewCount ? 'danger'
    : $offlineStatus.connection !== 'online' ? 'warn' : 'neutral';
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
    // Browser connectivity alone is not proof that the service recovered, so the
    // recovered state stays degraded until a request confirms it. Ask for that
    // confirmation immediately; otherwise a single blip leaves the whole session
    // reading "instável" and every screen keyed off it stuck.
    const connected = () => {
      setOfflineStatus({ connection: 'degraded' });
      void import('$lib/offline/runtime').then(m => m.refreshConnectionState()).catch(() => {});
    };
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
  <aside class="offline-status" class:expanded aria-label="Estado do salvamento" data-offline-status data-tone={tone}>
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
      <button type="button" class="open-center" on:click={() => centerOpen = true}>Abrir central de pendências</button>
    {/if}
  </aside>
{/if}
{#if centerOpen}<OfflineCenter on:close={() => centerOpen = false} />{/if}

<style>
  .offline-status { position: fixed; bottom: calc(0.75rem + var(--mobile-bottom-nav-offset, 0px)); left: 50%; transform: translateX(-50%); width: min(32rem, calc(100vw - 2rem)); z-index: 19; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-panel); color: var(--text-main); box-shadow: 0 4px 16px color-mix(in srgb, var(--bg-app) 35%, transparent); }
  button { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; width: 100%; text-align: left; font-size: 0.8rem; }
  button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  p { font-size: 0.8rem; padding: 0 0.85rem 0.7rem; color: var(--text-muted); }
  @media (max-width: 767px) {
    .offline-status { bottom: calc(4.75rem + var(--mobile-bottom-nav-offset, 0px)); }
  }

  /* ── Zelo Design System (app/brand): StatusPill compacta, tom pelo estado ── */
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status {
    width: max-content;
    max-width: min(32rem, calc(100vw - 24px));
    border-radius: var(--zelo-radius-pill);
    border-color: var(--border-subtle);
    background: var(--bg-panel);
    color: var(--text-label);
    box-shadow: var(--elevation-float);
  }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status[data-tone="warn"] { border-color: var(--status-warning-border); background: var(--status-warning-bg); color: var(--status-warning-text); }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status[data-tone="danger"] { border-color: var(--status-error-border); background: var(--status-error-bg); color: var(--status-error-text); }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status.expanded { width: min(26rem, calc(100vw - 24px)); border-radius: var(--zelo-radius-card); }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status button { min-height: 36px; padding: 0 14px; gap: 8px; font-size: 12.5px; font-weight: 500; line-height: 1.3; border-radius: inherit; }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status button :global(svg) { stroke-width: 1.75; flex: none; }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status button:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status p { padding: 0 14px 8px; font-size: 12.5px; color: inherit; opacity: 0.86; }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status .open-center {
    width: auto; margin: 4px 14px 14px; justify-content: center;
    border: 1px solid var(--border-subtle); border-radius: var(--zelo-radius-control);
    background: var(--bg-panel); color: var(--text-main); font-weight: 600;
  }
  :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status .open-center:hover { border-color: var(--border-strong); }
  @media (max-width: 767px) {
    :global(:is([data-surface="app"], [data-surface="brand"])) .offline-status { bottom: calc(12px + var(--mobile-bottom-nav-offset, 0px)); }
    /* /app: logo acima da barra flutuante "Ver comanda" (offset + 12px + 62px) */
    :global(html:is([data-surface="app"], [data-surface="brand"]):has(.fc-cartbar)) .offline-status { bottom: calc(82px + var(--mobile-bottom-nav-offset, 0px)); }
  }
</style>
