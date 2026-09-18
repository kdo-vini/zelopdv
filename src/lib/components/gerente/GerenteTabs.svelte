<script>
  /** @type {'briefing' | 'acoes' | 'historico' | 'semana' | 'preferencias'} */
  export let active = 'briefing';

  const tabs = [
    { id: 'briefing', label: 'Briefing', href: '/gestao/gerente?aba=briefing' },
    { id: 'acoes', label: 'Ações do Zelinho', href: '/gestao/gerente?aba=acoes' },
    { id: 'historico', label: 'Histórico', href: '/gestao/gerente?aba=historico' },
    { id: 'semana', label: 'Resumo semanal', href: '/gestao/gerente/semana' },
    { id: 'preferencias', label: 'Preferências', href: '/gestao/gerente/preferencias' },
  ];
</script>

<div class="tabs" role="tablist" aria-label="Seções do Zelinho">
  {#each tabs as tab}
    <a
      class="tab"
      class:selected={active === tab.id}
      role="tab"
      href={tab.href}
      aria-selected={active === tab.id}
      aria-current={active === tab.id ? 'page' : undefined}
    >{tab.label}</a>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 2px;
    margin: 22px 0 18px;
    padding: 3px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 8px;
    width: max-content;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    min-height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    transition: background 180ms cubic-bezier(.22,1,.36,1), color 180ms cubic-bezier(.22,1,.36,1);
  }
  .tab:hover { color: var(--text-main); }
  .tab.selected {
    background: var(--bg-panel);
    color: var(--text-main);
  }
  .tab:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    .tab { transition: none; }
  }
</style>
