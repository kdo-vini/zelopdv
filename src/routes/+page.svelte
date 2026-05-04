<svelte:head>
  <title>Sistema PDV para Lanchonete — Zelo PDV: Simples, Rápido e Online</title>
  <meta name="description" content="Sistema PDV para lanchonete, hamburgueria e pequenos negócios. Controle caixa, fiado, despesas e veja seu lucro real. Sem instalar nada. Teste grátis 30 dias, sem cartão." />
  <meta name="keywords" content="sistema PDV, PDV para lanchonete, sistema para lanchonete, controle de caixa, sistema de vendas simples, lanchonete, hamburgueria, mercadinho, PDV grátis" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/" />
  <meta property="og:title" content="Sistema PDV para Lanchonete — Zelo PDV: Simples, Rápido e Online" />
  <meta property="og:description" content="Controle pedidos, estoque e caixa em segundos. Sistema PDV ideal para lanchonetes e pequenos comércios." />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="Zelo PDV" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/" />
  <meta name="twitter:title" content="Sistema PDV para Lanchonete — Zelo PDV" />
  <meta name="twitter:description" content="O sistema de caixa que coloca ordem no seu negócio. Controle de vendas, gestão de fiado e relatórios financeiros em um só lugar." />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  <!-- SoftwareApplication + Product Schema -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "Product"],
    "name": "Zelo PDV",
    "alternateName": "Sistema PDV para Lanchonete",
    "brand": { "@type": "Brand", "name": "Zelo PDV" },
    "sku": "zelopdv-plano-unico",
    "category": "Business > Point of Sale Software",
    "itemCondition": "https://schema.org/NewCondition",
    "url": "https://zelopdv.com.br",
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "PointOfSaleApplication",
    "operatingSystem": "Web Browser, Android, iOS",
    "browserRequirements": "Requires Google Chrome or Microsoft Edge",
    "inLanguage": "pt-BR",
    "offers": {
      "@type": "Offer",
      "price": "59.00",
      "priceCurrency": "BRL",
      "priceValidUntil": "2027-12-31",
      "availability": "https://schema.org/InStock",
      "description": "Plano único com acesso completo: vendas ilimitadas, controle de fiado, gestão financeira e suporte via WhatsApp."
    },
    "featureList": [
      "Frente de caixa PDV para lanchonete",
      "Controle de fiado digital",
      "Fechamento de caixa",
      "Gestão de despesas",
      "Relatório de lucro real",
      "Controle de estoque",
      "Funciona offline (PWA)",
      "Comprovante via WhatsApp",
      "Assistente de IA para lucro real (Zelinho)"
    ],
    "screenshot": "https://zelopdv.com.br/images/screenshots/dashboard-desktop.png",
    "description": "Sistema PDV online para lanchonetes, hamburguerias e pequenos negócios. Controle caixa, fiado, despesas e veja seu lucro real sem instalar nada.",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "38",
      "bestRating": "5"
    },
    "review": [
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Marcos A." },
        "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" },
        "reviewBody": "Abri o caixa no celular e em 10 minutos já tava vendendo. Nunca vi sistema tão fácil.",
        "datePublished": "2026-01-15"
      },
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Fernanda S." },
        "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" },
        "reviewBody": "O controle de fiado mudou minha vida. Acabou a briga com cliente por causa de dívida.",
        "datePublished": "2026-02-03"
      },
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Patrícia N." },
        "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" },
        "reviewBody": "Eu fazia tudo no caderno. Hoje sei exatamente quanto lucrei no mês.",
        "datePublished": "2026-03-10"
      }
    ],
    "publisher": {
      "@type": "Organization",
      "name": "Téchne Sistemas",
      "url": "https://techneia.com.br"
    }
  })}</script>`}

  <!-- Organization Schema -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Téchne Sistemas",
    "legalName": "Techne Sistemas Tecnologia Da Informacao Ltda",
    "url": "https://zelopdv.com.br",
    "logo": "https://zelopdv.com.br/favicon.png",
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "telephone": "+55-14-99153-7503",
      "availableLanguage": "Portuguese",
      "contactOption": "TollFree"
    },
    "sameAs": [
      "https://instagram.com/techne.ia"
    ],
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "BR"
    }
  })}</script>`}

  <!-- WebSite Schema with SearchAction -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Zelo PDV",
    "url": "https://zelopdv.com.br",
    "inLanguage": "pt-BR",
    "description": "Sistema PDV para lanchonete e pequenos negócios. Controle caixa, fiado, despesas e lucro real no navegador.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://zelopdv.com.br/blog?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  })}</script>`}

  <!-- FAQPage Schema -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Preciso de computador potente para usar o Zelo PDV?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Não! O Zelo PDV roda direto no navegador (Chrome, Edge). Funciona em qualquer computador ou notebook básico, e até em tablets."
        }
      },
      {
        "@type": "Question",
        "name": "Como funcionam os 30 dias grátis?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Você cria a conta e começa seu período de teste de 30 dias, sem precisar cadastrar cartão. Se assinar e quiser cancelar, pode fazer isso a qualquer momento."
        }
      },
      {
        "@type": "Question",
        "name": "O Zelo PDV emite Nota Fiscal?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "O Zelo PDV emite recibos e comprovantes de venda. Não emitimos NFC-e (Nota Fiscal ao Consumidor Eletrônica), sendo ideal para MEIs e pequenos negócios que fazem controle gerencial interno. Se precisar emissão fiscal em cada venda, recomendamos combinar o Zelo com um emissor fiscal dedicado."
        }
      },
      {
        "@type": "Question",
        "name": "Tem suporte se eu tiver dúvidas?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sim! Temos suporte direto via WhatsApp em horário comercial. A gente ajuda a configurar e tirar dúvidas na hora."
        }
      },
      {
        "@type": "Question",
        "name": "O sistema funciona sem internet?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sim. O Zelo PDV é um PWA (Progressive Web App): funciona offline e sincroniza automaticamente quando a internet voltar."
        }
      },
      {
        "@type": "Question",
        "name": "Quanto custa o sistema PDV para lanchonete?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "O Zelo PDV custa R$ 59 por mês, com acesso completo a todas as funcionalidades. Os primeiros 30 dias são grátis, sem precisar de cartão de crédito."
        }
      },
      {
        "@type": "Question",
        "name": "Como funciona o Módulo Mesas?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "O Módulo Mesas é um add-on opcional de R$ 30/mês (total R$ 89/mês) que adiciona gestão de mesas para bares, hamburguerias e restaurantes: mapa visual com status livre/ocupada, comandas acumulativas, taxa de serviço, couvert, desconto e divisão igual entre N pessoas. Ative e desative quando quiser pela tela de assinatura — sem fidelidade."
        }
      }
    ]
  })}</script>`}
</svelte:head>

<script>
  import { onMount } from 'svelte';

  let activeLightboxImage = null;
  let showMobileMenu = false;
  let daysUntilEaster = 0;

  onMount(() => {
    function handleKeydown(e) {
      if (e.key === 'Escape') activeLightboxImage = null;
    }
    window.addEventListener('keydown', handleKeydown);

    const easter = new Date('2026-04-05T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((easter.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    daysUntilEaster = Math.max(0, diff);

    if (window.fbq) window.fbq('track', 'ViewContent');

    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="min-h-screen bg-[#0B0F19] text-slate-300 font-sans selection:bg-sky-500/30 selection:text-sky-200 overflow-x-hidden">

  <!-- EASTER PROMO BANNER -->
  {#if daysUntilEaster > 0}
  <a href="/pascoa" class="fixed top-0 w-full z-[60] bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 py-2 px-4 text-center text-xs md:text-sm font-bold text-white tracking-wide shadow-[0_2px_20px_rgba(236,72,153,0.4)] flex items-center justify-center gap-2 hover:brightness-110 transition-all">
    <span>🐣</span>
    <span>Páscoa em <strong>{daysUntilEaster} {daysUntilEaster === 1 ? 'dia' : 'dias'}</strong> — veja a oferta especial para doceiras e revendedores</span>
    <span class="hidden sm:inline-flex items-center gap-1 bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-extrabold ml-1">Ver →</span>
  </a>
  {/if}

  <!-- NAV (Simples e Flutuante) -->
  <nav class="fixed {daysUntilEaster > 0 ? 'top-9' : 'top-0'} w-full z-50 transition-all duration-300 border-b border-white/5 bg-[#0B0F19]/80 backdrop-blur-md">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <a href="/" class="flex items-center gap-2">
          <img src="/logo-horizontal.png" alt="Zelo PDV" class="h-32 md:h-40 w-auto" />
        </a>
      </div>

      <div class="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <a href="#features" class="hover:text-white transition-colors">Funcionalidades</a>
        <a href="/precificacao" class="hover:text-white transition-colors">Precificação</a>
        <a href="/blog" class="hover:text-white transition-colors">Blog</a>
        <a href="#pricing" class="hover:text-white transition-colors">Preços</a>
        <a href="#faq" class="hover:text-white transition-colors">Dúvidas</a>
      </div>

      <div class="flex items-center gap-4">
        <a href="/login" class="text-sm font-medium text-white hover:text-sky-400 transition-colors hidden md:block">Entrar</a>
        <!-- CTA do header: só desktop. Em mobile o usuário tem o CTA grande na hero + opção dentro do menu. -->
        <a href="/cadastro" class="hidden md:inline-block px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all hover:scale-105 active:scale-95">
          Testar 30 dias grátis
        </a>
        <!-- Hamburger button (mobile only) -->
        <button
          class="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white transition-colors"
          aria-label={showMobileMenu ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={showMobileMenu}
          on:click={() => showMobileMenu = !showMobileMenu}
        >
          {#if showMobileMenu}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          {/if}
        </button>
      </div>
    </div>

    <!-- Mobile menu panel -->
    {#if showMobileMenu}
      <div class="md:hidden border-t border-white/5 bg-[#0B0F19]/95 backdrop-blur-md px-6 py-4 flex flex-col gap-4 animate-fade-in-down">
        <a href="#features" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Funcionalidades</a>
        <a href="/precificacao" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Precificação</a>
        <a href="/blog" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Blog</a>
        <a href="#pricing" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Preços</a>
        <a href="#faq" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Dúvidas</a>
        <div class="mt-1 flex flex-col gap-2 pt-2 border-t border-white/10">
          <a href="/login" class="w-full text-center px-5 py-3 text-sm font-semibold text-white hover:text-sky-400 transition-colors" on:click={() => showMobileMenu = false}>
            Entrar
          </a>
          <a href="/cadastro" class="w-full text-center px-5 py-3 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all" on:click={() => showMobileMenu = false}>
            Testar grátis
          </a>
        </div>
      </div>
    {/if}
  </nav>

  <!-- HERO SECTION -->
  <section class="relative pt-32 pb-40 overflow-hidden">
    <!-- Background Glows -->
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-sky-600/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none"></div>
    <div class="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-900/10 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

    <div class="max-w-7xl mx-auto px-6 text-center relative z-10">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-[11px] font-semibold uppercase tracking-wider mb-8 animate-fade-in-up">
        <span class="relative flex h-1.5 w-1.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500"></span>
        </span>
        Novo · IA que mostra seu lucro real
      </div>

      <h1 class="text-5xl md:text-7xl font-bold text-white tracking-tight leading-[1.1] mb-8 animate-fade-in-up delay-100">
        Sistema PDV simples <br class="hidden md:block" />
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-blue-400 to-sky-400 animate-gradient">para Lanchonetes</span>
      </h1>

      <p class="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up delay-200">
        Controle pedidos, estoque e caixa em segundos. Ideal para lanchonetes, hamburguerias e pequenos comércios.
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
        <a href="/cadastro" class="w-full sm:w-auto px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1">
          Testar 30 dias grátis
        </a>
        <a href="#features" class="w-full sm:w-auto px-8 py-4 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-semibold backdrop-blur-sm transition-all">
          Ver como funciona
        </a>
      </div>
      <p class="text-xs text-slate-500 mt-3">Sem cobranças durante os 30 dias. Cancele quando quiser.</p>

      <!-- MOCKUP DASHBOARD 3D -->
      <div class="mt-20 relative group">
        <!-- Mockup Container with Glow -->
        <div class="relative mx-auto max-w-5xl rounded-xl border border-white/20 shadow-[0_0_0_1px_rgba(56,189,248,0.1),0_30px_80px_-10px_rgba(14,165,233,0.25)] overflow-hidden transform transition-all duration-700 hover:scale-[1.01]">
          <!-- Browser Toolbar -->
          <div class="h-10 border-b border-white/5 bg-[#0d1117] flex items-center px-4 gap-2">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-red-500/50"></div>
              <div class="w-3 h-3 rounded-full bg-amber-500/50"></div>
              <div class="w-3 h-3 rounded-full bg-emerald-500/50"></div>
            </div>
            <div class="ml-4 flex-1 max-w-md h-6 rounded-md bg-white/5 border border-white/5 flex items-center px-3 text-xs text-slate-600 font-mono">
              zelopdv.com.br/app
            </div>
          </div>

          <!-- Imagem Real do Produto -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
          <div class="bg-[#161b22] aspect-[16/9] md:aspect-auto relative group cursor-zoom-in" on:click={() => activeLightboxImage = '/images/screenshots/dashboard-desktop.png'} role="button" tabindex="0">
            <img src="/images/screenshots/dashboard-desktop.png" alt="Tela de Vendas do Zelo PDV para Lanchonetes" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-sky-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
               </div>
            </div>
          </div>

          <!-- Overlay Gradient for depth -->
          <div class="absolute inset-0 bg-gradient-to-t from-[#0B0F19]/50 via-transparent to-transparent pointer-events-none"></div>
        </div>

        <!-- Glow under dashboard -->
        <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[90%] h-20 bg-sky-500/35 blur-[60px] -z-10"></div>
      </div>
    </div>
  </section>

  <!-- BRANDS/TRUST STRIP -->
  <section class="py-10 border-y border-white/5 bg-white/[0.02]">
    <div class="max-w-7xl mx-auto px-6 text-center">
      <p class="text-sm font-medium text-slate-500 mb-6">Criado especialmente para pequenos negócios brasileiros</p>
      <div class="flex flex-wrap justify-center gap-8 md:gap-16 opacity-70 hover:opacity-100 transition-all duration-500">
        <span class="text-lg font-bold text-white flex items-center gap-2">🍔 Lanchonetes</span>
        <span class="text-lg font-bold text-white flex items-center gap-2">🍔 Hamburguerias</span>
        <span class="text-lg font-bold text-white flex items-center gap-2">📱 MEIs e Microempreendedores</span>
        <span class="text-lg font-bold text-white flex items-center gap-2">🍕 Pequenos Deliveries</span>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="py-24 relative overflow-hidden bg-[#0d1117]">
    <div class="max-w-7xl mx-auto px-6 text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-white mb-16">Como o Zelo PDV simplifica seu dia</h2>

      <div class="grid md:grid-cols-3 gap-12">
        <div class="relative">
          <div class="w-16 h-16 mx-auto bg-sky-500/10 rounded-2xl border border-sky-500/20 flex items-center justify-center mb-6">
            <span class="text-2xl font-bold text-sky-400">1</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Cadastre seus produtos</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Adicione seu cardápio em minutos. Defina preços, categorias e controle o estoque do que for necessário.</p>
        </div>

        <div class="relative">
          <div class="hidden md:block absolute top-8 left-1/2 w-full h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent"></div>
          <div class="w-16 h-16 mx-auto bg-sky-500/10 rounded-2xl border border-sky-500/20 flex items-center justify-center mb-6">
             <span class="text-2xl font-bold text-sky-400">2</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Registre pedidos rápido</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Tela de vendas limpa. Com poucos toques você registra o pedido, envia o comprovante no WhatsApp e atende o próximo da fila.</p>
        </div>

        <div class="relative">
          <div class="hidden md:block absolute top-8 left-1/2 w-full h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent"></div>
          <div class="w-16 h-16 mx-auto bg-sky-500/10 rounded-2xl border border-sky-500/20 flex items-center justify-center mb-6">
             <span class="text-2xl font-bold text-sky-400">3</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Veja o lucro do dia</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Chega de fechar o caixa no papel. O sistema cruza o que entrou com as despesas e te mostra o lucro real.</p>
        </div>
      </div>

      <div class="mt-16">
        <a href="/cadastro" class="inline-flex px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1">
          Testar 30 dias grátis
        </a>
        <p class="text-xs text-slate-500 mt-3">Sem cobranças durante os 30 dias. Cancele quando quiser.</p>
      </div>
    </div>
  </section>

  <!-- FEATURE 1: VENDAS (Texto Esquerda, IMG Direita) -->
  <section id="features" class="py-24 relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div>
        <div class="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Frente de Caixa PDV para Lanchonetes: <br/><span class="text-sky-500">Registre Pedidos em Segundos</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Um PDV desenhado para agilizar seu balcão. Toque, adicione e finalize. Ideal para horários de pico.
        </p>
        <ul class="space-y-4">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 text-xs">✓</div>
            Registro de pedidos em segundos
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 text-xs">✓</div>
            Envio de comprovante via WhatsApp
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 text-xs">✓</div>
            Controle de estoque automático
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 text-xs">✓</div>
            Vendas iFood/Rappi e outras plataformas de delivery com taxa configurável
          </li>
        </ul>
      </div>
      <div class="relative group">
        <div class="absolute inset-0 bg-sky-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-sky-500/30 transition-all duration-700"></div>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(14,165,233,0.3)] cursor-zoom-in" on:click={() => activeLightboxImage = '/images/screenshots/dashboard-desktop.png'} role="button" tabindex="0">
           <img src="/images/screenshots/dashboard-desktop.png" alt="Tela de Vendas Lanchonete" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-sky-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
               </div>
           </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 2: FINANCEIRO (IMG Esquerda, Texto Direita) -->
  <section class="py-24 relative bg-white/[0.02]">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div class="order-2 lg:order-1 relative group">
        <div class="absolute inset-0 bg-emerald-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-emerald-500/30 transition-all duration-700"></div>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(16,185,129,0.3)] cursor-zoom-in" on:click={() => activeLightboxImage = '/images/screenshots/financial-screen.png'} role="button" tabindex="0">
           <img src="/images/screenshots/financial-screen.png" alt="Tela de Controle de Caixa Lanchonete" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-emerald-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
               </div>
           </div>
        </div>
      </div>
      <div class="order-1 lg:order-2">
        <div class="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Gestão Financeira para Lanchonete: <br/><span class="text-emerald-500">Veja Seu Lucro Real</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Saber quanto vendeu é fácil. Difícil é saber quanto sobrou.
          O Zelo PDV cruza vendas com despesas e te mostra seu <strong>Lucro Real</strong> no fim do mês.
        </p>
        <div class="grid grid-cols-2 gap-4">
           <div class="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <h4 class="text-white font-semibold mb-1">Controle de Despesas</h4>
              <p class="text-sm text-slate-500">Lance aluguel, luz e retiradas.</p>
           </div>
           <div class="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <h4 class="text-white font-semibold mb-1">Fechamento de Caixa</h4>
              <p class="text-sm text-slate-500">Conferência cega e segura.</p>
           </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 3: DESPESAS (Texto Esquerda, IMG Direita) -->
  <section class="py-24 relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div>
        <div class="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"/></svg>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Controle de Despesas para Pequenos Negócios</h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Registre todos os gastos do seu negócio, desde fornecedores até retiradas diárias. O sistema organiza tudo para te dar clareza no fim do mês.
        </p>
         <ul class="space-y-4">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
            Categorização inteligente de gastos
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
            Previsibilidade do seu fluxo de caixa
          </li>
        </ul>
      </div>
      <div class="relative group">
        <div class="absolute inset-0 bg-purple-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-purple-500/30 transition-all duration-700"></div>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(168,85,247,0.3)] cursor-zoom-in" on:click={() => activeLightboxImage = '/images/screenshots/despesas-page.png'} role="button" tabindex="0">
           <img src="/images/screenshots/despesas-page.png" alt="Tela de Controle de Despesas Lanchonete" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-purple-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
               </div>
           </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 4: FIADO (IMG Esquerda, Texto Direita) -->
  <section class="py-24 relative bg-white/[0.02]">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div class="order-2 lg:order-1 relative group">
        <div class="absolute inset-0 bg-amber-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-amber-500/30 transition-all duration-700"></div>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(245,158,11,0.3)] cursor-zoom-in" on:click={() => activeLightboxImage = '/images/screenshots/customers-screen.png'} role="button" tabindex="0">
           <img src="/images/screenshots/customers-screen.png" alt="Tela de Controle de Fiado Clientes" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-amber-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
               </div>
           </div>
        </div>
      </div>
      <div class="order-1 lg:order-2">
        <div class="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Controle de Fiado Digital: <br/><span class="text-amber-500">Acabe com o Caderninho</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Transforme o "caderninho" em uma ferramenta profissional. Defina limites de crédito, veja histórico e cobre com educação e prova.
        </p>
         <ul class="space-y-4">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs">✓</div>
            Extrato detalhado por cliente
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs">✓</div>
            Limite de crédito personalizável
          </li>
        </ul>
      </div>
    </div>
  </section>

  <!-- FEATURE 5: MESAS (ADD-ON) -->
  <section id="mesas" class="py-24 relative overflow-hidden">
    <!-- Background glow -->
    <div class="absolute inset-0 bg-gradient-to-br from-rose-900/20 via-transparent to-rose-900/10 pointer-events-none"></div>

    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center relative z-10">
      <!-- Texto à esquerda -->
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-semibold mb-6">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
          Add-on opcional · +R$ 30/mês
        </div>
        <div class="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
        </div>

        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">
          Módulo Mesas para Bares e Restaurantes:<br/>
          <span class="text-rose-400">Comandas e Divisão de Conta</span>
        </h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Abra mesa, vá adicionando consumo da rodada e divida a conta na hora de fechar.
          Pensado para bares, hamburguerias e qualquer lanchonete que atende no salão.
        </p>

        <ul class="space-y-4 mb-8">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 text-xs">✓</div>
            Mapa visual com status livre/ocupada
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 text-xs">✓</div>
            Comanda acumulativa por mesa
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 text-xs">✓</div>
            Taxa de serviço, couvert e desconto
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 text-xs">✓</div>
            Divisão igual entre N pessoas + pré-conta
          </li>
        </ul>

        <p class="text-sm text-slate-500">
          Ative quando precisar, desative quando não usar mais. Sem fidelidade.
        </p>
      </div>

      <!-- Mockup CSS de mesas -->
      <div class="relative group">
        <div class="absolute inset-0 bg-rose-500/15 blur-[80px] rounded-full -z-10 group-hover:bg-rose-500/25 transition-all duration-700"></div>
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl p-8 transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(244,63,94,0.25)]">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Mesas</p>
              <p class="text-sm text-slate-300">3 livres · 5 ocupadas</p>
            </div>
            <span class="text-xs text-rose-400/80 font-semibold">M11</span>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <!-- Tile 1: livre -->
            <div class="aspect-square rounded-xl border-2 border-emerald-500/40 bg-emerald-500/[0.06] p-3 flex flex-col justify-between">
              <span class="text-2xl font-bold text-white">1</span>
              <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Livre</span>
            </div>
            <!-- Tile 2: ocupada -->
            <div class="aspect-square rounded-xl border-2 border-rose-500/45 bg-rose-500/[0.08] p-3 flex flex-col justify-between">
              <span class="text-2xl font-bold text-white">2</span>
              <span class="text-[10px] font-bold uppercase tracking-wider text-rose-400">Ocupada</span>
            </div>
            <!-- Tile 3: ocupada -->
            <div class="aspect-square rounded-xl border-2 border-rose-500/45 bg-rose-500/[0.08] p-3 flex flex-col justify-between">
              <span class="text-2xl font-bold text-white">3</span>
              <span class="text-[10px] font-bold uppercase tracking-wider text-rose-400">Ocupada</span>
            </div>
            <!-- Tile 4: fechando -->
            <div class="aspect-square rounded-xl border-2 border-amber-500/45 bg-amber-500/[0.08] p-3 flex flex-col justify-between">
              <span class="text-2xl font-bold text-white">4</span>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400">Fechando</span>
            </div>
            <!-- Tile 5: livre -->
            <div class="aspect-square rounded-xl border-2 border-emerald-500/40 bg-emerald-500/[0.06] p-3 flex flex-col justify-between">
              <span class="text-2xl font-bold text-white">5</span>
              <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Livre</span>
            </div>
            <!-- Tile 6: ocupada -->
            <div class="aspect-square rounded-xl border-2 border-rose-500/45 bg-rose-500/[0.08] p-3 flex flex-col justify-between">
              <span class="text-2xl font-bold text-white">6</span>
              <span class="text-[10px] font-bold uppercase tracking-wider text-rose-400">Ocupada</span>
            </div>
          </div>

          <!-- Comanda preview row -->
          <div class="mt-5 pt-5 border-t border-white/5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-400">Mesa 2 · 3 pessoas</span>
              <span class="font-semibold text-white">R$ 142,50</span>
            </div>
            <div class="text-[11px] text-slate-500 mt-1">por pessoa: R$ 47,50</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 6: ZELINHO AI -->
  <section id="zelinho" class="py-24 relative overflow-hidden">
    <!-- Background glow -->
    <div class="absolute inset-0 bg-gradient-to-br from-sky-900/20 via-transparent to-indigo-900/20 pointer-events-none"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-sky-600/10 rounded-full blur-[120px] pointer-events-none"></div>

    <div class="max-w-7xl mx-auto px-6 relative z-10">
      <div class="text-center mb-16">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-xs font-semibold mb-6">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>
          Inteligência Artificial para Pequenos Negócios
        </div>
        <h2 class="text-3xl md:text-5xl font-bold text-white mb-6">
          Zelinho: O Primeiro Assistente de IA<br class="hidden md:block"/>
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-400">Focado no Lucro Real</span>
        </h2>
        <p class="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Não é um chatbot genérico. O Zelinho lê suas vendas, despesas e estoque reais
          e responde com contexto do <strong class="text-slate-300">seu</strong> negócio.
        </p>
      </div>

      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <!-- Left: Feature bullets -->
        <div class="space-y-6">
          <div class="flex items-start gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
            <div class="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <div>
              <h3 class="text-white font-semibold mb-1">Análise de lucro por período</h3>
              <p class="text-slate-400 text-sm leading-relaxed">Pergunte "quanto lucrei essa semana?" e o Zelinho busca suas vendas e despesas reais para te dar a resposta.</p>
            </div>
          </div>

          <div class="flex items-start gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div>
              <h3 class="text-white font-semibold mb-1">Alerta de produtos com menor margem</h3>
              <p class="text-slate-400 text-sm leading-relaxed">O Zelinho identifica quais itens do seu cardápio estão te dando menos retorno para que você ajuste preços ou custo.</p>
            </div>
          </div>

          <div class="flex items-start gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </div>
            <div>
              <h3 class="text-white font-semibold mb-1">Sugestões práticas baseadas nos seus dados</h3>
              <p class="text-slate-400 text-sm leading-relaxed">Não são dicas genéricas de internet. São recomendações geradas a partir do histórico real do seu negócio.</p>
            </div>
          </div>

          <a href="/cadastro" class="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-full shadow-lg shadow-sky-900/30 transition-all hover:-translate-y-0.5 text-sm mt-2">
            Experimentar o Zelinho grátis
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
          </a>
        </div>

        <!-- Right: AI chat mockup -->
        <div class="relative">
          <div class="absolute inset-0 bg-sky-500/10 blur-[80px] rounded-full -z-10"></div>
          <div class="rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl overflow-hidden">
            <!-- Chat header -->
            <div class="border-b border-white/5 px-5 py-4 flex items-center gap-3 bg-[#0B0F19]">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-lg">Z</div>
              <div>
                <p class="text-white text-sm font-semibold leading-none">Zelinho</p>
                <p class="text-sky-400 text-xs mt-0.5">Parceiro IA · online</p>
              </div>
              <div class="ml-auto flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-emerald-400 text-xs">ativo</span>
              </div>
            </div>
            <!-- Chat messages -->
            <div class="p-5 space-y-4 min-h-[280px]">
              <!-- User message -->
              <div class="flex justify-end">
                <div class="bg-sky-600/30 border border-sky-500/20 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]">
                  <p class="text-slate-200 text-sm">Quanto lucrei essa semana?</p>
                </div>
              </div>
              <!-- AI response -->
              <div class="flex items-start gap-2.5">
                <div class="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">Z</div>
                <div class="bg-white/[0.05] border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                  <p class="text-slate-300 text-sm leading-relaxed">Analisando seus dados de <strong class="text-white">seg a dom</strong>...</p>
                  <div class="mt-3 space-y-1.5">
                    <div class="flex justify-between text-xs">
                      <span class="text-slate-400">Vendas brutas</span>
                      <span class="text-white font-medium">R$ 3.847</span>
                    </div>
                    <div class="flex justify-between text-xs">
                      <span class="text-slate-400">Despesas lançadas</span>
                      <span class="text-red-400 font-medium">- R$ 1.290</span>
                    </div>
                    <div class="h-px bg-white/10 my-2"></div>
                    <div class="flex justify-between text-sm">
                      <span class="text-emerald-400 font-semibold">Lucro real</span>
                      <span class="text-emerald-400 font-bold">R$ 2.557</span>
                    </div>
                  </div>
                  <p class="text-slate-400 text-xs mt-3">Seu ticket médio foi <strong class="text-white">R$ 28,40</strong>. Quer ver quais produtos venderam mais?</p>
                </div>
              </div>
            </div>
            <!-- Chat input -->
            <div class="border-t border-white/5 px-4 py-3 flex items-center gap-3 bg-[#0B0F19]/50">
              <div class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-slate-500 text-sm">Pergunte sobre seu negócio...</div>
              <button class="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center flex-shrink-0" aria-label="Enviar">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- TESTIMONIALS -->
  <!-- TODO: replace with real testimonials -->
  <section class="py-24 relative bg-white/[0.02] border-t border-white/5">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Quem já usa o Zelo PDV</h2>
        <p class="text-slate-400 text-lg">Negócios que deixaram o caderno e a planilha para trás</p>
      </div>

      <div class="grid md:grid-cols-3 gap-6">

        <!-- Testimonial 1 -->
        <div class="bg-white/[0.03] border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-lg flex-shrink-0">M</div>
            <div>
              <p class="text-white font-semibold text-sm leading-tight">Marcos A.</p>
              <p class="text-slate-500 text-xs">Lanchonete do Marcos · Fortaleza, CE</p>
            </div>
          </div>
          <div class="flex gap-0.5">
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          </div>
          <p class="text-slate-300 text-sm leading-relaxed">"Abri o caixa no celular e em 10 minutos já tava vendendo. Nunca pensei que fosse tão fácil."</p>
        </div>

        <!-- Testimonial 2 -->
        <div class="bg-white/[0.03] border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg flex-shrink-0">F</div>
            <div>
              <p class="text-white font-semibold text-sm leading-tight">Fernanda S.</p>
              <p class="text-slate-500 text-xs">Hamburgueria da Fê · Ribeirão Preto, SP</p>
            </div>
          </div>
          <div class="flex gap-0.5">
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          </div>
          <p class="text-slate-300 text-sm leading-relaxed">"O controle de fiado mudou minha vida. Antes eu perdia dinheiro toda semana sem perceber."</p>
        </div>

        <!-- Testimonial 3 -->
        <div class="bg-white/[0.03] border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg flex-shrink-0">C</div>
            <div>
              <p class="text-white font-semibold text-sm leading-tight">Carlos M.</p>
              <p class="text-slate-500 text-xs">Lanchonete Sabor da Praia · Natal, RN</p>
            </div>
          </div>
          <div class="flex gap-0.5">
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          </div>
          <p class="text-slate-300 text-sm leading-relaxed">"Simples, rápido e com suporte no WhatsApp. Exatamente o que eu precisava."</p>
        </div>

      </div>
    </div>
  </section>

  <!-- SEGMENTS -->
  <section class="segments-section py-24 relative overflow-hidden border-t border-white/5">
    <div class="max-w-7xl mx-auto px-6 relative z-10">
      <div class="segments-shell">
        <div class="segments-intro">
          <h2 class="segments-title">Para quem é o Zelo PDV?</h2>
          <p class="segments-description">
            O Zelo PDV é feito para pequenos negócios de alimentação que precisam de um backoffice simples, sem pagar caro em sistemas complexos de delivery.
            Você registra vendas, acompanha despesas, organiza o fiado e entende o lucro real sem sair do navegador.
          </p>
        </div>

        <div class="segments-grid">
          <a href="/para-lanchonetes" class="segment-card">
            <div class="segment-card-top">
              <span class="segment-icon">🍔</span>
            </div>
            <h3 class="segment-title">Lanchonetes</h3>
            <p class="segment-text">
              Para quem precisa registrar pedidos rápido no balcão, controlar o caixa e saber o lucro no fim do dia.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </a>

          <a href="/para-hamburguerias" class="segment-card">
            <div class="segment-card-top">
              <span class="segment-icon">🍔</span>
            </div>
            <h3 class="segment-title">Hamburguerias</h3>
            <p class="segment-text">
              Ideal para controlar combos, estoque e pico de movimento sem complicação na operação.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </a>

          <a href="/para-delivery" class="segment-card">
            <div class="segment-card-top">
              <span class="segment-icon">🛵</span>
            </div>
            <h3 class="segment-title">Delivery Próprio</h3>
            <p class="segment-text">
              Para quem faz entrega por conta própria, sem marketplace e sem perder margem com taxa.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </a>

          <a href="/para-mei" class="segment-card">
            <div class="segment-card-top">
              <span class="segment-icon">📱</span>
            </div>
            <h3 class="segment-title">MEIs e Pequenos Negócios</h3>
            <p class="segment-text">
              Controle simples para substituir planilha e caderno por um sistema leve que também funciona no celular.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- PRICING (Plano Principal + Add-ons em grid lateral) -->
  <section id="pricing" class="py-24 relative bg-white/[0.02]">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center mb-12">
        <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">Preço Único. Tudo Incluso.</h2>
        <p class="text-slate-400 text-lg">Sem pegadinhas, sem taxas extras de surpresa.</p>
      </div>

      <div class="grid lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-8 items-start max-w-5xl mx-auto">
        <!-- ========== PLANO PRINCIPAL ========== -->
        <div class="relative">
          <!-- Glow Effect behind card -->
          <div class="absolute -inset-1 bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl blur opacity-30 animate-pulse"></div>

          <div class="relative rounded-2xl bg-[#121620] p-8 md:p-12 shadow-2xl animate-border-gradient text-center">
            <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <span class="bg-sky-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-sky-500/40 tracking-wide uppercase">Plano Único</span>
            </div>

            <p class="text-slate-300 font-medium mb-1">Acesso Completo</p>
            <div class="flex justify-center items-baseline gap-1 mb-6">
              <span class="text-2xl text-slate-400">R$</span>
              <span class="text-6xl font-bold text-white tracking-tight">59</span>
              <span class="text-xl text-slate-500">/mês</span>
            </div>

            <div class="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4 mb-8">
              <p class="text-sky-400 font-bold text-lg">30 Dias Grátis</p>
              <p class="text-sm text-sky-300/80">Teste por 30 dias. Se não amar, não paga.</p>
            </div>

            <ul class="space-y-4 text-left mb-10 max-w-xs mx-auto">
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs text-bold">✓</div>
                <span>Vendas Ilimitadas</span>
              </li>
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs text-bold">✓</div>
                <span>Controle de Estoque e Fiado</span>
              </li>
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs text-bold">✓</div>
                <span>Gestão Financeira (Lucro)</span>
              </li>
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs text-bold">✓</div>
                <span>Suporte via WhatsApp</span>
              </li>
            </ul>

            <a href="/cadastro" class="block w-full text-center py-4 text-lg font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-lg shadow-sky-900/50 transition-all hover:scale-[1.02] active:scale-[0.98]">
              Começar teste gratuito
            </a>
            <p class="text-xs text-slate-500 text-center mt-3">Sem cartão. Cancele quando quiser.</p>
          </div>
        </div>

        <!-- ========== COLUNA ADD-ONS (cards brancos / glass) ========== -->
        <div class="flex flex-col gap-4">
          <!-- Header da coluna -->
          <div class="hidden lg:block">
            <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Add-ons opcionais</p>
            <p class="text-sm text-slate-400">Ative só o que precisar. Sem fidelidade.</p>
          </div>

          <!-- Add-on Card: Mesas -->
          <div class="group relative rounded-2xl bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 p-6 md:p-7 transition-all duration-300">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                </div>
                <div class="min-w-0">
                  <p class="text-base font-bold text-white">Módulo Mesas</p>
                  <p class="text-xs text-slate-400">Bares, hamburguerias, salão</p>
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="flex items-baseline gap-0.5 justify-end">
                  <span class="text-xs text-slate-400">+R$</span>
                  <span class="text-2xl font-bold text-white">30</span>
                </div>
                <p class="text-[10px] text-slate-500 -mt-0.5">/mês</p>
              </div>
            </div>

            <ul class="space-y-2 mb-5">
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] flex-shrink-0">✓</div>
                <span>Mapa visual com status de mesas</span>
              </li>
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] flex-shrink-0">✓</div>
                <span>Comandas e divisão de conta</span>
              </li>
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] flex-shrink-0">✓</div>
                <span>Taxa de serviço, couvert, pré-conta</span>
              </li>
            </ul>

            <a href="#mesas" class="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white transition-colors">
              Ver como funciona
              <svg class="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
            </a>
          </div>

          <!-- Placeholder Card: futuros add-ons (subtle, gives sense of expandability) -->
          <div class="rounded-2xl border border-dashed border-white/10 p-5 text-center">
            <p class="text-xs text-slate-500">
              Mais add-ons chegando em breve
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="py-24 border-t border-white/5 bg-[#0B0F19]">
    <div class="max-w-3xl mx-auto px-6">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-bold text-white mb-4">Perguntas Frequentes</h2>
        <p class="text-slate-400">Tire suas dúvidas antes de começar</p>
      </div>

      <div class="space-y-4">
        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-all duration-300">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Preciso de computador potente?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Não! O Zelo PDV roda direto no navegador (Chrome, Edge). Funciona em qualquer computador ou notebook básico, e até em tablets.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Como funciona os 30 dias grátis?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Você cria a conta e começa seu período de teste de 30 dias, sem precisar cadastrar cartão. Se assinar e quiser cancelar, pode fazer isso a qualquer momento.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Consigo emitir Nota Fiscal?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            O Zelo PDV emite recibos e comprovantes de venda. Não emitimos NFC-e (Nota Fiscal ao Consumidor Eletrônica), sendo ideal para MEIs e pequenos negócios que fazem controle gerencial interno. Se precisar emissão fiscal em cada venda, recomendamos combinar o Zelo com um emissor fiscal dedicado.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Se eu tiver dúvidas, tem suporte?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim! Temos suporte direto via WhatsApp em horário comercial. A gente ajuda a configurar e tirar dúvidas na hora.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Funciona sem internet?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim. O Zelo PDV é um PWA (aplicativo web progressivo): você instala ele direto do navegador, sem loja de apps, e ele continua funcionando mesmo se a internet cair. As vendas ficam salvas no dispositivo e sobem para a nuvem automaticamente quando a conexão voltar.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Funciona no celular?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim. Funciona em Android e iPhone. Abra o site no Chrome ou Safari, clique em "Adicionar à tela inicial" e o ícone aparece como qualquer outro app — sem precisar da Play Store nem da App Store. A interface é adaptada para telas menores.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Como funciona o Módulo Mesas?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            O Módulo Mesas é um add-on opcional de <strong class="text-rose-400">+R$ 30/mês</strong> (total R$ 89/mês). Adiciona mapa visual de mesas, comandas acumulativas, taxa de serviço, couvert, desconto e divisão igual entre N pessoas — pensado para bares, hamburguerias e restaurantes que atendem no salão. Ative ou desative pela tela de assinatura quando quiser, sem fidelidade.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Consigo usar em mais de um dispositivo?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim. Você pode abrir o Zelo PDV em vários dispositivos ao mesmo tempo — celular, tablet e computador — e todos ficam sincronizados em tempo real. Uma única assinatura cobre todos os dispositivos do seu negócio.
          </div>
        </details>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="py-12 border-t border-white/10 bg-[#0B0F19]">
    <div class="max-w-7xl mx-auto px-6">
      <div class="grid md:grid-cols-4 gap-8 mb-12">
        <div class="col-span-1 md:col-span-1">
            <img src="/logo-horizontal.png" alt="Zelo PDV" class="h-32 md:h-40 w-auto" />
          <p class="text-slate-500 text-sm leading-relaxed">
            Tecnologia simples para negócios que querem crescer. Controle total do seu caixa e do seu lucro.
          </p>
        </div>

        <div>
          <h4 class="text-white font-semibold mb-4">Produto</h4>
          <ul class="space-y-2 text-sm text-slate-400">
            <li><a href="#features" class="hover:text-sky-400 transition-colors">Funcionalidades</a></li>
            <li><a href="#pricing" class="hover:text-sky-400 transition-colors">Preços</a></li>
            <li><a href="/atualizacoes" class="hover:text-sky-400 transition-colors">Atualizações</a></li>
          </ul>
        </div>

        <div>
          <h4 class="text-white font-semibold mb-4">Suporte</h4>
          <ul class="space-y-2 text-sm text-slate-400">
            <li><a href="#faq" class="hover:text-sky-400 transition-colors">Central de Ajuda</a></li>
            <li><a href="https://wa.me/5514991537503" class="hover:text-sky-400 transition-colors">Falar no WhatsApp</a></li>
            <li><a href="mailto:techne.br@gmail.com" class="hover:text-sky-400 transition-colors">Email</a></li>
          </ul>
        </div>

        <div>
           <h4 class="text-white font-semibold mb-4">Legal</h4>
           <ul class="space-y-2 text-sm text-slate-400">
             <li><a href="/termos" class="hover:text-sky-400 transition-colors">Termos de Uso</a></li>
             <li><a href="/privacidade" class="hover:text-sky-400 transition-colors">Privacidade</a></li>
           </ul>
        </div>
      </div>

      <div class="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-600">
        <div>
          &copy; {new Date().getFullYear()} <a href="https://techneia.com.br" target="_blank" rel="noopener noreferrer" class="hover:text-slate-500 transition-colors">Téchne Sistemas</a>. <br class="hidden md:block"/>Todos os direitos reservados. <br class="hidden md:block"/>
          <span class="opacity-60">Techne Sistemas Tecnologia Da Informacao Ltda — CNPJ: 65.679.798/0001-95</span>
        </div>
        <div class="flex gap-4">
           <a href="https://instagram.com/techne.ia" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors">@techne.ia</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- LIGHTBOX MODAL -->
  {#if activeLightboxImage}
    <div role="dialog" aria-modal="true" aria-label="Visualização da imagem" class="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0F19]/90 backdrop-blur-sm p-4 cursor-zoom-out animate-fade-in-up" style="animation-duration: 0.2s; opacity: 1;" on:click={() => activeLightboxImage = null}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="relative max-w-7xl w-full max-h-[90vh] flex items-center justify-center" on:click={(e) => e.stopPropagation()}>
          <button class="absolute -top-12 right-0 md:-right-12 z-50 p-2 text-slate-400 hover:text-white transition-colors cursor-pointer" on:click={() => activeLightboxImage = null}>
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <!-- svelte-ignore a11y_img_redundant_alt -->
          <img src={activeLightboxImage} alt="Imagem Ampliada do Produto Zelo PDV" class="max-w-full max-h-[85vh] object-contain rounded-xl shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10" />
      </div>
    </div>
  {/if}

</div>

<style>
  /* Custom Animations not in Tailwind by default */
  .perspective-1000 {
    perspective: 1000px;
  }

  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fade-in-down {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in-down {
    animation: fade-in-down 0.3s ease-out forwards;
  }

  .animate-fade-in-up {
    animation: fade-in-up 0.8s ease-out both;
  }

  /* Lightweight Border Animation */
  @keyframes border-rotate {
    0% { --border-angle: 0deg; }
    100% { --border-angle: 360deg; }
  }
  @property --border-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }
  .animate-border-gradient {
    position: relative;
    border: 1px solid transparent;
  }
  .animate-border-gradient::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1px;
    background: conic-gradient(from var(--border-angle), transparent 20%, #0ea5e9 80%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: border-rotate 4s linear infinite;
    pointer-events: none;
  }

  .delay-100 { animation-delay: 100ms; }
  .delay-200 { animation-delay: 200ms; }
  .delay-300 { animation-delay: 300ms; }

  @keyframes gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .animate-gradient {
    background-size: 200% 200%;
    animation: gradient 6s ease infinite;
  }

  /* Spotlight Effect */
  .spotlight-card {
    position: relative;
    overflow: hidden;
    --x: -100px;
    --y: -100px;
  }
  .spotlight-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    opacity: 0;
    background: radial-gradient(800px circle at var(--x) var(--y), rgba(14, 165, 233, 0.1), transparent 40%);
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 1;
  }
  .spotlight-card:hover::before {
    opacity: 1;
  }

  .segments-section {
    background: color-mix(in srgb, var(--bg-panel) 88%, black);
  }

  .segments-shell {
    display: grid;
    gap: 2rem;
    align-items: start;
  }

  .segments-intro {
    max-width: 34rem;
  }

  .segments-title {
    color: white;
    font-size: clamp(2.3rem, 4.5vw, 4rem);
    line-height: 0.98;
    letter-spacing: -0.05em;
    font-weight: 700;
    margin-bottom: 1.15rem;
    text-wrap: balance;
  }

  .segments-description {
    color: rgb(148 163 184 / 0.98);
    font-size: 1.05rem;
    line-height: 1.85;
  }

  .segments-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .segment-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding: 1.4rem;
    border-radius: 1.6rem;
    border: 1px solid color-mix(in srgb, white 10%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, white 3%, transparent),
      color-mix(in srgb, var(--bg-card) 98%, transparent)
    );
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
      0 18px 38px color-mix(in srgb, black 32%, transparent);
    transition:
      transform 220ms ease,
      border-color 220ms ease,
      box-shadow 220ms ease,
      background 220ms ease;
    overflow: hidden;
  }

  .segment-card::after {
    content: '';
    position: absolute;
    inset: auto -30% -45% auto;
    width: 8rem;
    height: 8rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    filter: blur(42px);
    opacity: 0;
    transition: opacity 220ms ease;
    pointer-events: none;
  }

  .segment-card:hover {
    transform: translateY(-4px);
    border-color: color-mix(in srgb, var(--primary) 24%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
      0 22px 46px color-mix(in srgb, black 36%, transparent);
  }

  .segment-card:hover::after {
    opacity: 0.9;
  }

  .segment-card-top {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .segment-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
    box-shadow: inset 0 1px 0 color-mix(in srgb, white 12%, transparent);
  }

  .segment-title {
    color: white;
    font-size: 1.28rem;
    line-height: 1.15;
    font-weight: 700;
    margin-bottom: 0.8rem;
    letter-spacing: -0.03em;
  }

  .segment-text {
    color: rgb(148 163 184 / 0.96);
    font-size: 0.97rem;
    line-height: 1.75;
    margin-bottom: 1.2rem;
    flex: 1;
  }

  .segment-link {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: color-mix(in srgb, white 86%, var(--primary));
    font-size: 0.92rem;
    font-weight: 600;
  }

  @media (min-width: 1024px) {
    .segments-shell {
      grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
      gap: 2.25rem;
    }

    .segments-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 640px) and (max-width: 1023px) {
    .segments-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 639px) {
    .segment-card {
      padding: 1.2rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-fade-in-up,
    .animate-fade-in-down,
    .animate-gradient,
    .animate-border-gradient::before {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }
</style>
