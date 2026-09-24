<script>
  import { onMount } from 'svelte';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import { getSignupHref, trackSignupCta } from '$lib/marketing/signupCta';
  import { ADDONS, PLANS, TRIAL_DAYS } from '$lib/pricing';
  import {
    absoluteUrl,
    buildFaqSchema,
    buildOrganizationSchema,
    buildSoftwareApplicationSchema,
    formatBRL,
    ORGANIZATION,
    SITE_URL
  } from '$lib/seo/site';
  import { AUDIENCE, CAPABILITIES, FACTS_UPDATED_AT, NON_CAPABILITIES } from '$lib/data/productFacts';
  import { extensoes } from '$lib/data/extensoes';

  let cadastroHref = '/cadastro?origem=sobre';
  onMount(() => {
    cadastroHref = getSignupHref({ origem: 'sobre' });
  });

  const plans = Object.values(PLANS);
  const addons = Object.values(ADDONS);
  const integrations = Object.values(extensoes);

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formattedUpdatedAt = dateFormatter.format(new Date(`${FACTS_UPDATED_AT}T00:00:00`));

  const meta = {
    title: 'Sobre o Zelo PDV — Fatos, Preços e Empresa | Zelo PDV',
    description: `Página canônica com os fatos sobre o Zelo PDV: preço de cada plano e módulo, para quem é, o que o sistema faz e o que não faz, e dados da empresa. Atualizado em ${formattedUpdatedAt}.`,
    canonical: absoluteUrl('/sobre')
  };

  const faqItems = [
    {
      question: 'O Zelo PDV é um plano único, tudo incluso?',
      answer: `Não. O plano base é o ZeloPDV (${formatBRL(PLANS.pdv.price)}/mês), e módulos como Mesas, Controle de Acessos e ZeloMenu são add-ons pagos à parte. O ZeloChat é um produto separado, com preço próprio ou como upgrade para o pacote combinado.`
    },
    {
      question: 'Quanto custa o Zelo PDV?',
      answer: plans
        .map((plan) => `${plan.name}: ${formatBRL(plan.price)}/mês`)
        .concat(addons.map((addon) => `${addon.name} (add-on): +${formatBRL(addon.price)}/mês`))
        .join('. ')
    },
    {
      question: 'O Zelo PDV substitui o iFood?',
      answer:
        'Não. O Zelo PDV não é um marketplace de delivery: ele registra as vendas feitas por iFood, Rappi e outros apps, com a taxa da plataforma configurável, mas não substitui esses aplicativos.'
    },
    {
      question: 'Tem período de teste grátis?',
      answer: `Sim, ${TRIAL_DAYS} dias grátis, sem precisar cadastrar cartão de crédito.`
    }
  ];

  const softwareSchema = buildSoftwareApplicationSchema({
    description: 'Sistema de gestão e frente de caixa para pequenos negócios de alimentação — fatos, preços e empresa.'
  });
  const organizationSchema = buildOrganizationSchema();
  const faqSchema = buildFaqSchema(faqItems);
</script>

