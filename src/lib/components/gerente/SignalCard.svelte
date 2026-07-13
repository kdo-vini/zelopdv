<script>
  import { onMount } from 'svelte';
  import { ChevronDown, MessageCircle, MoreHorizontal } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { getSignalPresenter, confiancaHumana } from '$lib/gerente/signalPresenter.js';
  import { openAssistantWithSignal } from '$lib/stores/assistant.js';
  import { closeSupport } from '$lib/stores/support.js';
  import { capturePostHogEvent } from '$lib/posthogClient.js';
  export let signal;
  export let onRead = () => {};
  export let onAsk = () => {};
  export let onMute = () => {};
  export let muted = false;
  let open = false;
  let menuOpen = false;
  let menuButton;
  let card;
  $: presenter = getSignalPresenter(signal);
  $: Icon = presenter.icone;
  $: tag = signal?.severity === 'critical' ? 'PRECISA DE VOCÊ' : signal?.severity === 'attention' ? 'FICA DE OLHO' : 'PRA SABER';
  function handleMenuKeydown(event) {
    if (event.key === 'Escape') {
      menuOpen = false;
      menuButton?.focus();
    }
  }

  onMount(() => {
    const handleDocumentClick = (event) => {
      if (menuOpen && card && !card.querySelector('.menu-wrap')?.contains(event.target)) menuOpen = false;
    };
    document.addEventListener('click', handleDocumentClick);
    let timer;
    let observer;
    if (!signal?.read_at && card && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) timer = window.setTimeout(() => onRead(signal.id), 1500);
        else window.clearTimeout(timer);
      }, { threshold: [0.6] });
      observer.observe(card);
    }
    return () => { document.removeEventListener('click', handleDocumentClick); observer?.disconnect(); window.clearTimeout(timer); };
  });
</script>

