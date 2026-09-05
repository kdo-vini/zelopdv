<script>
  import { get } from 'svelte/store';
  import { offlineStatus, blocksOfflineUpdate } from '$lib/stores/offlineStatus';
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { APP_VERSION, normalizeVersion } from '$lib/version';

  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const ACTIVE_CHECK_INTERVAL_MS = 90 * 1000;
  const INITIAL_DELAY_MS = 20 * 1000;
  const DISMISS_DELAY_MS = 2 * 60 * 60 * 1000;
  const RECENT_REFRESH_SUPPRESSION_MS = 5 * 60 * 1000;
  const CHANNEL_NAME = 'zelo-app-version';
  const STORAGE_DEFERRED_VERSION = 'zelo_update_deferred_version';
  const STORAGE_DEFERRED_UNTIL = 'zelo_update_deferred_until';
  const SESSION_REFRESH_TARGET = 'zelo_update_refresh_target';
  const SESSION_REFRESH_AT = 'zelo_update_refresh_at';

  let visible = false;
  let pendingVersion = '';
  let checking = false;
  let updateServiceWorker = null;
  let bc = null;
  let pollTimer = null;
  let deferredPromptTimer = null;
  let cleanupFns = [];
  let swipeStart = null;
  let swipeOffset = 0;
  let isSwiping = false;

  const currentVersion = normalizeVersion(APP_VERSION);

  function now() {
    return Date.now();
  }

  function safeGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch {}
  }

  function safeRemove(storage, key) {
    try {
      storage.removeItem(key);
    } catch {}
  }

  function isSameVersion(version) {
    return normalizeVersion(version) === currentVersion;
  }

  function wasRecentlyRefreshedFor(version) {
    const target = safeGet(sessionStorage, SESSION_REFRESH_TARGET);
    const refreshedAt = Number(safeGet(sessionStorage, SESSION_REFRESH_AT) || 0);
    return target === version && now() - refreshedAt < RECENT_REFRESH_SUPPRESSION_MS;
  }

  function clearCompletedRefreshGuard() {
    const target = safeGet(sessionStorage, SESSION_REFRESH_TARGET);
    if (target && target === currentVersion) {
      safeRemove(sessionStorage, SESSION_REFRESH_TARGET);
      safeRemove(sessionStorage, SESSION_REFRESH_AT);
    }
  }

  function deferredUntilFor(version) {
    const deferredVersion = safeGet(localStorage, STORAGE_DEFERRED_VERSION);
    if (deferredVersion !== version) return 0;
    return Number(safeGet(localStorage, STORAGE_DEFERRED_UNTIL) || 0);
  }

  function isDeferred(version) {
    return deferredUntilFor(version) > now();
  }

  function hasActiveComanda() {
    try {
      const raw = sessionStorage.getItem('zelo_comanda');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  function hasOpenModal() {
    return Boolean(
      document.querySelector(
        'dialog[open], [aria-modal="true"], [data-update-blocking="true"], .swal2-container, .modal, .modal-backdrop'
      )
    );
  }

  function userIsTyping() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName?.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      active.isContentEditable ||
      active.closest?.('[contenteditable="true"]')
    );
  }

  function isCriticalFlowActive() {
    const path = window.location.pathname;
    const activeSaleRoute = path === '/app' && hasActiveComanda();
    return blocksOfflineUpdate(get(offlineStatus)) || userIsTyping() || hasOpenModal() || activeSaleRoute;
  }

  function schedulePromptWhenSafe(version) {
    clearTimeout(deferredPromptTimer);
    deferredPromptTimer = setTimeout(() => {
      if (!pendingVersion || pendingVersion !== version || visible) return;
      if (isDeferred(version) || wasRecentlyRefreshedFor(version)) return;
      if (isCriticalFlowActive()) {
        schedulePromptWhenSafe(version);
        return;
      }
      visible = true;
    }, 1200);
  }

  function announceUpdate(version, source = 'poll') {
    const normalized = normalizeVersion(version);
    if (!normalized || isSameVersion(normalized)) return;
    if (wasRecentlyRefreshedFor(normalized) || isDeferred(normalized)) return;
    pendingVersion = normalized;
    bc?.postMessage({ type: 'update-available', version: normalized, source });
    schedulePromptWhenSafe(normalized);
  }

  async function checkForUpdate(source = 'poll') {
    if (checking || !navigator.onLine) return;
    checking = true;
    try {
      const response = await fetch(`/api/version?t=${now()}`, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      if (!response.ok) return;
      const data = await response.json();
      announceUpdate(data?.version, source);
    } catch (err) {
      console.warn('[UpdateAvailable] Version check failed:', err?.message || err);
    } finally {
      checking = false;
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    const interval = document.visibilityState === 'visible' ? ACTIVE_CHECK_INTERVAL_MS : CHECK_INTERVAL_MS;
    pollTimer = setInterval(() => checkForUpdate('interval'), interval);
  }

  async function clearAppCaches() {
    if (!('caches' in window)) return;
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => /workbox|precache|sveltekit|vite-pwa/i.test(name))
          .map((name) => caches.delete(name))
      );
    } catch (err) {
      console.warn('[UpdateAvailable] Cache cleanup failed:', err?.message || err);
    }
  }

  async function refreshNow() {
    if (!pendingVersion || isCriticalFlowActive() || !navigator.onLine) return;
    safeSet(sessionStorage, SESSION_REFRESH_TARGET, pendingVersion);
    safeSet(sessionStorage, SESSION_REFRESH_AT, String(now()));
    bc?.postMessage({ type: 'refreshing', version: pendingVersion });

    try {
      if (updateServiceWorker) {
        await updateServiceWorker(false);
      } else if (navigator.serviceWorker?.getRegistration) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      }
    } catch (err) {
      console.warn('[UpdateAvailable] Service worker update failed:', err?.message || err);
    }

    // Keep the currently working shell until the replacement worker activates.

    const url = new URL(window.location.href);
    url.searchParams.set('appVersion', pendingVersion.slice(0, 12));
    window.location.replace(url.toString());
  }

  function dismiss() {
    if (pendingVersion) {
      safeSet(localStorage, STORAGE_DEFERRED_VERSION, pendingVersion);
      safeSet(localStorage, STORAGE_DEFERRED_UNTIL, String(now() + DISMISS_DELAY_MS));
      bc?.postMessage({ type: 'dismissed', version: pendingVersion });
    }
    visible = false;
  }

  function handleTouchStart(event) {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    swipeStart = { x: touch.clientX, y: touch.clientY };
    swipeOffset = 0;
    isSwiping = false;
  }

  function handleTouchMove(event) {
    if (!swipeStart) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      swipeStart = null;
      swipeOffset = 0;
      isSwiping = false;
      return;
    }
    if (Math.abs(deltaX) > 8) {
      isSwiping = true;
      swipeOffset = deltaX;
    }
  }

  function handleTouchEnd(event) {
    if (!swipeStart) return;
    const touch = event.changedTouches?.[0];
    const deltaX = touch ? touch.clientX - swipeStart.x : 0;
    swipeStart = null;
    if (Math.abs(deltaX) >= 72) {
      isSwiping = false;
      swipeOffset = deltaX > 0 ? window.innerWidth : -window.innerWidth;
      setTimeout(() => {
        swipeOffset = 0;
        dismiss();
      }, 160);
    } else {
      isSwiping = false;
      swipeOffset = 0;
    }
  }

  onMount(() => {
    clearCompletedRefreshGuard();

    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        updateServiceWorker = registerSW({
          immediate: true,
          onNeedRefresh() {
            checkForUpdate('service-worker');
          },
          onRegisteredSW(_swUrl, registration) {
            cleanupFns.push(setInterval(() => registration?.update(), CHECK_INTERVAL_MS));
          }
        });
      })
      .catch((err) => {
        console.warn('[UpdateAvailable] PWA registration unavailable:', err?.message || err);
      });

    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (event) => {
        const { type, version } = event.data || {};
        if (!version || isSameVersion(version)) return;
        if (type === 'update-available') {
          pendingVersion = version;
          schedulePromptWhenSafe(version);
        }
        if (type === 'dismissed' || type === 'deferred' || type === 'refreshing') {
          visible = false;
        }
      };
    }

    const onVisibility = () => {
      startPolling();
      if (document.visibilityState === 'visible') checkForUpdate('visibility');
    };
    const onFocus = () => checkForUpdate('focus');
    const onOnline = () => checkForUpdate('online');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    cleanupFns.push(
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('focus', onFocus),
      () => window.removeEventListener('online', onOnline)
    );

    startPolling();
    const initial = setTimeout(() => checkForUpdate('initial'), INITIAL_DELAY_MS);
    cleanupFns.push(() => clearTimeout(initial));

    return () => {
      clearInterval(pollTimer);
      clearTimeout(deferredPromptTimer);
      bc?.close();
      cleanupFns.forEach((fn) => {
        if (typeof fn === 'function') fn();
        else clearInterval(fn);
      });
      cleanupFns = [];
    };
  });
