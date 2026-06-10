<script>
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingPriceSection from '$lib/components/marketing/MarketingPriceSection.svelte';
  import { competitorComparisons } from '$lib/data/competitorComparisons';

  const comparisons = Object.values(competitorComparisons);

  const meta = {
    title: 'Zelo PDV vs Concorrentes: Comparativos de Sistemas de PDV | Zelo PDV',
    description:
      'Compare o Zelo PDV (a partir de R$ 59/mês, modular e offline) com Saipos, Goomer, Anota AI, Bling, Conta Azul e outros sistemas de PDV e gestão.',
    canonical: 'https://zelopdv.com.br/comparativos'
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Comparativos Zelo PDV vs concorrentes',
    itemListElement: comparisons.map((c, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `Zelo PDV vs ${c.competitor}`,
      url: `https://zelopdv.com.br/${c.slug}`
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
</svelte:head>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-white"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <SiteHeader />

  <main>
    <section class="relative pt-32 pb-16 overflow-hidden border-b border-white/5">
      <div class="absolute top-0 left-0 w-full h-72 bg-linear-to-b from-sky-500/10 to-transparent pointer-events-none"></div>
      <div class="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium mb-8">
          <span class="inline-flex w-2 h-2 rounded-full bg-sky-400"></span>
          Comparativos honestos
        </div>
        <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
          Zelo PDV vs os outros sistemas do mercado
        </h1>
        <p class="text-lg md:text-xl leading-relaxed" style="color: var(--text-muted);">
          A partir de R$ 59/mês, modular e funcionando offline. Veja, ponto a ponto e com preços datados, como o Zelo PDV se compara aos principais sistemas de PDV e gestão do Brasil.
        </p>
      </div>
    </section>

    <section class="py-20 border-b border-white/5">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {#each comparisons as comparison}
            <a
              href={`/${comparison.slug}`}
              class="group rounded-3xl border p-7 transition-all hover:-translate-y-1"
              style="background: var(--bg-card); border-color: var(--border-card);"
            >
              <p class="text-sm uppercase tracking-[0.2em] mb-3 text-sky-300">Comparativo</p>
              <h2 class="text-2xl font-semibold text-white mb-3 group-hover:text-sky-300 transition-colors">
                Zelo PDV vs {comparison.competitor}
              </h2>
              <p class="text-sm leading-relaxed mb-4" style="color: var(--text-muted);">
                R$ 59/mês vs {comparison.priceAnchor.competitor}
              </p>
              <span class="text-sm font-semibold text-sky-300 group-hover:text-sky-200 underline underline-offset-4">
                Ver comparativo
              </span>
            </a>
          {/each}
        </div>
      </div>
    </section>

    <MarketingPriceSection />
  </main>

  <MarketingFooter />
</div>
