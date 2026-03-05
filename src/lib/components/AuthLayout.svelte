<script>
  /** @type {string} */
  export let title = '';
  /** @type {string} */
  export let subtitle = '';
</script>

<div class="auth-page">
  <!-- Subtle radial glow (CSS-only, zero images) -->
  <div class="auth-glow" aria-hidden="true"></div>

  <div class="auth-card">
    <!-- Logo -->
    <a href="/" class="auth-logo">
      <img src="/logo-zelo.svg" alt="Zelo PDV" class="auth-logo-img" />
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
    overflow: hidden;
    background: linear-gradient(160deg, #070d1a 0%, #0f172a 40%, #0c1425 70%, #091120 100%);
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
    background: rgba(30, 41, 59, 0.65);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(51, 65, 85, 0.5);
    border-radius: 1rem;
    padding: 2rem 1.75rem;
    box-shadow:
      0 0 0 1px rgba(14,165,233,0.04),
      0 8px 32px rgba(0,0,0,0.35),
      0 2px 8px rgba(0,0,0,0.2);
  }

  /* ── Logo ── */
  .auth-logo {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }
  .auth-logo-img {
    height: 2.5rem;
    width: auto;
  }

  /* ── Typography ── */
  .auth-title {
    font-size: 1.375rem;
    font-weight: 700;
    color: #f8fafc;
    text-align: center;
    margin: 0 0 0.25rem;
    line-height: 1.3;
  }

  .auth-subtitle {
    font-size: 0.875rem;
    color: #94a3b8;
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
      justify-content: center;
      border-left: none;
      border-right: none;
    }
    .auth-glow {
      width: 300px;
      height: 300px;
    }
  }
</style>
