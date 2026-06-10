<script>
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingPriceSection from '$lib/components/marketing/MarketingPriceSection.svelte';
  import { competitorComparisons } from '$lib/data/competitorComparisons';
  import { ArrowRight } from 'lucide-svelte';

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
    <!-- HERO -->
    <section class="relative pt-24 md:pt-32 pb-12 md:pb-20 overflow-hidden border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <h1 class="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-4 md:mb-6" style="text-wrap: balance;">
          Zelo PDV vs os outros sistemas do mercado
        </h1>

        <p class="text-base md:text-xl max-w-2xl mx-auto mb-6 md:mb-8 leading-relaxed" style="color: var(--text-muted);">
          A partir de R$ 59/mês, modular e funcionando offline. Veja, ponto a ponto e com preços datados, como o Zelo PDV se compara aos principais sistemas de PDV e gestão do Brasil.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mb-3 md:mb-4">
          <a href="/cadastro" class="w-full sm:w-auto px-8 py-3.5 md:py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1 text-center">
            Testar 30 dias grátis
          </a>
          <a href="#comparativos" class="px-1 py-2 md:py-4 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4 transition-colors">
            Ver comparativos
          </a>
        </div>

        <p class="text-xs md:text-sm" style="color: var(--text-muted);">
          30 dias grátis. Sem cartão, sem cobrança automática.
          <button type="button" class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
            Tem dúvida? Fala com a gente.
          </button>
        </p>
      </div>
    </section>

    <!-- COMPARISON CARDS -->
    <section id="comparativos" class="py-20 border-b border-white/5">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {#each comparisons as comparison}
            <a
              href={`/${comparison.slug}`}
              class="group rounded-3xl border p-7 transition-all hover:-translate-y-1"
              style="background: var(--bg-card); border-color: var(--border-card);"
            >
              <h2 class="text-2xl font-semibold text-white mb-3 group-hover:text-sky-300 transition-colors">
                Zelo PDV × {comparison.competitor}
              </h2>
              <p class="text-sm leading-relaxed mb-4" style="color: var(--text-muted);">
                R$ 59/mês vs {comparison.priceAnchor.competitor}
              </p>
              <span class="text-sm font-semibold text-sky-300 group-hover:text-sky-200 inline-flex items-center gap-1.5">
                Ver comparativo
                <ArrowRight class="size-3.5" aria-hidden="true" />
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
