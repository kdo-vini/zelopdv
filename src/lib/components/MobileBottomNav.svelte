<script>
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import { cubicOut } from 'svelte/easing';
  import { onMount, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import SidebarBadge from '$lib/components/gerente/SidebarBadge.svelte';
  import {
    getActiveNavigationSectionId,
    getVisibleNavigationSections,
    isNavigationItemActive,
  } from '$lib/navigation/appNavigation';

  export let sections = [];
  export let pathname = '';
  export let navigationContext = {};
  export let companyLogoUrl = null;
  export let displayName = '';
  export let avatarLetter = 'Z';
  export let unreadCount = 0;
  export let hasUnreadCritical = false;
  export let supportOpen = false;
  export let onSupport = () => {};
  export let onLogout = () => {};

  let openSectionId = null;
  let panelElement;
  let lastTrigger;
  let prefersReducedMotion = false;
  let keyboardOpen = false;

  $: visibleSections = getVisibleNavigationSections(navigationContext).filter((section) =>
    sections.some((candidate) => candidate.id === section.id)
  );
  $: activeSectionId = getActiveNavigationSectionId(pathname);
  $: openSection = visibleSections.find((section) => section.id === openSectionId) || null;

  function setRootNavigationState(enabled) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('has-mobile-bottom-nav', enabled);
  }

  function setKeyboardState(enabled) {
    keyboardOpen = enabled;
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('mobile-keyboard-open', enabled);
  }

  function closePanel({ restoreFocus = false } = {}) {
    if (!openSectionId) return;
    openSectionId = null;
    if (restoreFocus) void tick().then(() => lastTrigger?.focus());
  }

  async function toggleSection(sectionId, event) {
    const openingWithKeyboard = event?.detail === 0;
    lastTrigger = event?.currentTarget || lastTrigger;

    if (openSectionId === sectionId) {
      closePanel({ restoreFocus: true });
      return;
    }

    openSectionId = sectionId;
    if (openingWithKeyboard) {
      await tick();
      panelElement?.querySelector('a, button:not([disabled])')?.focus();
    }
  }

  function activateAction(item) {
    closePanel();
    if (item.action === 'support') onSupport();
    if (item.action === 'logout') void onLogout();
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !openSectionId) return;
    event.preventDefault();
    closePanel({ restoreFocus: true });
  }

  beforeNavigate(({ type, cancel }) => {
    if (type !== 'popstate' || !openSectionId) return;
    cancel();
    closePanel({ restoreFocus: true });
  });

  afterNavigate(() => closePanel());

  onMount(() => {
    setRootNavigationState(true);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { prefersReducedMotion = motionQuery.matches; };
    updateMotion();
    motionQuery.addEventListener?.('change', updateMotion);

    const viewport = window.visualViewport;
    const updateKeyboard = () => {
      if (!viewport) return setKeyboardState(false);
      setKeyboardState(window.innerHeight - viewport.height > 180);
      if (keyboardOpen) closePanel();
    };
    viewport?.addEventListener('resize', updateKeyboard);
    updateKeyboard();

    return () => {
      motionQuery.removeEventListener?.('change', updateMotion);
      viewport?.removeEventListener('resize', updateKeyboard);
      setKeyboardState(false);
      setRootNavigationState(false);
    };
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if !keyboardOpen}
  {#if openSection}
    <button
      class="mobile-nav-backdrop"
      type="button"
      tabindex="-1"
      aria-label="Fechar menu de navegação"
      on:click={() => closePanel({ restoreFocus: true })}
      transition:fade={{ duration: prefersReducedMotion ? 0 : 160 }}
    ></button>

    <section
      bind:this={panelElement}
      id={`mobile-nav-panel-${openSection.id}`}
      class="mobile-nav-panel"
      aria-label={openSection.label}
      transition:fly={{ y: prefersReducedMotion ? 0 : 24, duration: prefersReducedMotion ? 0 : 220, easing: cubicOut }}
    >
      <div class="panel-handle" aria-hidden="true"></div>
      <div class="panel-heading">
        <svelte:component this={openSection.icon} class="size-5" aria-hidden="true" />
        <h2>{openSection.label}</h2>
      </div>

      {#if openSection.id === 'perfil'}
        <div class="company-identity">
          <div class="company-avatar" aria-hidden="true">
            {#if companyLogoUrl}
              <img src={companyLogoUrl} alt="" />
            {:else}
              {avatarLetter}
            {/if}
          </div>
          <div class="company-copy">
            <span>Estabelecimento atual</span>
            <strong>{displayName || 'ZeloPDV'}</strong>
          </div>
        </div>
      {/if}

      {#if openSection.items.length > 0}
        <div class="panel-grid">
          {#each openSection.items as item}
            {@const itemActive = isNavigationItemActive(item, pathname) || (item.action === 'support' && supportOpen)}
            {#if item.href}
              <a
                href={item.href}
                class:active={itemActive}
                class="panel-item"
                aria-current={itemActive ? 'page' : undefined}
                on:click={() => closePanel()}
              >
                <svelte:component this={item.icon} class="size-5" aria-hidden="true" />
                <span>{item.label}</span>
                {#if item.badge === 'gerente'}
                  <SidebarBadge count={unreadCount} hasCritical={hasUnreadCritical} />
                {/if}
              </a>
            {:else}
              <button
                type="button"
                class:active={itemActive}
                class:destructive={item.destructive}
                class="panel-item"
                aria-pressed={item.action === 'support' ? supportOpen : undefined}
                on:click={() => activateAction(item)}
              >
                <svelte:component this={item.icon} class="size-5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            {/if}
          {/each}
        </div>
      {:else}
        <p class="panel-loading" role="status">
          {navigationContext.accessLoaded ? 'Nenhuma página disponível para seu acesso.' : 'Carregando acessos…'}
        </p>
      {/if}
    </section>
  {/if}

  <nav class="mobile-bottom-navigation" aria-label="Navegação principal">
    {#each visibleSections as section}
      {@const routeActive = activeSectionId === section.id}
      {@const expanded = openSectionId === section.id}
      <button
        type="button"
        class:route-active={routeActive}
        class:expanded
        class="mobile-nav-section"
        aria-expanded={expanded}
        aria-controls={`mobile-nav-panel-${section.id}`}
        aria-current={routeActive ? 'page' : undefined}
        on:click={(event) => toggleSection(section.id, event)}
      >
        <span class="section-indicator" aria-hidden="true"></span>
        <svelte:component this={section.icon} class="size-5" aria-hidden="true" />
        <span>{section.label}</span>
      </button>
    {/each}
  </nav>
{/if}

<style>
  .mobile-bottom-navigation,
  .mobile-nav-panel,
  .mobile-nav-backdrop {
    display: none;
  }

  @media (max-width: 767px) {
    .mobile-bottom-navigation {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      /* A navegação global permanece operável sobre modais da rota, como Abrir Caixa. */
      z-index: 1100;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      height: var(--mobile-bottom-nav-safe-height);
      padding-inline: env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: var(--bg-card);
      border-top: 1px solid var(--border-subtle);
    }

    .mobile-nav-section {
      position: relative;
      display: flex;
      min-width: 0;
      min-height: var(--mobile-bottom-nav-height);
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.375rem 0.125rem;
      color: var(--text-muted);
      font: inherit;
      font-size: 0.625rem;
      font-weight: 650;
      line-height: 1;
      transition: color 180ms ease-out, background 180ms ease-out;
    }

    .mobile-nav-section.expanded {
      background: color-mix(in srgb, var(--bg-panel) 72%, transparent);
      color: var(--text-label);
    }

    .mobile-nav-section.route-active {
      color: var(--primary);
    }

    .section-indicator {
      position: absolute;
      top: 0;
      left: 50%;
      width: 1.75rem;
      height: 2px;
      border-radius: 0 0 2px 2px;
      background: transparent;
      transform: translateX(-50%);
    }

    .route-active .section-indicator {
      background: var(--primary);
    }

    .mobile-nav-section:focus-visible,
    .panel-item:focus-visible,
    .mobile-nav-backdrop:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }

    .mobile-nav-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1090;
      display: block;
      width: 100%;
      height: 100%;
      background: color-mix(in srgb, var(--bg-app) 58%, transparent);
      border: 0;
      backdrop-filter: blur(2px);
    }

    .mobile-nav-panel {
      position: fixed;
      inset-inline: 0;
      bottom: var(--mobile-bottom-nav-safe-height);
      z-index: 1100;
      display: block;
      max-height: min(60dvh, 30rem);
      padding: 0.5rem max(1rem, env(safe-area-inset-right, 0px)) 1rem max(1rem, env(safe-area-inset-left, 0px));
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-bottom: 0;
      border-radius: 16px 16px 0 0;
    }

    .panel-handle {
      width: 2.5rem;
      height: 4px;
      margin: 0 auto 0.625rem;
      border-radius: 9999px;
      background: var(--border-strong);
    }

    .panel-heading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      color: var(--text-main);
    }

    .panel-heading h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }

    .panel-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    .panel-item {
      display: grid;
      grid-template-columns: 1.25rem minmax(0, 1fr) auto;
      min-height: 3.5rem;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.75rem;
      border: 1px solid transparent;
      border-radius: 12px;
      background: var(--bg-card);
      color: var(--text-label);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.25;
      text-align: left;
      transition: background 180ms ease-out, border-color 180ms ease-out, color 180ms ease-out;
    }

    .panel-item:hover {
      border-color: var(--border-strong);
    }

    .panel-item:only-child {
      grid-column: 1 / -1;
    }

    .panel-item.active {
      background: color-mix(in srgb, var(--primary) 10%, var(--bg-card));
      border-color: color-mix(in srgb, var(--primary) 45%, var(--border-subtle));
      color: var(--primary);
    }

    .panel-item.destructive {
      color: var(--status-error-text);
    }

    .company-identity {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 12px;
    }

    .company-avatar {
      display: flex;
      width: 2.75rem;
      height: 2.75rem;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 50%;
      background: var(--accent-light);
      color: var(--primary);
      font-size: 0.875rem;
      font-weight: 800;
    }

    .company-avatar img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: var(--bg-input);
    }

    .company-copy {
      display: grid;
      min-width: 0;
      gap: 0.125rem;
    }

    .company-copy span {
      color: var(--text-muted);
      font-size: 0.6875rem;
    }

    .company-copy strong {
      display: -webkit-box;
      overflow: hidden;
      color: var(--text-main);
      font-size: 0.9375rem;
      line-height: 1.25;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .panel-loading {
      min-height: 3.5rem;
      margin: 0;
      padding: 1rem;
      color: var(--text-muted);
      font-size: 0.8125rem;
      text-align: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-nav-section,
    .panel-item {
      transition-duration: 1ms;
    }
  }

  /* ── Zelo Design System, superfície app (mockup zelopdv-app-mobile.html) ──
     Barra clara com filete superior; inativos em --text-muted; ativo navy com
     pílula suave (navy 8%) atrás do ícone; rótulos 11px; selos em mono.
     A pílula reaproveita .section-indicator (mesma marcação do legado). */
  @media (max-width: 767px) {
    :global([data-surface="app"]) .mobile-bottom-navigation {
      background: var(--bg-panel);
      border-top-color: var(--border-subtle);
    }

    :global([data-surface="app"]) .mobile-nav-section {
      justify-content: flex-start;
      gap: 4px;
      padding: 10px 2px 6px;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0;
      transition: color var(--zelo-dur-fast) var(--zelo-ease-out);
    }

    :global([data-surface="app"]) .mobile-nav-section :global(svg) {
      position: relative;
      z-index: 1;
      stroke-width: 1.75;
    }

    :global([data-surface="app"]) .mobile-nav-section.expanded {
      background: transparent;
      color: var(--text-main);
    }

    :global([data-surface="app"]) .mobile-nav-section.route-active {
      color: var(--text-main);
    }

    :global([data-surface="app"]) .section-indicator {
      top: 5px;
      width: 52px;
      height: 30px;
      border-radius: var(--zelo-radius-pill);
      background: transparent;
      transition: background var(--zelo-dur-fast) var(--zelo-ease-out);
    }

    :global([data-surface="app"]) .route-active .section-indicator,
    :global([data-surface="app"]) .expanded .section-indicator {
      background: var(--accent-light);
    }

    :global([data-surface="app"]) .mobile-nav-section:focus-visible,
    :global([data-surface="app"]) .panel-item:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 2px var(--focus);
    }

    :global([data-surface="app"]) .mobile-nav-backdrop {
      background: color-mix(in srgb, var(--shadow-color) 42%, transparent);
      backdrop-filter: none;
    }

    :global([data-surface="app"]) .mobile-nav-panel {
      padding: 8px max(16px, env(safe-area-inset-right, 0px)) 16px max(16px, env(safe-area-inset-left, 0px));
      background: var(--bg-panel);
      border-color: var(--border-subtle);
      border-radius: var(--zelo-radius-sheet) var(--zelo-radius-sheet) 0 0;
      box-shadow: var(--elevation-float);
    }

    :global([data-surface="app"]) .panel-handle {
      width: 40px;
      margin-bottom: 14px;
    }

    :global([data-surface="app"]) .panel-heading {
      gap: 10px;
      margin-bottom: 14px;
    }

    :global([data-surface="app"]) .panel-heading :global(svg) {
      stroke-width: 1.75;
      color: var(--text-muted);
    }

    :global([data-surface="app"]) .panel-heading h2 {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.015em;
    }

    :global([data-surface="app"]) .panel-grid {
      gap: 8px;
    }

    :global([data-surface="app"]) .panel-item {
      min-height: 56px;
      gap: 10px;
      padding: 10px 12px;
      border-color: var(--border-card);
      border-radius: var(--zelo-radius-card);
      background: var(--bg-panel);
      color: var(--text-main);
      font-size: 14px;
      font-weight: 500;
      transition: background var(--zelo-dur-fast) var(--zelo-ease-out), border-color var(--zelo-dur-fast) var(--zelo-ease-out);
    }

    :global([data-surface="app"]) .panel-item :global(svg) {
      stroke-width: 1.75;
      color: var(--text-muted);
    }

    :global([data-surface="app"]) .panel-item:hover {
      border-color: var(--border-strong);
    }

    :global([data-surface="app"]) .panel-item.active {
      background: var(--accent-light);
      border-color: var(--primary);
      color: var(--text-main);
    }

    :global([data-surface="app"]) .panel-item.active :global(svg) {
      color: var(--text-main);
    }

    :global([data-surface="app"]) .panel-item.destructive,
    :global([data-surface="app"]) .panel-item.destructive :global(svg) {
      color: var(--status-error-text);
    }

    :global([data-surface="app"]) .panel-item :global(.sidebar-badge) {
      min-width: 18px;
      height: 18px;
      background: var(--primary);
      color: var(--primary-text);
      font: var(--type-kbd); letter-spacing: var(--type-kbd-tracking);
    }

    :global([data-surface="app"]) .panel-item :global(.sidebar-badge.critical) {
      background: var(--status-error-text);
    }

    :global([data-surface="app"]) .company-identity {
      padding: 12px;
      border-color: var(--border-card);
      border-radius: var(--zelo-radius-card);
      background: var(--bg-sunken);
    }

    :global([data-surface="app"]) .company-avatar {
      background: var(--primary);
      color: var(--primary-text);
      font-weight: 600;
    }

    :global([data-surface="app"]) .company-copy span {
      font-size: 12px;
    }

    :global([data-surface="app"]) .company-copy strong {
      font-weight: 600;
    }
  }
</style>
