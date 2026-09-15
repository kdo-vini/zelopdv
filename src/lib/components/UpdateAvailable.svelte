<script>
  import { get } from 'svelte/store';
  import { offlineStatus, blocksOfflineUpdate } from '$lib/stores/offlineStatus';
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { APP_VERSION, normalizeVersion } from '$lib/version';
  import { evaluateBootUpdateSafety, isWithinBootWindow, draftHasPendingWork } from '$lib/pwa/updateSafety';

  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const ACTIVE_CHECK_INTERVAL_MS = 90 * 1000;
  const INITIAL_DELAY_MS = 20 * 1000;
  const DISMISS_DELAY_MS = 2 * 60 * 60 * 1000;
  const RECENT_REFRESH_SUPPRESSION_MS = 5 * 60 * 1000;
  const BOOT_WINDOW_MS = 8 * 1000;
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
  let bootStartedAt = 0;
  let bootInteracted = false;

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
    // A modal explicitly marked data-update-safe (e.g. ModalAbrirCaixa, which
    // the old version opens automatically whenever the caixa is closed) never
    // blocks the update notice — otherwise that screen could never show it.
    const candidates = document.querySelectorAll(
      'dialog[open], [aria-modal="true"], [data-update-blocking="true"], .swal2-container, .modal, .modal-backdrop'
    );
    for (const el of candidates) {
      if (!el.closest('[data-update-safe="true"]')) return true;
    }
    return false;
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

  function withinBootWindow() {
    return isWithinBootWindow(bootStartedAt, now(), bootInteracted, BOOT_WINDOW_MS);
  }

  /**
   * Live sync-runtime status (`offlineStatus`) is the fast path, but it only
   * reflects reality once `startOfflineRuntime` has run its first count
   * refresh — which can race this boot check. So, at boot only, also read the
   * durable queue directly. This component never knows the signed-in owner
   * (it mounts in the root layout, before any page resolves one), so it
   * checks every row in the queue tables rather than a single owner's —a
   * shared terminal could still hold a previous account's unsynced rows.
   * Any query failure counts as "has pending work" (never guess safe).
   */
  async function hasPendingOfflineWorkForBoot() {
    if (blocksOfflineUpdate(get(offlineStatus))) return true;
    try {
      const { db } = await import('$lib/offlineDb.js');
      const [pendingOps, legacyPending] = await Promise.all([
        db.offline_operations.toCollection().filter((row) => row.status !== 'acked').count(),
        db.vendas_pendentes.toCollection().filter((row) => row.status === 'aguardando').count()
      ]);
      return pendingOps > 0 || legacyPending > 0;
    } catch (err) {
      console.warn('[UpdateAvailable] Offline queue check failed:', err?.message || err);
      return true;
    }
  }

  /**
   * Same reasoning as above for the PDV draft (comanda em edição, ainda não
   * enviada — readDraft/saveDraft in $lib/offline/operations.js under key
   * 'pdv'): no owner/operator context is available here, so every stored PDV
   * draft is checked, not just the current person's. A query failure counts
   * as "has a pending draft".
   */
  async function hasPendingPdvDraftForBoot() {
    try {
      const { db } = await import('$lib/offlineDb.js');
      const rows = await db.offline_drafts.toCollection().filter((row) => row.key === 'pdv').toArray();
      return rows.some((row) => draftHasPendingWork(row.value));
    } catch (err) {
      console.warn('[UpdateAvailable] Draft check failed:', err?.message || err);
      return true;
    }
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

  async function announceUpdate(version, source = 'poll') {
    const normalized = normalizeVersion(version);
    if (!normalized || isSameVersion(normalized)) return;
    if (wasRecentlyRefreshedFor(normalized) || isDeferred(normalized)) return;
    pendingVersion = normalized;
    bc?.postMessage({ type: 'update-available', version: normalized, source });
    // Boot-safe silent path first. tryBootAutoUpdate is a no-op outside the
    // short post-load window (see withinBootWindow), so this is harmless for
    // updates discovered later by polling/focus/visibility — those always
    // fall through to the toast below, never an automatic reload.
    if (await tryBootAutoUpdate(normalized)) return;
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

  function waitForControllerChange(timeoutMs = 5000) {
    if (!navigator.serviceWorker) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        navigator.serviceWorker.removeEventListener('controllerchange', finish);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', finish);
      setTimeout(finish, timeoutMs);
    });
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

  async function applyUpdate(version) {
    safeSet(sessionStorage, SESSION_REFRESH_TARGET, version);
    safeSet(sessionStorage, SESSION_REFRESH_AT, String(now()));
    bc?.postMessage({ type: 'refreshing', version });

    try {
      if (updateServiceWorker) {
        await updateServiceWorker(false);
        // Only the new worker taking control makes it safe to drop the old
        // caches below — until then the still-active old worker may need them.
        await waitForControllerChange();
      } else if (navigator.serviceWorker?.getRegistration) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      }
    } catch (err) {
      console.warn('[UpdateAvailable] Service worker update failed:', err?.message || err);
    }

    await clearAppCaches();

    const url = new URL(window.location.href);
    url.searchParams.set('appVersion', version.slice(0, 12));
    window.location.replace(url.toString());
  }

  async function refreshNow() {
    if (!pendingVersion || isCriticalFlowActive() || !navigator.onLine) return;
    await applyUpdate(pendingVersion);
  }

  /**
   * Silently applies a waiting update at boot, before the person has started
   * interacting — see updateSafety.js for the exact rule. Outside the boot
   * window this always resolves false and callers fall back to the toast.
   */
  async function tryBootAutoUpdate(version) {
    if (!withinBootWindow()) return false;
    const [hasPendingQueue, hasPendingDraft] = await Promise.all([
      hasPendingOfflineWorkForBoot(),
      hasPendingPdvDraftForBoot()
    ]);
    const { safe } = evaluateBootUpdateSafety({
      online: navigator.onLine,
      hasPendingQueue,
      hasActiveComanda: hasActiveComanda(),
      hasPendingDraft,
      inputFocused: userIsTyping(),
      withinBootWindow: withinBootWindow(),
      alreadyApplied: wasRecentlyRefreshedFor(version)
    });
    if (!safe) return false;
    await applyUpdate(version);
    return true;
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

    bootStartedAt = now();
    const markInteracted = () => {
      bootInteracted = true;
    };
    window.addEventListener('pointerdown', markInteracted, { once: true, passive: true });
    window.addEventListener('keydown', markInteracted, { once: true });
    cleanupFns.push(
      () => window.removeEventListener('pointerdown', markInteracted),
      () => window.removeEventListener('keydown', markInteracted)
    );

    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        updateServiceWorker = registerSW({
          immediate: true,
          onNeedRefresh() {
            checkForUpdate('service-worker');
          },
          onRegisteredSW(_swUrl, registration) {
            cleanupFns.push(setInterval(() => registration?.update(), CHECK_INTERVAL_MS));
            // Force a check right away instead of waiting for the first
            // 5-minute interval tick, so a version already published shows
            // up (and can be applied silently) during the boot window.
            registration?.update().catch(() => {});
            if (registration?.waiting) {
              checkForUpdate('service-worker');
            }
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
