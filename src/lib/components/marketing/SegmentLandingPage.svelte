<script>
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SiteHeader from "$lib/components/marketing/SiteHeader.svelte";
  import MarketingPriceSection from '$lib/components/marketing/MarketingPriceSection.svelte';
  import { generalFaqs } from '$lib/data/segmentLandingPages';
  import { resolveAppIcon } from '$lib/icons/appIcons';
  import { Check, ChevronDown, SendHorizontal, Zap } from 'lucide-svelte';

  export let page;

  $: allFaqs = [...page.faqSpecific, ...generalFaqs];

  function openSupportChat() {
    window.dispatchEvent(new CustomEvent('zelo:open-support-chat'));
  }
</script>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-white"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <SiteHeader localAnchors />

  <main>
    <section class="relative pt-32 pb-20 overflow-hidden border-b border-white/5">
      <div class="absolute right-0 top-1/4 w-[420px] h-[420px] bg-sky-500/15 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.4fr_1fr] gap-16 items-start relative z-10">
        <div>
          <p class="text-sm font-semibold tracking-tight text-sky-300 mb-3">Para {page.segmentName || page.heroBadge}</p>

          <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6" style="text-wrap: balance;">
            {page.h1}
          </h1>

          <p class="text-lg md:text-xl max-w-2xl leading-relaxed mb-10" style="color: var(--text-muted);">
            {page.subtitle}
          </p>

          <div class="flex flex-col sm:flex-row gap-4 items-start mb-5">
            <a
              href="/cadastro"
              class="w-full sm:w-auto px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1 text-center"
            >
              Testar 14 dias grátis
            </a>
            <a
              href="#features"
              class="px-4 py-4 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4 transition-colors text-center"
            >
              Ver funcionalidades
            </a>
          </div>

          <p class="text-sm" style="color: var(--text-muted);">
            14 dias grátis, sem instalar nada.
            <button type="button" on:click={openSupportChat} class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
              Fala com a gente
            </button>
          </p>
        </div>

        <aside class="space-y-5 lg:pt-10">
          {#each page.highlights as highlight, i}
            <p class="text-lg leading-relaxed text-white flex items-start gap-3" style="text-wrap: balance;">
              <Check class="size-5 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
              {highlight}
            </p>
          {/each}
        </aside>
      </div>
    </section>

    <section class="py-24 border-b border-white/5">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-start">
        <div>
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
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{page.featuresTitle}</h2>
          <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
            {page.featuresIntro}
          </p>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          {#each page.features as feature}
            <article class="rounded-3xl border p-7" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5 bg-sky-500/10 border border-sky-500/20">
                <svelte:component this={resolveAppIcon(feature.icon)} class="size-7 text-sky-300" aria-hidden="true" />
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
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{page.howTitle}</h2>
          <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
            {page.howIntro}
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          {#each page.steps as step, index}
            <div class="rounded-3xl border p-7 text-center" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20 mb-5">
                <Check class="size-7 text-sky-300" aria-hidden="true" />
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
      <div class="max-w-7xl mx-auto px-6">
        <div class="max-w-3xl mx-auto text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Sem pegadinha, sem letra miúda</h2>
          <p class="text-lg" style="color: var(--text-muted);">O que você pode cobrar da gente desde o primeiro dia</p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div class="rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--bg-card); border-color: var(--border-card);">
            <div class="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Check class="size-5 text-sky-400" aria-hidden="true" />
            </div>
            <p class="text-white font-semibold text-sm leading-tight">14 dias grátis de verdade</p>
            <p class="text-sm leading-relaxed" style="color: var(--text-muted);">Não pedimos cartão e não existe cobrança automática. Testou e não gostou? Não acontece nada — sua conta simplesmente não vira assinatura.</p>
          </div>

          <div class="rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--bg-card); border-color: var(--border-card);">
            <div class="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
              <SendHorizontal class="size-5 text-sky-400" aria-hidden="true" />
            </div>
            <p class="text-white font-semibold text-sm leading-tight">Suporte de gente de verdade</p>
            <p class="text-sm leading-relaxed" style="color: var(--text-muted);">WhatsApp em horário comercial, direto com quem constrói o produto. Sem fila de protocolo.</p>
          </div>

          <div class="rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--bg-card); border-color: var(--border-card);">
            <div class="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Zap class="size-5 text-sky-400" aria-hidden="true" />
            </div>
            <p class="text-white font-semibold text-sm leading-tight">Internet caiu? Continua vendendo</p>
            <p class="text-sm leading-relaxed" style="color: var(--text-muted);">O Zelo funciona offline e sincroniza sozinho quando a conexão voltar. Seu caixa não para porque a operadora falhou.</p>
          </div>
        </div>
      </div>
    </section>

    <MarketingPriceSection />

    <section id="faq" class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Dúvidas que aparecem</h2>
          <p class="text-lg" style="color: var(--text-muted);">
            As do seu segmento + as gerais. Se ficou uma de fora, manda.
          </p>
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

    <section class="py-24">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <div class="rounded-4xl border p-10 md:p-14" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <h2 class="text-3xl md:text-5xl font-bold text-white mb-6">{page.finalCtaTitle}</h2>
          <p class="text-lg leading-relaxed max-w-2xl mx-auto mb-8" style="color: var(--text-muted);">
            {page.finalCtaText}
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="/cadastro"
              class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1"
            >
              Testar 14 dias grátis
            </a>
            <a
              href="#features"
              class="px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Ver como funciona
            </a>
          </div>
          <button type="button" on:click={openSupportChat} class="mt-5 text-sm text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
            Fala com a gente
          </button>
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>
