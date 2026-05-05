<script>
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SiteHeader from "$lib/components/marketing/SiteHeader.svelte";
  import MarketingPriceSection from '$lib/components/marketing/MarketingPriceSection.svelte';
  import { generalFaqs } from '$lib/data/segmentLandingPages';

  export let page;

  $: allFaqs = [...page.faqSpecific, ...generalFaqs];
</script>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-white"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <SiteHeader />

  <main>
    <section class="relative pt-32 pb-20 overflow-hidden border-b border-white/5">
      <div class="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-sky-500/10 to-transparent pointer-events-none"></div>
      <div class="absolute -top-8 right-0 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr,0.9fr] gap-14 items-center relative z-10">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium mb-8">
            <span class="inline-flex w-2 h-2 rounded-full bg-sky-400"></span>
            {page.heroBadge}
          </div>

          <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
            {page.h1}
          </h1>

          <p class="text-lg md:text-xl max-w-2xl leading-relaxed mb-10" style="color: var(--text-muted);">
            {page.subtitle}
          </p>

          <div class="flex flex-col sm:flex-row gap-4 mb-5">
            <a
              href="/cadastro"
              class="w-full sm:w-auto px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1 text-center"
            >
              Testar 30 dias grátis
            </a>
            <a
              href="#features"
              class="w-full sm:w-auto px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-center transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Ver como funciona
            </a>
          </div>

          <p class="text-sm" style="color: var(--text-muted);">
            Sem instalar nada. Cancele quando quiser durante o teste.
          </p>
        </div>

        <div class="grid sm:grid-cols-3 lg:grid-cols-1 gap-4">
          {#each page.highlights as highlight}
            <div class="rounded-3xl border p-6 shadow-lg" style="background: var(--bg-card); border-color: var(--border-card);">
              <p class="text-sm uppercase tracking-[0.2em] mb-3 text-sky-300">Zelo PDV</p>
              <p class="text-lg font-semibold leading-relaxed" style="color: var(--text-main);">
                {highlight}
              </p>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section class="py-24 border-b border-white/5">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.15fr,0.85fr] gap-12 items-start">
        <div>
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Problema</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-8">{page.problemTitle}</h2>

          {#each page.problemParagraphs as paragraph}
            <p class="text-lg leading-relaxed mb-6" style="color: var(--text-muted);">
              {paragraph}
            </p>
          {/each}
        </div>

        <div class="grid gap-4">
          {#each page.problemPoints as point}
            <div class="rounded-3xl border p-6" style="background: var(--bg-card); border-color: var(--border-card);">
              <p class="text-xs uppercase tracking-[0.25em] mb-3" style="color: var(--text-muted);">{point.label}</p>
              <p class="text-base leading-relaxed" style="color: var(--text-main);">{point.value}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section id="features" class="py-24 border-b border-white/5" style="background: var(--bg-panel);">
      <div class="max-w-7xl mx-auto px-6">
        <div class="max-w-3xl mb-14">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Funcionalidades</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{page.featuresTitle}</h2>
          <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
            {page.featuresIntro}
          </p>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          {#each page.features as feature}
            <article class="rounded-3xl border p-7" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5 bg-sky-500/10 border border-sky-500/20">
                {feature.icon}
              </div>
              <h3 class="text-2xl font-semibold text-white mb-3">{feature.title}</h3>
              <p class="leading-relaxed" style="color: var(--text-muted);">
                {feature.description}
              </p>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <section class="py-24 border-b border-white/5">
      <div class="max-w-7xl mx-auto px-6">
        <div class="max-w-3xl mx-auto text-center mb-14">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Como funciona</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{page.howTitle}</h2>
          <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
            {page.howIntro}
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          {#each page.steps as step, index}
            <div class="rounded-3xl border p-7 text-center" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl font-bold text-sky-300 bg-sky-500/10 border border-sky-500/20 mb-5">
                {index + 1}
              </div>
              <h3 class="text-2xl font-semibold text-white mb-3">{step.title}</h3>
              <p class="leading-relaxed" style="color: var(--text-muted);">
                {step.description}
              </p>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section class="py-24 border-b border-white/5" style="background: var(--bg-panel);">
      <div class="max-w-5xl mx-auto px-6">
        <div class="rounded-[2rem] border p-8 md:p-10 shadow-2xl" style="background: var(--bg-card); border-color: var(--border-card);">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Depoimento</p>
          <p class="text-2xl md:text-3xl font-semibold leading-relaxed text-white mb-8">
            "{page.testimonial.quote}"
          </p>
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p class="text-lg font-semibold" style="color: var(--text-main);">{page.testimonial.name}</p>
              <p class="text-sm" style="color: var(--text-muted);">
                {page.testimonial.business} · {page.testimonial.city}
              </p>
            </div>
            <p class="text-sm md:max-w-md leading-relaxed" style="color: var(--text-muted);">
              {page.testimonial.note}
            </p>
          </div>
        </div>
      </div>
    </section>

    <MarketingPriceSection />

    <section id="faq" class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">FAQ do segmento</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Dúvidas comuns antes de começar</h2>
          <p class="text-lg" style="color: var(--text-muted);">
            Perguntas específicas da sua operação, junto com as dúvidas gerais mais comuns sobre o Zelo PDV.
          </p>
        </div>

        <div class="space-y-4">
          {#each allFaqs as faq}
            <details class="group rounded-2xl border transition-all duration-300" style="background: var(--bg-card); border-color: var(--border-card);">
              <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none gap-4">
                <span>{faq.question}</span>
                <svg class="w-5 h-5 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

    <section class="py-24">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <div class="rounded-[2rem] border p-10 md:p-14" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Teste gratuito</p>
          <h2 class="text-3xl md:text-5xl font-bold text-white mb-6">{page.finalCtaTitle}</h2>
          <p class="text-lg leading-relaxed max-w-2xl mx-auto mb-8" style="color: var(--text-muted);">
            {page.finalCtaText}
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="/cadastro"
              class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1"
            >
              Testar 30 dias grátis
            </a>
            <a
              href="#features"
              class="px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Ver como funciona
            </a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>
