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
          "text": "O Zelo PDV custa R$ 59 por mês, com acesso completo a todas as funcionalidades. Os primeiros 30 dias são grátis, sem precisar de cartão de crédito. Add-ons opcionais (Mesas, Pedidos + Cozinha) custam R$ 30/mês cada e podem ser ativados ou desativados a qualquer momento."
        }
      }
    ]
  })}</script>`}
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import { trackViewContent } from '$lib/metaPixel';
  import {
    ArrowRight,
    Bike,
    Check,
    ChevronDown,
    ChevronRight,
    ChefHat,
    NotebookPen,
    Sandwich,
    ScanSearch,
    SendHorizontal,
    Smartphone,
    Table2,
    Wallet,
    X,
    Zap
  } from 'lucide-svelte';

  let visibleMessages = [];
  let isTyping = false;
  let chatContainer;
  let activeLightboxImage = null;
  let daysUntilEaster = 0;

  function openSupportChat() {
    window.dispatchEvent(new CustomEvent('zelo:open-support-chat'));
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }

  function addMessage(msg) {
    visibleMessages = [...visibleMessages, msg];
  }

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

    trackViewContent();

    // Mock conversation timeline
    const timeline = [
      // Round 1 — lucro semanal
      { d: 400, fn: () => { addMessage({ role: 'user', text: 'Quanto lucrei essa semana?' }); scrollBottom(); } },
      { d: 900, fn: () => { isTyping = true; scrollBottom(); } },
      { d: 2000, fn: () => { isTyping = false; scrollBottom(); } },
      { d: 2200, fn: () => { addMessage({ role: 'assistant', type: 'thinking', text: 'Analisando seu caixa de <strong class="text-white">seg a dom</strong>…' }); scrollBottom(); } },
      { d: 3400, fn: () => { addMessage({ role: 'assistant', type: 'numbers', data: { vendas: '3.847', despesas: '1.290', lucro: '2.557' }, prompt: 'Quer ver quais produtos puxaram esse resultado?' }); scrollBottom(); } },
      // Round 2 — top produtos
      { d: 4400, fn: () => { addMessage({ role: 'user', text: 'Quais produtos venderam mais?' }); scrollBottom(); } },
      { d: 4900, fn: () => { isTyping = true; scrollBottom(); } },
      { d: 6200, fn: () => { isTyping = false; scrollBottom(); } },
      { d: 6400, fn: () => { addMessage({ role: 'assistant', type: 'thinking', text: 'Puxando os <strong class="text-white">top produtos</strong> dos últimos 7 dias…' }); scrollBottom(); } },
      { d: 7400, fn: () => { addMessage({ role: 'assistant', type: 'products', items: [
        { name: 'Hambúrguer Artesanal', qty: 47, revenue: 'R$ 1.128' },
        { name: 'Batata Cheddar', qty: 38, revenue: 'R$ 570' },
        { name: 'Refrigerante 2L', qty: 32, revenue: 'R$ 320' },
      ] }); scrollBottom(); } },
      // Round 3 — fiado
      { d: 8600, fn: () => { addMessage({ role: 'user', text: 'Tem fiado em aberto?' }); scrollBottom(); } },
      { d: 9100, fn: () => { isTyping = true; scrollBottom(); } },
      { d: 10400, fn: () => { isTyping = false; scrollBottom(); } },
      { d: 10600, fn: () => { addMessage({ role: 'assistant', type: 'thinking', text: 'Verificando <strong class="text-white">contas a receber</strong>…' }); scrollBottom(); } },
      { d: 11600, fn: () => { addMessage({ role: 'assistant', type: 'fiado', data: { total: '1.870', clientes: 5, topNome: 'João Silva', topValor: 'R$ 520' } }); scrollBottom(); } },
      // Round 4 — whatsapp (funcionalidade real implementada via tool calling)
      { d: 12800, fn: () => { addMessage({ role: 'user', text: 'Manda o resumo no WhatsApp?' }); scrollBottom(); } },
      { d: 13300, fn: () => { isTyping = true; scrollBottom(); } },
      { d: 14800, fn: () => { isTyping = false; scrollBottom(); } },
      { d: 15000, fn: () => { addMessage({ role: 'assistant', type: 'thinking', text: 'Gerando resumo da semana…' }); scrollBottom(); } },
      { d: 16000, fn: () => { addMessage({ role: 'assistant', type: 'whatsapp' }); scrollBottom(); } },
    ];

    const timers = timeline.map(({ d, fn }) => setTimeout(fn, d));

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-sky-200"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <SiteHeader easterDays={daysUntilEaster} />

  <!-- HERO SECTION -->
  <section class="relative pt-24 md:pt-32 pb-12 md:pb-24 overflow-hidden border-b border-white/5">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.2fr_0.8fr] gap-8 lg:gap-16 items-center relative z-10">
      <div>
        <h1 class="text-3xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-4 md:mb-6 hero-title">
          O PDV simples que mostra quanto sua lanchonete lucra de verdade.
        </h1>

        <p class="text-base md:text-xl max-w-2xl mb-5 md:mb-8 leading-relaxed" style="color: var(--text-muted);">
          Registre vendas em segundos, controle fiado e despesas e feche o caixa sem dor de cabeça. E quando bater a dúvida, pergunte ao Zelinho — ele responde com os números do seu próprio caixa.
        </p>

        <div class="flex flex-col sm:flex-row items-start gap-3 md:gap-4 mb-3 md:mb-4">
          <a href="/cadastro" class="w-full sm:w-auto px-8 py-3.5 md:py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1 text-center">
            Testar 30 dias grátis
          </a>
          <a href="#por-dentro" class="px-1 py-2 md:py-4 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4 transition-colors">
            Ver por dentro
          </a>
        </div>

        <p class="text-xs md:text-sm" style="color: var(--text-muted);">
          30 dias grátis. Sem cartão, sem cobrança automática.
          <button type="button" on:click={openSupportChat} class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
            Tem dúvida? Fala com a gente.
          </button>
        </p>
      </div>

      <div class="relative">
        <div class="absolute right-0 top-1/3 w-[480px] h-[480px] bg-sky-500/15 rounded-full blur-[80px] -z-10 pointer-events-none"></div>
        <div class="rounded-2xl border border-white/10 overflow-hidden chat-card" style="background: var(--bg-card);">
          <div class="border-b border-white/5 px-5 py-4 flex items-center gap-3" style="background: var(--bg-app);">
            <div class="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold shadow-lg">Z</div>
            <div>
              <p class="text-white text-sm font-semibold leading-none">Zelinho</p>
              <p class="text-sky-400 text-xs mt-0.5">Lê seu caixa em tempo real</p>
            </div>
            <div class="ml-auto flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span class="text-emerald-400 text-xs">ativo</span>
            </div>
          </div>

          <div class="p-4 md:p-5 space-y-3 md:space-y-4 max-h-[360px] md:max-h-[440px] overflow-y-auto chat-scroll" bind:this={chatContainer}>
            {#each visibleMessages as msg}
              {#if msg.role === 'user'}
                <div class="flex justify-end chat-message">
                  <div class="bg-sky-600/30 border border-sky-500/20 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[82%]">
                    <p class="text-slate-200 text-sm">{msg.text}</p>
                  </div>
                </div>
              {:else if msg.type === 'thinking'}
                <div class="flex items-start gap-2.5 chat-message">
                  <div class="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">Z</div>
                  <div class="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[86%]">
                    <p class="text-slate-300 text-sm leading-relaxed">{@html msg.text}</p>
                  </div>
                </div>
              {:else if msg.type === 'numbers'}
                <div class="flex items-start gap-2.5 chat-message">
                  <div class="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">Z</div>
                  <div class="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[86%]">
                    <div class="space-y-1.5">
                      <div class="flex justify-between gap-8 text-xs tabular-nums">
                        <span class="text-slate-400">Vendas</span>
                        <span class="text-white font-medium">R$ {msg.data.vendas}</span>
                      </div>
                      <div class="flex justify-between gap-8 text-xs tabular-nums">
                        <span class="text-slate-400">Despesas</span>
                        <span class="text-red-400 font-medium">R$ {msg.data.despesas}</span>
                      </div>
                      <div class="h-px bg-white/10 my-2"></div>
                      <div class="flex justify-between gap-8 text-sm tabular-nums">
                        <span class="text-emerald-400 font-semibold">Lucro real</span>
                        <span class="text-emerald-400 font-bold">R$ {msg.data.lucro}</span>
                      </div>
                    </div>
                    {#if msg.prompt}
                      <p class="text-slate-400 text-xs mt-3">{msg.prompt}</p>
                    {/if}
                  </div>
                </div>
              {:else if msg.type === 'products'}
                <div class="flex items-start gap-2.5 chat-message">
                  <div class="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">Z</div>
                  <div class="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[86%]">
                    <p class="text-white text-xs font-semibold mb-2">Top produtos da semana</p>
                    <div class="space-y-1.5">
                      {#each msg.items as item}
                        <div class="flex justify-between gap-6 text-xs tabular-nums">
                          <span class="text-slate-400">{item.name}</span>
                          <div class="flex gap-4">
                            <span class="text-slate-500">{item.qty} un</span>
                            <span class="text-white font-medium">{item.revenue}</span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              {:else if msg.type === 'fiado'}
                <div class="flex items-start gap-2.5 chat-message">
                  <div class="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">Z</div>
                  <div class="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[86%]">
                    <div class="space-y-1.5">
                      <div class="flex justify-between gap-8 text-xs tabular-nums">
                        <span class="text-slate-400">Total em aberto</span>
                        <span class="text-amber-400 font-medium">R$ {msg.data.total}</span>
                      </div>
                      <div class="flex justify-between gap-8 text-xs tabular-nums">
                        <span class="text-slate-400">Clientes com débito</span>
                        <span class="text-white font-medium">{msg.data.clientes}</span>
                      </div>
                      <div class="h-px bg-white/10 my-2"></div>
                      <div class="flex justify-between gap-8 text-xs tabular-nums">
                        <span class="text-slate-400">Maior devedor</span>
                        <span class="text-white font-medium">{msg.data.topNome}</span>
                      </div>
                      <div class="flex justify-between gap-8 text-xs tabular-nums">
                        <span class="text-slate-400">Valor</span>
                        <span class="text-amber-400 font-medium">{msg.data.topValor}</span>
                      </div>
                    </div>
                    <p class="text-slate-400 text-xs mt-3">Quer enviar lembretes no WhatsApp?</p>
                  </div>
                </div>
              {:else if msg.type === 'whatsapp'}
                <div class="flex items-start gap-2.5 chat-message">
                  <div class="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">Z</div>
                  <div class="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[86%]">
                    <p class="text-emerald-400 text-sm font-semibold mb-1">✅ Resumo enviado no WhatsApp!</p>
                    <p class="text-slate-400 text-xs">Faturamento, lucro e fiado da semana foram enviados pro seu telefone.</p>
                    <p class="text-slate-500 text-xs mt-2">Chame o Zelinho no app pra conversar sobre seus números quando quiser.</p>
                  </div>
                </div>
              {/if}
            {/each}

            {#if isTyping}
              <div class="flex items-start gap-2.5 chat-message">
                <div class="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">Z</div>
                <div class="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3.5">
                  <div class="flex gap-1">
                    <span class="w-2 h-2 bg-slate-400 rounded-full typing-dot"></span>
                    <span class="w-2 h-2 bg-slate-400 rounded-full typing-dot" style="animation-delay: 0.16s"></span>
                    <span class="w-2 h-2 bg-slate-400 rounded-full typing-dot" style="animation-delay: 0.32s"></span>
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <div class="border-t border-white/5 px-4 py-3 flex items-center gap-3" style="background: var(--bg-app);">
            <div class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-slate-500 text-sm">Pergunte algo...</div>
            <button class="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center shrink-0" aria-label="Enviar">
              <SendHorizontal class="size-4 text-white" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="por-dentro" class="py-20 border-b border-white/5">
    <div class="max-w-7xl mx-auto px-6">
      <div class="relative mx-auto max-w-5xl rounded-xl border border-card overflow-hidden transform transition-all duration-300 hover:scale-[1.005]">
        <div class="h-10 border-b border-white/5 flex items-center px-4 gap-2" style="background: var(--bg-panel);">
          <div class="flex gap-1.5">
            <div class="w-3 h-3 rounded-full bg-red-500/50"></div>
            <div class="w-3 h-3 rounded-full bg-amber-500/50"></div>
            <div class="w-3 h-3 rounded-full bg-emerald-500/50"></div>
          </div>
          <div class="ml-4 flex-1 max-w-md h-6 rounded-md bg-white/5 border border-white/5 flex items-center px-3 text-xs text-slate-600 font-mono">
            zelopdv.com.br/app
          </div>
        </div>

        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="aspect-video md:aspect-auto relative group cursor-zoom-in" style="background: var(--bg-card);" on:click={() => activeLightboxImage = '/images/screenshots/dashboard-desktop.png'} role="button" tabindex="0">
          <img src="/images/screenshots/dashboard-desktop.png" alt="Tela de Vendas do Zelo PDV para Lanchonetes" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
             <div class="w-16 h-16 bg-sky-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                <ScanSearch class="size-8 text-white" aria-hidden="true" />
             </div>
          </div>
        </div>

        <div class="absolute inset-0 pointer-events-none" style="background: linear-gradient(to top, color-mix(in srgb, var(--bg-app) 50%, transparent), transparent 45%);"></div>
      </div>
    </div>
  </section>

  <!-- BRANDS/TRUST STRIP -->
  <section class="py-10 border-y border-white/5 bg-white/2">
    <div class="max-w-7xl mx-auto px-6 text-center">
      <p class="text-sm font-medium text-slate-500 mb-6">Criado especialmente para pequenos negócios brasileiros</p>
      <div class="flex flex-wrap justify-center gap-8 md:gap-16 opacity-70 hover:opacity-100 transition-all duration-500">
        <span class="text-lg font-bold text-white flex items-center gap-2"><Sandwich class="size-5 text-sky-300" aria-hidden="true" />Lanchonetes</span>
        <span class="text-lg font-bold text-white flex items-center gap-2"><Sandwich class="size-5 text-sky-300" aria-hidden="true" />Hamburguerias</span>
        <span class="text-lg font-bold text-white flex items-center gap-2"><Smartphone class="size-5 text-sky-300" aria-hidden="true" />MEIs e Microempreendedores</span>
        <span class="text-lg font-bold text-white flex items-center gap-2"><Bike class="size-5 text-sky-300" aria-hidden="true" />Pequenos Deliveries</span>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="py-24 relative overflow-hidden" style="background: var(--bg-panel);">
    <div class="max-w-7xl mx-auto px-6 text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-white mb-16">Como o Zelo PDV simplifica seu dia</h2>

      <div class="grid md:grid-cols-3 gap-12">
        <div class="relative">
          <div class="hidden md:block absolute top-8 left-1/2 w-full h-px bg-linear-to-r from-transparent via-sky-500/30 to-transparent"></div>
          <div class="w-16 h-16 mx-auto bg-sky-500/10 rounded-2xl border border-sky-500/20 flex items-center justify-center mb-6">
            <span class="text-2xl font-bold text-sky-400">1</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Cadastre seus produtos</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Adicione seu cardápio em minutos. Defina preços, categorias e controle o estoque do que for necessário.</p>
        </div>

        <div class="relative">
          <div class="hidden md:block absolute top-8 left-1/2 w-full h-px bg-linear-to-r from-transparent via-sky-500/30 to-transparent"></div>
          <div class="w-16 h-16 mx-auto bg-sky-500/10 rounded-2xl border border-sky-500/20 flex items-center justify-center mb-6">
             <span class="text-2xl font-bold text-sky-400">2</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Registre pedidos rápido</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Tela de vendas limpa. Com poucos toques você registra o pedido, envia o comprovante no WhatsApp e atende o próximo da fila.</p>
        </div>

        <div class="relative">
          <div class="hidden md:block absolute top-8 left-1/2 w-full h-px bg-linear-to-r from-transparent via-sky-500/30 to-transparent"></div>
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
          <Zap class="size-6 text-sky-400" aria-hidden="true" />
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Frente de Caixa PDV para Lanchonetes: <br/><span class="text-sky-500">Registre Pedidos em Segundos</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Um PDV desenhado para agilizar seu balcão. Toque, adicione e finalize. Ideal para horários de pico.
        </p>
        <ul class="space-y-4">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Registro de pedidos em segundos
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Envio de comprovante via WhatsApp
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Controle de estoque automático
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Vendas iFood/Rappi e outras plataformas de delivery com taxa configurável
          </li>
        </ul>
      </div>
      <div class="relative group">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden transition-all duration-300 hover:scale-[1.01] cursor-zoom-in" style="background: var(--bg-card);" on:click={() => activeLightboxImage = '/images/screenshots/dashboard-desktop.png'} role="button" tabindex="0">
           <img src="/images/screenshots/dashboard-desktop.png" alt="Tela de Vendas Lanchonete" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-sky-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <ScanSearch class="size-8 text-white" aria-hidden="true" />
               </div>
           </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 2: FINANCEIRO (IMG Esquerda, Texto Direita) -->
  <section class="py-24 relative bg-white/2">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div class="order-2 lg:order-1 relative group">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden transition-all duration-300 hover:scale-[1.01] cursor-zoom-in" style="background: var(--bg-card);" on:click={() => activeLightboxImage = '/images/screenshots/financial-screen.png'} role="button" tabindex="0">
           <img src="/images/screenshots/financial-screen.png" alt="Tela de Controle de Caixa Lanchonete" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-emerald-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <ScanSearch class="size-8 text-white" aria-hidden="true" />
               </div>
           </div>
        </div>
      </div>
      <div class="order-1 lg:order-2">
        <div class="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center mb-6">
          <Wallet class="size-6 text-sky-400" aria-hidden="true" />
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Gestão Financeira para Lanchonete: <br/><span class="text-sky-500">Veja Seu Lucro Real</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Saber quanto vendeu é fácil. Difícil é saber quanto sobrou.
          O Zelo PDV cruza vendas com despesas e te mostra seu <strong>Lucro Real</strong> no fim do mês.
        </p>
        <div class="grid grid-cols-2 gap-4">
           <div class="p-4 rounded-xl border border-white/5 bg-white/2">
              <h4 class="text-white font-semibold mb-1">Controle de Despesas</h4>
              <p class="text-sm text-slate-500">Lance aluguel, luz e retiradas.</p>
           </div>
           <div class="p-4 rounded-xl border border-white/5 bg-white/2">
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
        <div class="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center mb-6">
          <NotebookPen class="size-6 text-sky-400" aria-hidden="true" />
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Controle de Despesas para Pequenos Negócios</h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Registre todos os gastos do seu negócio, desde fornecedores até retiradas diárias. O sistema organiza tudo para te dar clareza no fim do mês.
        </p>
         <ul class="space-y-4">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Categorização inteligente de gastos
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Previsibilidade do seu fluxo de caixa
          </li>
        </ul>
      </div>
      <div class="relative group">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden transition-all duration-300 hover:scale-[1.01] cursor-zoom-in" style="background: var(--bg-card);" on:click={() => activeLightboxImage = '/images/screenshots/despesas-page.png'} role="button" tabindex="0">
           <img src="/images/screenshots/despesas-page.png" alt="Tela de Controle de Despesas Lanchonete" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-purple-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <ScanSearch class="size-8 text-white" aria-hidden="true" />
               </div>
           </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 4: FIADO (IMG Esquerda, Texto Direita) -->
  <section class="py-24 relative bg-white/2">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div class="order-2 lg:order-1 relative group">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden transition-all duration-300 hover:scale-[1.01] cursor-zoom-in" style="background: var(--bg-card);" on:click={() => activeLightboxImage = '/images/screenshots/customers-screen.png'} role="button" tabindex="0">
           <img src="/images/screenshots/customers-screen.png" alt="Tela de Controle de Fiado Clientes" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
           <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div class="w-16 h-16 bg-amber-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                  <ScanSearch class="size-8 text-white" aria-hidden="true" />
               </div>
           </div>
        </div>
      </div>
      <div class="order-1 lg:order-2">
        <div class="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center mb-6">
          <NotebookPen class="size-6 text-sky-400" aria-hidden="true" />
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Controle de Fiado Digital: <br/><span class="text-sky-500">Acabe com o Caderninho</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Transforme o "caderninho" em uma ferramenta profissional. Defina limites de crédito, veja histórico e cobre com educação e prova.
        </p>
         <ul class="space-y-4">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Extrato detalhado por cliente
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400"><Check class="size-4" aria-hidden="true" /></div>
            Limite de crédito personalizável
          </li>
        </ul>
      </div>
    </div>
  </section>

  <!-- FEATURE 5: EXTENSÕES (HUB) -->
  <section id="extensoes" class="py-24 relative overflow-hidden">
    <div class="max-w-6xl mx-auto px-6 relative z-10">
      <div class="text-center max-w-3xl mx-auto mb-12">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-semibold mb-6">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
          Add-ons opcionais
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-5">
          Combine só o que faz sentido pro seu negócio
        </h2>
        <p class="text-lg text-slate-400 leading-relaxed">
          Plano base R$ 59. Extensões opcionais para quem precisa de mais — bar com mesas, lanchonete com cozinha separada, e o que vier no futuro. Cada uma é cobrada à parte, ativa e desativa quando quiser.
        </p>
      </div>

      <div class="grid md:grid-cols-2 gap-5 mb-10">
        <!-- Mesas -->
        <a href="/extensoes#mesas" class="group rounded-2xl border border-white/10 p-7 transition-all hover:border-sky-500/40 hover:-translate-y-1" style="background: var(--bg-card);">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div class="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <Table2 class="size-6 text-sky-300" aria-hidden="true" />
            </div>
            <span class="text-xs font-bold text-sky-300">+R$ 30/mês</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-2 group-hover:text-sky-200 transition-colors">Módulo Mesas</h3>
          <p class="text-sm text-slate-400 leading-relaxed mb-4">
            Mapa visual de mesas, comanda acumulativa, taxa de serviço, couvert e divisão entre N pessoas. Ideal para bares e hamburguerias com salão.
          </p>
          <span class="inline-flex items-center gap-2 text-sm font-semibold text-sky-300 group-hover:gap-3 transition-all">
            Ver detalhes
            <ArrowRight class="size-4" aria-hidden="true" />
          </span>
        </a>

        <!-- Pedidos + Cozinha -->
        <a href="/extensoes#pedidos-cozinha" class="group rounded-2xl border border-white/10 p-7 transition-all hover:border-sky-500/40 hover:-translate-y-1" style="background: var(--bg-card);">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div class="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <ChefHat class="size-6 text-sky-300" aria-hidden="true" />
            </div>
            <span class="text-xs font-bold text-sky-300">+R$ 30/mês</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-2 group-hover:text-sky-200 transition-colors">Pedidos + Cozinha</h3>
          <p class="text-sm text-slate-400 leading-relaxed mb-4">
            Atendente lança pedidos pelo celular, cozinha acompanha em painel kiosk em tempo real, caixa recebe e cobra. Pra lanchonete com atendente, cozinha e caixa separados.
          </p>
          <span class="inline-flex items-center gap-2 text-sm font-semibold text-sky-300 group-hover:gap-3 transition-all">
            Ver detalhes
            <ArrowRight class="size-4" aria-hidden="true" />
          </span>
        </a>
      </div>

      <div class="text-center">
        <a href="/extensoes" class="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all">
          Ver todas as extensões
          <ArrowRight class="size-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  </section>

  <!-- TRUST / COMPROMISSOS -->
  <section class="py-24 relative bg-white/2 border-t border-white/5">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Sem pegadinha, sem letra miúda</h2>
        <p class="text-slate-400 text-lg">O que você pode cobrar da gente desde o primeiro dia</p>
      </div>

      <div class="grid md:grid-cols-3 gap-6">

        <div class="bg-white/3 border border-white/5 rounded-2xl p-6 flex flex-col gap-3">
          <div class="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
            <Check class="size-5 text-sky-400" aria-hidden="true" />
          </div>
          <p class="text-white font-semibold text-sm leading-tight">30 dias grátis de verdade</p>
          <p class="text-slate-300 text-sm leading-relaxed">Não pedimos cartão e não existe cobrança automática. Testou e não gostou? Não acontece nada — sua conta simplesmente não vira assinatura.</p>
        </div>

        <div class="bg-white/3 border border-white/5 rounded-2xl p-6 flex flex-col gap-3">
          <div class="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
            <SendHorizontal class="size-5 text-sky-400" aria-hidden="true" />
          </div>
          <p class="text-white font-semibold text-sm leading-tight">Suporte de gente de verdade</p>
          <p class="text-slate-300 text-sm leading-relaxed">WhatsApp em horário comercial, direto com quem constrói o produto. Sem robô de triagem, sem fila de protocolo.</p>
        </div>

        <div class="bg-white/3 border border-white/5 rounded-2xl p-6 flex flex-col gap-3">
          <div class="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
            <Zap class="size-5 text-sky-400" aria-hidden="true" />
          </div>
          <p class="text-white font-semibold text-sm leading-tight">Internet caiu? Continua vendendo</p>
          <p class="text-slate-300 text-sm leading-relaxed">O Zelo funciona offline e sincroniza sozinho quando a conexão voltar. Seu caixa não para porque a operadora falhou.</p>
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
              <span class="segment-icon"><Sandwich class="size-7 text-sky-300" aria-hidden="true" /></span>
            </div>
            <h3 class="segment-title">Lanchonetes</h3>
            <p class="segment-text">
              Para quem precisa registrar pedidos rápido no balcão, controlar o caixa e saber o lucro no fim do dia.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <ChevronRight class="size-4" aria-hidden="true" />
            </span>
          </a>

          <a href="/para-hamburguerias" class="segment-card">
            <div class="segment-card-top">
              <span class="segment-icon"><Sandwich class="size-7 text-sky-300" aria-hidden="true" /></span>
            </div>
            <h3 class="segment-title">Hamburguerias</h3>
            <p class="segment-text">
              Ideal para controlar combos, estoque e pico de movimento sem complicação na operação.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <ChevronRight class="size-4" aria-hidden="true" />
            </span>
          </a>

          <a href="/para-delivery" class="segment-card">
            <div class="segment-card-top">
              <span class="segment-icon"><Bike class="size-7 text-sky-300" aria-hidden="true" /></span>
            </div>
            <h3 class="segment-title">Delivery Próprio</h3>
            <p class="segment-text">
              Para quem faz entrega por conta própria, sem marketplace e sem perder margem com taxa.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <ChevronRight class="size-4" aria-hidden="true" />
            </span>
          </a>

          <a href="/para-mei" class="segment-card">
            <div class="segment-card-top">
              <span class="segment-icon"><Smartphone class="size-7 text-sky-300" aria-hidden="true" /></span>
            </div>
            <h3 class="segment-title">MEIs e Pequenos Negócios</h3>
            <p class="segment-text">
              Controle simples para substituir planilha e caderno por um sistema leve que também funciona no celular.
            </p>
            <span class="segment-link">
              Ver página do segmento
              <ChevronRight class="size-4" aria-hidden="true" />
            </span>
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- PRICING (Plano Principal + Add-ons em grid lateral) -->
  <section id="pricing" class="py-24 relative bg-white/2">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center mb-12">
        <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">Um preço. Tudo dentro.</h2>
        <p class="text-slate-400 text-lg">Sem letra miúda. Sem surpresa no fim do mês.</p>
      </div>

      <div class="grid lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-8 items-start max-w-5xl mx-auto">
        <!-- ========== PLANO PRINCIPAL ========== -->
        <div class="relative">
          <div
            class="relative rounded-2xl p-8 md:p-12 border-2 transition-shadow hover:shadow-[0_12px_24px_-8px_rgba(2,132,199,0.40)] text-center"
            style="background: var(--bg-card); border-color: var(--primary);"
          >
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
              <p class="text-sm text-sky-300/80">30 dias pra testar. Se não rolar, é só cancelar.</p>
            </div>

            <ul class="space-y-4 text-left mb-10 max-w-xs mx-auto">
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300"><Check class="size-3.5" aria-hidden="true" /></div>
                <span>Vendas Ilimitadas</span>
              </li>
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300"><Check class="size-3.5" aria-hidden="true" /></div>
                <span>Controle de Estoque e Fiado</span>
              </li>
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300"><Check class="size-3.5" aria-hidden="true" /></div>
                <span>Controle de lucro e despesa</span>
              </li>
              <li class="flex items-center gap-3 text-slate-200">
                <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300"><Check class="size-3.5" aria-hidden="true" /></div>
                <span>Suporte via WhatsApp</span>
              </li>
            </ul>

            <a href="/cadastro" class="block w-full text-center py-4 text-lg font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-lg shadow-sky-900/50 transition-all hover:scale-[1.02] active:scale-[0.98]">
              Começar teste gratuito
            </a>
            <p class="text-xs text-slate-500 text-center mt-3">
              Sem cartão. Cancele a qualquer hora.
              <button type="button" on:click={openSupportChat} class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
                Fala com a gente
              </button>
            </p>
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
          <a href="/extensoes#mesas" class="group relative rounded-2xl bg-white/4 hover:bg-white/6 border border-white/10 hover:border-rose-500/30 p-6 md:p-7 transition-all duration-300 block">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <Table2 class="size-5 text-rose-300" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-base font-bold text-white">Módulo Mesas</p>
                  <p class="text-xs text-slate-400">Bares, hamburguerias, salão</p>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="flex items-baseline gap-0.5 justify-end">
                  <span class="text-xs text-slate-400">+R$</span>
                  <span class="text-2xl font-bold text-white">30</span>
                </div>
                <p class="text-[10px] text-slate-500 -mt-0.5">/mês</p>
              </div>
            </div>

            <ul class="space-y-2 mb-5">
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0"><Check class="size-3" aria-hidden="true" /></div>
                <span>Mapa visual com status de mesas</span>
              </li>
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0"><Check class="size-3" aria-hidden="true" /></div>
                <span>Comandas e divisão de conta</span>
              </li>
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0"><Check class="size-3" aria-hidden="true" /></div>
                <span>Taxa de serviço, couvert, pré-conta</span>
              </li>
            </ul>

            <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-300 group-hover:gap-2 transition-all">
              Ver detalhes
              <ChevronRight class="size-3.5" aria-hidden="true" />
            </span>
          </a>

          <!-- Add-on Card: Pedidos + Cozinha -->
          <a href="/extensoes#pedidos-cozinha" class="group relative rounded-2xl bg-white/4 hover:bg-white/6 border border-white/10 hover:border-amber-500/30 p-6 md:p-7 transition-all duration-300 block">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <ChefHat class="size-5 text-amber-300" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-base font-bold text-white">Pedidos + Cozinha</p>
                  <p class="text-xs text-slate-400">Lanchonete com cozinha separada</p>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="flex items-baseline gap-0.5 justify-end">
                  <span class="text-xs text-slate-400">+R$</span>
                  <span class="text-2xl font-bold text-white">30</span>
                </div>
                <p class="text-[10px] text-slate-500 -mt-0.5">/mês</p>
              </div>
            </div>

            <ul class="space-y-2 mb-5">
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0"><Check class="size-3" aria-hidden="true" /></div>
                <span>Atendente lança pedido pelo celular</span>
              </li>
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0"><Check class="size-3" aria-hidden="true" /></div>
                <span>Painel de cozinha em tempo real</span>
              </li>
              <li class="flex items-center gap-2.5 text-sm text-slate-300">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0"><Check class="size-3" aria-hidden="true" /></div>
                <span>Caixa cobra pedidos prontos</span>
              </li>
            </ul>

            <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 group-hover:gap-2 transition-all">
              Ver detalhes
              <ChevronRight class="size-3.5" aria-hidden="true" />
            </span>
          </a>

          <a href="/extensoes" class="rounded-2xl border border-dashed border-white/10 hover:border-white/20 p-5 flex flex-col items-center justify-center text-center transition-colors">
            <p class="text-xs text-slate-400 mb-1">Mais add-ons em breve</p>
            <span class="text-xs font-semibold text-slate-300">Ver todas as extensões →</span>
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="py-24 border-t border-white/5" style="background: var(--bg-app);">
    <div class="max-w-3xl mx-auto px-6">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-bold text-white mb-4">Perguntas Frequentes</h2>
        <p class="text-slate-400">Tire suas dúvidas antes de começar</p>
      </div>

      <div class="space-y-4">
        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-all duration-300">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Preciso de computador potente?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Não! O Zelo PDV roda direto no navegador (Chrome, Edge). Funciona em qualquer computador ou notebook básico, e até em tablets.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Como funciona os 30 dias grátis?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Você cria a conta e começa seu período de teste de 30 dias, sem precisar cadastrar cartão. Se assinar e quiser cancelar, pode fazer isso a qualquer momento.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Consigo emitir Nota Fiscal?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            O Zelo PDV emite recibos e comprovantes de venda. Não emitimos NFC-e (Nota Fiscal ao Consumidor Eletrônica), sendo ideal para MEIs e pequenos negócios que fazem controle gerencial interno. Se precisar emissão fiscal em cada venda, recomendamos combinar o Zelo com um emissor fiscal dedicado.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Se eu tiver dúvidas, tem suporte?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim! Temos suporte direto via WhatsApp em horário comercial. A gente ajuda a configurar e tirar dúvidas na hora.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Funciona sem internet?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim. O Zelo PDV é um PWA (aplicativo web progressivo): você instala ele direto do navegador, sem loja de apps, e ele continua funcionando mesmo se a internet cair. As vendas ficam salvas no dispositivo e sobem para a nuvem automaticamente quando a conexão voltar.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Funciona no celular?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim. Funciona em Android e iPhone. Abra o site no Chrome ou Safari, clique em "Adicionar à tela inicial" e o ícone aparece como qualquer outro app — sem precisar da Play Store nem da App Store. A interface é adaptada para telas menores.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>O que são as extensões (add-ons)?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            São módulos opcionais cobrados como adicional mensal sobre o plano base de R$ 59. Hoje existem dois: <strong class="text-rose-300">Módulo Mesas</strong> (+R$ 30/mês, para bares e restaurantes com salão) e <strong class="text-amber-300">Pedidos + Cozinha</strong> (+R$ 30/mês, para lanchonetes com atendente, cozinha e caixa separados). Você ativa só os que fazem sentido pra sua operação e pode desligar a qualquer momento. <a href="/extensoes" class="underline text-sky-300 hover:text-sky-200">Ver todas as extensões →</a>
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/2 open:bg-white/4 transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Consigo usar em mais de um dispositivo?</span>
            <ChevronDown class="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Sim. Você pode abrir o Zelo PDV em vários dispositivos ao mesmo tempo — celular, tablet e computador — e todos ficam sincronizados em tempo real. Uma única assinatura cobre todos os dispositivos do seu negócio.
          </div>
        </details>
      </div>
    </div>
  </section>

  <MarketingFooter />

  <!-- LIGHTBOX MODAL -->
  {#if activeLightboxImage}
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualização da imagem"
      tabindex="-1"
      class="fixed inset-0 z-100 flex items-center justify-center backdrop-blur-xs p-4 cursor-zoom-out animate-fade-in-up"
      style="background: color-mix(in srgb, var(--bg-app) 90%, transparent); animation-duration: 0.2s; opacity: 1;"
      on:click={() => activeLightboxImage = null}
      on:keydown={(e) => e.key === 'Escape' && (activeLightboxImage = null)}
    >
      <div role="presentation" class="relative max-w-7xl w-full max-h-[90vh] flex items-center justify-center" on:click={(e) => e.stopPropagation()}>
          <button class="absolute -top-12 right-0 md:-right-12 z-50 p-2 text-slate-400 hover:text-white transition-colors cursor-pointer" on:click={() => activeLightboxImage = null}>
              <X class="size-8" aria-hidden="true" />
          </button>
          <!-- svelte-ignore a11y_img_redundant_alt -->
          <img src={activeLightboxImage} alt="Imagem Ampliada do Produto Zelo PDV" class="max-w-full max-h-[85vh] object-contain rounded-xl shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10" />
      </div>
    </div>
  {/if}

</div>

<style>
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

  .hero-title {
    text-wrap: balance;
  }

  .chat-card {
    box-shadow: 0 18px 40px color-mix(in srgb, black 32%, transparent);
  }

  .chat-message {
    animation: fade-in-up 420ms cubic-bezier(0.23, 1, 0.32, 1) both;
  }

  .typing-dot {
    animation: typing-bounce 1.2s ease-in-out infinite;
  }

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
    30% { transform: translateY(-5px); opacity: 1; }
  }

  .chat-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .chat-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .chat-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .chat-scroll::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.08);
    border-radius: 99px;
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
    font-size: 2.3rem;
    line-height: 0.98;
    letter-spacing: 0;
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
    letter-spacing: 0;
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
    .segments-title {
      font-size: 4rem;
    }

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
    .chat-message {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
    .typing-dot {
      animation: none !important;
      opacity: 0.5 !important;
    }
  }
</style>
