<svelte:head>
  <title>Zelo PDV - Sistema PDV simples para Lanchonetes</title>
  <meta name="description" content="Sistema PDV para lanchonete simples e direto ao ponto. Controle caixa, pedidos, estoque e fiado em segundos. Teste grátis o sistema ideal para lanchonetes e pequenos comércios." />
  <meta name="keywords" content="sistema PDV, PDV para lanchonete, sistema para lanchonete, controle de caixa, sistema de vendas simples, lanchonete, hamburgueria, mercadinho, PDV grátis" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/" />
  <meta property="og:title" content="Zelo PDV - Sistema PDV simples para Lanchonetes" />
  <meta property="og:description" content="Controle pedidos, estoque e caixa em segundos. Ideal para lanchonetes e pequenos comércios." />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/" />
  <meta name="twitter:title" content="Zelo PDV - Sistema PDV simples para Lanchonetes" />
  <meta name="twitter:description" content="O sistema de caixa que coloca ordem no seu negócio. Controle de vendas, gestão de fiado e relatórios financeiros em um só lugar." />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Zelo PDV",
    "url": "https://zelopdv.com.br",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "59.00",
      "priceCurrency": "BRL",
      "priceValidUntil": "2027-12-31"
    },
    "description": "Sistema de gestão e frente de caixa para pequenos negócios.",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "38"
    }
  }
  </script>
</svelte:head>

