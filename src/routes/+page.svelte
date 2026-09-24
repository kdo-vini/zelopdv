<script context="module">
  import { ADDONS, PLANS, TRIAL_DAYS } from '$lib/pricing';
  import { absoluteUrl, buildOrganizationSchema, buildSoftwareApplicationSchema, ORGANIZATION, SITE_URL } from '$lib/seo/site';

  const homeSoftwareSchema = buildSoftwareApplicationSchema({
    description: `PDV pra bar, lanchonete, restaurante, delivery e quem mais vende no balcão. Registra a venda, controla o fiado e mostra quanto sobrou no fim do dia. ${TRIAL_DAYS} dias grátis.`,
    extra: {
      '@type': ['SoftwareApplication', 'Product'],
      alternateName: 'Sistema PDV para Lanchonete',
      brand: { '@type': 'Brand', name: 'Zelo PDV' },
      sku: 'zelopdv-pdv',
      category: 'Business > Point of Sale Software',
      itemCondition: 'https://schema.org/NewCondition',
      applicationSubCategory: 'PointOfSaleApplication',
      browserRequirements: 'Requires Google Chrome or Microsoft Edge',
      inLanguage: 'pt-BR',
      availability: 'https://schema.org/InStock',
      featureList: [
        'Frente de caixa PDV para lanchonete',
        'Controle de fiado digital',
        'Fechamento de caixa',
        'Gestão de despesas',
        'Relatório de lucro real',
        'Controle de estoque',
        'Funciona offline (PWA)',
        'Comprovante via WhatsApp',
        'Assistente de IA para lucro real (Zelinho)'
      ],
      screenshot: absoluteUrl('/images/screenshots/dashboard-desktop.png'),
      publisher: {
        '@type': 'Organization',
        name: ORGANIZATION.brand,
        url: ORGANIZATION.parentUrl
      }
    }
  });

  const homeOrganizationSchema = buildOrganizationSchema();

  const homeWebSiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Zelo PDV',
    url: SITE_URL,
    inLanguage: 'pt-BR',
    description: 'PDV pra bar, lanchonete, restaurante, delivery e quem mais vende no balcão. Controle caixa, fiado, despesas e lucro real no navegador.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/blog?q={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };

  const homeFaqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Preciso emitir nota fiscal pra usar?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Não. O Zelo organiza suas vendas, o fiado e o caixa com ou sem nota. Ele emite recibo e comprovante de venda. A emissão de NF-e está a caminho, e quando chegar é só ativar, sem trocar de sistema.'
        }
      },
      {
        '@type': 'Question',
        name: `Como funcionam os ${TRIAL_DAYS} dias grátis?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Cria a conta, usa tudo por ${TRIAL_DAYS} dias e não cadastra cartão. Só paga se decidir continuar.`
        }
      },
      {
        '@type': 'Question',
        name: 'Funciona sem internet?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Funciona. As vendas ficam salvas no aparelho e sobem pra nuvem quando a conexão voltar.'
        }
      },
      {
        '@type': 'Question',
        name: 'Preciso de computador bom?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Não. Roda no navegador de qualquer celular, tablet ou computador simples.'
        }
      },
      {
        '@type': 'Question',
        name: 'Consigo usar em mais de um aparelho?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Sim. Usa a mesma conta no celular, no tablet e no computador, sempre sincronizado.'
        }
      },
      {
        '@type': 'Question',
        name: 'E se eu travar em alguma coisa?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Chama no WhatsApp. Quem responde é quem constrói o Zelo, não um robô de atendimento.'
        }
      }
    ]
  };
</script>

