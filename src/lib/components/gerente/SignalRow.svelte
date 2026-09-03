<script>
  import { onMount } from 'svelte';
  import { ChevronDown, MessageCircle, MoreHorizontal } from 'lucide-svelte';
  import { getSignalPresenter } from '$lib/gerente/signalPresenter.js';
  export let signal;
  export let onRead = () => {};
  export let onAsk = () => {};
  export let onMute = () => {};
  export let onQuickAction = () => {};
  export let muted = false;
  /** Só mostra a ação rápida de cardápio quando a empresa tem ZeloMenu ativo. */
  export let menuAtivo = false;
  let menuOpen = false;
  let menuButton;
  let root;
  $: presenter = getSignalPresenter(signal);
  $: Icon = presenter.icone;
  $: sev = signal?.severity === 'critical' ? 'critical' : signal?.severity === 'attention' ? 'attention' : 'info';
  $: kicker = sev === 'critical' ? 'Precisa de você' : sev === 'attention' ? 'Fica de olho' : 'Pra saber';
  $: when = formatWhen(signal?.signal_date);
  function formatWhen(date) {
    if (!date) return '';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
    if (date === d.toISOString().slice(0, 10)) return 'ontem';
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  }
  function read() { onRead(signal.id); }
  onMount(() => {
    const close = (e) => { if (menuOpen && root && !root.querySelector('.menu')?.contains(e.target)) menuOpen = false; };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  });
</script>

<article bind:this={root} class="row" class:muted>
  <div class="sev {sev}"><svelte:component this={Icon} size={14} aria-hidden="true" /></div>
  <div class="body">
    <div class="kicker"><span class="k {sev}">{kicker}</span>{#if !signal?.read_at && !muted}<i class="new" role="status" aria-label="Novo"></i>{/if}{#if when}<span>{when}</span>{/if}</div>
    <h3>{presenter.titulo}</h3>
    {#if muted}
      <p class="quiet">Silenciado nas preferências</p>
    {:else}
      <p>{signal?.narrative || 'Há um ponto para acompanhar nos números recentes.'}</p>
      <details on:toggle={(e) => { if (e.currentTarget.open) read(); }}>
        <summary>Ver os números <ChevronDown size={14} aria-hidden="true" /></summary>
        <dl>{#each presenter.formatEvidence(signal?.evidence || {}) as item}<dt>{item.label}</dt><dd class="tabular-nums">{item.valor}</dd>{/each}</dl>
      </details>
    {/if}
  </div>
  {#if !muted}
    <div class="actions">
      {#if presenter.acaoRapida && menuAtivo}
        <button type="button" class="btn primary" on:click={() => { read(); onQuickAction(presenter.acaoRapida.mensagem(signal)); }}>{presenter.acaoRapida.label}</button>
      {:else}
        <a class="btn ghost" href={presenter.acaoSugerida.href} on:click={read}>{presenter.acaoSugerida.label}</a>
      {/if}
      <div class="ask-row">
        <button type="button" class="btn quiet" on:click={() => { read(); onAsk(signal); }}><MessageCircle size={15} aria-hidden="true" />Perguntar</button>
        <div class="menu">
          <button type="button" bind:this={menuButton} class="icon" aria-label="Mais opções" aria-haspopup="menu" aria-expanded={menuOpen} on:click={() => (menuOpen = !menuOpen)}><MoreHorizontal size={16} aria-hidden="true" /></button>
          {#if menuOpen}
            <div class="popup" role="menu" tabindex="-1" on:keydown={(e) => { if (e.key === 'Escape') { menuOpen = false; menuButton?.focus(); } }}>
              <button type="button" role="menuitem" on:click={() => { menuOpen = false; onMute(signal.type); }}>Silenciar esse tipo</button>
              <button type="button" role="menuitem" on:click={() => { menuOpen = false; onAsk(signal); }}>Esse aviso não faz sentido?</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</article>

<style>
  .row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 14px; padding: 16px 18px; border-top: 1px solid var(--border-card); transition: background 180ms cubic-bezier(.22,1,.36,1); }
  .row:first-child { border-top: 0; }
  .row:hover { background: color-mix(in srgb, var(--bg-panel) 55%, var(--bg-card)); }
  .row.muted { opacity: .6; }
  .sev { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; margin-top: 1px; }
  .sev.critical { background: var(--status-error-bg); color: var(--status-error-text); }
  .sev.attention { background: var(--status-warning-bg); color: var(--status-warning-text); }
  .sev.info { background: var(--accent-light); color: var(--primary); }
  .body { min-width: 0; display: grid; gap: 4px; }
  .kicker { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
  .k.critical { color: var(--status-error-text); } .k.attention { color: var(--status-warning-text); } .k.info { color: var(--primary); }
  .new { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); }
  h3 { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.35; color: var(--text-main); }
  p { margin: 0; color: var(--text-label); font-size: 13px; line-height: 1.5; max-width: 70ch; }
  .quiet { color: var(--text-muted); font-size: 12px; }
  details { margin-top: 4px; }
  summary { list-style: none; cursor: pointer; font-size: 12px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; min-height: 28px; }
  summary::-webkit-details-marker { display: none; }
  summary:hover { color: var(--text-main); }
  details[open] summary :global(svg) { transform: rotate(180deg); }
  dl { margin: 6px 0 0; padding: 10px 12px; border: 1px solid var(--border-card); border-radius: 6px; background: var(--bg-input); display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; font-size: 12px; }
  dt { color: var(--text-muted); } dd { margin: 0; text-align: right; color: var(--text-label); }
  .actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .ask-row { display: flex; align-items: center; gap: 2px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 6px; border: 1px solid transparent; font-size: 13px; font-weight: 500; white-space: nowrap; text-decoration: none; cursor: pointer; transition: background 180ms cubic-bezier(.22,1,.36,1), border-color 180ms cubic-bezier(.22,1,.36,1), color 180ms cubic-bezier(.22,1,.36,1); }
  .btn.primary { background: var(--primary); color: var(--primary-text); } .btn.primary:hover { background: var(--primary-hover); }
  .btn.ghost { background: transparent; color: var(--text-label); border-color: var(--border-subtle); } .btn.ghost:hover { color: var(--text-main); border-color: var(--border-strong); }
  .btn.quiet { background: transparent; color: var(--text-muted); } .btn.quiet:hover { color: var(--text-main); background: var(--bg-input); }
  .icon { width: 36px; height: 36px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
  .icon:hover { background: var(--bg-input); color: var(--text-main); }
  .menu { position: relative; }
  .popup { position: absolute; right: 0; top: calc(100% + 4px); z-index: 4; display: grid; width: 200px; padding: 4px; border: 1px solid var(--border-card); border-radius: 6px; background: var(--bg-card); }
  .popup button { min-height: 40px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: var(--text-label); text-align: left; font-size: 12px; cursor: pointer; }
  .popup button:hover { background: var(--bg-input); }
  .btn:focus-visible, .icon:focus-visible, summary:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent); }
  @media (max-width: 640px) { .row { grid-template-columns: 22px minmax(0, 1fr); } .actions { grid-column: 2; flex-direction: row; justify-content: flex-start; flex-wrap: wrap; } }
  @media (prefers-reduced-motion: reduce) { .row, .btn { transition: none; } }
</style>