<svelte:head>
  <title>{meta.title}</title>
  <meta name="description" content={meta.description} />
  <link rel="canonical" href={meta.canonical} />

  <meta property="og:type" content="website" />
  <meta property="og:url" content={meta.canonical} />
  <meta property="og:title" content={meta.title} />
  <meta property="og:description" content={meta.description} />
  <meta property="og:image" content={absoluteUrl('/og-image.png')} />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={meta.canonical} />
  <meta name="twitter:title" content={meta.title} />
  <meta name="twitter:description" content={meta.description} />
  <meta name="twitter:image" content={absoluteUrl('/og-image.png')} />

  {@html `<script type="application/ld+json">${JSON.stringify(softwareSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(organizationSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}
</svelte:head>

<div class="sobre-page">
  <SiteHeader />

  <main>
    <section class="hero">
      <div class="hero-bg hero-bg-a"></div>
      <div class="hero-bg hero-bg-b"></div>

      <div class="section-inner hero-inner">
        <p class="eyebrow">Fatos sobre o Zelo PDV</p>
        <h1>O Zelo PDV é um sistema de gestão e frente de caixa para pequenos negócios de alimentação</h1>
        <p class="hero-lead">
          Plano base a partir de {formatBRL(PLANS.pdv.price)}/mês, com {TRIAL_DAYS} dias de teste grátis sem cartão.
          Roda no navegador, funciona offline e cobre caixa, fiado, estoque e financeiro. Módulos como Mesas,
          Controle de Acessos e ZeloMenu são opcionais e pagos à parte. Esta página resume os fatos verificáveis
          do produto — preço, público, o que ele faz e o que não faz — e é atualizada sempre que algo relevante muda.
        </p>
        <p class="hero-updated">Última atualização: {formattedUpdatedAt}</p>
        <div class="hero-actions">
          <a class="primary-action" href={cadastroHref} on:click={() => trackSignupCta('sobre_hero')}>
            Testar {TRIAL_DAYS} dias grátis
          </a>
        </div>
      </div>
    </section>

    <section class="fact-section">
      <div class="section-inner">
        <h2>O que é o Zelo PDV</h2>
        <p>
          O Zelo PDV é um software como serviço (SaaS) de ponto de venda (PDV) e gestão, desenvolvido pela
          {ORGANIZATION.brand}. Ele roda inteiramente no navegador — sem instalação — e funciona em computador,
          tablet e celular. O sistema continua vendendo mesmo sem internet (modo offline) e sincroniza os dados
          quando a conexão volta.
        </p>
      </div>
    </section>

    <section class="fact-section alt">
      <div class="section-inner">
        <h2>Para quem é</h2>
        <ul class="fact-list">
          {#each AUDIENCE as item}
            <li>{item}</li>
          {/each}
        </ul>
      </div>
    </section>

    <section class="fact-section" id="precos">
      <div class="section-inner">
        <h2>Preços</h2>
        <p>Todo preço abaixo vem direto do catálogo de planos do produto — não há "plano único, tudo incluso".</p>

        <table class="price-table">
          <thead>
            <tr>
              <th scope="col">Plano</th>
              <th scope="col">Preço</th>
              <th scope="col">O que inclui</th>
            </tr>
          </thead>
          <tbody>
            {#each plans as plan}
              <tr>
                <td>{plan.name}</td>
                <td>{formatBRL(plan.price)}/mês</td>
                <td>{plan.tagline}</td>
              </tr>
            {/each}
            {#each addons as addon}
              <tr>
                <td>{addon.name} <span class="tag">add-on</span></td>
                <td>+{formatBRL(addon.price)}/mês</td>
                <td>{addon.tagline}</td>
              </tr>
            {/each}
          </tbody>
        </table>

        <p class="trial-note">
          Teste grátis de {TRIAL_DAYS} dias em qualquer plano, sem precisar cadastrar cartão de crédito.
        </p>
      </div>
    </section>

    <section class="fact-section alt">
      <div class="section-inner two-col">
        <div>
          <h2>O que o Zelo PDV faz</h2>
          <ul class="fact-list positive">
            {#each CAPABILITIES as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
        <div>
          <h2>O que o Zelo PDV não faz</h2>
          <ul class="fact-list negative">
            {#each NON_CAPABILITIES as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
      </div>
    </section>

    <section class="fact-section">
      <div class="section-inner">
        <h2>Integrações e extensões</h2>
        <div class="integration-grid">
          {#each integrations as item}
            <article class="integration-card">
              <h3>{item.h1}</h3>
              <p>{item.subtitle}</p>
              <a href={item.external ? item.externalUrl : `/extensoes#${item.slug}`}>Ver detalhes</a>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <section class="fact-section alt">
      <div class="section-inner">
        <h2>Empresa</h2>
        <dl class="company-facts">
          <div>
            <dt>Marca</dt>
            <dd>{ORGANIZATION.brand}</dd>
          </div>
          <div>
            <dt>Razão social</dt>
            <dd>{ORGANIZATION.legalName}</dd>
          </div>
          <div>
            <dt>CNPJ</dt>
            <dd>{ORGANIZATION.cnpj}</dd>
          </div>
          <div>
            <dt>Site institucional</dt>
            <dd><a href={ORGANIZATION.parentUrl} target="_blank" rel="noopener noreferrer">{ORGANIZATION.parentUrl}</a></dd>
          </div>
          <div>
            <dt>Instagram</dt>
            <dd><a href={ORGANIZATION.instagram} target="_blank" rel="noopener noreferrer">@techne.ia</a></dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="fact-section" id="faq">
      <div class="section-inner">
        <h2>Perguntas frequentes</h2>
        <div class="faq-list">
          {#each faqItems as item}
            <details>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          {/each}
        </div>
      </div>
    </section>

    <section class="final-cta">
      <div class="section-inner final-cta-inner">
        <div>
          <h2>Quer ver o Zelo PDV funcionando no seu negócio?</h2>
          <p>Crie a conta e teste {TRIAL_DAYS} dias grátis, sem cartão.</p>
        </div>
        <a class="primary-action" href={cadastroHref} on:click={() => trackSignupCta('sobre_final')}>
          Testar {TRIAL_DAYS} dias grátis
        </a>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>

<style>
  .sobre-page {
    min-height: 100vh;
    overflow-x: hidden;
    background: var(--bg-app);
    color: var(--text-label);
  }

  .section-inner {
    width: min(100% - 3rem, 72rem);
    margin: 0 auto;
  }

  .hero {
    position: relative;
    padding: 8.5rem 1.5rem 4.5rem;
    overflow: hidden;
  }

  .hero-bg {
    position: absolute;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(60px);
    opacity: 0.65;
  }

  .hero-bg-a {
    width: 26rem;
    height: 26rem;
    right: -8rem;
    top: 9rem;
    background: color-mix(in srgb, var(--primary) 26%, transparent);
  }

  .hero-bg-b {
    width: 18rem;
    height: 18rem;
    left: -6rem;
    bottom: 2rem;
    background: color-mix(in srgb, var(--success) 16%, transparent);
  }

  .hero-inner {
    position: relative;
    z-index: 1;
    max-width: 52rem;
  }

  .eyebrow {
    margin: 0 0 1rem;
    color: var(--link);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0 0 1.35rem;
    color: var(--text-main);
    font-size: clamp(2.2rem, 5.5vw, 3.75rem);
    line-height: 1.05;
    font-weight: 800;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  .hero-lead {
    max-width: 44rem;
    margin: 0 0 1rem;
    color: var(--text-muted);
    font-size: clamp(1.05rem, 2vw, 1.25rem);
    line-height: 1.7;
  }

  .hero-updated {
    margin: 0 0 1.75rem;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    padding: 0.9rem 1.4rem;
    border: 1px solid color-mix(in srgb, var(--primary) 80%, white);
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-text);
    font-weight: 800;
    box-shadow: 0 18px 45px color-mix(in srgb, var(--primary) 24%, transparent);
    transition: transform 180ms ease;
  }

  .primary-action:hover {
    transform: translateY(-1px);
  }

  .fact-section {
    padding: 3.5rem 1.5rem;
    border-top: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent);
  }

  .fact-section.alt {
    background: color-mix(in srgb, var(--bg-panel) 42%, transparent);
  }

  h2 {
    margin: 0 0 1rem;
    color: var(--text-main);
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  h3 {
    margin: 0 0 0.5rem;
    color: var(--text-main);
    font-size: 1.05rem;
    font-weight: 700;
  }

  p {
    margin: 0 0 0.75rem;
    color: var(--text-muted);
    line-height: 1.7;
  }

  .two-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2.5rem;
  }

  .fact-list {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fact-list li {
    position: relative;
    padding-left: 1.4rem;
    color: var(--text-main);
    line-height: 1.6;
  }

  .fact-list.positive li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: var(--success);
    font-weight: 800;
  }

  .fact-list.negative li::before {
    content: '✕';
    position: absolute;
    left: 0;
    color: var(--error);
    font-weight: 800;
  }

  .price-table {
    width: 100%;
    margin-top: 1.5rem;
    border-collapse: collapse;
    border: 1px solid var(--border-card);
    border-radius: 1rem;
    overflow: hidden;
  }

  .price-table th,
  .price-table td {
    padding: 0.85rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.9rem;
  }

  .price-table thead th {
    background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
    color: var(--text-label);
    font-weight: 700;
  }

  .price-table td:first-child {
    color: var(--text-main);
    font-weight: 700;
  }

  .price-table td:nth-child(2) {
    white-space: nowrap;
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    margin-left: 0.4rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 16%, transparent);
    color: var(--link);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .trial-note {
    margin-top: 1.25rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .integration-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .integration-card {
    border: 1px solid var(--border-card);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--bg-card) 92%, transparent);
    padding: 1.25rem;
  }

  .integration-card a {
    display: inline-flex;
    margin-top: 0.5rem;
    color: var(--link);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .company-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem 2rem;
    margin: 0;
  }

  .company-facts dt {
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .company-facts dd {
    margin: 0.25rem 0 0;
    color: var(--text-main);
    font-size: 0.95rem;
  }

  .company-facts a {
    color: var(--link);
  }

  .faq-list {
    display: grid;
    gap: 0.75rem;
  }

  .faq-list details {
    border: 1px solid var(--border-card);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--bg-card) 92%, transparent);
    padding: 1rem 1.25rem;
  }

  .faq-list summary {
    color: var(--text-main);
    font-weight: 700;
    cursor: pointer;
  }

  .faq-list p {
    margin: 0.6rem 0 0;
  }

  .final-cta {
    padding: 4rem 1.5rem;
    border-top: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent);
  }

  .final-cta-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }

  .final-cta-inner h2 {
    margin-bottom: 0.35rem;
  }

  .final-cta-inner p {
    margin: 0;
  }

  @media (max-width: 900px) {
    .two-col,
    .integration-grid,
    .company-facts {
      grid-template-columns: 1fr;
    }

    .final-cta-inner {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
