<script>
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingPriceSection from '$lib/components/marketing/MarketingPriceSection.svelte';
  import { generalFaqs } from '$lib/data/segmentLandingPages';
  import { competitorComparisons } from '$lib/data/competitorComparisons';
  import { cn } from '$lib/utils';
  import { ChevronDown } from 'lucide-svelte';

  export let comparison;

  $: allFaqs = [...comparison.faqSpecific, ...generalFaqs];
  $: otherComparisons = Object.values(competitorComparisons).filter((c) => c.slug !== comparison.slug);

  function openSupportChat() {
    window.dispatchEvent(new CustomEvent('zelo:open-support-chat'));
  }
</script>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-white"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <SiteHeader />

  <main>
    <!-- Hero -->
    <section class="relative pt-32 pb-20 overflow-hidden border-b border-white/5">
      <div class="absolute top-0 left-0 w-full h-72 bg-linear-to-b from-sky-500/10 to-transparent pointer-events-none"></div>
      <div class="absolute -top-8 right-0 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center relative z-10">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium mb-8">
            <span class="inline-flex w-2 h-2 rounded-full bg-sky-400"></span>
            {comparison.heroBadge}
          </div>

          <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
            {comparison.h1}
          </h1>

          <p class="text-lg md:text-xl max-w-2xl leading-relaxed mb-10" style="color: var(--text-muted);">
            {comparison.subtitle}
          </p>

          <div class="flex flex-col sm:flex-row gap-4 mb-5">
            <a
              href="/cadastro"
              class="w-full sm:w-auto px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1 text-center"
            >
              Testar 30 dias grátis
            </a>
            <a
              href="#comparativo"
              class="w-full sm:w-auto px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-center transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Ver comparativo
            </a>
          </div>

          <p class="text-sm" style="color: var(--text-muted);">
            Sem instalar nada. Cancele quando quiser durante o teste.
            <button type="button" on:click={openSupportChat} class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
              Falar com especialista
            </button>
          </p>
        </div>

        <!-- Price anchor card -->
        <div class="rounded-4xl border p-8 shadow-2xl" style="background: var(--bg-card); border-color: var(--border-card);">
          <p class="text-sm uppercase tracking-[0.2em] mb-6 text-sky-300">Comparação de preço</p>
          <div class="space-y-5">
            <div>
              <p class="text-xs uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Zelo PDV</p>
              <p class="text-3xl font-bold text-white">{comparison.priceAnchor.zelo}</p>
            </div>
            <div class="h-px w-full" style="background: var(--border-card);"></div>
            <div>
              <p class="text-xs uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">{comparison.competitor}</p>
              <p class="text-2xl font-semibold" style="color: var(--text-main);">{comparison.priceAnchor.competitor}</p>
            </div>
          </div>
          <p class="text-xs leading-relaxed mt-6 pt-5 border-t" style="color: var(--text-muted); border-color: var(--border-card);">
            {comparison.priceAnchor.note}
          </p>
        </div>
      </div>
    </section>

    <!-- Intro / context -->
    <section class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Contexto</p>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-8">{comparison.introTitle}</h2>
        {#each comparison.introParagraphs as paragraph}
          <p class="text-lg leading-relaxed mb-6" style="color: var(--text-muted);">
            {paragraph}
          </p>
        {/each}
      </div>
    </section>

    <!-- Comparison table -->
    <section id="comparativo" class="py-24 border-b border-white/5" style="background: var(--bg-panel);">
      <div class="max-w-5xl mx-auto px-6">
        <div class="max-w-3xl mb-12">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Comparativo</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Zelo PDV vs {comparison.competitor}, ponto a ponto</h2>
          <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
            {comparison.comparisonIntro}
          </p>
        </div>

        <div class="overflow-hidden rounded-3xl border" style="background: var(--bg-card); border-color: var(--border-card);">
          <div class="grid grid-cols-[1.2fr_1fr_1fr] text-sm font-semibold" style="background: var(--bg-panel); color: var(--text-muted);">
            <div class="p-4 md:p-5">Recurso</div>
            <div class="p-4 md:p-5">{comparison.competitor}</div>
            <div class="p-4 md:p-5 text-sky-300">Zelo PDV</div>
          </div>
          {#each comparison.comparisonRows as row}
            <div class="grid grid-cols-[1.2fr_1fr_1fr] border-t" style="border-color: var(--border-card);">
              <div class="p-4 md:p-5 font-medium" style="color: var(--text-main);">{row.feature}</div>
              <div class="p-4 md:p-5 leading-snug text-sm" style="color: var(--text-muted);">{row.competitor}</div>
              <div
                class={cn(
                  'p-4 md:p-5 leading-snug text-sm',
                  row.advantage === 'zelo' ? 'font-semibold text-white bg-sky-500/5' : 'text-foreground'
                )}
              >
                {row.zelo}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Reasons to switch -->
    <section class="py-24 border-b border-white/5">
      <div class="max-w-7xl mx-auto px-6">
        <div class="max-w-3xl mb-14">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Por que o Zelo</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{comparison.reasonsTitle}</h2>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          {#each comparison.reasons as reason}
            <article class="rounded-3xl border p-7" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5 bg-sky-500/10 border border-sky-500/20">
                {reason.icon}
              </div>
              <h3 class="text-2xl font-semibold text-white mb-3">{reason.title}</h3>
              <p class="leading-relaxed" style="color: var(--text-muted);">
                {reason.description}
              </p>
            </article>
          {/each}
        </div>

        {#if comparison.fairnessNote}
          <div class="mt-10 rounded-3xl border p-6 md:p-7" style="background: var(--bg-panel); border-color: var(--border-subtle);">
            <p class="text-sm uppercase tracking-[0.2em] mb-3 text-sky-300">Sendo justo</p>
            <p class="leading-relaxed" style="color: var(--text-muted);">{comparison.fairnessNote}</p>
          </div>
        {/if}
      </div>
    </section>

    <MarketingPriceSection />

    <!-- FAQ -->
    <section id="faq" class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Dúvidas comuns</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Zelo PDV vs {comparison.competitor}: o que perguntam</h2>
        </div>

        <div class="space-y-4">
          {#each allFaqs as faq}
            <details class="group rounded-2xl border transition-all duration-300" style="background: var(--bg-card); border-color: var(--border-card);">
              <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none gap-4">
                <span>{faq.question}</span>
                <ChevronDown class="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div class="px-6 pb-6 leading-relaxed" style="color: var(--text-muted);">
                {faq.answer}
              </div>
            </details>
          {/each}
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <div class="rounded-4xl border p-10 md:p-14" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Teste gratuito</p>
          <h2 class="text-3xl md:text-5xl font-bold text-white mb-6">{comparison.finalCtaTitle}</h2>
          <p class="text-lg leading-relaxed max-w-2xl mx-auto mb-8" style="color: var(--text-muted);">
            {comparison.finalCtaText}
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="/cadastro"
              class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1"
            >
              Testar 30 dias grátis
            </a>
            <a
              href="#comparativo"
              class="px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Rever comparativo
            </a>
          </div>
          <button type="button" on:click={openSupportChat} class="mt-5 text-sm text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
            Falar com especialista
          </button>
        </div>
      </div>
    </section>

    <!-- Compare com outros sistemas (cross-link interno) -->
    {#if otherComparisons.length}
      <section class="py-20 border-b border-white/5" style="background: var(--bg-panel);">
        <div class="max-w-7xl mx-auto px-6">
          <div class="max-w-3xl mb-10">
            <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Outros comparativos</p>
            <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Compare o Zelo PDV com outros sistemas</h2>
            <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
              Veja como o Zelo PDV se compara a outras opções do mercado, sempre com preço a partir de R$ 59/mês.
            </p>
          </div>

          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each otherComparisons as other}
              <a
                href={`/${other.slug}`}
                class="group rounded-2xl border p-5 transition-all hover:-translate-y-1"
                style="background: var(--bg-card); border-color: var(--border-card);"
              >
                <p class="text-lg font-semibold text-white mb-1 group-hover:text-sky-300 transition-colors">
                  Zelo PDV vs {other.competitor}
                </p>
                <p class="text-sm" style="color: var(--text-muted);">
                  R$ 59/mês vs {other.priceAnchor.competitor}
                </p>
              </a>
            {/each}
          </div>

          <div class="mt-8">
            <a href="/comparativos" class="text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
              Ver todos os comparativos
            </a>
          </div>
        </div>
      </section>
    {/if}

    <!-- Sources -->
    {#if comparison.sources?.length}
      <section class="py-12">
        <div class="max-w-4xl mx-auto px-6">
          <p class="text-xs uppercase tracking-[0.2em] mb-3" style="color: var(--text-muted);">Fontes (consultadas em {comparison.priceCheckedAt})</p>
          <ul class="space-y-1">
            {#each comparison.sources as source}
              <li class="text-xs" style="color: var(--text-muted);">
                <a href={source.url} target="_blank" rel="nofollow noopener" class="hover:text-sky-300 underline underline-offset-2">{source.label}</a>
              </li>
            {/each}
          </ul>
          <p class="text-xs mt-4 leading-relaxed" style="color: var(--text-muted);">
            Preços e informações de {comparison.competitor} foram coletados das fontes públicas acima em {comparison.priceCheckedAt} e podem ter mudado. Relatos de clientes citados são de terceiros (ex: Reclame Aqui). Marcas citadas pertencem aos respectivos titulares; esta página é um comparativo informativo.
          </p>
        </div>
      </section>
    {/if}
  </main>

  <MarketingFooter />
</div>
