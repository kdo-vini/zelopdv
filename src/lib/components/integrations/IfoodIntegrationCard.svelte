<script>
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  import {
    IFOOD_STATE_LABELS,
    deriveIfoodWizardState,
    describeIfoodConnectionError,
    printOwnerLabel,
    shapeDiscoveredMerchants
  } from '$lib/integrations/ifoodSetup.js';
  import IfoodSetupWizard from './IfoodSetupWizard.svelte';

  // Owns every network call for the self-service iFood connection. The
  // wizard modal and this card's own status line are both pure renders of
  // `derived` (see `ifoodSetup.js`) — neither one keeps its own idea of
  // "what step we're on".
  let loading = true;
  let unavailable = false; // subscription/capability/service unavailable — hide entirely, don't dead-end the tab
  let connection = null;
  let health = null;
  let wizardOpen = false;
  let busy = false;
  let errorMessage = '';

  $: derived = deriveIfoodWizardState({ connection, health });
  $: discoveredMerchants = shapeDiscoveredMerchants(connection?.discoveredMerchants);

  // Auto-check while the wizard sits on "awaiting_authorization", so the
  // owner never has to remember to come back and click "Já autorizei,
  // verificar" — it activates on its own, usually within one tick of them
  // returning from the iFood tab. Silent: no busy spinner, no toast for the
  // routine "still pending" case; the manual button below keeps that
  // feedback for whoever clicks it directly.
  const AUTH_POLL_INTERVAL_MS = 10_000;
  let authPollTimer = null;

  function stopAuthPolling() {
    if (authPollTimer) {
      clearInterval(authPollTimer);
      authPollTimer = null;
    }
  }

  function startAuthPolling() {
    if (authPollTimer) return;
    void attemptAuthorizationCheck({ silent: true });
    authPollTimer = setInterval(() => {
      void attemptAuthorizationCheck({ silent: true });
    }, AUTH_POLL_INTERVAL_MS);
  }

  $: shouldPollAuthorization = wizardOpen && derived.state === 'awaiting_authorization' && !derived.expired;
  $: if (shouldPollAuthorization) startAuthPolling(); else stopAuthPolling();

  function handleVisibilityChange() {
    // The moment the tab regains focus is exactly when the owner is most
    // likely to have just finished authorizing on iFood's side.
    if (document.visibilityState === 'visible' && shouldPollAuthorization) {
      void attemptAuthorizationCheck({ silent: true });
    }
  }

  const STATE_BADGE_STYLE = {
    not_connected: { bg: 'var(--bg-input)', color: 'var(--text-muted)' },
    awaiting_authorization: { bg: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' },
    configuration_needed: { bg: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' },
    active: { bg: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' },
    attention: { bg: 'color-mix(in srgb, var(--error) 15%, transparent)', color: 'var(--error)' },
    paused: { bg: 'var(--bg-input)', color: 'var(--text-muted)' }
  };
  $: badgeStyle = STATE_BADGE_STYLE[derived.state] ?? STATE_BADGE_STYLE.not_connected;

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('unauthorized');
    return { authorization: `Bearer ${session.access_token}` };
  }

  async function loadStatus({ silent = false } = {}) {
    if (!silent) loading = true;
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/integrations/ifood/connection', { headers });
      if (res.status === 402 || res.status === 403 || res.status === 503) {
        // Not eligible (plan/trial), no capability, or backend not configured —
        // the card simply does not show itself rather than dead-ending the tab.
        unavailable = true;
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'unavailable');
      connection = body;
      unavailable = false;

      if (body.status === 'active' || body.status === 'degraded') {
        const healthRes = await fetch('/api/integrations/ifood/health', { headers });
        const healthBody = await healthRes.json().catch(() => ({}));
        health = healthRes.ok ? healthBody : null;
      } else {
        health = null;
      }
    } catch (e) {
      if (!silent) unavailable = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadStatus();
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onDestroy(() => {
    stopAuthPolling();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  function openWizard() {
    errorMessage = '';
    wizardOpen = true;
  }
  function closeWizard() {
    if (busy) return;
    wizardOpen = false;
    errorMessage = '';
  }

  async function runAction(fn) {
    busy = true;
    errorMessage = '';
    try {
      await fn();
    } catch (e) {
      errorMessage = e?.message === 'unauthorized'
        ? describeIfoodConnectionError('unauthorized')
        : describeIfoodConnectionError('unavailable');
    } finally {
      busy = false;
    }
  }

  async function handleConnect(event) {
    const { merchantId } = event.detail;
    await runAction(async () => {
      const headers = { ...(await authHeaders()), 'content-type': 'application/json' };
      const res = await fetch('/api/integrations/ifood/connection', {
        method: 'POST',
        headers,
        body: JSON.stringify({ merchantId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = describeIfoodConnectionError(body?.error, body);
        return;
      }
      connection = body;
      health = null;
      if (body.status === 'active') {
        addToast('Loja conectada e ativada!', 'success');
      } else {
        addToast('Loja identificada. Conclua a autorização no iFood.', 'success');
      }
    });
  }

  async function handleRestart(event) {
    await handleConnect(event);
  }

  /**
   * Shared by the manual "Já autorizei, verificar" button and the
   * background poll. `silent: true` (the poll/visibilitychange path) never
   * shows a spinner, never toasts the routine "still pending" 202, and
   * swallows a transient network error instead of surfacing it — the next
   * tick, or the next time the tab regains focus, just tries again.
   */
  async function attemptAuthorizationCheck({ silent }) {
    const state = connection?.authorization?.state;
    if (!state) {
      if (!silent) errorMessage = describeIfoodConnectionError('invalid_state');
      return;
    }
    let headers;
    try {
      headers = { ...(await authHeaders()), 'content-type': 'application/json' };
    } catch {
      if (!silent) errorMessage = describeIfoodConnectionError('unauthorized');
      return;
    }
    let res;
    try {
      res = await fetch('/api/integrations/ifood/authorization', {
        method: 'POST',
        headers,
        body: JSON.stringify({ state })
      });
    } catch {
      if (!silent) errorMessage = describeIfoodConnectionError('unavailable');
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 202) {
      if (!silent) addToast('Ainda aguardando confirmação do iFood. Tente novamente em instantes.', 'info');
      return;
    }
    if (!res.ok) {
      if (!silent) {
        errorMessage = describeIfoodConnectionError(body?.error, body);
      } else if (body?.error === 'authorization_expired') {
        await loadStatus({ silent: true });
      } else if (res.status >= 400 && res.status < 500) {
        // A 4xx during a silent background poll (e.g. the subscription
        // lapsed, or the session token is stale) will not resolve itself by
        // retrying every 10s -- stop hammering the endpoint. The manual
        // "Já autorizei, verificar" button still works and surfaces the
        // real error the next time the owner clicks it.
        stopAuthPolling();
      }
      return;
    }
    addToast('Conexão com o iFood ativada!', 'success');
    await loadStatus({ silent: true });
  }

  async function handleCheckAuthorization() {
    await runAction(() => attemptAuthorizationCheck({ silent: false }));
  }

  async function handleSetPrintOwner(event) {
    const { printOwner } = event.detail;
    await runAction(async () => {
      const headers = { ...(await authHeaders()), 'content-type': 'application/json' };
      const res = await fetch('/api/integrations/ifood/connection', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ printOwner })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = describeIfoodConnectionError(body?.error, body);
        return;
      }
      connection = { ...connection, printOwner: body.printOwner ?? printOwner };
      addToast(`Impressão dos pedidos iFood agora é responsabilidade de: ${printOwnerLabel(body.printOwner ?? printOwner)}.`, 'success');
    });
  }

  async function handleStatusAction(event) {
    const { action } = event.detail;
    if (action === 'delete') return handleDeleteConnection();
    await runAction(async () => {
      const headers = { ...(await authHeaders()), 'content-type': 'application/json' };
      const res = await fetch('/api/integrations/ifood/connection', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = describeIfoodConnectionError(body?.error, body);
        return;
      }
      await loadStatus({ silent: true });
      if (action === 'disconnect') {
        wizardOpen = false;
        addToast('Conexão com o iFood desconectada.', 'info');
      } else if (action === 'pause') {
        addToast('Conexão com o iFood pausada.', 'info');
      } else if (action === 'resume') {
        addToast('Conexão com o iFood retomada.', 'success');
      }
    });
  }

  /**
   * "Excluir configuração" — genuinely destructive (DELETE, not the PATCH
   * `disconnect` action above): erases the merchantId and its command/event
   * history server-side, confirmed already by the wizard before this fires.
   */
  async function handleDeleteConnection() {
    await runAction(async () => {
      const headers = await authHeaders();
      const res = await fetch('/api/integrations/ifood/connection', { method: 'DELETE', headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = describeIfoodConnectionError(body?.error, body);
        return;
      }
      wizardOpen = false;
      connection = null;
      health = null;
      addToast('Configuração da loja iFood excluída.', 'info');
    });
  }
</script>

{#if !unavailable}
  <section class="rounded-xl overflow-hidden" style="background: var(--bg-card); border: 1px solid var(--border-card);">
    <div class="p-5 flex items-center gap-4">
      <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs" style="background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary);">
        iF
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-base font-semibold" style="color: var(--text-main);">iFood</h2>
          {#if !loading}
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background: {badgeStyle.bg}; color: {badgeStyle.color};">
              {IFOOD_STATE_LABELS[derived.state]}
            </span>
          {/if}
        </div>
        <p class="text-sm mt-0.5 truncate" style="color: var(--text-muted);">
          {#if derived.state === 'not_connected'}
            Receba e opere pedidos do iFood direto no ZeloPDV.
          {:else if derived.merchantId}
            Loja: {derived.merchantId}
          {:else}
            Verificando conexão…
          {/if}
        </p>
      </div>
      <button
        type="button"
        on:click={openWizard}
        disabled={loading}
        class="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
        style="background: var(--primary); color: var(--primary-text);"
      >{derived.state === 'not_connected' ? 'Conectar' : 'Gerenciar'}</button>
    </div>
  </section>

  <IfoodSetupWizard
    open={wizardOpen}
    {derived}
    {busy}
    {errorMessage}
    {discoveredMerchants}
    on:close={closeWizard}
    on:connect={handleConnect}
    on:restart={handleRestart}
    on:checkAuthorization={handleCheckAuthorization}
    on:setPrintOwner={handleSetPrintOwner}
    on:action={handleStatusAction}
  />
{/if}
