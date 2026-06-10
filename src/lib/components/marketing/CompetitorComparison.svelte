<script>
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import { generalFaqs } from '$lib/data/segmentLandingPages';
  import { competitorComparisons } from '$lib/data/competitorComparisons';
  import { resolveAppIcon } from '$lib/icons/appIcons';
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
    <section class="relative pt-32 pb-16 overflow-hidden border-b border-white/5">
      <div class="max-w-3xl mx-auto px-6">
        <p class="text-xs tracking-wider" style="color: var(--text-muted);">
          Comparativo · Atualizado em {comparison.priceCheckedAt} ·
          <a href="#fontes" class="text-sky-300 hover:text-sky-200 underline underline-offset-4">Fontes</a>
        </p>

        <h1 class="mt-4 text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight" style="text-wrap: balance;">
          Zelo PDV × {comparison.competitor}
        </h1>

        <p class="mt-6 text-lg md:text-xl leading-relaxed" style="color: var(--text-label);">
          {comparison.editorialThesis || comparison.subtitle}
        </p>

        <div class="mt-10 flex flex-col sm:flex-row gap-4 items-start">
          <a href="#comparativo" class="px-6 py-3 rounded-full font-semibold border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/15 transition-colors">
            Ver comparativo →
          </a>
          <a href="/cadastro" class="px-6 py-3 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4 transition-colors">
            Testar Zelo PDV grátis
          </a>
        </div>
      </div>
    </section>

    <!-- Intro / context -->
    <section class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
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
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Zelo PDV × {comparison.competitor}, lado a lado</h2>
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
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{comparison.reasonsTitle}</h2>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          {#each comparison.reasons as reason}
            <article class="rounded-3xl border p-7" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5 bg-sky-500/10 border border-sky-500/20">
                <svelte:component this={resolveAppIcon(reason.icon)} class="size-7 text-sky-300" aria-hidden="true" />
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

    <section class="py-20 border-b border-white/5" style="background: var(--bg-panel);">
      <div class="max-w-4xl mx-auto px-6">
        <div class="rounded-2xl border p-6 md:p-7" style="background: var(--bg-card); border-color: var(--border-card);">
          <h2 class="text-2xl md:text-3xl font-bold text-white mb-3">R$ 59/mês — plano único</h2>
          <p class="leading-relaxed mb-4" style="color: var(--text-muted);">
            A base do Zelo PDV inclui frente de caixa, fiado, estoque e controle financeiro. O resto entra como módulo opcional quando fizer sentido.
          </p>
          <a href="/precificacao" class="text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
            Ver detalhes da precificação →
          </a>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">As perguntas mais comuns: Zelo PDV × {comparison.competitor}</h2>
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
        <div class="border-t pt-12" style="border-color: var(--border-subtle);">
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
            Fala com a gente
          </button>
        </div>
      </div>
    </section>

    <!-- Compare com outros sistemas (cross-link interno) -->
    {#if otherComparisons.length}
      <section class="py-20 border-b border-white/5" style="background: var(--bg-panel);">
        <div class="max-w-7xl mx-auto px-6">
          <div class="max-w-3xl mb-10">
            <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Compare o Zelo PDV com outros sistemas</h2>
            <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
              Mais 11 comparativos. Mesmo Zelo PDV, outros competidores.
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
                  Zelo PDV × {other.competitor}
                </p>
                <p class="text-sm" style="color: var(--text-muted);">
                  R$ 59/mês × {other.priceAnchor.competitor}
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
      <section id="fontes" class="py-12">
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
