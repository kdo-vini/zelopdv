<script>
  // Hub de ferramentas do empresário. Cada card leva a uma ferramenta.
  // Card inteiro é clicável; "Em breve" fica desabilitado (sinaliza roadmap).
  const tools = [
    {
      title: "Precificação",
      description:
        "Descubra o preço ideal por produto a partir do custo, markup e taxa de plataforma.",
      href: "/ferramentas/precificacao",
      tag: "Grátis",
      available: true,
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18ZM3.75 4.5h16.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H3.75a.75.75 0 0 1-.75-.75V5.25a.75.75 0 0 1 .75-.75Z" />`,
    },
    {
      title: "Cardápio Digital",
      description:
        "Monte e compartilhe o cardápio online do seu negócio com link público.",
      href: "/ferramentas/cardapio",
      tag: "Incluso",
      available: true,
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />`,
    },
    {
      title: "Metas de venda",
      description:
        "Defina metas de faturamento e acompanhe o progresso do mês em tempo real.",
      href: null,
      tag: "Em breve",
      available: false,
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />`,
    },
  ];
</script>

<svelte:head>
  <title>Ferramentas | Zelo PDV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="hub-shell">
  <header class="hub-head" style="border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 85%, transparent); padding-bottom: 1rem;">
    <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Outros / Ferramentas</p>
    <h1 class="text-xl font-bold text-slate-100 tracking-tight">Ferramentas</h1>
    <p class="hub-subtitle">
      Recursos extras para você precificar, divulgar e organizar o seu negócio.
    </p>
  </header>

  <div class="tools-grid">
    {#each tools as tool}
      {#if tool.available}
        <a class="tool-card" href={tool.href}>
          <div class="tool-top">
            <span class="tool-icon" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-6 h-6"
              >
                {@html tool.icon}
              </svg>
            </span>
            <span class="tool-tag">{tool.tag}</span>
          </div>
          <h2 class="tool-name">{tool.title}</h2>
          <p class="tool-desc">{tool.description}</p>
          <span class="tool-cta">
            Abrir
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-4 h-4"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clip-rule="evenodd"
              />
            </svg>
          </span>
        </a>
      {:else}
        <div class="tool-card tool-card-disabled" aria-disabled="true">
          <div class="tool-top">
            <span class="tool-icon" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-6 h-6"
              >
                {@html tool.icon}
              </svg>
            </span>
            <span class="tool-tag tool-tag-soon">{tool.tag}</span>
          </div>
          <h2 class="tool-name">{tool.title}</h2>
          <p class="tool-desc">{tool.description}</p>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .hub-shell {
    max-width: 72rem;
    margin-inline: auto;
  }

  .hub-head {
    margin-bottom: 1.75rem;
  }

  .hub-subtitle {
    margin-top: 0.4rem;
    color: var(--text-muted);
    font-size: 0.98rem;
    max-width: 60ch;
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 1rem;
  }

  .tool-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 11rem;
    padding: 1.25rem;
    border-radius: 1.25rem;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    color: inherit;
    text-decoration: none;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  a.tool-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--primary) 45%, transparent);
    box-shadow: 0 14px 32px color-mix(in srgb, var(--primary) 14%, transparent);
  }

  a.tool-card:focus-visible {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
  }

  .tool-card-disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .tool-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .tool-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--primary);
  }

  .tool-tag {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
  }

  .tool-tag-soon {
    color: var(--text-muted);
    background: color-mix(in srgb, white 6%, transparent);
    border-color: var(--border-subtle);
  }

  .tool-name {
    color: var(--text-main);
    font-size: 1.15rem;
    font-weight: 700;
  }

  .tool-desc {
    color: var(--text-muted);
    font-size: 0.92rem;
    line-height: 1.55;
    flex: 1;
  }

  .tool-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.25rem;
    color: var(--primary);
    font-weight: 700;
    font-size: 0.9rem;
  }

  @media (min-width: 640px) {
    .tools-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1024px) {
    .tools-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
