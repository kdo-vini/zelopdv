<script>
  import MarketingHeader from '$lib/components/marketing/MarketingHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import { extensoesList, getAddonPrice } from '$lib/data/extensoes';

  const meta = {
    title: 'Extensões — Add-ons do Zelo PDV (Mesas, Pedidos + Cozinha) | Zelo PDV',
    description:
      'Extensões opcionais do Zelo PDV: Módulo Mesas para bares e restaurantes (+R$ 30/mês) e Pedidos + Cozinha para lanchonetes com atendente, cozinha e caixa separados (+R$ 30/mês). Combine só o que precisa.',
    canonical: 'https://zelopdv.com.br/extensoes'
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: extensoesList.map((ext, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: ext.meta.canonical,
      name: ext.h1.split(':')[0].trim()
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
  <MarketingHeader />

  <main>
    <section class="relative pt-32 pb-16 overflow-hidden border-b border-white/5">
      <div class="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none"></div>
      <div class="absolute -top-8 right-0 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none"></div>

      <div class="max-w-5xl mx-auto px-6 relative z-10 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium mb-6">
          <span class="inline-flex w-2 h-2 rounded-full bg-amber-400"></span>
          Extensões do Zelo PDV
        </div>
        <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
          Combine só o que faz sentido pro seu negócio
        </h1>
        <p class="text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-2" style="color: var(--text-muted);">
          O plano base do Zelo PDV cobre o essencial — caixa, fiado, estoque, despesas e relatórios — por R$ 59/mês.
        </p>
        <p class="text-lg md:text-xl max-w-3xl mx-auto leading-relaxed" style="color: var(--text-muted);">
          Quem precisa de salão com mesas, ou de cozinha separada do caixa, ativa as extensões abaixo. Cada uma é opcional, individual e cancelável a qualquer momento.
        </p>
      </div>
    </section>

    <section class="py-20">
      <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-6">
        {#each extensoesList as ext (ext.slug)}
          {@const price = getAddonPrice(ext.addonId)}
          <a
            href="/extensoes/{ext.slug}"
            class="group rounded-3xl border p-8 transition-all hover:-translate-y-1 hover:border-amber-500/40"
            style="background: var(--bg-card); border-color: var(--border-card);"
          >
            <div class="flex items-start justify-between gap-4 mb-5">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium">
                <span class="inline-flex w-2 h-2 rounded-full bg-amber-400"></span>
                Add-on
              </div>
              <div class="text-right">
                <p class="text-xs uppercase tracking-[0.2em]" style="color: var(--text-muted);">Adicional</p>
                <p class="text-2xl font-bold text-amber-300">+R$ {price.toFixed(0)}<span class="text-sm font-medium" style="color: var(--text-muted);">/mês</span></p>
              </div>
            </div>

            <h2 class="text-2xl md:text-3xl font-bold text-white mb-3 group-hover:text-amber-200 transition-colors">
              {ext.h1.split(':')[0].trim()}
            </h2>
            <p class="text-base leading-relaxed mb-5" style="color: var(--text-muted);">
              {ext.subtitle}
            </p>

            {#if ext.forSegments?.length}
              <div class="flex flex-wrap gap-2 mb-6">
                {#each ext.forSegments.slice(0, 4) as segment}
                  <span class="px-2.5 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5" style="color: var(--text-label);">
                    {segment}
                  </span>
                {/each}
              </div>
            {/if}

            <ul class="space-y-2 mb-6">
              {#each ext.highlights.slice(0, 3) as highlight}
                <li class="flex items-start gap-2 text-sm" style="color: var(--text-label);">
                  <svg class="w-5 h-5 shrink-0 text-amber-300 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{highlight}</span>
                </li>
              {/each}
            </ul>

            <span class="inline-flex items-center gap-2 text-sm font-semibold text-amber-300 group-hover:gap-3 transition-all">
              Ver detalhes
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
          </a>
        {/each}

        <div class="rounded-3xl border-2 border-dashed p-8 flex flex-col justify-center items-center text-center" style="border-color: var(--border-subtle);">
          <p class="text-xs uppercase tracking-[0.25em] mb-3" style="color: var(--text-muted);">Em breve</p>
          <h3 class="text-xl font-bold text-white mb-2">Mais extensões chegando</h3>
          <p class="text-sm leading-relaxed max-w-xs" style="color: var(--text-muted);">
            Delivery próprio, integração com WhatsApp, fidelidade e mais. Quem está no plano base não paga por nada disso até precisar.
          </p>
        </div>
      </div>
    </section>

    <section class="py-20 border-t border-white/5" style="background: var(--bg-panel);">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">Como funciona</p>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">
          Plano base R$ 59 + extensões opcionais
        </h2>
        <p class="text-lg leading-relaxed max-w-2xl mx-auto mb-10" style="color: var(--text-muted);">
          Você ativa só o que faz sentido pra sua operação. Cada extensão é cobrada como linha separada no Stripe, com proporcionalidade no ciclo. Pode ligar e desligar a qualquer momento direto na sua página de assinatura.
        </p>
        <div class="flex flex-col sm:flex-row justify-center gap-4">
          <a
            href="/cadastro"
            class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold transition-all hover:-translate-y-1"
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
    </section>
  </main>

  <MarketingFooter />
</div>
