<script>
  import MarketingHeader from '$lib/components/marketing/MarketingHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import { extensoes, getAddonPrice, getChatBundleDelta } from '$lib/data/extensoes';
  import { generalFaqs } from '$lib/data/segmentLandingPages';
  import { PLANS } from '$lib/pricing';

  const meta = {
    title: 'Extensões Zelo PDV — Mesas, Pedidos+Cozinha e Atendimento WhatsApp | Zelo PDV',
    description:
      'O Zelo PDV cobre o essencial por R$ 59/mês. Adicione apenas o que sua operação pedir: Módulo Mesas, Pedidos + Cozinha ou Zelo Chat (WhatsApp com IA). Cancele quando quiser.',
    canonical: 'https://zelopdv.com.br/extensoes'
  };

  const basePrice = PLANS.pdv.price;
  const mesasPrice = getAddonPrice('mesas');
  const pedidosPrice = getAddonPrice('pedidos');
  const chatDelta = getChatBundleDelta();

  const mesas = extensoes.mesas;
  const pedidos = extensoes['pedidos-cozinha'];
  const chat = extensoes.chat;

  // Grade principal de cards. Ordem importa — Mesas e Pedidos primeiro (addons baratos), Chat depois (upgrade).
  const cards = [
    {
      anchor: 'mesas',
      data: mesas,
      name: 'Módulo Mesas',
      tagline: 'Comanda, divisão de conta e mapa de salão',
      bullets: [
        'Mapa visual com status de cada mesa',
        'Comanda acumulativa por mesa',
        'Divisão entre N pessoas com um clique',
        'Taxa de serviço, couvert e pré-conta'
      ],
      priceLabel: `+R$ ${mesasPrice.toFixed(0)}`,
      priceSuffix: '/mês',
      priceNote: 'Adicional ao plano base',
      ctaPrimary: { href: '/cadastro?addon=mesas', label: 'Adicionar ao plano' },
      ctaSecondary: { href: '#mesas', label: 'Ver detalhes' },
      iconKey: 'tables'
    },
    {
      anchor: 'pedidos-cozinha',
      data: pedidos,
      name: 'Pedidos + Cozinha',
      tagline: 'Atendente, painel de cozinha e fila do caixa',
      bullets: [
        'Atendente lança pedido pelo celular',
        'Cozinha acompanha em painel kiosk',
        'Caixa cobra pedidos prontos',
        'Funciona junto com o Módulo Mesas'
      ],
      priceLabel: `+R$ ${pedidosPrice.toFixed(0)}`,
      priceSuffix: '/mês',
      priceNote: 'Adicional ao plano base',
      ctaPrimary: { href: '/cadastro?addon=pedidos', label: 'Adicionar ao plano' },
      ctaSecondary: { href: '#pedidos-cozinha', label: 'Ver detalhes' },
      iconKey: 'kitchen'
    },
    {
      anchor: 'chat',
      data: chat,
      name: 'Zelo Chat',
      tagline: 'Atendimento WhatsApp com IA',
      bullets: [
        'IA responde clientes 24/7 no seu tom',
        'Anota pedido com cardápio em mãos',
        'Pedido cai direto no Zelo PDV',
        'WhatsApp Business oficial — sem banimento'
      ],
      priceLabel: `+R$ ${chatDelta.toFixed(0)}`,
      priceSuffix: '/mês',
      priceNote: 'No pacote Gestão + Atendimento',
      ctaPrimary: { href: chat.upgradeHref, label: 'Upgrade pro pacote' },
      ctaSecondary: { href: chat.externalUrl, label: 'Ver chat.zelopdv.com.br', external: true },
      iconKey: 'chat',
      external: true
    }
  ];

  // Combinações recomendadas por perfil de negócio. Quanto custa cada cenário.
  const combos = [
    {
      profile: 'Lanchonete simples',
      example: 'Atendimento de balcão, sem salão, sem WhatsApp ativo.',
      stack: ['Plano base'],
      total: basePrice,
      notes: 'Caixa, fiado, estoque e relatórios. Cobre o essencial.'
    },
    {
      profile: 'Restaurante com salão',
      example: 'Mesas, comandas, divisão de conta, taxa de serviço.',
      stack: ['Plano base', 'Mesas'],
      total: basePrice + mesasPrice,
      notes: 'Sem cozinha separada — caixa lança e fecha pelo balcão.'
    },
    {
      profile: 'Operação com cozinha separada',
      example: 'Atendente, cozinha de fundo, caixa separado.',
      stack: ['Plano base', 'Pedidos + Cozinha'],
      total: basePrice + pedidosPrice,
      notes: 'Pedido digital fluindo entre os três papéis. Sem ticket de papel.'
    },
    {
      profile: 'Bar / restaurante completo',
      example: 'Salão com mesas + cozinha que precisa enxergar a fila.',
      stack: ['Plano base', 'Mesas', 'Pedidos + Cozinha'],
      total: basePrice + mesasPrice + pedidosPrice,
      notes: 'Comanda na mesa, item vai pra cozinha, conta divide e fecha.'
    },
    {
      profile: 'Negócio com WhatsApp ativo',
      example: 'Pedidos chegam pelo WhatsApp e ninguém dá conta de responder.',
      stack: ['Plano base', 'Zelo Chat'],
      total: basePrice + chatDelta,
      notes: 'IA responde, anota pedido, e o pedido cai no Zelo PDV.',
      featured: true
    }
  ];

  // FAQ consolidada
  const allFaqs = [
    ...mesas.faqSpecific.map((f) => ({ ...f, group: 'Mesas' })),
    ...pedidos.faqSpecific.map((f) => ({ ...f, group: 'Pedidos + Cozinha' })),
    ...chat.faqSpecific.map((f) => ({ ...f, group: 'Zelo Chat' })),
    ...generalFaqs.map((f) => ({ ...f, group: 'Geral' }))
  ];

  // Detalhe expandido das três extensões
  const detailSections = [
    { ...mesas, anchor: 'mesas', name: 'Módulo Mesas', priceLabel: `+R$ ${mesasPrice.toFixed(0)}/mês`, ctaHref: '/cadastro?addon=mesas', ctaLabel: 'Adicionar ao plano' },
    { ...pedidos, anchor: 'pedidos-cozinha', name: 'Pedidos + Cozinha', priceLabel: `+R$ ${pedidosPrice.toFixed(0)}/mês`, ctaHref: '/cadastro?addon=pedidos', ctaLabel: 'Adicionar ao plano' },
    { ...chat, anchor: 'chat', name: 'Zelo Chat', priceLabel: `+R$ ${chatDelta.toFixed(0)}/mês no Bundle`, ctaHref: chat.upgradeHref, ctaLabel: 'Upgrade pro pacote', external: true, externalUrl: chat.externalUrl }
  ];

  // JSON-LD
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: cards.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${meta.canonical}#${c.anchor}`,
      name: c.name
    }))
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allFaqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer }
    }))
  };
