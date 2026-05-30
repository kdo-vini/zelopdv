<svelte:head>
  <title>Pagamento Recebido | Zelo PDV</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { trackGoogleAdsAssinatura, waitForGtag } from '$lib/googleAds';

  const REDIRECT_DELAY_MS = 4500;
  const GOOGLE_CALLBACK_TIMEOUT_MS = 3000;

  let hasTracked = false;
  let countdownMs = REDIRECT_DELAY_MS;
  let redirectTimer = null;
  let countdownTimer = null;

  $: valueParam = Number($page.url.searchParams.get('value'));
  $: conversionValue = Number.isFinite(valueParam) && valueParam > 0 ? valueParam : null;
  $: source = $page.url.searchParams.get('source') || 'checkout';
  $: conversionKey = [
    source,
    $page.url.searchParams.get('session_id') || '',
    $page.url.searchParams.get('payment_id') || '',
    $page.url.searchParams.get('legacy') || '',
  ].join(':');
  $: transactionId = $page.url.searchParams.get('session_id')
    || $page.url.searchParams.get('payment_id')
    || conversionKey;
  $: countdownSeconds = Math.max(1, Math.ceil(countdownMs / 1000));

  function goToDashboard() {
    if (typeof window !== 'undefined' && window.location.pathname !== '/gestao') {
      window.location.href = '/gestao';
    }
  }

  async function trackConversionOnce() {
    if (typeof window === 'undefined' || hasTracked) return;

    const storageKey = `zelo_google_ads_assinatura_conversion:v2:${conversionKey || 'default'}`;
    if (window.sessionStorage.getItem(storageKey) === '1') {
      hasTracked = true;
      redirectTimer = window.setTimeout(goToDashboard, 1000);
      return;
    }

    const hasGoogleTag = await waitForGtag({ attempts: 20, intervalMs: 150 });

    let googleCallbackFired = false;
    const trackedGoogle = hasGoogleTag && trackGoogleAdsAssinatura({
      ...(conversionValue ? { value: conversionValue, currency: 'BRL' } : {}),
      transaction_id: transactionId,
      transport_type: 'beacon',
      event_timeout: GOOGLE_CALLBACK_TIMEOUT_MS,
      event_callback: () => {
        googleCallbackFired = true;
        window.sessionStorage.setItem(storageKey, '1');
        goToDashboard();
      },
    });

    window.setTimeout(() => {
      if (!googleCallbackFired) goToDashboard();
    }, GOOGLE_CALLBACK_TIMEOUT_MS + 400);

    hasTracked = true;
  }

  onMount(() => {
    trackConversionOnce();

    countdownTimer = window.setInterval(() => {
      countdownMs = Math.max(0, countdownMs - 100);
    }, 100);

    redirectTimer = window.setTimeout(goToDashboard, REDIRECT_DELAY_MS + 2500);
  });

  onDestroy(() => {
    if (redirectTimer) clearTimeout(redirectTimer);
    if (countdownTimer) clearInterval(countdownTimer);
  });
</script>

<section class="success-shell">
  <div class="success-card">
    <div class="success-badge">
      <span class="badge-dot"></span>
      Pagamento confirmado
    </div>

    <div class="icon-wrap" aria-hidden="true">
      <svg viewBox="0 0 64 64" class="success-icon">
        <circle cx="32" cy="32" r="30" class="icon-ring"></circle>
        <path d="M20 32.5 28 40.5 45 23.5" class="icon-check"></path>
      </svg>
    </div>

    <h1>Seu pagamento foi recebido!</h1>
    <p class="lead">
      Obrigado pela confiança. Sua assinatura do Zelo foi confirmada e estamos te redirecionando para o sistema.
    </p>

    <div class="status-row">
      <div class="status-copy">
        <strong>Redirecionando para o dashboard</strong>
        <span>Isso leva só alguns instantes.</span>
      </div>
      <div class="countdown-pill" aria-live="polite">
        {countdownSeconds}s
      </div>
    </div>

    <div class="progress-track" aria-hidden="true">
      <div class="progress-bar"></div>
    </div>

    <div class="actions">
      <a href="/gestao" class="primary-action">Ir para o sistema agora</a>
    </div>
  </div>
</section>

<style>
  .success-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 45%),
      var(--bg-app);
  }

  .success-card {
    width: min(100%, 680px);
    padding: 2rem;
    border: 1px solid var(--border-card);
    border-radius: 24px;
    background: color-mix(in srgb, var(--bg-card) 92%, var(--bg-panel));
    box-shadow: 0 24px 80px color-mix(in srgb, var(--bg-app) 70%, transparent);
    display: grid;
    gap: 1.25rem;
  }

  .success-badge {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--text-label);
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .badge-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: var(--success);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--success) 18%, transparent);
  }

  .icon-wrap {
    width: 5.5rem;
    height: 5.5rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--success) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
  }

  .success-icon {
    width: 3.5rem;
    height: 3.5rem;
  }

  .icon-ring {
    fill: none;
    stroke: color-mix(in srgb, var(--success) 30%, transparent);
    stroke-width: 2.5;
  }

  .icon-check {
    fill: none;
    stroke: var(--success);
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.05;
    color: var(--text-main);
  }

  .lead {
    margin: 0;
    max-width: 54ch;
    font-size: 1.05rem;
    line-height: 1.7;
    color: var(--text-muted);
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border-radius: 18px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-panel) 70%, transparent);
  }

  .status-copy {
    display: grid;
    gap: 0.2rem;
  }

  .status-copy strong {
    color: var(--text-main);
    font-size: 0.98rem;
  }

  .status-copy span {
    color: var(--text-muted);
    font-size: 0.92rem;
  }

  .countdown-pill {
    min-width: 3.2rem;
    padding: 0.6rem 0.8rem;
    border-radius: 999px;
    text-align: center;
    font-weight: 700;
    color: var(--text-main);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .progress-track {
    width: 100%;
    height: 0.65rem;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, var(--bg-panel) 72%, transparent);
  }

  .progress-bar {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--accent) 75%, white 0%),
      color-mix(in srgb, var(--success) 72%, white 0%)
    );
    transform-origin: left center;
    animation: drain 1.8s linear forwards;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    padding: 0.9rem 1.25rem;
    border-radius: 14px;
    text-decoration: none;
    font-weight: 700;
    color: var(--primary-text);
    background: var(--accent);
    transition: filter 0.2s ease, transform 0.2s ease;
  }

  .primary-action:hover {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }

  @keyframes drain {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }

  @media (max-width: 640px) {
    .success-card {
      padding: 1.5rem;
      border-radius: 20px;
    }

    .status-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .countdown-pill {
      min-width: 0;
    }

    .actions {
      width: 100%;
    }

    .primary-action {
      width: 100%;
    }
  }
</style>