</script>

{#if visible}
  <section
    class="update-toast"
    class:swiping={isSwiping}
    role="status"
    aria-live="polite"
    style:transform={`translateX(${swipeOffset}px)`}
    on:touchstart={handleTouchStart}
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}
    on:touchcancel={handleTouchEnd}
    in:fly={{ y: 18, duration: 240 }}
    out:fade={{ duration: 160 }}
  >
    <div class="update-dot" aria-hidden="true"></div>
    <div class="update-copy">
      <strong>Uma nova atualização está disponível.</strong>
      <span>Atualize para receber as melhorias mais recentes.</span>
    </div>
    <div class="update-actions">
      <button type="button" class="btn-refresh" on:click={refreshNow}>Atualizar</button>
    </div>
    <button type="button" class="btn-dismiss" on:click={dismiss} aria-label="Fechar aviso de atualização" title="Fechar">
      <span aria-hidden="true">×</span>
    </button>
  </section>
{/if}

<style>
  .update-toast {
    position: fixed;
    right: 1rem;
    bottom: calc(1rem + var(--mobile-bottom-nav-offset));
    z-index: 120;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.85rem;
    width: min(31rem, calc(100vw - 2rem));
    padding: 0.9rem 2.8rem 0.9rem 0.9rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
    color: var(--text-main);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--bg-app) 55%, transparent);
    backdrop-filter: blur(18px);
    touch-action: pan-y;
    user-select: none;
    transition: transform 160ms ease-out;
    will-change: transform;
  }

  .update-toast.swiping {
    transition: none;
  }

  .update-dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    background: var(--success);
    box-shadow: 0 0 0 0.35rem color-mix(in srgb, var(--success) 16%, transparent);
  }

  .update-copy {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .update-copy strong {
    font-size: 0.92rem;
    line-height: 1.25;
    font-weight: 750;
  }

  .update-copy span {
    font-size: 0.8rem;
    line-height: 1.3;
    color: var(--text-muted);
  }

  .update-actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .update-actions button,
  .btn-dismiss {
    min-height: 2.2rem;
    border-radius: 8px;
    padding: 0 0.8rem;
    font-size: 0.82rem;
    font-weight: 700;
    transition:
      transform var(--transition-fast),
      background var(--transition-fast),
      border-color var(--transition-fast);
  }

  .update-actions button:hover,
  .btn-dismiss:hover {
    transform: translateY(-1px);
  }

  .btn-refresh {
    border: 1px solid var(--primary);
    background: var(--primary);
    color: var(--primary-text);
  }

  .btn-refresh:hover {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }

  .btn-dismiss {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-size: 1.35rem;
    line-height: 1;
    cursor: pointer;
  }

  .btn-dismiss:hover {
    color: var(--text-main);
  }

  .btn-dismiss:focus-visible,
  .btn-refresh:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
  }

  @media (max-width: 640px) {
    .update-toast {
      left: 0.75rem;
      right: 0.75rem;
      bottom: calc(0.75rem + var(--mobile-bottom-nav-offset));
      width: auto;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      padding-right: 2.8rem;
    }

    .update-actions {
      grid-column: 1 / -1;
      width: 100%;
      justify-content: stretch;
    }

    .update-actions button {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .update-toast,
    .update-actions button,
    .btn-dismiss {
      transition: none;
    }
  }
</style>
