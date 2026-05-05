<script>
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import MarketingHeader from '$lib/components/marketing/MarketingHeader.svelte';
  import { generalFaqs } from '$lib/data/segmentLandingPages';
  import { getAddonPrice } from '$lib/data/extensoes';

  export let page;

  $: addonPrice = getAddonPrice(page.addonId);
  $: totalPrice = 59 + addonPrice;
  $: allFaqs = [...page.faqSpecific, ...generalFaqs];
  $: signupHref = `/cadastro?addon=${page.addonId}`;
  $: subscribeHref = `/assinatura?addon=${page.addonId}`;
</script>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-white"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <MarketingHeader />

  <main>
    <section class="relative pt-32 pb-20 overflow-hidden border-b border-white/5">
      <div class="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-sky-500/10 to-transparent pointer-events-none"></div>
      <div class="absolute -top-8 right-0 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr,0.9fr] gap-14 items-center relative z-10">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium mb-5">
            <span class="inline-flex w-2 h-2 rounded-full bg-amber-400"></span>
            {page.heroBadge} · +R$ {addonPrice.toFixed(0)}/mês
          </div>

          <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
            {page.h1}
          </h1>

          <p class="text-lg md:text-xl max-w-2xl leading-relaxed mb-8" style="color: var(--text-muted);">
            {page.subtitle}
          </p>

          {#if page.forSegments?.length}
            <div class="flex flex-wrap gap-2 mb-8">
              {#each page.forSegments as segment}
                <span class="px-3 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5" style="color: var(--text-label);">
                  {segment}
                </span>
              {/each}
            </div>
          {/if}

          <div class="flex flex-col sm:flex-row gap-4 mb-5">
            <a
              href={signupHref}
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
            R$ {totalPrice}/mês total (plano base R$ 59 + add-on R$ {addonPrice.toFixed(0)}). Cancele quando quiser.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {#each page.highlights as highlight}
            <div class="rounded-3xl border p-6 shadow-lg" style="background: var(--bg-card); border-color: var(--border-card);">
              <p class="text-sm uppercase tracking-[0.2em] mb-3 text-amber-300">Add-on</p>
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
          <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">A dor</p>
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
          <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">O que tem dentro</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{page.featuresTitle}</h2>
          <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
            {page.featuresIntro}
          </p>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          {#each page.features as feature}
            <article class="rounded-3xl border p-7" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5 bg-amber-500/10 border border-amber-500/20">
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
          <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">Como funciona</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">{page.howTitle}</h2>
          <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
            {page.howIntro}
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          {#each page.steps as step, index}
            <div class="rounded-3xl border p-7 text-center" style="background: var(--bg-card); border-color: var(--border-card);">
              <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 mb-5">
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
          <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">Depoimento</p>
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

    <section class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <div class="rounded-[2rem] border p-10 text-center" style="background: var(--bg-card); border-color: var(--border-card);">
          <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">Preço claro</p>
          <h2 class="text-4xl md:text-5xl font-bold text-white mb-2">R$ {totalPrice}<span class="text-2xl font-medium" style="color: var(--text-muted);">/mês</span></h2>
          <p class="text-base leading-relaxed mb-6" style="color: var(--text-muted);">
            Plano base R$ 59 + add-on R$ {addonPrice.toFixed(0)}. Sem taxa de adesão. Cancele quando quiser.
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={signupHref}
              class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold transition-all hover:-translate-y-1"
            >
              Começar trial 30 dias
            </a>
            <a
              href={subscribeHref}
              class="px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Já tenho conta — ativar add-on
            </a>
          </div>
        </div>
      </div>
    </section>

    <section id="faq" class="py-24 border-b border-white/5">
      <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">FAQ</p>
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Perguntas comuns sobre esse add-on</h2>
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
          <p class="text-sm uppercase tracking-[0.25em] text-amber-300 mb-4">Teste gratuito</p>
          <h2 class="text-3xl md:text-5xl font-bold text-white mb-6">{page.finalCtaTitle}</h2>
          <p class="text-lg leading-relaxed max-w-2xl mx-auto mb-8" style="color: var(--text-muted);">
            {page.finalCtaText}
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={signupHref}
              class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1"
            >
              Testar 30 dias grátis
            </a>
            <a
              href="/extensoes"
              class="px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:text-white"
              style="color: var(--text-label);"
            >
              Ver outras extensões
            </a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>
