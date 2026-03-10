<svelte:head>
  <title>PDV para Páscoa 2026 — Venda ovos de Páscoa com controle total | Zelo PDV</title>
  <meta name="description" content="Sistema para vender na Páscoa 2026. Cadastre ovos de Páscoa, trufas e cestas em minutos. Para MEIs, confeiteiros e revendedores. Teste grátis por 7 dias." />
  <meta name="keywords" content="sistema para vender na páscoa, pdv para revenda de ovos de páscoa, controle de caixa páscoa MEI, app para loja de páscoa" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/pascoa" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="PDV para Páscoa 2026 — Venda ovos de Páscoa com controle total | Zelo PDV" />
  <meta property="og:description" content="Sistema para vender na Páscoa 2026. Cadastre ovos de Páscoa, trufas e cestas em minutos. Para MEIs, confeiteiros e revendedores. Teste grátis por 7 dias." />
  <meta property="og:url" content="https://zelopdv.com.br/pascoa" />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="Zelo PDV" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="PDV para Páscoa 2026 — Venda ovos de Páscoa com controle total" />
  <meta name="twitter:description" content="Controle suas vendas de Páscoa com o Zelo PDV. 7 dias grátis." />

  <!-- JSON-LD -->
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Zelo PDV",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web, Android, iOS",
    "offers": {
      "@type": "Offer",
      "price": "59.00",
      "priceCurrency": "BRL",
      "priceValidUntil": "2026-12-31",
      "description": "7 dias grátis, depois R$59/mês"
    },
    "description": "Sistema PDV para vender na Páscoa 2026. Ideal para MEIs, confeiteiros e revendedores de ovos de Páscoa.",
    "url": "https://zelopdv.com.br/pascoa"
  }
  <\/script>`}
</svelte:head>

<script>
  import { onMount } from 'svelte';

  let showMobileMenu = false;
  let openFaq = null;

  function toggleFaq(i) {
    openFaq = openFaq === i ? null : i;
  }
</script>

<div class="min-h-screen bg-[#0B0F19] text-slate-300 font-sans selection:bg-purple-500/30 selection:text-purple-200 overflow-x-hidden">


  <!-- NAV -->
  <nav class="fixed top-0 w-full z-50 transition-all duration-300 border-b border-white/5 bg-[#0B0F19]/80 backdrop-blur-md">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <span class="text-xl font-bold text-white tracking-tight">Zelo<span class="text-purple-400">PDV</span></span>
      </div>

      <div class="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <a href="#features" class="hover:text-white transition-colors">Funcionalidades</a>
        <a href="#pricing" class="hover:text-white transition-colors">Preços</a>
        <a href="#faq" class="hover:text-white transition-colors">Dúvidas</a>
        <a href="/" class="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Voltar ao site
        </a>
      </div>

      <div class="flex items-center gap-4">
        <a href="/cadastro" class="px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-full shadow-lg shadow-purple-900/40 transition-all hover:scale-105 active:scale-95">
          Testar 7 dias grátis
        </a>
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
        <a href="/" class="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Voltar ao site
        </a>
        <a href="/cadastro" class="mt-1 w-full text-center px-5 py-3 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-full shadow-lg shadow-purple-900/40 transition-all" on:click={() => showMobileMenu = false}>
          Testar grátis
        </a>
      </div>
    {/if}
  </nav>

  <!-- HERO SECTION -->
  <section class="relative pt-12 md:pt-20 pb-40 overflow-hidden">
    <!-- Background Glows -->
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none"></div>
    <div class="absolute bottom-0 right-0 w-[600px] h-[500px] bg-pink-500/10 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

    <div class="max-w-7xl mx-auto px-6 text-center relative z-10">
      <!-- Badge -->
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-medium mb-8 animate-fade-in-up">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
        </span>
        🐣 Temporada Páscoa 2026 · Encerra 6 de abril
      </div>

      <h1 class="text-5xl md:text-7xl font-bold text-white tracking-tight leading-[1.1] mb-8 animate-fade-in-up delay-100">
        Venda mais na Páscoa <br class="hidden md:block" />
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 animate-gradient">com total controle.</span>
      </h1>

      <p class="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up delay-200">
        Para MEIs, confeiteiros e revendedores que vendem ovos de Páscoa, trufas e cestas. Controle o caixa e feche a temporada no lucro.
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
        <a href="/cadastro" class="w-full sm:w-auto px-8 py-4 text-white bg-purple-600 hover:bg-purple-500 rounded-full font-semibold shadow-xl shadow-purple-900/30 transition-all hover:-translate-y-1">
          Começar grátis — 7 dias
        </a>
        <a href="#features" class="w-full sm:w-auto px-8 py-4 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-semibold backdrop-blur-sm transition-all">
          Ver como funciona
        </a>
      </div>
      <p class="text-xs text-slate-500 mt-3">Cancele quando quiser · Funciona no celular</p>

      <!-- Browser Mockup -->
      <div class="mt-20 relative group">
        <div class="relative mx-auto max-w-5xl rounded-xl border border-white/10 shadow-2xl shadow-purple-900/40 overflow-hidden transform transition-all duration-700 hover:scale-[1.01]">
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

          <!-- Screenshot -->
          <div class="bg-[#161b22] aspect-[16/9] md:aspect-auto relative group cursor-zoom-in">
            <img src="/images/screenshots/dashboard-desktop.png" alt="Frente de caixa Zelo PDV para Páscoa 2026" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div class="w-16 h-16 bg-purple-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
              </div>
            </div>
          </div>

          <!-- Depth gradient -->
          <div class="absolute inset-0 bg-gradient-to-t from-[#0B0F19]/50 via-transparent to-transparent pointer-events-none"></div>
        </div>

        <!-- Glow under dashboard -->
        <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[90%] h-20 bg-purple-500/20 blur-[60px] -z-10"></div>
      </div>
    </div>
  </section>

  <!-- TRUST STRIP -->
  <section class="py-10 border-y border-white/5 bg-white/[0.02]">
    <div class="max-w-7xl mx-auto px-6 text-center">
      <p class="text-sm font-medium text-slate-500 mb-6">Perfeito para quem vende na Páscoa</p>
      <div class="flex flex-wrap justify-center gap-8 md:gap-16 opacity-70 hover:opacity-100 transition-all duration-500">
        <span class="text-lg font-bold text-white flex items-center gap-2">🥚 Confeiteiros</span>
        <span class="text-lg font-bold text-white flex items-center gap-2">🎁 Revendedores</span>
        <span class="text-lg font-bold text-white flex items-center gap-2">🐰 MEIs sazonais</span>
        <span class="text-lg font-bold text-white flex items-center gap-2">🍫 Lojas de chocolate</span>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="py-24 relative overflow-hidden bg-[#0d1117]">
    <div class="max-w-7xl mx-auto px-6 text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-white mb-16">Pronto para vender em 3 passos</h2>

      <div class="grid md:grid-cols-3 gap-12">
        <div class="relative">
          <div class="w-16 h-16 mx-auto bg-purple-500/10 rounded-2xl border border-purple-500/20 flex items-center justify-center mb-6">
            <span class="text-2xl font-bold text-purple-400">1</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Crie sua conta</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Cadastre seu e-mail e o nome do negócio. 7 dias grátis.</p>
        </div>

        <div class="relative">
          <div class="hidden md:block absolute top-8 left-1/2 w-full h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
          <div class="w-16 h-16 mx-auto bg-purple-500/10 rounded-2xl border border-purple-500/20 flex items-center justify-center mb-6">
            <span class="text-2xl font-bold text-purple-400">2</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Ative o Kit Páscoa</h3>
          <p class="text-slate-400 text-sm leading-relaxed">5 categorias prontas — Ovos de Páscoa, Trufas & Bombons, Cestas, Colomba Pascal e Avulso — ativadas com um clique.</p>
        </div>

        <div class="relative">
          <div class="hidden md:block absolute top-8 left-1/2 w-full h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
          <div class="w-16 h-16 mx-auto bg-purple-500/10 rounded-2xl border border-purple-500/20 flex items-center justify-center mb-6">
            <span class="text-2xl font-bold text-purple-400">3</span>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Venda e feche o caixa</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Registre as vendas no celular ou computador. Relatório automático no fechamento do dia.</p>
        </div>
      </div>

      <div class="mt-16">
        <a href="/cadastro" class="inline-flex px-8 py-4 text-white bg-purple-600 hover:bg-purple-500 rounded-full font-semibold shadow-xl shadow-purple-900/30 transition-all hover:-translate-y-1">
          Testar 7 dias grátis
        </a>
        <p class="text-xs text-slate-500 mt-3">Cancele quando quiser</p>
      </div>
    </div>
  </section>

  <!-- FEATURE 1: FRENTE DE CAIXA (Texto Esquerda, Imagem Direita) -->
  <section id="features" class="py-24 relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div>
        <div class="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Frente de Caixa para Páscoa. <br/><span class="text-purple-400">Sem Filas.</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          PDV pensado para a correria da temporada. Toque, adicione e finalize em segundos. Funciona no celular e offline.
        </p>
        <ul class="space-y-4">
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
            Cadastro em minutos com Kit Páscoa
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
            PIX, cartão, dinheiro e fiado
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
            Funciona offline no celular
          </li>
        </ul>
      </div>
      <div class="relative group">
        <div class="absolute inset-0 bg-purple-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-purple-500/30 transition-all duration-700"></div>
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(168,85,247,0.3)]">
          <img src="/images/screenshots/dashboard-desktop.png" alt="Frente de caixa Páscoa Zelo PDV" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div class="w-16 h-16 bg-purple-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 2: CONTROLE DE CAIXA (Imagem Esquerda, Texto Direita) -->
  <section class="py-24 relative bg-white/[0.02]">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div class="order-2 lg:order-1 relative group">
        <div class="absolute inset-0 bg-emerald-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-emerald-500/30 transition-all duration-700"></div>
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(16,185,129,0.3)]">
          <img src="/images/screenshots/financial-screen.png" alt="Controle de caixa Páscoa Zelo PDV" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
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
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Controle de Caixa Completo. <br/><span class="text-emerald-400">Saiba o que lucrou.</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Saber quanto vendeu é fácil. Difícil é saber quanto sobrou. O Zelo PDV fecha o caixa e te mostra o lucro real da temporada.
        </p>
        <div class="grid grid-cols-2 gap-4">
          <div class="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <h4 class="text-white font-semibold mb-1">Fechamento de Caixa</h4>
            <p class="text-sm text-slate-500">Conferência cega e segura ao final do dia.</p>
          </div>
          <div class="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <h4 class="text-white font-semibold mb-1">Relatório de Vendas</h4>
            <p class="text-sm text-slate-500">Exporte em PDF ou Excel para o MEI.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 3: FIADO (Texto Esquerda, Imagem Direita) -->
  <section class="py-24 relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div>
        <div class="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-6">
          <svg class="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Fiado Organizado. <br/><span class="text-amber-400">Venda com segurança.</span></h2>
        <p class="text-lg text-slate-400 mb-8 leading-relaxed">
          Transforme o caderninho em uma ferramenta profissional. Venda no fiado para clientes conhecidos e controle o saldo de cada um com extrato completo.
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
          <li class="flex items-center gap-3 text-slate-300">
            <div class="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs">✓</div>
            Cobre com prova e educação
          </li>
        </ul>
      </div>
      <div class="relative group">
        <div class="absolute inset-0 bg-amber-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-amber-500/30 transition-all duration-700"></div>
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(245,158,11,0.3)]">
          <img src="/images/screenshots/customers-screen.png" alt="Controle de fiado clientes Páscoa" loading="lazy" class="w-full h-auto object-cover opacity-90 group-hover:blur-[2px] transition-all duration-300" />
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div class="w-16 h-16 bg-amber-600/90 rounded-full flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-md transform scale-75 group-hover:scale-100 transition-transform duration-300">
              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- PRICING -->
  <section id="pricing" class="py-24 relative bg-white/[0.02]">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <div class="mb-12">
        <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">Preço Único. Tudo Incluso.</h2>
        <p class="text-slate-400 text-lg">Um preço justo para a temporada. Sem pegadinhas.</p>
      </div>

      <div class="relative max-w-lg mx-auto">
        <!-- Glow behind card -->
        <div class="absolute -inset-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl blur opacity-30 animate-pulse"></div>

        <div class="relative rounded-2xl bg-[#121620] p-8 md:p-12 shadow-2xl ring-2 ring-purple-500/50">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <span class="bg-purple-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-purple-500/40 tracking-wide uppercase">7 dias grátis</span>
          </div>

          <p class="text-slate-300 font-medium mb-1 mt-4">Acesso Completo</p>
          <div class="flex justify-center items-baseline gap-1 mb-6">
            <span class="text-2xl text-slate-400">R$</span>
            <span class="text-6xl font-bold text-white tracking-tight">59</span>
            <span class="text-xl text-slate-500">/mês</span>
          </div>

          <div class="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mb-8">
            <p class="text-purple-400 font-bold text-lg">7 Dias Grátis</p>
            <p class="text-sm text-purple-300/80">Teste sem compromisso. Se não amar, não paga.</p>
          </div>

          <ul class="space-y-4 text-left mb-10 max-w-xs mx-auto">
            <li class="flex items-center gap-3 text-slate-200">
              <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
              <span>Frente de caixa completa (PDV)</span>
            </li>
            <li class="flex items-center gap-3 text-slate-200">
              <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
              <span>Controle de estoque</span>
            </li>
            <li class="flex items-center gap-3 text-slate-200">
              <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
              <span>Relatórios PDF e Excel</span>
            </li>
            <li class="flex items-center gap-3 text-slate-200">
              <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
              <span>Gestão de clientes e fiado</span>
            </li>
            <li class="flex items-center gap-3 text-slate-200">
              <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
              <span>Funciona offline no celular</span>
            </li>
            <li class="flex items-center gap-3 text-slate-200">
              <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
              <span>Kit categorias Páscoa incluso</span>
            </li>
            <li class="flex items-center gap-3 text-slate-200">
              <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">✓</div>
              <span>Suporte pelo WhatsApp</span>
            </li>
          </ul>

          <a href="/cadastro" class="block w-full text-center py-4 text-lg font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-lg shadow-purple-900/50 transition-all hover:scale-[1.02] active:scale-[0.98]">
            Começar grátis agora
          </a>
          <p class="text-xs text-slate-500 text-center mt-3">Cancele quando quiser · Suporte pelo WhatsApp</p>
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

        <!-- FAQ 1 -->
        <div class="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all duration-300">
          <button
            class="w-full flex items-center justify-between cursor-pointer p-6 font-medium text-white text-left select-none"
            aria-expanded={openFaq === 0}
            on:click={() => toggleFaq(0)}
          >
            <span>Preciso de cartão de crédito para testar?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform flex-shrink-0 {openFaq === 0 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {#if openFaq === 0}
            <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
              Sim. É necessário informar um cartão para ativar o teste, mas a cobrança só ocorre após os 7 dias. Se cancelar antes, não paga nada.
            </div>
          {/if}
        </div>

        <!-- FAQ 2 -->
        <div class="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all duration-300">
          <button
            class="w-full flex items-center justify-between cursor-pointer p-6 font-medium text-white text-left select-none"
            aria-expanded={openFaq === 1}
            on:click={() => toggleFaq(1)}
          >
            <span>Funciona no celular?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform flex-shrink-0 {openFaq === 1 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {#if openFaq === 1}
            <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
              Sim. O Zelo PDV é um PWA — instale no Android ou iPhone e venda offline. Quando a internet voltar, os dados sincronizam automaticamente.
            </div>
          {/if}
        </div>

        <!-- FAQ 3 -->
        <div class="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all duration-300">
          <button
            class="w-full flex items-center justify-between cursor-pointer p-6 font-medium text-white text-left select-none"
            aria-expanded={openFaq === 2}
            on:click={() => toggleFaq(2)}
          >
            <span>Posso cancelar a qualquer momento?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform flex-shrink-0 {openFaq === 2 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {#if openFaq === 2}
            <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
              Sim. Sem fidelidade, sem multa. Cancele quando quiser direto pelo painel de assinatura, a qualquer hora.
            </div>
          {/if}
        </div>

        <!-- FAQ 4 -->
        <div class="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all duration-300">
          <button
            class="w-full flex items-center justify-between cursor-pointer p-6 font-medium text-white text-left select-none"
            aria-expanded={openFaq === 3}
            on:click={() => toggleFaq(3)}
          >
            <span>O que é o Kit Páscoa?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform flex-shrink-0 {openFaq === 3 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {#if openFaq === 3}
            <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
              São 5 categorias prontas — Ovos de Páscoa, Trufas & Bombons, Cestas, Colomba Pascal e Avulso — que você ativa com um clique na página de Produtos. Economiza tempo de configuração no início da temporada.
            </div>
          {/if}
        </div>

        <!-- FAQ 5 -->
        <div class="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all duration-300">
          <button
            class="w-full flex items-center justify-between cursor-pointer p-6 font-medium text-white text-left select-none"
            aria-expanded={openFaq === 4}
            on:click={() => toggleFaq(4)}
          >
            <span>Funciona para quem vende só na Páscoa?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform flex-shrink-0 {openFaq === 4 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {#if openFaq === 4}
            <div class="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in-down">
              Perfeitamente. Você pode usar nos 7 dias grátis e cancelar após a temporada — sem custo nenhum. Se gostar, continue com o plano mensal de R$59.
            </div>
          {/if}
        </div>

      </div>
    </div>
  </section>

  <!-- FINAL CTA -->
  <section class="py-24 relative overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-transparent to-pink-900/20 pointer-events-none"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-purple-600/20 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

    <div class="max-w-3xl mx-auto px-6 text-center relative z-10">
      <h2 class="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
        A Páscoa não espera. 🥚
      </h2>
      <p class="text-lg text-slate-400 mb-10 leading-relaxed max-w-xl mx-auto">
        Configure seu sistema hoje e chegue pronto para a maior venda da temporada. 7 dias grátis, sem compromisso.
      </p>
      <a href="/cadastro" class="inline-flex px-10 py-5 text-lg font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-full shadow-2xl shadow-purple-900/50 transition-all hover:-translate-y-1 hover:scale-105 active:scale-95">
        Criar conta grátis agora
      </a>
      <p class="text-xs text-slate-500 mt-4">Cancele quando quiser · Suporte pelo WhatsApp</p>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="py-8 border-t border-white/10 bg-[#0B0F19]">
    <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-md bg-gradient-to-tr from-purple-500 to-purple-700 flex items-center justify-center">
          <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <span class="font-bold text-white">Zelo<span class="text-purple-400">PDV</span></span>
        <span class="text-slate-600 text-sm ml-2">&copy; {new Date().getFullYear()} Téchne Sistemas</span>
      </div>
      <div class="flex gap-6 text-sm text-slate-500">
        <a href="/" class="hover:text-white transition-colors">Início</a>
        <a href="/privacidade" class="hover:text-white transition-colors">Privacidade</a>
        <a href="/termos" class="hover:text-white transition-colors">Termos de uso</a>
        <a href="/cadastro" class="hover:text-purple-400 transition-colors">Criar conta</a>
      </div>
    </div>
  </footer>

  <!-- Floating WhatsApp Button -->
  <a
    href="https://wa.me/5514991537503?text=Oi%2C%20vim%20pela%20p%C3%A1gina%20de%20P%C3%A1scoa%20do%20Zelo%20PDV%20e%20quero%20saber%20mais%21"
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
  @keyframes gradient {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  .animate-fade-in-up {
    animation: fade-in-up 0.8s ease-out both;
  }
  .animate-fade-in-down {
    animation: fade-in-down 0.3s ease-out forwards;
  }
  .animate-gradient {
    background-size: 200% 200%;
    animation: gradient 4s ease infinite;
  }

  .delay-100 { animation-delay: 0.1s; }
  .delay-200 { animation-delay: 0.2s; }
  .delay-300 { animation-delay: 0.3s; }
</style>