</script>

<svelte:head>
  <title>{meta.title}</title>
  <meta name="description" content={meta.description} />
  <link rel="canonical" href={meta.canonical} />

  <meta property="og:type" content="website" />
  <meta property="og:url" content={meta.canonical} />
  <meta property="og:title" content={meta.title} />
  <meta property="og:description" content={meta.description} />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={meta.canonical} />
  <meta name="twitter:title" content={meta.title} />
  <meta name="twitter:description" content={meta.description} />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  {@html `<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}
</svelte:head>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-white"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <MarketingHeader />

  <main>
    <!-- ============ HERO ============ -->
    <section class="relative pt-28 md:pt-32 pb-16 md:pb-20 overflow-hidden border-b border-white/5">
      <!-- Ambient sky glow, centralizado, sutil -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-[900px] h-[420px] rounded-full bg-sky-500/[0.06] blur-3xl"></div>
      </div>
      <!-- Grid pattern sutil pra dar textura premium -->
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.04]"
        style="background-image: linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px); background-size: 56px 56px; background-position: -1px -1px;"
        aria-hidden="true"
      ></div>

      <div class="max-w-5xl mx-auto px-6 relative z-10 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-[11px] font-semibold uppercase tracking-[0.18em] mb-6">
          <span class="inline-flex w-1.5 h-1.5 rounded-full bg-sky-400"></span>
          Extensões Zelo PDV
        </div>
        <h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-[3.4rem] font-bold text-white tracking-tight leading-[1.08] mb-5">
          Plano base no essencial.<br class="hidden md:inline" />
          Extensões só quando faz sentido.
        </h1>
        <p class="text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-8" style="color: var(--text-muted);">
          O Zelo PDV cobre caixa, fiado, estoque e relatórios por <strong class="text-white font-semibold">R$ {basePrice}/mês</strong>.
          Adicione mesas, pedidos com cozinha ou atendimento por WhatsApp conforme sua operação cresce. Cada extensão é individual e cancelável a qualquer momento.
        </p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/cadastro"
            class="px-7 py-3.5 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-full shadow-lg shadow-sky-950/40 transition-colors"
          >
            Testar 30 dias grátis
          </a>
          <a
            href="#extensoes"
            class="px-7 py-3.5 text-sm font-semibold rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-colors"
            style="color: var(--text-label);"
          >
            Ver extensões
          </a>
        </div>
      </div>
    </section>

    <!-- ============ GRID DAS 3 EXTENSÕES ============ -->
    <section id="extensoes" class="py-16 md:py-20 border-b border-white/5">
      <div class="max-w-7xl mx-auto px-6">
        <div class="max-w-2xl mb-12">
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300 mb-3">As extensões</p>
          <h2 class="text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight">
            Três módulos opcionais. Você escolhe.
          </h2>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {#each cards as card}
            <article
              class="relative rounded-2xl border p-7 flex flex-col transition-colors hover:border-sky-500/30"
              style="background: var(--bg-card); border-color: var(--border-card);"
            >
              <!-- Icon -->
              <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-sky-500/10 border border-sky-500/20" aria-hidden="true">
                {#if card.iconKey === 'tables'}
                  <svg class="w-6 h-6 text-sky-300" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 9.75h18M3 9.75v9a.75.75 0 00.75.75h3.75a.75.75 0 00.75-.75V15h9v3.75c0 .414.336.75.75.75h3.75a.75.75 0 00.75-.75v-9M3 9.75V6a.75.75 0 01.75-.75h16.5a.75.75 0 01.75.75v3.75M8.25 9.75v-3M15.75 9.75v-3" />
                  </svg>
                {:else if card.iconKey === 'kitchen'}
                  <svg class="w-6 h-6 text-sky-300" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 4.5v15M15 4.5v15M4.5 9h15M4.5 14.25h15M3.75 4.5h16.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V5.25a.75.75 0 01.75-.75z" />
                  </svg>
                {:else if card.iconKey === 'chat'}
                  <svg class="w-6 h-6 text-sky-300" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                {/if}
              </div>

              <!-- Header -->
              <div class="flex items-start justify-between gap-4 mb-2">
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300 mb-1.5">
                    {card.external ? 'Produto integrado' : 'Add-on'}
                  </p>
                  <h3 class="text-xl font-bold text-white">{card.name}</h3>
                </div>
              </div>

              <p class="text-sm leading-relaxed mb-6" style="color: var(--text-muted);">
                {card.tagline}
              </p>

              <!-- Bullets -->
              <ul class="space-y-2.5 mb-7">
                {#each card.bullets as bullet}
                  <li class="flex items-start gap-2.5 text-sm" style="color: var(--text-label);">
                    <svg class="w-4 h-4 shrink-0 text-sky-400 mt-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{bullet}</span>
                  </li>
                {/each}
              </ul>

              <!-- Price -->
              <div class="border-t pt-5 mb-5" style="border-color: var(--border-subtle);">
                <div class="flex items-baseline gap-1 mb-1">
                  <span class="text-3xl font-bold text-white">{card.priceLabel}</span>
                  <span class="text-sm font-medium" style="color: var(--text-muted);">{card.priceSuffix}</span>
                </div>
                <p class="text-xs" style="color: var(--text-muted);">{card.priceNote}</p>
              </div>

              <!-- CTAs -->
              <div class="flex flex-col gap-2 mt-auto">
                <a
                  href={card.ctaPrimary.href}
                  class="w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-full transition-colors"
                >
                  {card.ctaPrimary.label}
                </a>
                <a
                  href={card.ctaSecondary.href}
                  target={card.ctaSecondary.external ? '_blank' : undefined}
                  rel={card.ctaSecondary.external ? 'noopener noreferrer' : undefined}
                  class="w-full text-center px-4 py-2.5 text-sm font-semibold rounded-full border border-white/10 bg-transparent hover:bg-white/5 hover:text-white transition-colors inline-flex items-center justify-center gap-1.5"
                  style="color: var(--text-label);"
                >
                  {card.ctaSecondary.label}
                  {#if card.ctaSecondary.external}
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  {/if}
                </a>
              </div>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <!-- ============ COMBINAÇÕES POR TIPO DE NEGÓCIO ============ -->
    <section class="py-16 md:py-20 border-b border-white/5" style="background: var(--bg-panel);">
      <div class="max-w-6xl mx-auto px-6">
        <div class="max-w-2xl mb-12">
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300 mb-3">Combinações recomendadas</p>
          <h2 class="text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight mb-3">
            Qual extensão cabe no seu negócio
          </h2>
          <p class="text-base leading-relaxed" style="color: var(--text-muted);">
            Operações diferentes têm necessidades diferentes. Aqui o que normalmente faz sentido pra cada perfil.
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each combos as combo}
            <div
              class={combo.featured ? 'rounded-2xl border p-6 transition-colors lg:col-span-2' : 'rounded-2xl border p-6 transition-colors'}
              style={combo.featured ? 'background: linear-gradient(135deg, rgba(14,165,233,0.06), transparent); border-color: rgba(14,165,233,0.3);' : 'background: var(--bg-card); border-color: var(--border-card);'}
            >
              <p class="text-base font-bold text-white mb-1.5">{combo.profile}</p>
              <p class="text-sm leading-relaxed mb-5" style="color: var(--text-muted);">{combo.example}</p>

              <div class="flex flex-wrap gap-1.5 mb-5">
                {#each combo.stack as item, i}
                  <span class="px-2.5 py-1 rounded-full text-[11px] font-medium border bg-sky-500/[0.08]" style="color: var(--text-label); border-color: rgba(14,165,233,0.25);">
                    {item}
                  </span>
                  {#if i < combo.stack.length - 1}
                    <span class="text-sky-500/40 self-center text-xs" aria-hidden="true">+</span>
                  {/if}
                {/each}
              </div>

              <div class="flex items-baseline gap-1 mb-2">
                <span class="text-2xl font-bold text-white">R$ {combo.total}</span>
                <span class="text-xs" style="color: var(--text-muted);">/mês total</span>
              </div>
              <p class="text-xs leading-relaxed" style="color: var(--text-muted);">{combo.notes}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- ============ DETALHE DE CADA EXTENSÃO ============ -->
    {#each detailSections as section, sectionIndex}
      <section
        id={section.anchor}
        class="relative py-16 md:py-24 border-b border-white/5 scroll-mt-20"
        style={sectionIndex % 2 === 1 ? 'background: var(--bg-panel);' : ''}
      >
        <div class="max-w-7xl mx-auto px-6">
          <!-- Section header -->
          <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
            <div class="max-w-2xl">
              <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-[10px] font-semibold uppercase tracking-[0.2em] mb-4">
                {section.kind === 'plan' ? 'Produto integrado' : 'Add-on'} · {section.priceLabel}
              </div>
              <h2 class="text-2xl md:text-4xl font-bold text-white tracking-tight leading-tight mb-4">
                {section.h1.split(':')[0].trim()}
              </h2>
              <p class="text-base md:text-lg leading-relaxed" style="color: var(--text-muted);">
                {section.subtitle}
              </p>
            </div>
            <div class="shrink-0 flex flex-wrap gap-2">
              {#each section.forSegments.slice(0, 4) as segment}
                <span class="px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/10 bg-white/[0.04]" style="color: var(--text-muted);">
                  {segment}
                </span>
              {/each}
            </div>
          </div>

          <!-- Features grid -->
          <div class="mb-14">
            <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300 mb-3">O que tem dentro</p>
            <h3 class="text-xl md:text-2xl font-semibold text-white mb-3">{section.featuresTitle}</h3>
            <p class="text-sm md:text-base leading-relaxed max-w-3xl mb-8" style="color: var(--text-muted);">
              {section.featuresIntro}
            </p>

            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each section.features as feature, idx}
                <div class="rounded-xl border p-5" style="background: var(--bg-card); border-color: var(--border-card);">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/20">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <h4 class="text-sm font-semibold text-white">{feature.title}</h4>
                  </div>
                  <p class="text-sm leading-relaxed" style="color: var(--text-muted);">
                    {feature.description}
                  </p>
                </div>
              {/each}
            </div>
          </div>

          <!-- Steps + Testimonial -->
          <div class="grid lg:grid-cols-[1.4fr,1fr] gap-8 items-start">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300 mb-3">Como funciona</p>
              <h3 class="text-xl md:text-2xl font-semibold text-white mb-3">{section.howTitle}</h3>
              <p class="text-sm md:text-base leading-relaxed mb-6" style="color: var(--text-muted);">
                {section.howIntro}
              </p>

              <ol class="space-y-3">
                {#each section.steps as step, index}
                  <li class="flex gap-4 rounded-xl border p-4" style="background: var(--bg-card); border-color: var(--border-card);">
                    <div class="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold text-sky-300 bg-sky-500/10 border border-sky-500/20">
                      {index + 1}
                    </div>
                    <div>
                      <h4 class="text-sm font-semibold text-white mb-0.5">{step.title}</h4>
                      <p class="text-sm leading-relaxed" style="color: var(--text-muted);">{step.description}</p>
                    </div>
                  </li>
                {/each}
              </ol>

              <div class="mt-8 flex flex-col sm:flex-row gap-3">
                <a
                  href={section.ctaHref}
                  class="px-6 py-3 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-full transition-colors text-center"
                >
                  {section.ctaLabel}
                </a>
                {#if section.external && section.externalUrl}
                  <a
                    href={section.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="px-6 py-3 text-sm font-semibold rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-colors inline-flex items-center justify-center gap-1.5"
                    style="color: var(--text-label);"
                  >
                    Ver chat.zelopdv.com.br
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                {/if}
              </div>
            </div>

            <aside class="rounded-2xl border p-6" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="flex items-center gap-2 mb-4">
                <svg class="w-4 h-4 text-sky-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                </svg>
                <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">Depoimento</p>
              </div>
              <p class="text-base font-medium leading-relaxed text-white mb-5">
                {section.testimonial.quote}
              </p>
              <div class="border-t pt-4" style="border-color: var(--border-subtle);">
                <p class="text-sm font-semibold mb-0.5" style="color: var(--text-main);">{section.testimonial.name}</p>
                <p class="text-xs mb-2" style="color: var(--text-muted);">
                  {section.testimonial.business} · {section.testimonial.city}
                </p>
                <p class="text-xs leading-relaxed" style="color: var(--text-muted);">
                  {section.testimonial.note}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>
    {/each}

    <!-- ============ FAQ ============ -->
    <section class="py-16 md:py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-10">
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300 mb-3">FAQ</p>
          <h2 class="text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
            Perguntas comuns sobre extensões
          </h2>
          <p class="text-sm md:text-base leading-relaxed" style="color: var(--text-muted);">
            Dúvidas específicas de cada extensão e perguntas gerais sobre o Zelo PDV.
          </p>
        </div>

        <div class="space-y-2.5">
          {#each allFaqs as faq}
            <details class="group rounded-xl border transition-colors" style="background: var(--bg-card); border-color: var(--border-card);">
              <summary class="flex items-center justify-between cursor-pointer px-5 py-4 select-none gap-4">
                <div class="flex items-start gap-3 min-w-0">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] shrink-0 mt-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/20">
                    {faq.group}
                  </span>
                  <span class="text-sm font-medium text-white">{faq.question}</span>
                </div>
                <svg class="w-4 h-4 shrink-0 transition-transform group-open:rotate-180 text-sky-300" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div class="px-5 pb-5 pl-[4.5rem] text-sm leading-relaxed" style="color: var(--text-muted);">
                {faq.answer}
              </div>
            </details>
          {/each}
        </div>
      </div>
    </section>

    <!-- ============ FINAL CTA ============ -->
    <section class="py-16 md:py-24">
      <div class="max-w-3xl mx-auto px-6 text-center">
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300 mb-4">Teste 30 dias grátis</p>
        <h2 class="text-2xl md:text-4xl font-bold text-white tracking-tight leading-tight mb-5">
          Comece pelo essencial. Cresça quando precisar.
        </h2>
        <p class="text-base md:text-lg leading-relaxed mb-8" style="color: var(--text-muted);">
          Cria conta sem cartão, ativa as extensões que fizerem sentido no checkout, e usa por trinta dias completos. Se não fizer diferença, é só deixar o trial expirar.
        </p>
        <div class="flex flex-col sm:flex-row justify-center gap-3">
          <a
            href="/cadastro"
            class="px-7 py-3.5 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-full shadow-lg shadow-sky-950/40 transition-colors"
          >
            Começar trial 30 dias
          </a>
          <a
            href="/precificacao"
            class="px-7 py-3.5 text-sm font-semibold rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-colors"
            style="color: var(--text-label);"
          >
            Ver preços completos
          </a>
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>
