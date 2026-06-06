<script>
  import SiteHeader from "$lib/components/marketing/SiteHeader.svelte";
  import MarketingFooter from "$lib/components/marketing/MarketingFooter.svelte";
  import PricingCalculator from "$lib/components/tools/PricingCalculator.svelte";

  const faqItems = [
    {
      question: "Preciso saber quantas vou vender no mês?",
      answer:
        "Não. Se você quer descobrir quanto cobrar em uma unidade, use o modo Preço de 1 produto. A estimativa de vendas por mês só entra no modo de negócio completo.",
    },
    {
      question: "Posso lancar ingrediente por ingrediente?",
      answer:
        "Sim. Você pode informar quantidade comprada, unidade, preço pago e quantidade usada na receita. A calculadora faz a proporção automaticamente.",
    },
    {
      question: "Posso usar para ovo de Páscoa, hot-dog ou bolo no pote?",
      answer:
        "Sim. O modo rápido foi desenhado exatamente para produto unitário e sazonal. Serve para hot-dog, marmita, ovo de Páscoa, doce, pizza e vários outros casos.",
    },
    {
      question: "A taxa da plataforma entra no calculo?",
      answer:
        "Sim. Se você vende por app, marketplace ou outro canal com percentual de desconto, basta ativar a taxa e informar o número.",
    },
    {
      question: "Qual margem de lucro devo usar?",
      answer:
        "Não existe um número único. O ideal é partir de um preset equilibrado e ajustar se o preço final ficar alto ou baixo demais para o seu público.",
    },
  ];

  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Calculadora de Precificação Zelo PDV",
    url: "https://zelopdv.com.br/precificacao",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    description:
      "Ferramenta grátis para calcular preço de venda de produtos e precificação completa de pequenos negócios.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
    },
    featureList: [
      "Cálculo rápido para produto específico",
      "Lançamento ingrediente por ingrediente",
      "Precificação completa com custos fixos",
      "Preço mínimo e preço recomendado",
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
</script>

<svelte:head>
  <title>Calculadora de Precificação Grátis | Zelo PDV</title>
  <meta
    name="description"
    content="Calcule o preço ideal dos seus produtos. Ferramenta grátis para lanchonetes, hamburguerias, delivery, marmitarias e pequenos negócios."
  />
  <meta
    name="keywords"
    content="precificação, calcular preço de venda, margem de lucro, preço de custo, quanto cobrar, delivery, marmitaria"
  />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/precificacao" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/precificacao" />
  <meta
    property="og:title"
    content="Calculadora de Precificação Grátis | Zelo PDV"
  />
  <meta
    property="og:description"
    content="Descubra quanto cobrar em um produto específico ou monte a precificação completa do seu negócio."
  />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/precificacao" />
  <meta
    name="twitter:title"
    content="Calculadora de Precificação Grátis | Zelo PDV"
  />
  <meta
    name="twitter:description"
    content="Calcule o preço de venda ideal para hot-dog, marmita, ovo de Páscoa e outros produtos sem precisar criar conta."
  />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />
</svelte:head>

{@html `<script type="application/ld+json">${JSON.stringify(webAppSchema)}</script>`}
{@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}

<div class="min-h-screen page-shell">
  <SiteHeader />

  <section class="hero-shell">
    <div class="max-w-6xl mx-auto px-6 hero-stack">
      <h1 class="hero-title">Descubra quanto cobrar</h1>
      <p class="hero-subtitle">
        Calcule o preço de venda de qualquer produto de forma simples e descubra
        sua margem real.
      </p>
    </div>
  </section>

  <section class="pb-4">
    <PricingCalculator variant="marketing" />
  </section>

  <section class="py-24 border-t border-white/5 bg-[#0B0F19]">
    <div class="max-w-3xl mx-auto px-6">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-bold text-white mb-4">Perguntas Frequentes</h2>
        <p class="text-slate-400">
          Tire suas dúvidas e entenda os detalhes dos cálculos.
        </p>
      </div>

      <div class="space-y-4">
        {#each faqItems as item}
          <details
            class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-all duration-300"
          >
            <summary
              class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none"
            >
              <span>{item.question}</span>
              <svg
                class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                /></svg
              >
            </summary>
            <div class="px-6 pb-6 text-slate-400 leading-relaxed">
              {item.answer}
            </div>
          </details>
        {/each}
      </div>
    </div>
  </section>

  <MarketingFooter />
</div>

<style>
  .page-shell {
    --bg-app: #0b0f19; /* Align with main landing page */
    --bg-panel: #111827;
    --bg-card: #0f172a;
    background: var(--bg-app);
    color: var(--text-label);
  }

  .hero-shell {
    padding-top: 7.5rem;
    padding-bottom: 3rem;
  }

  .hero-stack {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .hero-title {
    color: var(--text-main);
    font-size: clamp(2rem, 4vw, 3.2rem);
    line-height: 1.08;
    letter-spacing: -0.05em;
    font-weight: 800;
    max-width: 20ch;
  }

  .hero-subtitle {
    color: var(--text-muted);
    font-size: 1.05rem;
    line-height: 1.6;
    max-width: 48ch;
  }

  @media (max-width: 767px) {
    .hero-shell {
      padding-top: 8rem;
    }
  }
</style>
