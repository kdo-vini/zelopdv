<script>
  import { onMount } from 'svelte';
  import { Sparkles, X } from 'lucide-svelte';
  import { captureAcquisitionOrigin } from '$lib/attribution/client';
  import { SITE_NAME } from '$lib/seo/site';
  import { getAiSourceById } from '$lib/attribution/aiSources';
  import { TRIAL_DAYS } from '$lib/pricing';
  import { getSignupHref, trackSignupCta } from '$lib/marketing/signupCta';
  import { capturePostHogEvent } from '$lib/posthogClient';

  const STORAGE_KEY = 'zelo_ai_referral_banner_dismissed';

  // Só existe depois do mount (a origem armazenada é client-only; renderizar
  // no server causaria hydration mismatch). Fica null até resolver.
  let aiSourceId = null;
  let label = '';
  let visible = false;

  function isDismissed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function dismiss() {
    visible = false;
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // modo privado / storage cheio: some só nesta sessão, sem persistir
    }
  }

  function handleCtaClick() {
    void capturePostHogEvent('ai_referral_banner_clicked', { ai_source: aiSourceId });
    trackSignupCta('ai_referral_banner', { ai_source: aiSourceId });
  }

  onMount(() => {
    if (isDismissed()) return;

    // O onMount do layout (que grava o first touch) roda depois do onMount das
    // páginas filhas; capturar aqui garante a origem já na primeira visita.
    // Idempotente: se já houver origem salva, só devolve a existente.
    const origem = captureAcquisitionOrigin();
    const id = origem?.ai_source;
    if (!id) return;

    const source = getAiSourceById(id);
    if (!source) return;

    aiSourceId = id;
    label = source.label;
    visible = true;
    void capturePostHogEvent('ai_referral_banner_viewed', { ai_source: aiSourceId });
  });
</script>

{#if visible}
  <div class="ai-referral-banner" role="note">
    <div class="ai-referral-inner">
      <div class="ai-referral-text">
        <Sparkles class="size-4 ai-referral-icon" aria-hidden="true" />
        <span>
          Chegou pelo {label}? Teste o {SITE_NAME} por {TRIAL_DAYS} dias grátis, sem cartão.
        </span>
      </div>
      <div class="ai-referral-actions">
        <a
          href={getSignupHref()}
          class="ai-referral-cta"
          on:click={handleCtaClick}
        >
          Começar grátis
        </a>
        <button
          type="button"
          class="ai-referral-dismiss"
          aria-label="Fechar aviso"
          on:click={dismiss}
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Aviso flutuante no canto inferior esquerdo: o SiteHeader é fixo no topo e
     cobriria uma faixa no fluxo; o canto direito fica livre pro botão de chat. */
  .ai-referral-banner {
    position: fixed;
    z-index: 40;
    left: 1rem;
    bottom: 1rem;
    max-width: min(26rem, calc(100vw - 6rem));
    border: 1px solid var(--marketing-dark-border);
    border-radius: 0.875rem;
    background: var(--marketing-dark-panel);
    box-shadow: 0 12px 32px color-mix(in srgb, var(--marketing-dark) 60%, transparent);
  }

  .ai-referral-inner {
    padding: 0.75rem 0.875rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.625rem 0.75rem;
  }

  .ai-referral-text {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    flex: 1 1 14rem;
    font-size: 0.875rem;
    color: var(--marketing-dark-muted);
    line-height: 1.4;
  }

  :global(.ai-referral-icon) {
    color: var(--marketing-paper);
    flex-shrink: 0;
  }

  .ai-referral-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .ai-referral-cta {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--marketing-paper);
    background: var(--marketing-action);
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .ai-referral-cta:hover {
    background: color-mix(in srgb, var(--marketing-action) 85%, var(--marketing-paper));
  }

  .ai-referral-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--marketing-dark-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.3rem;
    border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }

  .ai-referral-dismiss:hover {
    color: var(--marketing-paper);
    background: color-mix(in srgb, var(--marketing-dark-muted) 16%, transparent);
  }
</style>
