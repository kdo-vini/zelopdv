<script>
  import MarketingHeader from '$lib/components/marketing/MarketingHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import { extensoes, getAddonPrice } from '$lib/data/extensoes';
  import { generalFaqs } from '$lib/data/segmentLandingPages';

  const meta = {
    title: 'Extensões — Add-ons do Zelo PDV (Mesas, Pedidos + Cozinha) | Zelo PDV',
    description:
      'Extensões opcionais do Zelo PDV: Módulo Mesas para bares e restaurantes (+R$ 30/mês) e Pedidos + Cozinha para lanchonetes com atendimento, cozinha e caixa separados (+R$ 30/mês). Combine só o que faz sentido.',
    canonical: 'https://zelopdv.com.br/extensoes'
  };

  const mesas = extensoes['mesas'];
  const pedidos = extensoes['pedidos-cozinha'];
  const mesasPrice = getAddonPrice('mesas');
  const pedidosPrice = getAddonPrice('pedidos');
  const basePrice = 59;

  const addonSections = [
    {
      data: mesas,
      anchor: 'mesas',
      price: mesasPrice,
      label: 'Módulo Mesas',
      shortDesc: 'Comanda, divisão de conta e mapa de salão para bares e restaurantes pequenos.'
    },
    {
      data: pedidos,
      anchor: 'pedidos-cozinha',
      price: pedidosPrice,
      label: 'Pedidos + Cozinha',
      shortDesc: 'Atendente lança, cozinha prepara, caixa cobra. Sem ticket de papel.'
    }
  ];

  const allFaqs = [
    ...mesas.faqSpecific.map((f) => ({ ...f, group: 'Módulo Mesas' })),
    ...pedidos.faqSpecific.map((f) => ({ ...f, group: 'Pedidos + Cozinha' })),
    ...generalFaqs.map((f) => ({ ...f, group: 'Geral' }))
  ];

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: addonSections.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${meta.canonical}#${s.anchor}`,
      name: s.label
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
    <!-- HERO -->
    <section class="relative pt-32 pb-20 overflow-hidden border-b border-white/5">
      <div class="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none"></div>
      <div class="absolute -top-8 right-0 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none"></div>
      <div class="absolute -top-8 -left-24 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none"></div>

      <div class="max-w-5xl mx-auto px-6 relative z-10 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium mb-6">
          <span class="inline-flex w-2 h-2 rounded-full bg-amber-400"></span>
          Extensões opcionais do Zelo PDV
        </div>
        <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-[1.05] mb-6">
          Combine só o que faz sentido pro seu negócio
        </h1>
        <p class="text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-3" style="color: var(--text-muted);">
          O plano base do Zelo PDV cobre o essencial — caixa, fiado, estoque, despesas e relatórios — por R$ {basePrice}/mês.
        </p>
        <p class="text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-10" style="color: var(--text-muted);">
          Quem precisa de salão com mesas, ou de cozinha separada do caixa, ativa as extensões abaixo. Cada uma é opcional, individual e cancelável a qualquer momento.
        </p>

        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="#mesas"
            class="px-6 py-3 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 hover:border-rose-400/40 transition-all text-white text-sm inline-flex items-center gap-2"
          >
            <span class="inline-flex w-2 h-2 rounded-full bg-rose-400"></span>
            Módulo Mesas
          </a>
          <a
            href="#pedidos-cozinha"
            class="px-6 py-3 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 hover:border-amber-400/40 transition-all text-white text-sm inline-flex items-center gap-2"
          >
            <span class="inline-flex w-2 h-2 rounded-full bg-amber-400"></span>
            Pedidos + Cozinha
          </a>
        </div>
      </div>
    </section>

    <!-- VISUAL TOC / ANCHOR CARDS -->
    <section class="py-16 border-b border-white/5">
      <div class="max-w-6xl mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-5">
          <!-- Mesas anchor card -->
          <a
            href="#mesas"
            class="group rounded-3xl border p-7 transition-all hover:-translate-y-1 hover:border-rose-400/40"
            style="background: var(--bg-card); border-color: var(--border-card);"
          >
            <div class="flex items-start justify-between gap-4 mb-5">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <svg class="w-6 h-6 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-300 mb-1">Add-on</p>
                  <p class="text-xl font-bold text-white">Módulo Mesas</p>
                </div>
              </div>
              <div class="text-right shrink-0">
                <p class="text-2xl font-bold text-white">+R$ {mesasPrice.toFixed(0)}</p>
                <p class="text-[11px]" style="color: var(--text-muted);">/mês</p>
              </div>
            </div>
            <p class="text-base leading-relaxed mb-5" style="color: var(--text-muted);">
              {mesas.subtitle}
            </p>
            <div class="flex flex-wrap gap-2 mb-6">
              {#each mesas.forSegments.slice(0, 4) as segment}
                <span class="px-2.5 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5" style="color: var(--text-label);">
                  {segment}
                </span>
              {/each}
            </div>
            <span class="inline-flex items-center gap-2 text-sm font-semibold text-rose-300 group-hover:gap-3 transition-all">
              Ver detalhes
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
          </a>

          <!-- Pedidos anchor card -->
          <a
            href="#pedidos-cozinha"
            class="group rounded-3xl border p-7 transition-all hover:-translate-y-1 hover:border-amber-400/40"
            style="background: var(--bg-card); border-color: var(--border-card);"
          >
            <div class="flex items-start justify-between gap-4 mb-5">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <svg class="w-6 h-6 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 3.75h3m-1.5 0v2.25m-6.75 6h13.5M5.25 12A6.75 6.75 0 0112 5.25 6.75 6.75 0 0118.75 12m-13.5 0v2.25a4.5 4.5 0 004.5 4.5h4.5a4.5 4.5 0 004.5-4.5V12" />
                  </svg>
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300 mb-1">Add-on</p>
                  <p class="text-xl font-bold text-white">Pedidos + Cozinha</p>
                </div>
              </div>
              <div class="text-right shrink-0">
                <p class="text-2xl font-bold text-white">+R$ {pedidosPrice.toFixed(0)}</p>
                <p class="text-[11px]" style="color: var(--text-muted);">/mês</p>
              </div>
            </div>
            <p class="text-base leading-relaxed mb-5" style="color: var(--text-muted);">
              {pedidos.subtitle}
            </p>
            <div class="flex flex-wrap gap-2 mb-6">
              {#each pedidos.forSegments.slice(0, 4) as segment}
                <span class="px-2.5 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5" style="color: var(--text-label);">
                  {segment}
                </span>
              {/each}
            </div>
            <span class="inline-flex items-center gap-2 text-sm font-semibold text-amber-300 group-hover:gap-3 transition-all">
              Ver detalhes
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </section>

    <!-- ============ MESAS SECTION ============ -->
    <section id="mesas" class="relative py-24 border-b border-white/5 scroll-mt-24">
      <div class="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-72 rounded-full bg-rose-500/5 blur-3xl pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-6 relative z-10">
        <!-- Section header -->
        <div class="max-w-3xl mb-14">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-medium mb-5">
            <span class="inline-flex w-2 h-2 rounded-full bg-rose-400"></span>
            Add-on · +R$ {mesasPrice.toFixed(0)}/mês
          </div>
          <h2 class="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-6">
            {mesas.h1.split(':')[0].trim()}<span class="text-rose-300">.</span>
          </h2>
          <p class="text-lg md:text-xl leading-relaxed mb-6" style="color: var(--text-muted);">
            {mesas.subtitle}
          </p>
          <div class="flex flex-wrap gap-2">
            {#each mesas.forSegments as segment}
              <span class="px-3 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5" style="color: var(--text-label);">
                {segment}
              </span>
            {/each}
          </div>
        </div>

        <!-- Problem + Highlights split -->
        <div class="grid lg:grid-cols-[1.15fr,0.85fr] gap-10 mb-16">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300 mb-3">A dor</p>
            <h3 class="text-2xl md:text-3xl font-bold text-white mb-6">{mesas.problemTitle}</h3>
            {#each mesas.problemParagraphs as paragraph}
              <p class="text-base md:text-lg leading-relaxed mb-5" style="color: var(--text-muted);">
                {paragraph}
              </p>
            {/each}
          </div>

          <div class="grid gap-3">
            {#each mesas.problemPoints as point}
              <div class="rounded-2xl border p-5" style="background: var(--bg-card); border-color: var(--border-card);">
                <p class="text-[11px] font-semibold uppercase tracking-[0.25em] mb-2" style="color: var(--text-muted);">{point.label}</p>
                <p class="text-sm md:text-base leading-relaxed" style="color: var(--text-main);">{point.value}</p>
              </div>
            {/each}
          </div>
        </div>

        <!-- Features grid -->
        <div class="mb-16">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300 mb-3">O que tem dentro</p>
          <h3 class="text-2xl md:text-3xl font-bold text-white mb-3">{mesas.featuresTitle}</h3>
          <p class="text-base leading-relaxed max-w-3xl mb-10" style="color: var(--text-muted);">{mesas.featuresIntro}</p>

          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {#each mesas.features as feature}
              <article class="rounded-2xl border p-6" style="background: var(--bg-card); border-color: var(--border-card);">
                <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4 bg-rose-500/10 border border-rose-500/20" aria-hidden="true">
                  {feature.icon}
                </div>
                <h4 class="text-lg font-semibold text-white mb-2">{feature.title}</h4>
                <p class="text-sm leading-relaxed" style="color: var(--text-muted);">
                  {feature.description}
                </p>
              </article>
            {/each}
          </div>
        </div>

        <!-- Steps + Testimonial split -->
        <div class="grid lg:grid-cols-[1.4fr,1fr] gap-10 items-start">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300 mb-3">Como funciona</p>
            <h3 class="text-2xl md:text-3xl font-bold text-white mb-3">{mesas.howTitle}</h3>
            <p class="text-base leading-relaxed mb-8" style="color: var(--text-muted);">{mesas.howIntro}</p>

            <ol class="space-y-4">
              {#each mesas.steps as step, index}
                <li class="flex gap-5 rounded-2xl border p-5" style="background: var(--bg-card); border-color: var(--border-card);">
                  <div class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-base font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20">
                    {index + 1}
                  </div>
                  <div>
                    <h4 class="text-base font-semibold text-white mb-1">{step.title}</h4>
                    <p class="text-sm leading-relaxed" style="color: var(--text-muted);">{step.description}</p>
                  </div>
                </li>
              {/each}
            </ol>
          </div>

          <aside class="rounded-3xl border p-7" style="background: var(--bg-panel); border-color: var(--border-subtle);">
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300 mb-4">Depoimento</p>
            <p class="text-lg md:text-xl font-medium leading-relaxed text-white mb-6">
              "{mesas.testimonial.quote}"
            </p>
            <div class="border-t pt-4" style="border-color: var(--border-subtle);">
              <p class="text-sm font-semibold mb-1" style="color: var(--text-main);">{mesas.testimonial.name}</p>
              <p class="text-xs mb-3" style="color: var(--text-muted);">
                {mesas.testimonial.business} · {mesas.testimonial.city}
              </p>
              <p class="text-xs leading-relaxed" style="color: var(--text-muted);">
                {mesas.testimonial.note}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <!-- ============ PEDIDOS + COZINHA SECTION ============ -->
    <section id="pedidos-cozinha" class="relative py-24 border-b border-white/5 scroll-mt-24" style="background: var(--bg-panel);">
      <div class="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-72 rounded-full bg-amber-500/5 blur-3xl pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-6 relative z-10">
        <!-- Section header -->
        <div class="max-w-3xl mb-14">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium mb-5">
            <span class="inline-flex w-2 h-2 rounded-full bg-amber-400"></span>
            Add-on · +R$ {pedidosPrice.toFixed(0)}/mês
          </div>
          <h2 class="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-6">
            {pedidos.h1.split(':')[0].trim()}<span class="text-amber-300">.</span>
          </h2>
          <p class="text-lg md:text-xl leading-relaxed mb-6" style="color: var(--text-muted);">
            {pedidos.subtitle}
          </p>
          <div class="flex flex-wrap gap-2">
            {#each pedidos.forSegments as segment}
              <span class="px-3 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5" style="color: var(--text-label);">
                {segment}
              </span>
            {/each}
          </div>
        </div>

        <!-- Problem + Highlights split -->
        <div class="grid lg:grid-cols-[1.15fr,0.85fr] gap-10 mb-16">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300 mb-3">A dor</p>
            <h3 class="text-2xl md:text-3xl font-bold text-white mb-6">{pedidos.problemTitle}</h3>
            {#each pedidos.problemParagraphs as paragraph}
              <p class="text-base md:text-lg leading-relaxed mb-5" style="color: var(--text-muted);">
                {paragraph}
              </p>
            {/each}
          </div>

          <div class="grid gap-3">
            {#each pedidos.problemPoints as point}
              <div class="rounded-2xl border p-5" style="background: var(--bg-card); border-color: var(--border-card);">
                <p class="text-[11px] font-semibold uppercase tracking-[0.25em] mb-2" style="color: var(--text-muted);">{point.label}</p>
                <p class="text-sm md:text-base leading-relaxed" style="color: var(--text-main);">{point.value}</p>
              </div>
            {/each}
          </div>
        </div>

        <!-- Features grid -->
        <div class="mb-16">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300 mb-3">O que tem dentro</p>
          <h3 class="text-2xl md:text-3xl font-bold text-white mb-3">{pedidos.featuresTitle}</h3>
          <p class="text-base leading-relaxed max-w-3xl mb-10" style="color: var(--text-muted);">{pedidos.featuresIntro}</p>

          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {#each pedidos.features as feature}
              <article class="rounded-2xl border p-6" style="background: var(--bg-card); border-color: var(--border-card);">
                <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4 bg-amber-500/10 border border-amber-500/20" aria-hidden="true">
                  {feature.icon}
                </div>
                <h4 class="text-lg font-semibold text-white mb-2">{feature.title}</h4>
                <p class="text-sm leading-relaxed" style="color: var(--text-muted);">
                  {feature.description}
                </p>
              </article>
            {/each}
          </div>
        </div>

        <!-- Steps + Testimonial split -->
        <div class="grid lg:grid-cols-[1.4fr,1fr] gap-10 items-start">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300 mb-3">Como funciona</p>
            <h3 class="text-2xl md:text-3xl font-bold text-white mb-3">{pedidos.howTitle}</h3>
            <p class="text-base leading-relaxed mb-8" style="color: var(--text-muted);">{pedidos.howIntro}</p>

            <ol class="space-y-4">
              {#each pedidos.steps as step, index}
                <li class="flex gap-5 rounded-2xl border p-5" style="background: var(--bg-card); border-color: var(--border-card);">
                  <div class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-base font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20">
                    {index + 1}
                  </div>
                  <div>
                    <h4 class="text-base font-semibold text-white mb-1">{step.title}</h4>
                    <p class="text-sm leading-relaxed" style="color: var(--text-muted);">{step.description}</p>
                  </div>
                </li>
              {/each}
            </ol>
          </div>

          <aside class="rounded-3xl border p-7" style="background: var(--bg-card); border-color: var(--border-subtle);">
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300 mb-4">Depoimento</p>
            <p class="text-lg md:text-xl font-medium leading-relaxed text-white mb-6">
              "{pedidos.testimonial.quote}"
            </p>
            <div class="border-t pt-4" style="border-color: var(--border-subtle);">
              <p class="text-sm font-semibold mb-1" style="color: var(--text-main);">{pedidos.testimonial.name}</p>
              <p class="text-xs mb-3" style="color: var(--text-muted);">
                {pedidos.testimonial.business} · {pedidos.testimonial.city}
              </p>
              <p class="text-xs leading-relaxed" style="color: var(--text-muted);">
                {pedidos.testimonial.note}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <!-- PRICING / HOW IT WORKS -->
    <section class="py-24 border-b border-white/5">
      <div class="max-w-5xl mx-auto px-6">
        <div class="text-center mb-14">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300 mb-4">Preço claro</p>
          <h2 class="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-5">
            Plano base + extensões opcionais
          </h2>
          <p class="text-base md:text-lg leading-relaxed max-w-2xl mx-auto" style="color: var(--text-muted);">
            Cada extensão é cobrada como linha separada no Stripe, com proporcionalidade no ciclo. Pode ligar e desligar a qualquer momento direto na sua página de assinatura.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-4 mb-10">
          <div class="rounded-3xl border p-6 text-center" style="background: var(--bg-card); border-color: var(--border-card);">
            <p class="text-[11px] font-semibold uppercase tracking-[0.25em] mb-3 text-sky-300">Plano base</p>
            <p class="text-4xl font-bold text-white mb-1">R$ {basePrice}<span class="text-sm font-medium" style="color: var(--text-muted);">/mês</span></p>
            <p class="text-xs leading-relaxed" style="color: var(--text-muted);">PDV completo: caixa, fiado, estoque, despesas, relatórios</p>
          </div>
          <div class="rounded-3xl border p-6 text-center" style="background: var(--bg-card); border-color: var(--border-card);">
            <p class="text-[11px] font-semibold uppercase tracking-[0.25em] mb-3 text-rose-300">+ Mesas</p>
            <p class="text-4xl font-bold text-white mb-1">+R$ {mesasPrice.toFixed(0)}<span class="text-sm font-medium" style="color: var(--text-muted);">/mês</span></p>
            <p class="text-xs leading-relaxed" style="color: var(--text-muted);">Comanda, divisão, mapa de salão, taxa de serviço</p>
          </div>
          <div class="rounded-3xl border p-6 text-center" style="background: var(--bg-card); border-color: var(--border-card);">
            <p class="text-[11px] font-semibold uppercase tracking-[0.25em] mb-3 text-amber-300">+ Pedidos & Cozinha</p>
            <p class="text-4xl font-bold text-white mb-1">+R$ {pedidosPrice.toFixed(0)}<span class="text-sm font-medium" style="color: var(--text-muted);">/mês</span></p>
            <p class="text-xs leading-relaxed" style="color: var(--text-muted);">Atendente, painel de cozinha, fila do caixa</p>
          </div>
        </div>

        <div class="rounded-3xl border p-8 md:p-10 text-center" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <p class="text-sm mb-3" style="color: var(--text-muted);">Combinando os dois add-ons no plano completo</p>
          <p class="text-5xl md:text-6xl font-bold text-white mb-2">
            R$ {basePrice + mesasPrice + pedidosPrice}
            <span class="text-xl font-medium" style="color: var(--text-muted);">/mês</span>
          </p>
          <p class="text-sm leading-relaxed max-w-xl mx-auto mb-8" style="color: var(--text-muted);">
            R$ {basePrice} (base) + R$ {mesasPrice.toFixed(0)} (Mesas) + R$ {pedidosPrice.toFixed(0)} (Pedidos & Cozinha). Sem taxa de adesão. Trial de 30 dias gratuito cobrindo tudo.
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-3">
            <a
              href="/cadastro"
              class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1"
            >
              Testar 30 dias grátis
            </a>
            <a
              href="/precificacao"
              class="px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Ver preços completos
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="py-24 border-b border-white/5" style="background: var(--bg-panel);">
      <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300 mb-4">FAQ</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-3">Perguntas comuns sobre as extensões</h2>
          <p class="text-base leading-relaxed" style="color: var(--text-muted);">
            Dúvidas específicas de cada add-on e perguntas gerais sobre o Zelo PDV.
          </p>
        </div>

        <div class="space-y-3">
          {#each allFaqs as faq}
            <details class="group rounded-2xl border transition-all duration-300" style="background: var(--bg-card); border-color: var(--border-card);">
              <summary class="flex items-center justify-between cursor-pointer p-6 select-none gap-4">
                <div class="flex items-start gap-3 min-w-0">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-1 border bg-white/5" style="color: var(--text-muted); border-color: var(--border-subtle);">
                    {faq.group}
                  </span>
                  <span class="font-medium text-white">{faq.question}</span>
                </div>
                <svg class="w-5 h-5 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div class="px-6 pb-6 leading-relaxed" style="color: var(--text-muted);">
                {faq.answer}
              </div>
            </details>
          {/each}
        </div>
      </div>
    </section>

    <!-- FINAL CTA -->
    <section class="py-24">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <div class="rounded-[2rem] border p-10 md:p-14 relative overflow-hidden" style="background: var(--bg-card); border-color: var(--border-card);">
          <div class="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-48 rounded-full bg-sky-500/10 blur-3xl pointer-events-none"></div>
          <div class="relative z-10">
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300 mb-4">Teste gratuito</p>
            <h2 class="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-5">
              Teste o Zelo PDV com as extensões por 30 dias grátis
            </h2>
            <p class="text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-8" style="color: var(--text-muted);">
              Cria conta sem cartão, ativa as extensões que fizerem sentido no checkout e usa por trinta dias completos. Se não fizer diferença na sua operação, é só deixar o trial expirar.
            </p>
            <div class="flex flex-col sm:flex-row justify-center gap-3">
              <a
                href="/cadastro"
                class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1"
              >
                Começar trial 30 dias
              </a>
              <a
                href="/assinatura"
                class="px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:text-white"
                style="color: var(--text-label);"
              >
                Já tenho conta — ativar add-on
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>