<svelte:head>
  <title>Zelo PDV | PDV pra bar, lanchonete e restaurante. Sem frescura.</title>
  <meta name="description" content="PDV no celular pra quem vende no balcão. Pedido em 3 toques, fiado controlado e quanto sobrou no dia. 14 dias grátis, sem cartão." />
  <meta name="keywords" content="sistema PDV, PDV para lanchonete, sistema para lanchonete, controle de caixa, controle de fiado, lanchonete, hamburgueria, MEI" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/" />
  <meta property="og:title" content="Você vende. O Zelo cuida do resto." />
  <meta property="og:description" content="PDV no celular pra quem vende no balcão. Pedido em 3 toques, fiado controlado e quanto sobrou no dia. 14 dias grátis, sem cartão." />
  <meta property="og:image" content="https://zelopdv.com.br/og-image-home.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="Zelo PDV" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/" />
  <meta name="twitter:title" content="Você vende. O Zelo cuida do resto." />
  <meta name="twitter:description" content="PDV no celular pra quem vende no balcão. Pedido em 3 toques, fiado controlado e quanto sobrou no dia. 14 dias grátis, sem cartão." />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image-home.png" />

  {@html `<script type="application/ld+json">${JSON.stringify(homeSoftwareSchema)}</script>`}

  {@html `<script type="application/ld+json">${JSON.stringify(homeOrganizationSchema)}</script>`}

  {@html `<script type="application/ld+json">${JSON.stringify(homeWebSiteSchema)}</script>`}

  {@html `<script type="application/ld+json">${JSON.stringify(homeFaqSchema)}</script>`}
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import {
    ArrowRight,
    Check,
    ChevronDown,
    CloudOff,
    MessageCircle,
    ShoppingBasket,
    Wallet,
    X
  } from 'lucide-svelte';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import AiReferralBanner from '$lib/components/marketing/AiReferralBanner.svelte';
  import OperationalProofSection from '$lib/components/marketing/OperationalProofSection.svelte';
  import { trackViewContent } from '$lib/metaPixel';
  import { initMarketingAnalytics } from '$lib/marketingAnalytics';
  import { getSignupHref, trackSignupCta } from '$lib/marketing/signupCta';
  import { observeSectionViews } from '$lib/marketing/sectionViews';

  let activeLightboxImage = null;
  let activeLightboxTrigger = null;
  let activeDemo = 'profit';

  const demoQuestions = {
    profit: {
      question: 'Quanto sobrou hoje?',
      answer: 'Depois das despesas registradas, o resultado ilustrativo ficou assim:',
      numbers: [
        { label: 'Vendas', value: 'R$ 3.000' },
        { label: 'Despesas', value: 'R$ 1.290' },
        { label: 'Resultado', value: 'R$ 1.710' }
      ],
      takeaway: 'Entrou, saiu, sobrou. Sem planilha.'
    },
    credit: {
      question: 'Tem fiado em aberto?',
      answer: 'A demonstração encontra os recebimentos pendentes no seu cadastro:',
      numbers: [
        { label: 'Em aberto', value: 'R$ 420' },
        { label: 'Clientes', value: '3' },
        { label: 'Mais antigo', value: '12 dias' }
      ],
      takeaway: 'Quem deve, quanto e desde quando. Sem depender da memória.'
    },
    products: {
      question: 'Qual produto vendeu mais?',
      answer: 'O exemplo organiza os itens do período e destaca o que puxou suas vendas:',
      numbers: [
        { label: 'Mais vendido', value: 'X-Salada' },
        { label: 'Unidades', value: '47' },
        { label: 'Receita', value: 'R$ 1.128' }
      ],
      takeaway: 'Você vê o que puxa o seu movimento e decide olhando o que já acontece no balcão.'
    }
  };

  $: selectedDemo = demoQuestions[activeDemo];

  let cadastroHref = '/cadastro';

  onMount(() => {
    function handleKeydown(event) {
      if (event.key === 'Escape' && activeLightboxImage) closeLightbox();
    }

    window.addEventListener('keydown', handleKeydown);
    initMarketingAnalytics();
    trackViewContent();
    cadastroHref = getSignupHref();
    const stopSectionViews = observeSectionViews(document, { page: 'home' });

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      stopSectionViews();
    };
  });

  $: basePrice = PLANS.pdv.price.toFixed(0);
  $: mesasTotal = (PLANS.pdv.price + ADDONS.mesas.price).toFixed(0);
  $: menuTotal = (PLANS.pdv.price + ADDONS.menu.price).toFixed(0);

  function openLightbox(image, trigger = null) {
    activeLightboxImage = image;
    activeLightboxTrigger = trigger;
  }

  function closeLightbox() {
    activeLightboxImage = null;
    const trigger = activeLightboxTrigger;
    activeLightboxTrigger = null;
    requestAnimationFrame(() => trigger?.focus());
  }
</script>