<script>
  import { onMount } from 'svelte';

  let activeLightboxImage = null;
  let showMobileMenu = false;

  onMount(() => {
    function handleKeydown(e) {
      if (e.key === 'Escape') activeLightboxImage = null;
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="min-h-screen bg-[#0B0F19] text-slate-300 font-sans selection:bg-sky-500/30 selection:text-sky-200 overflow-x-hidden">

  <!-- NAV (Simples e Flutuante) -->
  <nav class="fixed top-0 w-full z-50 transition-all duration-300 border-b border-white/5 bg-[#0B0F19]/80 backdrop-blur-md">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <span class="text-xl font-bold text-white tracking-tight">Zelo<span class="text-sky-500">PDV</span></span>
      </div>

      <div class="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <a href="#features" class="hover:text-white transition-colors">Funcionalidades</a>
        <a href="#pricing" class="hover:text-white transition-colors">Preços</a>
        <a href="#faq" class="hover:text-white transition-colors">Dúvidas</a>
      </div>

      <div class="flex items-center gap-4">
        <a href="/login" class="text-sm font-medium text-white hover:text-sky-400 transition-colors hidden sm:block">Entrar</a>
        <a href="/cadastro" class="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all hover:scale-105 active:scale-95">
          Testar 7 dias grátis
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
        <a href="#pricing" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Preços</a>
        <a href="#faq" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Dúvidas</a>
        <a href="/cadastro" class="mt-1 w-full text-center px-5 py-3 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all" on:click={() => showMobileMenu = false}>
          Testar grátis
        </a>
      </div>
    {/if}
  </nav>

  <!-- HERO SECTION -->
  <section class="relative pt-32 pb-40 overflow-hidden">
    <!-- Background Glows -->
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-sky-600/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none"></div>
    <div class="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-900/10 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

    <div class="max-w-7xl mx-auto px-6 text-center relative z-10">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-xs font-medium mb-8 animate-fade-in-up">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
        </span>
        Novo: Gestão Financeira Completa
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
          Testar 7 dias grátis
        </a>
        <a href="#features" class="w-full sm:w-auto px-8 py-4 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-semibold backdrop-blur-sm transition-all">
          Ver como funciona
        </a>
      </div>
      <p class="text-xs text-slate-500 mt-3">Cadastre seu cartão para ativar. Cancele antes dos 7 dias e não paga nada.</p>

      <!-- MOCKUP DASHBOARD 3D -->
      <div class="mt-20 relative group">
        <!-- Mockup Container with Glow -->
        <div class="relative mx-auto max-w-5xl rounded-xl border border-white/10 shadow-2xl shadow-sky-900/40 overflow-hidden transform transition-all duration-700 hover:scale-[1.01]">
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
        <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[90%] h-20 bg-sky-500/20 blur-[60px] -z-10"></div>
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
        <span class="text-lg font-bold text-white flex items-center gap-2">🥪 Quiosques</span>
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
          Testar 7 dias grátis
        </a>
        <p class="text-xs text-slate-500 mt-3">Cadastre seu cartão para ativar. Cancele antes dos 7 dias e não paga nada.</p>
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
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Frente de Caixa Ágil. <br/><span class="text-sky-500">Sem Filas.</span></h2>
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
        </ul>
      </div>
      <div class="relative group">
        <div class="absolute inset-0 bg-sky-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-sky-500/30 transition-all duration-700"></div>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(14,165,233,0.3)] cursor-zoom-in" on:click={() => activeLightboxImage = '/images/screenshots/sales-screen.png'} role="button" tabindex="0">
           <img src="/images/screenshots/sales-screen.png" alt="Tela de Vendas Lanchonete" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
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
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Lucro Líquido Real. <br/><span class="text-emerald-500">Sem Achismos.</span></h2>
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

  <!-- FEATURE 3: FIADO (Texto Esquerda, IMG Direita) -->
  <section class="py-24 relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div>
        <div class="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Carteira de Clientes. <br/><span class="text-amber-500">Fiado Organizado.</span></h2>
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
      <div class="relative group">
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
              <p class="text-slate-500 text-xs">Quiosque Sabor da Praia · Natal, RN</p>
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

  <!-- PRICING (Single Card Focus) -->
  <section id="pricing" class="py-24 relative bg-white/[0.02]">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <div class="mb-12">
        <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">Preço Único. Tudo Incluso.</h2>
        <p class="text-slate-400 text-lg">Sem pegadinhas, sem taxas extras de surpresa.</p>
      </div>

      <div class="relative max-w-lg mx-auto">
        <!-- Glow Effect behind card -->
        <div class="absolute -inset-1 bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl blur opacity-30 animate-pulse"></div>

        <div class="relative rounded-2xl bg-[#121620] p-8 md:p-12 shadow-2xl animate-border-gradient">
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
            <p class="text-sky-400 font-bold text-lg">7 Dias Grátis</p>
            <p class="text-sm text-sky-300/80">Teste a semana toda. Se não amar, não paga.</p>
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
          <p class="text-xs text-slate-500 text-center mt-3">Cartão necessário para ativar o teste. Cancele antes dos 7 dias, não paga nada.</p>
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
            <span>Como funciona os 7 dias grátis?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
            Você cria a conta e cadastra seu cartão para ativar o período de teste. A cobrança só inicia após 7 dias. Se cancelar antes, não paga nada.
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
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="py-12 border-t border-white/10 bg-[#0B0F19]">
    <div class="max-w-7xl mx-auto px-6">
      <div class="grid md:grid-cols-4 gap-8 mb-12">
        <div class="col-span-1 md:col-span-1">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <span class="font-bold text-white text-xl">Zelo<span class="text-sky-500">PDV</span></span>
          </div>
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
          &copy; {new Date().getFullYear()} <a href="https://techneia.com.br" target="_blank" rel="noopener noreferrer" class="hover:text-slate-500 transition-colors">Téchne Sistemas</a>. <br class="hidden md:block"/>Todos os direitos reservados.
        </div>
        <div class="flex gap-4">
           <a href="https://instagram.com/techne.ia" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors">@techne.ia</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Floating WhatsApp Button -->
  <a
    href="https://wa.me/5514991537503?text=Oi%2C%20vim%20pelo%20site%20do%20Zelo%20PDV%20e%20quero%20saber%20mais%21"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Falar no WhatsApp"
    class="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#25D366] hover:bg-[#20b858] text-white font-semibold text-sm px-4 py-3 rounded-full shadow-lg shadow-black/30 transition-all hover:scale-105 active:scale-95 group"
  >
    <svg class="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
    <span class="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap">Falar no WhatsApp</span>
  </a>

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
