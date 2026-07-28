<script>
  import { page } from '$app/stores';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';

  const subjectOptions = [
    { value: 'demo', label: 'Agendar demonstração' },
    { value: 'especialista', label: 'Falar com especialista' },
    { value: 'whatsapp', label: 'Pedidos pelo WhatsApp' },
    { value: 'suporte', label: 'Falar com suporte' },
    { value: 'planos', label: 'Conhecer planos' },
    { value: 'teste', label: 'Testar o Zelo PDV' },
    { value: 'outro', label: 'Outro assunto' },
  ];

  const intentCopy = {
    demo: {
      eyebrow: 'Demonstração guiada',
      title: 'Veja o Zelo PDV funcionando na rotina do seu negócio',
      description:
        'Conte como funciona sua operação e o time Zelo te orienta pelo melhor caminho: caixa, estoque, delivery, mesas, pedidos e financeiro.',
    },
    especialista: {
      eyebrow: 'Atendimento consultivo',
      title: 'Fale com alguém que entende a operação antes de escolher',
      description:
        'Use este canal para tirar dúvidas comerciais, comparar planos e entender se o Zelo encaixa na sua lanchonete, hamburgueria ou delivery próprio.',
    },
    whatsapp: {
      eyebrow: 'Pedidos e atendimento',
      title: 'Organize pedidos do WhatsApp sem perder venda no caminho',
      description:
        'Entenda como o Zelo PDV ajuda a receber pedidos, acompanhar o caixa e deixar o atendimento mais organizado no dia a dia.',
    },
    suporte: {
      eyebrow: 'Suporte Zelo PDV',
      title: 'Receba orientação para começar ou resolver uma dúvida',
      description:
        'Conte o que você precisa e o time Zelo indica o melhor próximo passo, seja para começar o teste, conhecer recursos ou tirar uma dúvida inicial.',
    },
    planos: {
      eyebrow: 'Planos e extensões',
      title: 'Entenda o plano ideal antes de criar sua conta',
      description:
        'O plano base cobre caixa, produtos, estoque, fiado, despesas e relatórios. Extensões entram só quando a operação pedir.',
    },
    teste: {
      eyebrow: 'Teste gratuito',
      title: 'Comece o teste do Zelo PDV com o caminho certo',
      description:
        'Se você já quer colocar a mão no sistema, crie sua conta grátis. Se preferir conversar antes, envie seus dados pelo formulário.',
    },
    outro: {
      eyebrow: 'Contato Zelo PDV',
      title: 'Converse com o time Zelo sobre o seu negócio',
      description:
        'Tire dúvidas sobre planos, demonstração, WhatsApp, suporte inicial ou teste grátis para sua lanchonete, hamburgueria, delivery próprio ou MEI.',
    },
  };

  const quickRoutes = [
    {
      title: 'Começar agora',
      description: 'Criar conta e testar o PDV por 14 dias, sem cartão.',
      href: '/cadastro?origem=contato',
      label: 'Criar conta grátis',
    },
    {
      title: 'Comparar planos',
      description: 'Ver preço do plano base, extensões e cenários recomendados.',
      href: '/?origem=contato#pricing',
      label: 'Ver planos',
    },
    {
      title: 'Operação com WhatsApp',
      description: 'Conhecer o Zelo Chat e o fluxo de atendimento conectado ao PDV.',
      href: '/extensoes?origem=contato#chat',
      label: 'Ver Zelo Chat',
    },
  ];

  const fitCards = [
    'Lanchonete com balcão, caixa e fiado',
    'Hamburgueria com pico de pedidos',
    'Delivery próprio por WhatsApp ou Instagram',
    'MEI que precisa controlar caixa e despesas',
  ];

  let name = '';
  let email = '';
  let phone = '';
  let business = '';
  let message = '';
  let website = '';
  let loading = false;
  let successMessage = '';
  let errorMessage = '';

  $: rawSubject = $page.url.searchParams.get('assunto') || $page.url.searchParams.get('utm_content') || 'outro';
  $: normalizedSubject = normalizeSubject(rawSubject);
  $: copy = intentCopy[normalizedSubject] || intentCopy.outro;
  $: selectedSubject = normalizedSubject;
  $: utmContent = $page.url.searchParams.get('utm_content') || '';

  function normalizeSubject(value) {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('demo')) return 'demo';
    if (raw.includes('especialista')) return 'especialista';
    if (raw.includes('whatsapp')) return 'whatsapp';
    if (raw.includes('suporte')) return 'suporte';
    if (raw.includes('plano')) return 'planos';
    if (raw.includes('teste')) return 'teste';
    return ['demo', 'especialista', 'whatsapp', 'suporte', 'planos', 'teste'].includes(raw) ? raw : 'outro';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    loading = true;
    successMessage = '';
    errorMessage = '';

    try {
      const response = await fetch('/api/contact/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          business,
          message,
          website,
          subject: selectedSubject,
          utmContent,
          pagePath: `${$page.url.pathname}${$page.url.search}`,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        errorMessage = payload?.error || 'Não conseguimos enviar sua mensagem agora.';
        return;
      }

      successMessage = 'Mensagem enviada. O time Zelo recebeu seus dados e vai retornar pelo contato informado.';
      name = '';
      email = '';
      phone = '';
      business = '';
      message = '';
    } catch {
      errorMessage = 'Erro de conexão. Tente novamente em alguns minutos.';
    } finally {
      loading = false;
    }
  }

  const contactSchema = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contato Zelo PDV',
    url: 'https://zelopdv.com.br/contato',
    description:
      'Página de contato para falar com o time Zelo PDV, solicitar demonstração, conhecer planos e tirar dúvidas iniciais.',
    publisher: {
      '@type': 'Organization',
      name: 'Zelo PDV',
      url: 'https://zelopdv.com.br',
    },
  };