<div class="marketing-page">
  <SiteHeader />
  <AiReferralBanner />

  <main>
    <section class="hero" aria-labelledby="hero-title" data-track-section="hero">
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="hero-kicker">PDV sem frescura</p>
          <h1 id="hero-title">
            Você vende.
            <span>O Zelo cuida do resto.</span>
          </h1>
          <p class="hero-lead">
            PDV pra bar, lanchonete, restaurante, delivery e quem mais vende no balcão. Registra a venda, controla o fiado e mostra quanto sobrou no fim do dia.
          </p>
          <div class="hero-actions">
            <a href={cadastroHref} class="primary-cta" on:click={() => trackSignupCta('hero')}>Testar 14 dias grátis</a>
            <p class="hero-price">Sem cartão pra testar. Depois, R$ {basePrice}/mês.</p>
            <a href="#features" class="secondary-cta">Ver o sistema por dentro <ArrowRight class="size-4" aria-hidden="true" /></a>
          </div>
        </div>

        <!-- Celular: tela real do sistema no lugar do mascote, com um número legível. -->
        <figure class="hero-proof-mobile">
          <img
            src="/images/screenshots/financial-kpis-crop.webp"
            alt="Tela do Zelo PDV mostrando receita líquida de R$ 21.373,50 nos últimos 30 dias, com vendas brutas, despesas e quantidade de vendas."
            width="806"
            height="188"
            loading="eager"
          />
          <figcaption>Tela real do sistema: o que entrou e o que sobrou no mês.</figcaption>
        </figure>

        <figure class="hero-shot">
          <picture>
            <source
              type="image/webp"
              srcset="/images/screenshots/dashboard-desktop-800.webp 800w, /images/screenshots/dashboard-desktop-1600.webp 1600w"
              sizes="(min-width: 1600px) 40vw, 42vw"
            />
            <img
              src="/images/screenshots/dashboard-desktop.png"
              alt="Frente de caixa do Zelo PDV com uma comanda aberta"
              width="1600"
              height="1000"
              loading="eager"
              fetchpriority="high"
              decoding="async"
            />
          </picture>
        </figure>
      </div>

      <div class="hero-facts" aria-label="O que você encontra no teste">
        <article>
          <span class="fact-icon"><Check class="size-5" aria-hidden="true" /></span>
          <div>
            <strong>Sem instalar nada.</strong>
            <p>Abre no navegador do celular, tablet ou computador.</p>
          </div>
        </article>
        <article>
          <span class="fact-icon"><CloudOff class="size-5" aria-hidden="true" /></span>
          <div>
            <strong>Sem contrato.</strong>
            <p>Pagou o mês, usou o mês. Cancela quando quiser.</p>
          </div>
        </article>
        <article>
          <span class="fact-icon"><MessageCircle class="size-5" aria-hidden="true" /></span>
          <div>
            <strong>Sem internet? Sem drama.</strong>
            <p>Vende offline e sincroniza quando voltar.</p>
          </div>
        </article>
      </div>
    </section>

    <OperationalProofSection onPreview={(image, trigger) => openLightbox(image, trigger)} />

    <section id="features" class="features-section" data-track-section="features" aria-labelledby="features-title">
      <div class="section-shell">
        <div class="section-heading">
          <h2 id="features-title">O que o Zelo faz por você no dia a dia</h2>
          <p>Do primeiro pedido ao fechamento do caixa, tudo no mesmo lugar.</p>
        </div>

        <div class="feature-layout">
          <article class="feature-main">
            <div class="feature-copy">
              <span class="feature-icon"><ShoppingBasket class="size-6" aria-hidden="true" /></span>
              <h3>Pedido em 3 toques.</h3>
              <p>Toca, adiciona, finaliza. Manda o comprovante no WhatsApp e já atende o próximo. A fila anda.</p>
            </div>
            <button
              type="button"
              class="product-shot"
              aria-label="Ampliar tela da frente de caixa"
              on:click={(event) => openLightbox('/images/screenshots/dashboard-desktop.png', event.currentTarget)}
            >
              <picture>
                <source
                  type="image/webp"
                  srcset="/images/screenshots/dashboard-desktop-800.webp 800w, /images/screenshots/dashboard-desktop-1600.webp 1600w"
                  sizes="(max-width: 900px) calc(100vw - 2rem), 60vw"
                />
                <img
                  src="/images/screenshots/dashboard-desktop.png"
                  alt="Frente de caixa do Zelo PDV com uma comanda aberta."
                  width="1600"
                  height="1000"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            </button>
          </article>

          <div class="feature-side">
            <article class="offline-feature">
              <span class="feature-icon feature-icon-inverse"><CloudOff class="size-6" aria-hidden="true" /></span>
              <h3>A internet caiu? A venda não.</h3>
              <p>O Zelo continua vendendo sem conexão e sobe tudo pra nuvem quando a internet volta.</p>
            </article>

            <article class="fiado-feature">
              <div class="feature-copy compact-copy">
                <span class="feature-icon"><Wallet class="size-6" aria-hidden="true" /></span>
                <h3>Aposenta o caderninho do fiado.</h3>
                <p>Limite por cliente, histórico de compras e a conta certinha na hora de cobrar.</p>
              </div>
              <button
                type="button"
                class="product-shot"
                aria-label="Ampliar tela de controle de fiado"
                on:click={(event) => openLightbox('/images/screenshots/customers-screen.png', event.currentTarget)}
              >
                <picture>
                  <source
                    type="image/webp"
                    srcset="/images/screenshots/customers-screen-800.webp 800w, /images/screenshots/customers-screen-1600.webp 1600w"
                    sizes="(max-width: 900px) calc(100vw - 2rem), 50vw"
                  />
                  <img
                    src="/images/screenshots/customers-screen.png"
                    alt="Controle de clientes e fiado no Zelo PDV."
                    width="1600"
                    height="1000"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </button>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section id="zelinho" class="zelinho-section" data-track-section="zelinho" aria-labelledby="zelinho-title">
      <div class="section-shell zelinho-layout">
        <div>
          <h2 id="zelinho-title">Pergunta pro caixa. O Zelinho responde.</h2>
          <p>
            Nada de caçar número em cinco telas. Pergunta do seu jeito e o Zelinho lê as vendas do seu caixa e responde em segundos.
          </p>
        </div>
        <div class="zelinho-demo">
          <div class="demo-heading">
            <p class="demo-label">Leitura do caixa</p>
            <span class="demo-status"><span aria-hidden="true"></span>Dados ilustrativos</span>
          </div>
          <div class="question-list" role="tablist" aria-label="Perguntas para o Zelinho">
            <button
              type="button"
              class:active={activeDemo === 'profit'}
              role="tab"
              aria-selected={activeDemo === 'profit'}
              aria-controls="zelinho-result"
              on:click={() => activeDemo = 'profit'}
            >
              <MessageCircle class="size-5" aria-hidden="true" />
              <span>Quanto sobrou hoje?</span>
            </button>
            <button
              type="button"
              class:active={activeDemo === 'credit'}
              role="tab"
              aria-selected={activeDemo === 'credit'}
              aria-controls="zelinho-result"
              on:click={() => activeDemo = 'credit'}
            >
              <MessageCircle class="size-5" aria-hidden="true" />
              <span>Tem fiado em aberto?</span>
            </button>
            <button
              type="button"
              class:active={activeDemo === 'products'}
              role="tab"
              aria-selected={activeDemo === 'products'}
              aria-controls="zelinho-result"
              on:click={() => activeDemo = 'products'}
            >
              <MessageCircle class="size-5" aria-hidden="true" />
              <span>Qual produto vendeu mais?</span>
            </button>
          </div>

          <div class="demo-query">
            <span>Pergunta selecionada</span>
            <strong>{selectedDemo.question}</strong>
          </div>
          <div id="zelinho-result" class="demo-answer" role="tabpanel" aria-live="polite">
            <div class="demo-answer-heading">
              <div>
                <span>Fechamento rápido</span>
                <strong>O que o caixa está dizendo</strong>
              </div>
              <span class="demo-result-state">agora</span>
            </div>
            <p>{selectedDemo.answer}</p>
            <div class="demo-numbers">
              {#each selectedDemo.numbers as number}
                <div>
                  <span>{number.label}</span>
                  <strong>{number.value}</strong>
                </div>
              {/each}
            </div>
            <p class="demo-takeaway">{selectedDemo.takeaway}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="audience-section" data-track-section="audience" aria-labelledby="audience-title">
      <div class="section-shell audience-layout">
        <div class="audience-heading">
          <h2 id="audience-title">Pra quem vive o balcão</h2>
          <p class="audience-lead">Do bar ao delivery, do MEI ao restaurante com salão.</p>
        </div>
        <nav class="audience-links" aria-label="Páginas por tipo de negócio">
          <a href="/para-lanchonetes">Lanchonetes</a>
          <a href="/para-restaurantes">Restaurantes</a>
          <a href="/para-hamburguerias">Hamburguerias</a>
          <a href="/para-delivery">Delivery próprio</a>
          <a href="/para-mei">MEIs</a>
        </nav>
      </div>
    </section>

    <section id="pricing" class="pricing-section" data-track-section="pricing" aria-labelledby="pricing-title">
      <div class="section-shell">
        <div class="section-heading pricing-heading">
          <h2 id="pricing-title">Preço de gente, sem pegadinha.</h2>
          <p>Começa com o PDV. Precisa de mesa ou cardápio online? Liga a extensão quando fizer sentido.</p>
        </div>

        <div class="pricing-grid">
          <article class="price-plan price-plan-primary">
            <div>
              <p class="plan-name">PDV</p>
              <h3>Para vender no balcão</h3>
              <p class="plan-description">Vendas, fiado, estoque, despesas e lucro em um só caixa.</p>
            </div>
            <p class="plan-price"><span>R$</span><strong>{basePrice}</strong><span>/mês</span></p>
            <ul>
              <li><Check class="size-4" aria-hidden="true" />Vendas ilimitadas</li>
              <li><Check class="size-4" aria-hidden="true" />Celular, tablet e computador</li>
              <li><Check class="size-4" aria-hidden="true" />Suporte no WhatsApp</li>
            </ul>
          </article>

          <article class="price-plan">
            <div>
              <p class="plan-name">PDV + Mesas</p>
              <h3>Para salão e comandas</h3>
              <p class="plan-description">O caixa com mapa de mesas, comandas e divisão da conta.</p>
            </div>
            <p class="plan-price"><span>R$</span><strong>{mesasTotal}</strong><span>/mês</span></p>
            <p class="price-breakdown">R$ {basePrice} + R$ {ADDONS.mesas.price.toFixed(0)} do Módulo Mesas</p>
            <ul>
              <li><Check class="size-4" aria-hidden="true" />Tudo do PDV</li>
              <li><Check class="size-4" aria-hidden="true" />Mapa de mesas e comandas</li>
              <li><Check class="size-4" aria-hidden="true" />Divisão da conta</li>
            </ul>
          </article>

          <article class="price-plan">
            <div>
              <p class="plan-name">PDV + ZeloMenu</p>
              <h3>Para vender pelo cardápio online</h3>
              <p class="plan-description">Cardápio, pedidos e painel de cozinha ligados ao PDV.</p>
            </div>
            <p class="plan-price"><span>R$</span><strong>{menuTotal}</strong><span>/mês</span></p>
            <p class="price-breakdown">R$ {basePrice} + R$ {ADDONS.menu.price.toFixed(0)} do ZeloMenu</p>
            <ul>
              <li><Check class="size-4" aria-hidden="true" />Tudo do PDV</li>
              <li><Check class="size-4" aria-hidden="true" />Cardápio online e pedidos</li>
              <li><Check class="size-4" aria-hidden="true" />Painel de cozinha</li>
            </ul>
          </article>
        </div>

        <div class="pricing-action">
          <p><strong>R$ {basePrice} por mês</strong>, vendas ilimitadas. Sem taxa de implantação, sem fidelidade.</p>
          <a href={cadastroHref} class="primary-cta" on:click={() => trackSignupCta('pricing')}>Testar 14 dias grátis (sem cartão)</a>
        </div>
      </div>
    </section>

    <section id="faq" class="faq-section" data-track-section="faq" aria-labelledby="faq-title">
      <div class="faq-shell">
        <div class="faq-intro">
          <h2 id="faq-title">Perguntas de quem tá chegando</h2>
          <p>Direto ao ponto, do jeito que você perguntaria no balcão.</p>
        </div>

        <div class="faq-list">
          <details>
            <summary>
              <span>Preciso emitir nota fiscal pra usar?</span>
              <ChevronDown class="size-5" aria-hidden="true" />
            </summary>
            <p>Não. O Zelo organiza suas vendas, o fiado e o caixa com ou sem nota. Ele emite recibo e comprovante de venda. A emissão de NF-e está a caminho, e quando chegar é só ativar, sem trocar de sistema.</p>
          </details>

          <details>
            <summary>
              <span>Como funcionam os {TRIAL_DAYS} dias grátis?</span>
              <ChevronDown class="size-5" aria-hidden="true" />
            </summary>
            <p>Cria a conta, usa tudo por {TRIAL_DAYS} dias e não cadastra cartão. Só paga se decidir continuar.</p>
          </details>

          <details>
            <summary>
              <span>Funciona sem internet?</span>
              <ChevronDown class="size-5" aria-hidden="true" />
            </summary>
            <p>Funciona. As vendas ficam salvas no aparelho e sobem pra nuvem quando a conexão voltar.</p>
          </details>

          <details>
            <summary>
              <span>Preciso de computador bom?</span>
              <ChevronDown class="size-5" aria-hidden="true" />
            </summary>
            <p>Não. Roda no navegador de qualquer celular, tablet ou computador simples.</p>
          </details>

          <details>
            <summary>
              <span>Consigo usar em mais de um aparelho?</span>
              <ChevronDown class="size-5" aria-hidden="true" />
            </summary>
            <p>Sim. Usa a mesma conta no celular, no tablet e no computador, sempre sincronizado.</p>
          </details>

          <details>
            <summary>
              <span>E se eu travar em alguma coisa?</span>
              <ChevronDown class="size-5" aria-hidden="true" />
            </summary>
            <p>Chama no WhatsApp. Quem responde é quem constrói o Zelo, não um robô de atendimento.</p>
          </details>
        </div>
      </div>
    </section>

    <section class="final-cta" data-track-section="final_cta" aria-labelledby="final-cta-title">
      <div class="final-cta-inner">
        <div>
          <h2 id="final-cta-title">Amanhã tem movimento. Testa hoje.</h2>
          <p>14 dias grátis, sem cartão. Não gostou, não paga nada.</p>
        </div>
        <a href={cadastroHref} class="primary-cta" on:click={() => trackSignupCta('final')}>Testar 14 dias grátis (sem cartão)</a>
      </div>
    </section>
  </main>

  <MarketingFooter />

  {#if activeLightboxImage}
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualização ampliada do Zelo PDV"
      tabindex="-1"
      class="lightbox"
      on:click={closeLightbox}
      on:keydown={(event) => event.key === 'Escape' && closeLightbox()}
    >
      <div class="lightbox-inner" role="presentation" on:click={(event) => event.stopPropagation()}>
        <button type="button" class="lightbox-close" aria-label="Fechar imagem" on:click={closeLightbox}>
          <X class="size-6" aria-hidden="true" />
        </button>
        <img src={activeLightboxImage} alt="Tela ampliada do Zelo PDV." />
      </div>
    </div>
  {/if}
</div>

<style>
  .marketing-page {
    min-height: 100vh;
    overflow-x: hidden;
    background: var(--marketing-paper);
    color: var(--marketing-ink);
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  .marketing-page :global(*) {
    box-sizing: border-box;
  }

  .marketing-page a:focus-visible,
  .marketing-page button:focus-visible,
  .marketing-page summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .section-shell {
    width: min(100% - 3rem, 80rem);
    margin-inline: auto;
  }

  .hero {
    position: relative;
    min-height: min(52rem, 100dvh);
    padding: 6.5rem 0 2rem;
    overflow: hidden;
    background:
      radial-gradient(circle at 72% 42%, color-mix(in srgb, var(--primary) 30%, transparent), transparent 36%),
      radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 28%),
      var(--marketing-dark);
    color: var(--text-main);
  }

  .hero-inner {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) minmax(32rem, 1.08fr);
    align-items: center;
    gap: clamp(1rem, 2.5vw, 3rem);
    width: min(100% - 3rem, 80rem);
    margin-inline: auto;
  }

  .hero-copy {
    position: relative;
    z-index: 2;
    padding-block: 2rem;
  }

  .hero-kicker {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    margin: 0 0 1.5rem;
    padding-inline: 0.9rem;
    border: 1px solid var(--marketing-dark-border);
    border-radius: 999px;
    color: var(--link);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .hero h1 {
    max-width: 16ch;
    margin: 0;
    color: var(--text-main);
    font-size: clamp(2.75rem, 4.8vw, 4.5rem);
    font-weight: 750;
    letter-spacing: -0.04em;
    line-height: 1.01;
    text-wrap: balance;
  }

  .hero h1 span {
    display: block;
    margin-top: 0.18em;
    color: var(--primary);
  }

  .hero-lead {
    max-width: 35rem;
    margin: 1.5rem 0 2rem;
    color: var(--marketing-dark-muted);
    font-size: 1.125rem;
    line-height: 1.65;
    text-wrap: pretty;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.85rem 1.25rem;
  }

  .hero-price {
    order: 3;
    flex-basis: 100%;
    margin: 0;
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
  }

  .hero-proof-mobile {
    display: none;
  }

  .primary-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3.5rem;
    padding-inline: 1.75rem;
    border-radius: 999px;
    background: var(--marketing-action);
    color: var(--primary-text);
    font-size: 0.875rem;
    font-weight: 750;
    white-space: nowrap;
    transition: background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
  }

  .primary-cta:hover {
    background: var(--marketing-action);
    box-shadow: 0 12px 24px -8px color-mix(in srgb, var(--primary) 58%, transparent);
    transform: translateY(-2px);
  }

  .primary-cta:active {
    transform: translateY(1px);
  }

  .secondary-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 3.5rem;
    padding-inline: 0.35rem;
    color: var(--link);
    font-size: 0.875rem;
    font-weight: 700;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--link) 42%, transparent);
    text-underline-offset: 0.35rem;
    transition: color 180ms ease, transform 180ms ease;
  }

  .secondary-cta:hover {
    color: var(--text-main);
    transform: translateX(2px);
  }

  .hero-shot {
    position: relative;
    z-index: 2;
    min-width: 0;
    margin: 0;
  }

  .hero-shot img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    border: 1px solid var(--marketing-dark-border);
    border-radius: 0.75rem;
    box-shadow: 0 2rem 3rem -1.5rem color-mix(in srgb, var(--marketing-dark) 70%, transparent);
  }

  .hero-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: min(100% - 3rem, 80rem);
    margin: 1.25rem auto 0;
    border-top: 1px solid var(--marketing-dark-border);
    border-bottom: 1px solid var(--marketing-dark-border);
  }

  .hero-facts article {
    display: grid;
    grid-template-columns: 2.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.9rem;
    min-height: 6rem;
    padding: 1rem 1.5rem;
  }

  .hero-facts article + article {
    border-left: 1px solid var(--marketing-dark-border);
  }

  .fact-icon,
  .feature-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--primary) 13%, transparent);
    color: var(--link);
  }

  .hero-facts strong {
    display: block;
    color: var(--text-main);
    font-size: 0.875rem;
    line-height: 1.25;
  }

  .hero-facts p {
    margin: 0.3rem 0 0;
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .section-heading h2,
  .faq-intro h2,
  .final-cta h2 {
    margin: 0;
    color: var(--marketing-ink);
    font-size: clamp(2.25rem, 4.4vw, 4rem);
    font-weight: 750;
    letter-spacing: -0.04em;
    line-height: 1.03;
    text-wrap: balance;
  }

  .section-heading p,
  .faq-intro p {
    max-width: 44rem;
    margin: 1.4rem 0 0;
    color: var(--marketing-ink-soft);
    font-size: 1.125rem;
    line-height: 1.7;
    text-wrap: pretty;
  }

  .product-shot {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--marketing-line);
    border-radius: 0.75rem;
    background: var(--marketing-dark-soft);
    cursor: zoom-in;
  }

  .product-shot img {
    display: block;
    width: 100%;
    height: auto;
    transition: transform 360ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .product-shot:hover img {
    transform: scale(1.012);
  }

  .features-section {
    padding: clamp(5.5rem, 8vw, 8rem) 0;
    border-top: 1px solid var(--marketing-line);
    background: var(--marketing-paper-strong);
  }

  #features,
  #pricing,
  #faq {
    scroll-margin-top: 4.5rem;
  }

  .section-heading {
    max-width: 48rem;
    margin-bottom: 3rem;
  }

  .section-heading h2 {
    font-size: clamp(2.25rem, 3.8vw, 3.5rem);
  }

  .feature-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(20rem, 0.75fr);
    gap: 1.25rem;
  }

  .feature-main,
  .fiado-feature,
  .offline-feature {
    overflow: hidden;
    border-radius: 0.75rem;
  }

  .feature-main,
  .fiado-feature {
    border: 1px solid var(--marketing-line);
    background: var(--marketing-paper);
  }

  .feature-main {
    display: flex;
    flex-direction: column;
  }

  .feature-main .product-shot,
  .fiado-feature .product-shot {
    margin-top: auto;
    border: 0;
    border-top: 1px solid var(--marketing-line);
    border-radius: 0;
  }

  .feature-main .product-shot img {
    width: 112%;
    max-width: none;
  }

  .feature-copy {
    padding: 2rem;
  }

  .feature-copy h3,
  .offline-feature h3 {
    max-width: 15ch;
    margin: 1.35rem 0 0;
    color: var(--marketing-ink);
    font-size: 1.875rem;
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.08;
    text-wrap: balance;
  }

  .feature-copy p,
  .offline-feature p {
    max-width: 38rem;
    margin: 1rem 0 0;
    color: var(--marketing-ink-soft);
    font-size: 1.125rem;
    line-height: 1.65;
  }

  .feature-side {
    display: grid;
    gap: 1.25rem;
  }

  .offline-feature {
    min-height: 17rem;
    padding: 2rem;
    background: var(--primary-hover);
    color: var(--primary-text);
  }

  .feature-icon-inverse {
    background: color-mix(in srgb, var(--primary-text) 18%, transparent);
    color: var(--primary-text);
  }

  .offline-feature h3,
  .offline-feature p {
    color: var(--primary-text);
  }

  .offline-feature p {
    opacity: 1;
  }

  .compact-copy {
    padding: 1.5rem;
  }

  .compact-copy h3 {
    font-size: 1.25rem;
  }

  .compact-copy p {
    font-size: 0.875rem;
  }

  .zelinho-section {
    padding: clamp(5.5rem, 8vw, 8rem) 0;
    background: var(--marketing-dark-soft);
    color: var(--text-main);
  }

  #zelinho {
    scroll-margin-top: 4.5rem;
  }

  .zelinho-layout {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(22rem, 1.1fr);
    align-items: start;
    gap: clamp(3rem, 8vw, 8rem);
  }

  .zelinho-layout h2 {
    margin: 0;
    color: var(--text-main);
    font-size: clamp(2.25rem, 4vw, 3.75rem);
    font-weight: 750;
    letter-spacing: -0.04em;
    line-height: 1.03;
    text-wrap: balance;
  }

  .zelinho-layout > div:first-child p {
    margin: 1.4rem 0 0;
    color: var(--marketing-dark-muted);
    font-size: 1.125rem;
    line-height: 1.7;
  }

  .zelinho-demo {
    min-width: 0;
  }

  .demo-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }

  .demo-label {
    margin: 0;
    color: var(--marketing-dark-muted);
    font-size: 0.625rem;
    font-weight: 650;
  }

  .demo-status {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--marketing-dark-muted);
    font-size: 0.625rem;
  }

  .demo-status span {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--primary);
  }

  .question-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }

  .question-list button {
    display: flex;
    align-items: center;
    flex: 1 1 10.5rem;
    gap: 0.65rem;
    min-height: 2.75rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--marketing-dark-border);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-main);
    font-size: 0.875rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
    transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
  }

  .question-list button:hover,
  .question-list button.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }

  .question-list button :global(svg) {
    flex: 0 0 auto;
    color: var(--link);
  }

  .question-list button.active :global(svg) {
    color: var(--primary);
  }

  .demo-query {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin: 1.75rem 0 0.75rem;
    padding: 0 0 0.75rem;
    border-bottom: 1px solid var(--marketing-dark-border);
  }

  .demo-query span {
    color: var(--marketing-dark-muted);
    font-size: 0.625rem;
  }

  .demo-query strong {
    color: var(--text-main);
    font-size: 0.875rem;
    text-align: right;
  }

  .demo-answer {
    padding: 1.35rem 1.5rem 1.5rem;
    border: 1px solid var(--marketing-dark-border);
    border-radius: 0.75rem;
    background: var(--marketing-dark);
  }

  .demo-answer-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .demo-answer-heading strong,
  .demo-answer-heading span {
    display: block;
  }

  .demo-answer-heading strong {
    margin-top: 0.3rem;
    color: var(--text-main);
    font-size: 1rem;
  }

  .demo-answer-heading > div > span {
    color: var(--marketing-dark-muted);
    font-size: 0.625rem;
  }

  .demo-result-state {
    flex: 0 0 auto;
    color: var(--link);
    font-size: 0.625rem;
  }

  .demo-answer > p {
    margin: 1.15rem 0 0;
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .demo-numbers {
    display: grid;
    gap: 0;
    margin-top: 1.25rem;
    padding: 0.25rem 0;
    border-top: 1px solid var(--marketing-dark-border);
    border-bottom: 1px solid var(--marketing-dark-border);
  }

  .demo-numbers div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 0.75rem 0;
  }

  .demo-numbers div + div {
    border-top: 1px solid var(--marketing-dark-border);
  }

  .demo-numbers span,
  .demo-numbers strong {
    display: block;
  }

  .demo-numbers span {
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
  }

  .demo-numbers strong {
    overflow-wrap: anywhere;
    color: var(--text-main);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .demo-answer .demo-takeaway {
    margin-top: 1.15rem;
    color: var(--text-main);
    font-size: 0.875rem;
    font-weight: 650;
  }

  .audience-section {
    padding: 3rem 0;
    border-bottom: 1px solid var(--marketing-line);
    background: var(--marketing-paper-tint);
  }

  .audience-layout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }

  .audience-layout h2 {
    margin: 0;
    color: var(--marketing-ink);
    font-size: 1.25rem;
    font-weight: 750;
    letter-spacing: -0.02em;
  }

  .audience-lead {
    margin: 0.5rem 0 0;
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
  }

  .audience-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.75rem 1.5rem;
  }

  .audience-links a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
    font-weight: 650;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--primary) 38%, transparent);
    text-underline-offset: 0.3rem;
  }

  .audience-links a:hover {
    color: var(--primary-hover);
  }

  .pricing-section {
    padding: clamp(6rem, 9vw, 9rem) 0;
    background: var(--marketing-paper);
  }

  .pricing-heading {
    margin-inline: auto;
    text-align: center;
  }

  .pricing-heading p {
    margin-inline: auto;
  }

  .pricing-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .price-plan {
    display: flex;
    flex-direction: column;
    min-height: 31rem;
    padding: 1.75rem;
    border: 1px solid var(--marketing-line);
    border-radius: 0.75rem;
    background: var(--marketing-paper-strong);
  }

  .price-plan-primary {
    border-color: var(--marketing-dark-soft);
    background: var(--marketing-dark-soft);
    color: var(--text-main);
  }

  .plan-name {
    margin: 0 0 0.75rem;
    color: var(--primary-hover);
    font-size: 0.625rem;
    font-weight: 750;
  }

  .price-plan-primary .plan-name {
    color: var(--link);
  }

  .price-plan h3 {
    margin: 0;
    color: var(--marketing-ink);
    font-size: 1.875rem;
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.12;
    text-wrap: balance;
  }

  .price-plan-primary h3 {
    color: var(--text-main);
  }

  .plan-description {
    margin: 0.9rem 0 0;
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .price-plan-primary .plan-description,
  .price-plan-primary li {
    color: var(--text-main);
  }

  .plan-price {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    margin: 2rem 0 0;
    color: var(--marketing-ink);
    font-variant-numeric: tabular-nums;
  }

  .price-plan-primary .plan-price {
    color: var(--text-main);
  }

  .plan-price strong {
    font-size: 3.75rem;
    font-weight: 750;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .plan-price span {
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
  }

  .price-plan-primary .plan-price span {
    color: var(--marketing-dark-muted);
  }

  .price-breakdown {
    margin: 0.75rem 0 0;
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
  }

  .price-plan ul {
    display: grid;
    gap: 0.85rem;
    margin: auto 0 0;
    padding: 1.5rem 0 0;
    border-top: 1px solid var(--marketing-line);
    list-style: none;
  }

  .price-plan-primary ul {
    border-color: var(--marketing-dark-border);
  }

  .price-plan li {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .price-plan li :global(svg) {
    flex: 0 0 auto;
    margin-top: 0.12rem;
    color: var(--primary);
  }

  .price-plan-primary ul li {
    color: var(--text-main);
  }

  .pricing-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    margin-top: 2rem;
    padding: 1.5rem 0;
    border-top: 1px solid var(--marketing-line);
    border-bottom: 1px solid var(--marketing-line);
  }

  .pricing-action p {
    max-width: 42rem;
    margin: 0;
    color: var(--marketing-ink-soft);
    font-size: 1.125rem;
    line-height: 1.6;
  }

  .pricing-action strong {
    color: var(--marketing-ink);
  }

  .faq-section {
    padding: clamp(5.5rem, 8vw, 8rem) 0;
    border-top: 1px solid var(--marketing-line);
    background: var(--marketing-paper-strong);
  }

  .faq-shell {
    display: grid;
    grid-template-columns: minmax(16rem, 0.7fr) minmax(0, 1.3fr);
    gap: clamp(3rem, 8vw, 8rem);
    width: min(100% - 3rem, 70rem);
    margin-inline: auto;
  }

  .faq-intro h2 {
    font-size: clamp(2.25rem, 3.5vw, 3.25rem);
  }

  .faq-intro p {
    font-size: 1.125rem;
  }

  .faq-list {
    border-top: 1px solid var(--marketing-line);
  }

  .faq-list details {
    border-bottom: 1px solid var(--marketing-line);
  }

  .faq-list summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4.75rem;
    color: var(--marketing-ink);
    font-size: 1.125rem;
    font-weight: 700;
    cursor: pointer;
    list-style: none;
  }

  .faq-list summary::-webkit-details-marker {
    display: none;
  }

  .faq-list summary :global(svg) {
    flex: 0 0 auto;
    color: var(--marketing-ink-soft);
    transition: transform 180ms ease;
  }

  .faq-list details[open] summary :global(svg) {
    transform: rotate(180deg);
  }

  .faq-list details > p {
    max-width: 42rem;
    margin: -0.25rem 0 1.5rem;
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
    line-height: 1.65;
  }

  .final-cta {
    padding: clamp(4rem, 7vw, 6.5rem) 0;
    background: var(--marketing-dark);
    color: var(--text-main);
  }

  .final-cta-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3rem;
    width: min(100% - 3rem, 70rem);
    margin-inline: auto;
  }

  .final-cta h2 {
    max-width: 18ch;
    color: var(--text-main);
    font-size: clamp(2.25rem, 4vw, 3.75rem);
  }

  .final-cta p {
    margin: 1rem 0 0;
    color: var(--marketing-dark-muted);
    font-size: 1.125rem;
  }

  .lightbox {
    position: fixed;
    z-index: 80;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: color-mix(in srgb, var(--marketing-dark) 92%, transparent);
    cursor: zoom-out;
  }

  .lightbox-inner {
    position: relative;
    width: min(100%, 80rem);
  }

  .lightbox-inner img {
    display: block;
    width: 100%;
    max-height: 86vh;
    object-fit: contain;
    border-radius: 0.75rem;
  }

  .lightbox-close {
    position: absolute;
    top: -3.25rem;
    right: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid var(--marketing-dark-border);
    border-radius: 0.75rem;
    background: var(--marketing-dark-panel);
    color: var(--text-main);
  }

  @media (max-width: 1024px) {
    .hero {
      min-height: auto;
    }

    .hero-inner {
      grid-template-columns: minmax(0, 0.95fr) minmax(27rem, 1.05fr);
    }

    .hero h1 {
      font-size: clamp(2.5rem, 5vw, 3.5rem);
    }

    .feature-layout {
      grid-template-columns: 1fr;
    }

    .feature-side {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pricing-grid {
      grid-template-columns: 1fr;
    }

    .price-plan {
      min-height: 0;
    }
  }

  @media (max-width: 900px) {
    .section-shell,
    .hero-inner,
    .hero-facts,
    .faq-shell,
    .final-cta-inner {
      width: min(100% - 2rem, 80rem);
    }

    .hero {
      min-height: 0;
      padding-top: 5.5rem;
    }

    .hero-inner {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .hero-copy {
      padding-block: 1.5rem 0;
    }

    .hero-kicker {
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }

    .hero h1 {
      max-width: 19ch;
      font-size: clamp(2rem, 8.6vw, 3.25rem);
      letter-spacing: -0.035em;
      line-height: 1.03;
    }

    .hero-lead {
      margin-block: 1rem 1.25rem;
      font-size: 1rem;
      line-height: 1.6;
    }

    .primary-cta {
      width: 100%;
      padding-inline: 1rem;
    }

    .hero-actions {
      display: grid;
      gap: 0.65rem;
    }

    .secondary-cta {
      justify-content: center;
      width: 100%;
    }

    .hero-kicker,
    .hero-shot {
      display: none;
    }

    .hero-price {
      order: 0;
      text-align: center;
    }

    .hero-proof-mobile {
      display: block;
      margin: 1.75rem 0 0;
    }

    .hero-proof-mobile img {
      display: block;
      width: 100%;
      height: auto;
      border: 1px solid var(--marketing-dark-border);
      border-radius: 0.75rem;
    }

    .hero-proof-mobile figcaption {
      margin-top: 0.6rem;
      color: var(--marketing-dark-muted);
      font-size: 0.8125rem;
      text-align: center;
    }

    .hero-facts {
      display: block;
      margin-top: 0.5rem;
    }

    .hero-facts article {
      min-height: 4.75rem;
      padding-inline: 0.75rem;
    }

    .hero-facts article + article {
      border-top: 1px solid var(--marketing-dark-border);
      border-left: 0;
    }

    .section-heading h2,
    .zelinho-layout h2,
    .faq-intro h2,
    .final-cta h2 {
      font-size: 2.25rem;
      letter-spacing: -0.035em;
    }

    .section-heading p,
    .zelinho-layout > div:first-child p {
      font-size: 1.125rem;
    }

    .feature-side {
      grid-template-columns: 1fr;
    }

    .feature-copy,
    .offline-feature {
      padding: 1.5rem;
    }

    .feature-copy h3,
    .offline-feature h3 {
      font-size: 1.875rem;
    }

    .zelinho-layout,
    .faq-shell {
      grid-template-columns: 1fr;
      gap: 3rem;
    }

    .question-list button {
      flex-basis: 12rem;
      font-size: 1rem;
    }

    .demo-answer {
      padding: 1.25rem;
    }

    .demo-numbers {
      margin-top: 1rem;
    }

    .audience-layout {
      align-items: flex-start;
      flex-direction: column;
    }

    .audience-links {
      justify-content: flex-start;
      row-gap: 0.25rem;
    }

    .pricing-action,
    .final-cta-inner {
      align-items: stretch;
      flex-direction: column;
    }

    .final-cta p {
      line-height: 1.6;
    }
  }

  @media (min-width: 1600px) {
    .hero {
      min-height: min(56rem, 100dvh);
      padding-top: 6rem;
    }

    .hero-inner,
    .hero-facts {
      width: min(calc(100% - 6rem), 96rem);
    }

    .hero-inner {
      grid-template-columns: minmax(0, 0.9fr) minmax(40rem, 1.1fr);
      gap: clamp(1rem, 2vw, 3rem);
    }

    .hero h1 {
      max-width: 16ch;
      font-size: clamp(5rem, 5.3vw, 5.5rem);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .hero-copy {
      animation: hero-copy-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
  }

  @keyframes hero-copy-in {
    from {
      opacity: 0;
      transform: translateY(1.25rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .primary-cta,
    .product-shot img,
    .faq-list summary :global(svg) {
      transition: none;
    }

    .primary-cta:hover,
    .primary-cta:active,
    .product-shot:hover img {
      transform: none;
    }
  }
</style>
