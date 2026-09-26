<script>
  import { zeloSurface } from '$lib/theme/surface';
  import ZeloMark from '$lib/components/zelo/ZeloMark.svelte';
  /** @type {string} */
  export let title = '';
  /** @type {string} */
  export let subtitle = '';
</script>

<svelte:head>
  <title>{title ? `${title} — Zelo PDV` : 'Zelo PDV'}</title>
</svelte:head>

{#if $zeloSurface}
  <!-- Zelo Design System (Fase 3): navy page (brand surface), light form card (data-surface="app").
       Same slots and props as the legacy branch below. docs/DESIGN_SYSTEM.md → Autenticação. -->
  <div class="auth-page zelo">
    <a href="/" class="zauth-brand" aria-label="Zelo PDV — página inicial">
      <span class="zauth-mark"><ZeloMark size={26} /></span>
      <span class="zauth-word">Zelo<small>PDV</small></span>
    </a>

    <div class="auth-card zauth-card" data-surface="app">
      {#if title}
        <h1 class="zauth-title">{title}</h1>
      {/if}
      {#if subtitle}
        <p class="zauth-subtitle">{subtitle}</p>
      {/if}

      <slot />

      {#if $$slots.footer}
        <div class="auth-footer zauth-footer">
          <slot name="footer" />
        </div>
      {/if}
    </div>
  </div>
{:else}
<div class="auth-page">
  <!-- Subtle radial glow (CSS-only, zero images) -->
  <div class="auth-glow" aria-hidden="true"></div>

  <div class="auth-card">
    <!-- Logo -->
    <a href="/" class="auth-logo">
      <img src="/logo-horizontal.webp" alt="Zelo PDV" class="auth-logo-img" />
    </a>

    {#if title}
      <h1 class="auth-title">{title}</h1>
    {/if}
    {#if subtitle}
      <p class="auth-subtitle">{subtitle}</p>
    {/if}

    <slot />

    {#if $$slots.footer}
      <div class="auth-footer">
        <slot name="footer" />
      </div>
    {/if}
  </div>
</div>
{/if}

<style>
  /* ── Full-page background ── */
  .auth-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    padding: 1rem;
    position: relative;
    overflow-x: hidden;
    overflow-y: auto;
    background: linear-gradient(160deg, var(--bg-app) 0%, var(--bg-panel) 100%);
  }

  /* Radial glow behind the card */
  .auth-glow {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Glassmorphism card ── */
  .auth-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 420px;
    background: var(--bg-panel);
    border: 1px solid var(--border-subtle);
    border-radius: 1rem;
    padding: 2rem 1.75rem;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--primary) 4%, transparent),
      0 8px 24px rgba(0,0,0,0.35),
      0 2px 8px rgba(0,0,0,0.2);
  }

  /* ── Logo ── */
  .auth-logo {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }
  .auth-logo-img {
    height: 7rem;
    width: auto;
  }

  /* ── Typography ── */
  .auth-title {
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--text-main);
    text-align: center;
    margin: 0 0 0.25rem;
    line-height: 1.3;
  }

  .auth-subtitle {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
    margin: 0 0 1.5rem;
    line-height: 1.5;
  }

  .auth-title + :global(*:not(.auth-subtitle)) {
    margin-top: 1.5rem;
  }

  /* ── Footer links ── */
  .auth-footer {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(51, 65, 85, 0.4);
    text-align: center;
    font-size: 0.875rem;
  }

  /* ── Mobile full-width ── */
  @media (max-width: 480px) {
    .auth-page {
      padding: 0;
      align-items: flex-start;
    }
    .auth-card {
      max-width: 100%;
      border-radius: 0;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 2rem 1.25rem;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      border-left: none;
      border-right: none;
    }
    .auth-glow {
      width: 300px;
      height: 300px;
    }
  }

  /* ═══ Zelo Design System (only rendered when $zeloSurface); colour and type only through tokens ═══ */
  .auth-page.zelo {
    flex-direction: column;
    gap: 28px;
    padding: 40px 16px;
    background: var(--bg-app);
    color: var(--text-main);
    font-family: var(--zelo-font-ui);
  }
  .zauth-brand { display: inline-flex; align-items: center; gap: 12px; color: var(--text-main); text-decoration: none; }
  .zauth-brand:focus-visible { outline: none; border-radius: var(--zelo-radius-control); box-shadow: 0 0 0 4px var(--focus); }
  .zauth-mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--primary); color: var(--primary-text); }
  .zauth-word { font: var(--type-title); letter-spacing: var(--type-title-tracking); }
  .zauth-word small { margin-left: 6px; font: var(--type-eyebrow); letter-spacing: var(--type-eyebrow-tracking); color: var(--text-muted); }
  .zauth-card {
    position: relative;
    width: 100%;
    max-width: 440px;
    padding: 32px 28px 28px;
    border: 1px solid var(--border-card);
    border-radius: var(--zelo-radius-sheet);
    background: var(--bg-panel);
    color: var(--text-main);
    box-shadow: var(--elevation-float);
  }
  .zauth-title { margin: 0; text-align: center; font: var(--type-title); letter-spacing: var(--type-title-tracking); color: var(--text-main); }
  .zauth-subtitle { margin: 8px 0 24px; text-align: center; font: var(--type-body); letter-spacing: var(--type-body-tracking); color: var(--text-muted); }
  .zauth-title + :global(*:not(.zauth-subtitle)) { margin-top: 24px; }
  .zauth-footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-subtle); text-align: center; font: var(--type-label); letter-spacing: var(--type-label-tracking); }

  @media (max-width: 480px) {
    .auth-page.zelo { align-items: center; justify-content: flex-start; gap: 20px; padding: 28px 0 0; }
    .zauth-card { align-self: stretch; }
    .zauth-card {
      flex: 1;
      max-width: 100%;
      padding: 28px 20px calc(24px + env(safe-area-inset-bottom));
      border-width: 1px 0 0;
      border-radius: var(--zelo-radius-sheet) var(--zelo-radius-sheet) 0 0;
    }
  }
</style>
