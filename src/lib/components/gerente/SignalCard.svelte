<script>
  import { onMount } from 'svelte';
  import { ChevronDown, MessageCircle, MoreHorizontal } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { getSignalPresenter, confiancaHumana } from '$lib/gerente/signalPresenter.js';
  export let signal;
  export let onRead = () => {};
  export let onAsk = () => {};
  let open = false;
  let card;
  $: presenter = getSignalPresenter(signal);
  $: Icon = presenter.icone;
  $: tag = signal?.severity === 'critical' ? 'PRECISA DE VOCÊ' : signal?.severity === 'attention' ? 'FICA DE OLHO' : 'PRA SABER';

  onMount(() => {
    if (signal?.read_at || !card || !('IntersectionObserver' in window)) return;
    let timer;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) timer = window.setTimeout(() => onRead(signal.id), 1500);
      else window.clearTimeout(timer);
    }, { threshold: [0.6] });
    observer.observe(card);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  });
</script>

<article bind:this={card} class:critical={signal?.severity === 'critical'} class:attention={signal?.severity === 'attention'} class="signal-card">
  <div class="signal-top">
    <div class="signal-title"><svelte:component this={Icon} size={18} /><div><span class="tag {presenter.tagClass}">{tag}</span>{#if !signal?.read_at}<i class:critical-dot={signal?.severity === 'critical'} class="new-dot" aria-label="Novo"></i>{/if}<h3>{presenter.titulo}</h3></div></div>
    <button class="icon-button" title="Mais opções" aria-label="Mais opções"><MoreHorizontal size={18} /></button>
  </div>
  <p class="narrative">{signal?.narrative || 'Há um ponto para acompanhar nos números recentes.'}</p>
  <p class="confidence">{confiancaHumana(signal?.confidence, signal?.evidence)}</p>
  <button class="numbers-toggle" aria-expanded={open} on:click={() => { open = !open; onRead(signal.id); }}><span>Ver os números</span><span class:rotated={open}><ChevronDown size={15} /></span></button>
  <div class:expanded={open} class="evidence"><div><dl>{#each presenter.formatEvidence(signal?.evidence || {}) as item}<div><dt>{item.label}</dt><dd class="tabular-nums">{item.valor}</dd></div>{/each}</dl></div></div>
  <div class="signal-actions">
    <a href={presenter.acaoSugerida.href} on:click={() => onRead(signal.id)}>{presenter.acaoSugerida.label}</a>
    <Button variant="outline" size="sm" on:click={() => { onRead(signal.id); onAsk(signal); }}><MessageCircle />Perguntar ao Zelinho</Button>
  </div>
</article>

<style>
  .signal-card { border: 1px solid var(--border-card); border-left: 3px solid var(--primary); border-radius: 8px; background: var(--bg-card); padding: 16px; }
  .signal-card.attention { border-left-color: var(--status-warning-text); }
  .signal-card.critical { border-left-color: var(--status-error-text); }
  .signal-top, .signal-title, .signal-actions { display: flex; align-items: center; }
  .signal-top { justify-content: space-between; gap: 12px; }
  .signal-title { gap: 10px; min-width: 0; color: var(--primary); }
  .signal-title h3 { margin: 5px 0 0; color: var(--text-main); font-size: 15px; line-height: 1.25; }
  .tag { font-size: 10px; font-weight: 700; letter-spacing: .08em; color: var(--text-muted); }
  .tag.attention { color: var(--status-warning-text); }.tag.critical { color: var(--status-error-text); }.tag.info { color: var(--primary); }
  .new-dot { display: inline-block; width: 7px; height: 7px; margin-left: 6px; border-radius: 50%; background: var(--primary); }.new-dot.critical-dot { background: var(--status-error-text); animation: pulse 900ms ease-in-out 3; }
  .icon-button { display: inline-grid; place-items: center; color: var(--text-muted); background: transparent; border: 0; padding: 5px; cursor: pointer; }
  .narrative { margin: 13px 0 7px; color: var(--text-label); font-size: 14px; line-height: 1.5; }.confidence { margin: 0; color: var(--text-muted); font-size: 12px; font-style: italic; }
  .numbers-toggle { margin-top: 12px; display: inline-flex; gap: 5px; align-items: center; padding: 0; border: 0; background: transparent; color: var(--link); font-size: 12px; cursor: pointer; }.rotated { transform: rotate(180deg); }
  .evidence { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--transition-normal); }.evidence.expanded { grid-template-rows: 1fr; }.evidence > div { overflow: hidden; }.evidence dl { margin: 10px 0 0; padding: 10px; border: 1px solid var(--border-card); border-radius: 6px; background: var(--bg-input); }.evidence dl div { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; font-size: 12px; }.evidence dt { color: var(--text-muted); }.evidence dd { margin: 0; color: var(--text-label); text-align: right; }
  .signal-actions { justify-content: space-between; gap: 10px; margin-top: 14px; }.signal-actions a { color: var(--link); font-size: 12px; text-decoration: none; }.signal-actions :global(button) { flex-shrink: 0; }
  @keyframes pulse { 50% { opacity: .35; transform: scale(1.3); } }
  @media (prefers-reduced-motion: reduce) { .new-dot { animation: none; }.evidence { transition: none; } }
</style>
