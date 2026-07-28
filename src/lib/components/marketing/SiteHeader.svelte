<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { Menu, Sparkles, X } from 'lucide-svelte';

  export let topOffset = 'top-0';
  export let easterDays = 0;
  export let localAnchors = false;

  let showMobileMenu = false;

  onMount(() => {
    const handleKeydown = (event) => {
      if (event.key === 'Escape') showMobileMenu = false;
    };

    window.addEventListener('keydown', handleKeydown);

    return () => window.removeEventListener('keydown', handleKeydown);
  });

  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = showMobileMenu ? 'hidden' : '';
  }

  $: useLocal = localAnchors || $page.url.pathname === '/';
  $: featuresHref = useLocal ? '#features' : '/#features';
  $: pricingHref = useLocal ? '#pricing' : '/#pricing';
  $: faqHref = useLocal ? '#faq' : '/#faq';
</script>

<nav class="site-nav {topOffset}" aria-label="Navegação principal">
  <div class="site-nav-inner">
    <a href="/" class="brand-link" aria-label="Zelo PDV, página inicial">
      <img src="/logo-horizontal.webp" alt="Zelo PDV" class="site-logo" />
    </a>

    <div class="desktop-nav">
      <a href={featuresHref}>Funcionalidades</a>
      <a href="/extensoes">Extensões</a>
      <a href={pricingHref}>Preços</a>
      <a href="/blog">Blog</a>
      <a href={faqHref}>Dúvidas</a>
    </div>

    <div class="header-actions">
      {#if easterDays > 0}
        <a href="/pascoa" class="easter-link">
          <Sparkles class="size-3.5" aria-hidden="true" />
          <span>Páscoa em {easterDays} {easterDays === 1 ? 'dia' : 'dias'}</span>
        </a>
      {/if}
      <a href="/login" class="login-link">Entrar</a>
      <a href="/cadastro" class="site-nav-cta">Testar 14 dias grátis</a>
      <button
        class="mobile-menu-button"
        aria-label={showMobileMenu ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={showMobileMenu}
        aria-controls="mobile-menu-panel"
        on:click={() => showMobileMenu = !showMobileMenu}
      >
        {#if showMobileMenu}
          <X class="size-5" aria-hidden="true" />
        {:else}
          <Menu class="size-5" aria-hidden="true" />
        {/if}
      </button>
    </div>
  </div>

  {#if showMobileMenu}
    <div id="mobile-menu-panel" class="mobile-menu-panel" aria-label="Menu móvel">
      <a href={featuresHref} on:click={() => showMobileMenu = false}>Funcionalidades</a>
      <a href="/extensoes" on:click={() => showMobileMenu = false}>Extensões</a>
      <a href={pricingHref} on:click={() => showMobileMenu = false}>Preços</a>
      <a href="/blog" on:click={() => showMobileMenu = false}>Blog</a>
      <a href={faqHref} on:click={() => showMobileMenu = false}>Dúvidas</a>
      <div class="mobile-actions">
        <a href="/login" on:click={() => showMobileMenu = false}>Entrar</a>
        <a href="/cadastro" class="mobile-primary" on:click={() => showMobileMenu = false}>Testar 14 dias grátis</a>
      </div>
    </div>
  {/if}
</nav>

<style>
  .site-nav {
    position: fixed;
    z-index: 50;
    width: 100%;
    border-bottom: 1px solid var(--marketing-dark-border);
    background: color-mix(in srgb, var(--marketing-dark) 96%, transparent);
  }

  .site-nav-inner {
    display: grid;
    grid-template-columns: 11rem 1fr auto;
    align-items: center;
    gap: 2rem;
    width: min(100% - 3rem, 80rem);
    height: 4.5rem;
    margin-inline: auto;
  }

  .brand-link {
    display: inline-flex;
    align-items: center;
    width: fit-content;
  }

  .site-logo {
    display: block;
    width: 8rem;
    height: 3rem;
    object-fit: cover;
    object-position: center;
  }

  .desktop-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(1.25rem, 2.2vw, 2.25rem);
  }

  .desktop-nav a,
  .login-link {
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
    font-weight: 600;
    transition: color 180ms ease;
  }

  .desktop-nav a:hover,
  .login-link:hover {
    color: var(--text-main);
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
  }

  .easter-link {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--link);
    font-size: 0.625rem;
    font-weight: 600;
  }

  .site-nav-cta,
  .mobile-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding-inline: 1.25rem;
    border-radius: 999px;
    background: var(--marketing-action);
    color: var(--primary-text);
    font-size: 0.875rem;
    font-weight: 700;
    white-space: nowrap;
    transition: background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
  }

  .site-nav-cta:hover,
  .mobile-primary:hover {
    background: var(--marketing-action);
    box-shadow: 0 10px 20px -10px color-mix(in srgb, var(--primary) 72%, transparent);
    transform: translateY(-1px);
  }

  .site-nav-cta:active,
  .mobile-primary:active {
    transform: translateY(1px);
  }

  .mobile-menu-button {
    display: none;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid var(--marketing-dark-border);
    border-radius: 0.75rem;
    background: var(--marketing-dark-panel);
    color: var(--text-main);
  }

  .mobile-menu-panel {
    display: none;
  }

  @media (min-width: 1600px) {
    .site-nav-inner {
      width: min(calc(100% - 6rem), 96rem);
    }
  }

  .site-nav a:focus-visible,
  .site-nav button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }

  @media (max-width: 900px) {
    .site-nav-inner {
      grid-template-columns: 1fr auto;
      width: min(100% - 2rem, 80rem);
    }

    .desktop-nav,
    .login-link,
    .site-nav-cta,
    .easter-link {
      display: none;
    }

    .mobile-menu-button {
      display: inline-flex;
    }

    .mobile-menu-panel {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.75rem 1rem 1.25rem;
      border-top: 1px solid var(--marketing-dark-border);
      background: var(--marketing-dark-soft);
    }

    .mobile-menu-panel > a,
    .mobile-actions > a:first-child {
      min-height: 2.75rem;
      padding: 0.75rem;
      color: var(--marketing-dark-muted);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .mobile-actions {
      display: grid;
      gap: 0.5rem;
      margin-top: 0.5rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--marketing-dark-border);
    }

    .mobile-actions > a:first-child {
      text-align: center;
    }

    .mobile-primary {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .site-nav-cta,
    .mobile-primary {
      transition: none;
    }

    .site-nav-cta:hover,
    .site-nav-cta:active,
    .mobile-primary:hover,
    .mobile-primary:active {
      transform: none;
    }
  }
</style>