<article bind:this={card} class:critical={signal?.severity === 'critical'} class:attention={signal?.severity === 'attention'} class:muted class="signal-card">
  <div class="signal-top">
    <div class="signal-title"><svelte:component this={Icon} size={18} aria-hidden="true" /><div><span class="tag {presenter.tagClass}">{tag}</span>{#if !signal?.read_at}<i class:critical-dot={signal?.severity === 'critical'} class="new-dot" role="status" aria-label="Novo"></i>{/if}<h3>{presenter.titulo}</h3></div></div>
    <div class="menu-wrap"><button type="button" bind:this={menuButton} class="icon-button" title="Mais opções" aria-label="Mais opções" aria-expanded={menuOpen} aria-haspopup="menu" on:click={() => menuOpen = !menuOpen}><MoreHorizontal size={18} aria-hidden="true" /></button>{#if menuOpen}<div class="signal-menu" role="menu" tabindex="-1" on:keydown={handleMenuKeydown} aria-label="Ações do aviso"><button type="button" role="menuitem" on:click={() => { onMute(signal.type); menuOpen = false; }}>Silenciar esse tipo</button><button type="button" role="menuitem" on:click={() => { menuOpen = false; closeSupport(); openAssistantWithSignal(signal); }}>Esse aviso não faz sentido?</button></div>{/if}</div>
  </div>
  <p class="narrative">{signal?.narrative || 'Há um ponto para acompanhar nos números recentes.'}</p>
  <p class="confidence">{confiancaHumana(signal?.confidence, signal?.evidence)}</p>
  <button class="numbers-toggle" aria-expanded={open} on:click={() => { open = !open; if (open) void capturePostHogEvent('gerente_signal_expand', { signal_type: signal.type, severity: signal.severity }); onRead(signal.id); }}><span>Ver os números</span><span class:rotated={open}><ChevronDown size={15} /></span></button>
  <div class:expanded={open} class="evidence"><div><dl>{#each presenter.formatEvidence(signal?.evidence || {}) as item}<div><dt>{item.label}</dt><dd class="tabular-nums">{item.valor}</dd></div>{/each}</dl></div></div>
  <div class="signal-actions">
    <a href={presenter.acaoSugerida.href} on:click={() => onRead(signal.id)}>{presenter.acaoSugerida.label}</a>
    <Button variant="outline" size="sm" on:click={() => { void capturePostHogEvent('gerente_ask_zelinho', { signal_type: signal.type, severity: signal.severity }); onRead(signal.id); closeSupport(); if (!openAssistantWithSignal(signal)) onAsk(signal); }}><MessageCircle />Perguntar ao Zelinho</Button>
  </div>
</article>

<style>
  .signal-card { border: 1px solid var(--border-card); border-radius: 8px; background: var(--bg-card); padding: 16px; }
  .signal-card.attention { border-color: var(--status-warning-border); }
  .signal-card.critical { border-color: var(--status-error-border); }
  .signal-top, .signal-title, .signal-actions { display: flex; align-items: center; }
  .signal-top { justify-content: space-between; gap: 12px; }
  .signal-title { gap: 10px; min-width: 0; color: var(--primary); }
  .signal-title h3 { margin: 5px 0 0; color: var(--text-main); font-size: 15px; line-height: 1.25; }
  .tag { font-size: 10px; font-weight: 700; letter-spacing: .08em; color: var(--text-muted); }
  .tag.attention { color: var(--status-warning-text); }.tag.critical { color: var(--status-error-text); }.tag.info { color: var(--primary); }
  .new-dot { display: inline-block; width: 7px; height: 7px; margin-left: 6px; border-radius: 50%; background: var(--primary); }.new-dot.critical-dot { background: var(--status-error-text); animation: dot-fade 900ms ease-in-out 3; }
  .menu-wrap { position: relative; }.icon-button { display: inline-grid; place-items: center; width: 44px; height: 44px; color: var(--text-muted); background: transparent; border: 0; border-radius: 8px; cursor: pointer; }.signal-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 4; display: grid; width: 190px; padding: 4px; border: 1px solid var(--border-card); border-radius: 6px; background: var(--bg-card); box-shadow: 0 8px 20px color-mix(in srgb, var(--text-inverse) 25%, transparent); }.signal-menu button { min-height: 44px; padding: 7px 8px; border: 0; border-radius: 4px; background: transparent; color: var(--text-label); text-align: left; font-size: 12px; cursor: pointer; }.signal-menu button:hover { background: var(--bg-input); }
  .narrative { margin: 13px 0 7px; color: var(--text-label); font-size: 14px; line-height: 1.5; }.confidence { margin: 0; color: var(--text-muted); font-size: 12px; font-style: italic; }
  .numbers-toggle { min-height: 44px; margin-top: 12px; display: inline-flex; gap: 5px; align-items: center; padding: 0; border: 0; background: transparent; color: var(--link); font-size: 12px; cursor: pointer; }.rotated { transform: rotate(180deg); }
  .evidence { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--transition-normal); }.evidence.expanded { grid-template-rows: 1fr; }.evidence > div { overflow: hidden; }.evidence dl { margin: 10px 0 0; padding: 10px; border: 1px solid var(--border-card); border-radius: 6px; background: var(--bg-input); }.evidence dl div { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; font-size: 12px; }.evidence dt { color: var(--text-muted); }.evidence dd { margin: 0; color: var(--text-label); text-align: right; }
  .signal-actions { justify-content: space-between; gap: 10px; margin-top: 14px; }.signal-actions a { color: var(--link); font-size: 12px; text-decoration: none; }.signal-actions :global(button) { min-height: 44px; flex-shrink: 0; }
  .signal-card.muted { opacity: .58; }.signal-card.muted .narrative, .signal-card.muted .confidence, .signal-card.muted .numbers-toggle, .signal-card.muted .evidence, .signal-card.muted .signal-actions { display: none; }.signal-card.muted::after { content: 'Silenciado nas preferências'; display: block; margin-top: 8px; color: var(--text-muted); font-size: 12px; }
  @keyframes dot-fade { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .new-dot { animation: none; }.evidence { transition: none; } }
</style>