</script>

<svelte:head>
  <title>Contato Zelo PDV — Fale com Especialista, Demonstração e Suporte</title>
  <meta
    name="description"
    content="Fale com o time Zelo PDV sem sair do site. Solicite demonstração, suporte inicial, planos ou orientação para lanchonete, hamburgueria e delivery."
  />
  <link rel="canonical" href="https://zelopdv.com.br/contato" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/contato" />
  <meta property="og:title" content="Contato Zelo PDV — Fale com Especialista, Demonstração e Suporte" />
  <meta
    property="og:description"
    content="Fale com o time Zelo PDV para solicitar demonstração, tirar dúvidas sobre planos, WhatsApp e suporte inicial."
  />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/contato" />
  <meta name="twitter:title" content="Contato Zelo PDV — Fale com Especialista, Demonstração e Suporte" />
  <meta
    name="twitter:description"
    content="Solicite demonstração, suporte inicial ou orientação comercial para sua lanchonete, hamburgueria, delivery próprio ou MEI."
  />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />
  {@html `<script type="application/ld+json">${JSON.stringify(contactSchema)}</script>`}
</svelte:head>

<div class="contact-page">
  <SiteHeader />

  <main>
    <section class="hero">
      <div class="hero-bg hero-bg-a"></div>
      <div class="hero-bg hero-bg-b"></div>

      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p class="hero-description">{copy.description}</p>

          <div class="hero-actions">
            <a class="primary-action" href="/cadastro?origem=contato">Testar 14 dias grátis</a>
            <a class="secondary-action" href="#formulario">Enviar mensagem</a>
          </div>

          <div class="trust-row" aria-label="Diferenciais do Zelo PDV">
            <span>Sem cartão no teste</span>
            <span>Roda no navegador</span>
            <span>Suporte em português</span>
          </div>
        </div>

        <div class="lead-panel" id="formulario">
          <div class="panel-head">
            <p>Fale com o time Zelo</p>
            <h2>Deixe seus dados</h2>
          </div>

          {#if successMessage}
            <div class="alert success">{successMessage}</div>
          {/if}
          {#if errorMessage}
            <div class="alert error">{errorMessage}</div>
          {/if}

          <form on:submit={handleSubmit}>
            <div class="field-grid">
              <label>
                <span>Nome</span>
                <input bind:value={name} name="name" autocomplete="name" required />
              </label>

              <label>
                <span>E-mail</span>
                <input bind:value={email} name="email" type="email" autocomplete="email" required />
              </label>
            </div>

            <div class="field-grid">
              <label>
                <span>Telefone ou WhatsApp</span>
                <input bind:value={phone} name="phone" autocomplete="tel" />
              </label>

              <label>
                <span>Tipo de contato</span>
                <select bind:value={selectedSubject} name="subject">
                  {#each subjectOptions as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
            </div>

            <label>
              <span>Nome ou tipo do negócio</span>
              <input
                bind:value={business}
                name="business"
                placeholder="Ex: lanchonete, hamburgueria, delivery próprio"
              />
            </label>

            <label>
              <span>Como podemos ajudar?</span>
              <textarea
                bind:value={message}
                name="message"
                rows="5"
                required
                placeholder="Conte o que você quer resolver: caixa, estoque, delivery, WhatsApp, demonstração, suporte..."
              ></textarea>
            </label>

            <label class="hidden-field" aria-hidden="true">
              <span>Site</span>
              <input bind:value={website} name="website" tabindex="-1" autocomplete="off" />
            </label>

            <button class="submit-btn" type="submit" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar para o time Zelo'}
            </button>
          </form>
        </div>
      </div>
    </section>

    <section class="route-section">
      <div class="section-inner">
        <div class="section-head">
          <p>Próximo passo</p>
          <h2>Escolha o melhor caminho para avançar</h2>
        </div>

        <div class="route-grid">
          {#each quickRoutes as route}
            <article class="route-card">
              <h3>{route.title}</h3>
              <p>{route.description}</p>
              <a href={route.href}>{route.label}</a>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <section class="fit-section">
      <div class="section-inner fit-grid">
        <div>
          <p class="eyebrow">Para quem o Zelo PDV ajuda</p>
          <h2>Atendimento para quem vende comida todos os dias</h2>
          <p>
            Se você precisa melhorar o caixa, controlar estoque, organizar pedidos do WhatsApp
            ou entender qual plano faz sentido, o time Zelo pode orientar antes de você começar.
          </p>
        </div>

        <div class="fit-list">
          {#each fitCards as item}
            <div>{item}</div>
          {/each}
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>

<style>
  .contact-page {
    min-height: 100vh;
    overflow-x: hidden;
    background:
      radial-gradient(circle at 10% 10%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 30%),
      radial-gradient(circle at 82% 4%, color-mix(in srgb, var(--success) 14%, transparent), transparent 28%),
      var(--bg-app);
    color: var(--text-label);
  }

  .hero {
    position: relative;
    padding: 8.5rem 1.5rem 5rem;
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

  .hero-inner,
  .section-inner {
    width: min(100%, 76rem);
    margin: 0 auto;
  }

  .hero-inner {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(24rem, 0.78fr);
    gap: 3rem;
    align-items: center;
  }

  .hero-copy {
    max-width: 43rem;
  }

  .eyebrow,
  .section-head p,
  .panel-head p {
    margin: 0 0 1rem;
    color: var(--link);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 1.35rem;
    color: var(--text-main);
    font-size: clamp(2.6rem, 7vw, 5.5rem);
    line-height: 0.96;
    font-weight: 800;
    letter-spacing: 0;
  }

  .hero-description {
    max-width: 38rem;
    margin-bottom: 2rem;
    color: var(--text-muted);
    font-size: clamp(1.05rem, 2vw, 1.28rem);
    line-height: 1.7;
  }

  .hero-actions,
  .trust-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    align-items: center;
  }

  .hero-actions {
    margin-bottom: 1.25rem;
  }

  .primary-action,
  .secondary-action,
  .route-card a,
  .submit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    border-radius: 999px;
    font-weight: 800;
    text-align: center;
    transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
  }

  .primary-action,
  .submit-btn {
    border: 1px solid color-mix(in srgb, var(--primary) 80%, white);
    background: var(--primary);
    color: var(--primary-text);
    box-shadow: 0 18px 45px color-mix(in srgb, var(--primary) 24%, transparent);
  }

  .primary-action,
  .secondary-action {
    padding: 0.9rem 1.4rem;
  }

  .secondary-action {
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-panel) 72%, transparent);
    color: var(--text-main);
  }

  .primary-action:hover,
  .secondary-action:hover,
  .route-card a:hover,
  .submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .trust-row span {
    padding: 0.48rem 0.72rem;
    border: 1px solid var(--border-card);
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg-card) 74%, transparent);
    color: var(--text-muted);
    font-size: 0.86rem;
  }

  .lead-panel,
  .route-card,
  .fit-list div {
    border: 1px solid var(--border-card);
    background: color-mix(in srgb, var(--bg-card) 92%, transparent);
    box-shadow: 0 24px 70px color-mix(in srgb, var(--bg-app) 70%, transparent);
  }

  .lead-panel {
    border-radius: 1.6rem;
    padding: clamp(1.25rem, 3vw, 2rem);
  }

  .panel-head h2 {
    margin-bottom: 1.25rem;
    color: var(--text-main);
    font-size: 1.7rem;
    line-height: 1.15;
  }

  form,
  label {
    display: grid;
    gap: 0.7rem;
  }

  form {
    gap: 1rem;
  }

  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  label span {
    color: var(--text-label);
    font-size: 0.9rem;
    font-weight: 700;
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid var(--border-subtle);
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--bg-input) 86%, black);
    color: var(--text-main);
    font: inherit;
    padding: 0.85rem 0.95rem;
    outline: none;
    transition: border-color 180ms ease, box-shadow 180ms ease;
  }

  textarea {
    resize: vertical;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--text-muted);
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
  }

  .hidden-field {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .submit-btn {
    width: 100%;
    padding: 0.9rem 1.25rem;
    cursor: pointer;
  }

  .submit-btn:disabled {
    cursor: not-allowed;
    opacity: 0.68;
  }

  .alert {
    margin-bottom: 1rem;
    border-radius: 0.9rem;
    padding: 0.85rem 1rem;
    font-size: 0.92rem;
    line-height: 1.5;
  }

  .alert.success {
    border: 1px solid var(--status-success-border);
    background: var(--status-success-bg);
    color: var(--status-success-text);
  }

  .alert.error {
    border: 1px solid var(--status-error-border);
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .route-section,
  .fit-section {
    padding: 4.5rem 1.5rem;
    border-top: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent);
  }

  .route-section {
    background: color-mix(in srgb, var(--bg-panel) 42%, transparent);
  }

  .section-head {
    max-width: 42rem;
    margin-bottom: 2rem;
  }

  .section-head h2,
  .fit-grid h2 {
    color: var(--text-main);
    font-size: clamp(2rem, 4vw, 3.2rem);
    line-height: 1.08;
    font-weight: 800;
  }

  .route-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .route-card {
    border-radius: 1.2rem;
    padding: 1.4rem;
  }

  .route-card h3 {
    margin-bottom: 0.65rem;
    color: var(--text-main);
    font-size: 1.25rem;
  }

  .route-card p,
  .fit-grid p {
    color: var(--text-muted);
    line-height: 1.65;
  }

  .route-card a {
    margin-top: 0.5rem;
    padding: 0.72rem 1rem;
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
  }

  .fit-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(20rem, 1fr);
    gap: 2rem;
    align-items: center;
  }

  .fit-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .fit-list div {
    min-height: 7rem;
    display: flex;
    align-items: flex-end;
    border-radius: 1.2rem;
    padding: 1.2rem;
    color: var(--text-main);
    font-weight: 800;
  }

  @media (max-width: 900px) {
    .hero-inner,
    .fit-grid {
      grid-template-columns: 1fr;
    }

    .route-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .hero {
      padding-top: 7rem;
    }

    .field-grid,
    .fit-list {
      grid-template-columns: 1fr;
    }

    .primary-action,
    .secondary-action {
      width: 100%;
    }
  }
</style>
