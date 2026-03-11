<svelte:head>
  <title>Sistema Simples para vender na Páscoa 2026 | Zelo PDV</title>
  <meta name="description" content="O sistema mais fácil para vender na Páscoa 2026. Controle suas vendas de ovos de chocolate, trufas e cestas. Feito para doceiras e revendedores." />
  <meta name="keywords" content="sistema para vender na páscoa, pdv para doceiras, controle de vendas ovos de páscoa, aplicativo para vender chocolate" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/pascoa" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Venda mais nesta Páscoa com o Zelo PDV" />
  <meta property="og:description" content="Controle suas vendas e seu lucro com facilidade. Teste grátis por 7 dias." />
  <meta property="og:url" content="https://zelopdv.com.br/pascoa" />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="Zelo PDV" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="O sistema ideal para sua Páscoa" />
  <meta name="twitter:description" content="Cadastre ovos, controle o estoque e as vendas no fiado. 7 dias grátis." />

  <!-- JSON-LD SEO -->
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Zelo PDV Páscoa",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web, Android, iOS",
    "offers": {
      "@type": "Offer",
      "price": "59.00",
      "priceCurrency": "BRL",
      "priceValidUntil": "2026-12-31",
      "description": "7 dias grátis"
    },
    "description": "Sistema para vender na Páscoa 2026. Ideal para doceiras, confeiteiras e revendedores.",
    "url": "https://zelopdv.com.br/pascoa"
  }
  <\/script>`}
</svelte:head>

<script>
  import { onMount } from 'svelte';
  
  let showMobileMenu = false;
  let openFaq = null;
  let scrollY = 0;

  function toggleFaq(i) {
    openFaq = openFaq === i ? null : i;
  }
</script>

<svelte:window bind:scrollY={scrollY} />

<div class="min-h-screen bg-[#06040A] text-slate-300 font-sans selection:bg-pink-500/30 selection:text-pink-200 overflow-x-hidden relative">

  <!-- ==================== AMBIENT GLOWS ==================== -->
  <div class="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/20 blur-[150px] rounded-full pointer-events-none z-0 mix-blend-screen transition-transform duration-1000" style="transform: translateY({scrollY * 0.1}px)"></div>
  <div class="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-amber-900/15 blur-[150px] rounded-full pointer-events-none z-0 mix-blend-screen transition-transform duration-1000" style="transform: translateY({scrollY * -0.1}px)"></div>

  <!-- ==================== NAVIGATION ==================== -->
  <nav class="fixed top-0 w-full z-50 transition-all duration-500 {scrollY > 20 ? 'border-b border-white/[0.04] bg-[#06040A]/70 backdrop-blur-2xl py-2' : 'bg-transparent py-4'}">
    <div class="max-w-7xl mx-auto px-6 flex items-center justify-between">
      
      <!-- Brand -->
      <a href="/pascoa" class="flex items-center gap-3 group relative z-50">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 p-[1px] shadow-lg shadow-pink-500/20 relative">
          <div class="absolute inset-0 bg-gradient-to-br from-amber-400 to-purple-600 blur-md opacity-40 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div class="w-full h-full rounded-xl bg-[#06040A] flex items-center justify-center relative z-10 transition-colors group-hover:bg-opacity-80">
             <span class="text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-amber-200 to-pink-400">Z</span>
          </div>
        </div>
        <span class="text-2xl font-black tracking-tighter text-white">Zelo<span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-pink-500">PDV</span></span>
      </a>

      <!-- Desktop Links -->
      <div class="hidden md:flex items-center gap-10 text-sm font-bold text-slate-300 tracking-wide">
        <a href="#como-funciona" class="hover:text-amber-400 transition-colors relative group">
          Como funciona
          <span class="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-amber-400 to-pink-500 transition-all group-hover:w-full"></span>
        </a>
        <a href="#ferramentas" class="hover:text-amber-400 transition-colors relative group">
          Tudo o que você precisa
          <span class="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-amber-400 to-pink-500 transition-all group-hover:w-full"></span>
        </a>
        <a href="#preco" class="hover:text-amber-400 transition-colors relative group">
          Preço
          <span class="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-amber-400 to-pink-500 transition-all group-hover:w-full"></span>
        </a>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-4">
        <a href="/" class="hidden md:flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-white transition-colors">
          Site Oficial
        </a>
        <a href="/cadastro" class="hidden md:flex relative group px-7 py-2.5 rounded-full overflow-hidden shadow-[0_0_20px_rgba(236,72,153,0.3)] hover:shadow-[0_0_40px_rgba(236,72,153,0.5)] transition-all duration-300 transform hover:-translate-y-0.5">
          <div class="absolute inset-0 bg-gradient-to-r from-amber-400 via-pink-500 to-purple-600 opacity-90 group-hover:opacity-100 transition-opacity"></div>
          <div class="absolute inset-[1.5px] bg-[#06040A] rounded-full transition-colors duration-300 group-hover:bg-opacity-0"></div>
          <span class="relative text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-100 to-white group-hover:text-white transition-colors duration-300">Testar Grátis</span>
        </a>

        <!-- Mobile Menu Toggle -->
        <button
          class="md:hidden relative z-50 flex flex-col justify-center items-center w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none backdrop-blur-md"
          on:click={() => showMobileMenu = !showMobileMenu}
        >
          <span class="bg-white block transition-all duration-300 ease-out h-[2px] w-5 rounded-sm {showMobileMenu ? 'rotate-45 translate-y-[6px]' : '-translate-y-1'}"></span>
          <span class="bg-white block transition-all duration-300 ease-out h-[2px] w-5 rounded-sm my-0.5 {showMobileMenu ? 'opacity-0' : 'opacity-100'}"></span>
          <span class="bg-white block transition-all duration-300 ease-out h-[2px] w-5 rounded-sm {showMobileMenu ? '-rotate-45 -translate-y-[6px]' : 'translate-y-1'}"></span>
        </button>
      </div>
    </div>

    <!-- Mobile Menu Overlay -->
    {#if showMobileMenu}
      <div class="md:hidden absolute top-0 left-0 w-full h-screen bg-[#06040A]/95 backdrop-blur-3xl border-b border-white/[0.05] flex flex-col items-center justify-center gap-8 animate-fade-in z-40">
        <a href="#como-funciona" class="text-2xl font-black text-white hover:text-amber-400 transition-colors" on:click={() => showMobileMenu = false}>Como funciona</a>
        <a href="#ferramentas" class="text-2xl font-black text-white hover:text-amber-400 transition-colors" on:click={() => showMobileMenu = false}>Ferramentas</a>
        <a href="#preco" class="text-2xl font-black text-white hover:text-amber-400 transition-colors" on:click={() => showMobileMenu = false}>Preço</a>
        <a href="/" class="text-lg font-bold text-slate-500 hover:text-white transition-colors" on:click={() => showMobileMenu = false}>Voltar ao site principal</a>
        
        <a href="/cadastro" class="mt-8 relative group px-10 py-4 rounded-full overflow-hidden shadow-[0_0_30px_rgba(236,72,153,0.4)]" on:click={() => showMobileMenu = false}>
          <div class="absolute inset-0 bg-gradient-to-r from-amber-400 via-pink-500 to-purple-600"></div>
          <span class="relative text-lg font-extrabold text-white">Criar Conta Grátis</span>
        </a>
      </div>
    {/if}
  </nav>

  <!-- ==================== HERO SECTION ==================== -->
  <section class="relative min-h-[90vh] flex items-center pt-28 pb-32 overflow-hidden z-10">
    <!-- Abstract Easter Shapes -->
    <div class="absolute top-[20%] right-[10%] w-[120px] h-[160px] abstract-egg bg-gradient-to-br from-amber-300 to-pink-500 blur-[2px] opacity-80 animate-float-slow shadow-[0_0_80px_rgba(251,191,36,0.3)] hidden lg:block" style="border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;"></div>
    <div class="absolute bottom-[10%] left-[5%] w-[80px] h-[110px] abstract-egg bg-gradient-to-br from-purple-400 to-indigo-600 blur-[1px] opacity-70 animate-float-fast shadow-[0_0_60px_rgba(168,85,247,0.3)] hidden lg:block" style="border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; animation-delay: 1.5s;"></div>
    <div class="absolute top-[40%] left-[45%] w-[40px] h-[50px] abstract-egg bg-gradient-to-br from-pink-400 to-rose-600 blur-[3px] opacity-50 animate-float-slow hidden md:block" style="border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; animation-delay: 0.5s;"></div>

    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center w-full relative z-20">
      
      <!-- Text content -->
      <div class="text-left relative z-20">
        <div class="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs font-black tracking-widest uppercase mb-8 shadow-[0_0_30px_rgba(251,191,36,0.15)] backdrop-blur-md animate-fade-in-up">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Venda mais nesta Páscoa 2026
        </div>

        <h1 class="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[1.05] mb-6 drop-shadow-2xl animate-fade-in-up delay-100">
          Venda seus ovos de Páscoa <br class="hidden md:block"/> com <br class="block md:hidden"/>
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-pink-400 to-purple-500 animate-gradient-slow drop-shadow-[0_0_30px_rgba(236,72,153,0.3)]">controle total do caixa.</span>
        </h1>

        <p class="text-lg md:text-xl text-slate-400 font-medium max-w-lg mb-10 leading-relaxed animate-fade-in-up delay-200">
          O sistema de vendas mais simples para doceiras, MEIs, e empreendedores. Cadastre seus doces e feche o caixa em segundos, no celular ou PC.
        </p>

        <div class="flex flex-col sm:flex-row items-center gap-5 animate-fade-in-up delay-300">
          <a href="/cadastro" class="w-full sm:w-auto px-8 py-4.5 text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl font-extrabold shadow-[0_0_40px_rgba(219,39,119,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_60px_rgba(219,39,119,0.5)] flex items-center justify-center gap-3 group relative overflow-hidden">
            <span class="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:animate-shine"></span>
            Começar Grátis — 7 Dias
            <svg class="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
          </a>
          <a href="#como-funciona" class="w-full sm:w-auto px-8 py-4 text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] rounded-2xl font-bold backdrop-blur-xl transition-all duration-300 flex items-center justify-center gap-2 hover:-translate-y-1">
            Ver como funciona
          </a>
        </div>
        <p class="text-[10px] text-slate-500 uppercase tracking-widest mt-4 font-bold">Cancele quando quiser</p>
      </div>

      <!-- Visuals -->
      <div class="relative w-full h-[500px] perspective-[2000px] hidden lg:block animate-fade-in-up delay-300">
        
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-gradient-to-tr from-purple-600/30 to-amber-500/20 blur-[80px] rounded-full z-0"></div>

        <!-- Dashboard Card 1 (Back) -->
        <div class="absolute top-[40%] left-[60%] -translate-x-1/2 -translate-y-1/2 w-[550px] h-[320px] bg-[#100B1A]/40 backdrop-blur-md border border-white/[0.04] rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.9)] transform rotate-y-[-20deg] rotate-x-[15deg] translate-z-[-100px] overflow-hidden z-10">
          <div class="h-10 border-b border-white/[0.03] flex items-center px-4 gap-2 bg-black/40">
            <div class="w-2.5 h-2.5 rounded-full bg-white/10"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-white/10"></div>
          </div>
          <img src="/images/screenshots/financial-screen.png" alt="Zelo Financeiro" class="w-full h-full object-cover object-top opacity-30 mix-blend-screen" />
        </div>

        <!-- Dashboard Card 2 (Front) -->
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-[#100B1A]/80 backdrop-blur-2xl border border-white/[0.1] rounded-3xl shadow-[0_50px_150px_rgba(0,0,0,0.9)] transform rotate-y-[-15deg] rotate-x-[10deg] transition-all duration-700 hover:rotate-y-[-5deg] hover:rotate-x-[5deg] hover:scale-[1.05] overflow-hidden group z-20 cursor-crosshair">
          
          <div class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.05] pointer-events-none"></div>
          
          <div class="h-12 border-b border-white/[0.05] flex items-center justify-between px-5 bg-black/30 backdrop-blur-md text-[10px] font-mono text-slate-400">
            FRENTE DE CAIXA • ZELO PDV
            <div class="flex gap-2">
              <div class="w-2 h-2 rounded-full bg-amber-500"></div>
              <div class="w-2 h-2 rounded-full bg-pink-500"></div>
            </div>
          </div>

          <div class="relative w-full h-full">
            <img src="/images/screenshots/dashboard-desktop.png" alt="Zelo Dashboard" class="w-full h-full object-cover object-top opacity-80 mix-blend-lighten group-hover:opacity-100 transition-all duration-500 scale-[1.02]" />
            <div class="absolute inset-0 shadow-[inset_0_0_40px_rgba(16,11,26,1)] pointer-events-none"></div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ==================== WAVY DIVIDER ==================== -->
  <div class="relative w-full overflow-hidden leading-none z-10 -mt-10">
    <svg class="relative block w-full h-[120px] lg:h-[180px]" viewBox="0 0 1200 120" preserveAspectRatio="none">
      <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" class="fill-[#06040A] opacity-50"></path>
      <path d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,12.24,88.2,10.12V0Z" class="fill-[#0F0A1B]"></path>
    </svg>
  </div>

  <!-- ==================== FEATURES SECTION ==================== -->
  <section id="como-funciona" class="py-24 bg-[#0F0A1B] relative z-20">
    <div class="max-w-7xl mx-auto px-6">
      
      <div class="text-center mb-24 relative">
        <h2 class="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 mb-6 tracking-tighter">Chega de se perder no caderno.</h2>
        <p class="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed">Desenvolvido para ajudar quem vende muito na Páscoa e não tem tempo para aplicativos complicados. O Zelo PDV faz o trabalho duro por você.</p>
        <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 w-48 h-1 rounded-full bg-gradient-to-r from-transparent via-pink-500 to-transparent blur-[2px]"></div>
      </div>

      <div class="grid md:grid-cols-3 gap-8">
        
        <!-- Feature Card 1 -->
        <div class="group relative rounded-3xl bg-[#181326]/50 backdrop-blur-xl border border-white/[0.03] p-10 overflow-hidden hover:border-amber-500/40 transition-all duration-700 hover:-translate-y-2 box-hover-glow">
          <div class="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 blur-[60px] group-hover:bg-amber-500/30 transition-all duration-700 ease-in-out"></div>
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-[0_10px_30px_rgba(251,191,36,0.3)] mb-8 transform group-hover:scale-110 transition-transform duration-500">
             <svg class="w-8 h-8 text-[#0F0A1B]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <h3 class="text-2xl font-black text-white mb-4 tracking-tight">Venda Rápida</h3>
          <p class="text-slate-400 leading-relaxed font-medium">Toque nos produtos e feche a venda. Aceite Pix, Cartão ou dinheiro sem complicação. Ideal para quando a loja estiver cheia.</p>
        </div>

        <!-- Feature Card 2 -->
        <div class="group relative rounded-3xl bg-[#181326]/50 backdrop-blur-xl border border-white/[0.03] p-10 overflow-hidden hover:border-pink-500/40 transition-all duration-700 hover:-translate-y-2 box-hover-glow mt-0 md:mt-12">
          <div class="absolute top-0 right-0 w-40 h-40 bg-pink-500/10 blur-[60px] group-hover:bg-pink-500/30 transition-all duration-700 ease-in-out"></div>
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-700 flex items-center justify-center shadow-[0_10px_30px_rgba(236,72,153,0.3)] mb-8 transform group-hover:scale-110 transition-transform duration-500">
             <svg class="w-8 h-8 text-[#0F0A1B]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          </div>
          <h3 class="text-2xl font-black text-white mb-4 tracking-tight">Lucro na mão</h3>
          <p class="text-slate-400 leading-relaxed font-medium">Esqueça as contas de cabeça. O sistema te mostra quanto você vendeu no dia e qual foi o seu lucro real de forma automática.</p>
        </div>

        <!-- Feature Card 3 -->
        <div class="group relative rounded-3xl bg-[#181326]/50 backdrop-blur-xl border border-white/[0.03] p-10 overflow-hidden hover:border-purple-500/40 transition-all duration-700 hover:-translate-y-2 box-hover-glow mt-0 md:mt-24">
          <div class="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 blur-[60px] group-hover:bg-purple-500/30 transition-all duration-700 ease-in-out"></div>
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-indigo-700 flex items-center justify-center shadow-[0_10px_30px_rgba(168,85,247,0.3)] mb-8 transform group-hover:scale-110 transition-transform duration-500">
             <svg class="w-8 h-8 text-[#0F0A1B]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <h3 class="text-2xl font-black text-white mb-4 tracking-tight">Adeus Fiado</h3>
          <p class="text-slate-400 leading-relaxed font-medium">Controle as vendas por cliente de um jeito organizado. Saiba quem deve, mande lembrete por WhatsApp e tenha tudo registrado.</p>
        </div>

      </div>
    </div>
  </section>

  <!-- ==================== FEATURES 2 ==================== -->
  <section id="ferramentas" class="py-32 bg-[#0F0A1B] relative border-t border-white/[0.02]">
    <div class="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-20 items-center">
      
      <div class="relative group perspective-[1000px] order-2 md:order-1">
        <div class="absolute inset-0 bg-gradient-to-tr from-pink-500/20 to-purple-600/20 blur-[80px] rounded-full z-0 transition-opacity duration-700 group-hover:opacity-100 opacity-60"></div>
        <div class="relative bg-[#06040A] rounded-3xl border border-white/[0.05] p-2 shadow-2xl z-10 transform rotate-y-[5deg] rotate-x-[5deg] group-hover:rotate-y-0 group-hover:rotate-x-0 transition-all duration-700">
           <img src="/images/screenshots/customers-screen.png" alt="Gestão de Clientes" class="w-full h-auto rounded-2xl opacity-80 group-hover:opacity-100 transition-opacity" />
           <div class="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10 pointer-events-none"></div>
        </div>
      </div>

      <div class="order-1 md:order-2">
        <div class="inline-flex py-1 px-3 rounded-full border border-pink-500/20 bg-pink-500/10 text-pink-400 text-xs font-bold tracking-widest uppercase mb-6">Funciona no Celular</div>
        <h2 class="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight leading-tight">Venda de qualquer lugar.<br/><span class="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-500">Sem precisar de internet.</span></h2>
        <p class="text-lg text-slate-400 font-medium mb-8 leading-relaxed">
          Instale o nosso aplicativo direto no seu celular (Android ou iPhone) ou PC sem precisar baixar nada da loja. Se a internet cair, você continua vendendo e o sistema salva tudo sozinho.
        </p>
        
        <ul class="space-y-5">
          <li class="flex items-start gap-4">
             <div class="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 border border-pink-500/20">
               <svg class="w-4 h-4 text-pink-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
             </div>
             <div>
               <h4 class="text-white font-bold text-lg">Sincronização Automática</h4>
               <p class="text-sm text-slate-400 mt-1">Quando a internet volta, suas vendas vão direto para a nuvem de forma segura.</p>
             </div>
          </li>
          <li class="flex items-start gap-4">
             <div class="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 border border-pink-500/20">
               <svg class="w-4 h-4 text-pink-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
             </div>
             <div>
               <h4 class="text-white font-bold text-lg">Instalação Simples</h4>
               <p class="text-sm text-slate-400 mt-1">Abra o site, clique em "Instalar" e tenha o ícone do sistema na sua tela inicial.</p>
             </div>
          </li>
        </ul>
      </div>

    </div>
  </section>

  <!-- ==================== WAVY DIVIDER TO PRICING ==================== -->
  <div class="relative w-full overflow-hidden leading-none z-10">
    <svg class="relative block w-full h-[80px]" viewBox="0 0 1200 120" preserveAspectRatio="none">
      <path d="M0,0V120H1200V0C1014.54,80,785.46,80,600,60,414.54,40,185.46,40,0,0Z" class="fill-[#06040A]"></path>
    </svg>
  </div>

  <!-- ==================== PRICING ==================== -->
  <section id="preco" class="py-32 bg-[#06040A] relative z-20">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      
      <div class="text-left">
        <h2 class="text-5xl md:text-7xl font-black text-white mb-6 tracking-tighter leading-tight">Tudo o que você precisa<br/><span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-pink-500 drop-shadow-[0_0_20px_rgba(251,191,36,0.2)]">por um preço justo.</span></h2>
        <p class="text-xl text-slate-400 mb-10 font-medium leading-relaxed max-w-md">Menos que o lucro de um único ovo de Páscoa para ter o controle total da sua empresa.</p>
        
        <div class="hidden lg:flex flex-col gap-6">
          <div class="flex items-center gap-4">
            <div class="w-16 h-1 rounded-full bg-gradient-to-r from-amber-400 to-pink-500"></div>
            <span class="text-slate-300 font-bold tracking-widest uppercase text-sm">Sem fidelidade</span>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-16 h-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-600"></div>
            <span class="text-slate-300 font-bold tracking-widest uppercase text-sm">Cancele quando quiser</span>
          </div>
        </div>
      </div>

      <!-- Pricing Card -->
      <div class="relative group max-w-md mx-auto w-full perspective-[1000px]">
        <div class="absolute -inset-1 bg-gradient-to-r from-amber-400 via-pink-500 to-purple-600 rounded-[2.5rem] blur-[25px] opacity-50 group-hover:opacity-80 transition-opacity duration-1000 animate-pulse-slow"></div>
        
        <div class="relative bg-gradient-to-b from-[#161122] to-[#0A0713] backdrop-blur-3xl border border-white/[0.1] rounded-[2.5rem] p-10 md:p-12 shadow-2xl transform rotate-x-[2deg] rotate-y-[-2deg] transition-transform duration-700 group-hover:rotate-0">
          
          <div class="absolute top-0 right-10 -translate-y-1/2">
             <div class="bg-gradient-to-r from-amber-400 to-amber-600 text-[#06040A] font-black tracking-widest uppercase text-xs px-5 py-2 rounded-full shadow-[0_10px_20px_rgba(251,191,36,0.4)]">
               7 DIAS GRÁTIS
             </div>
          </div>

          <div class="mb-10">
            <p class="text-amber-400 font-bold tracking-widest uppercase text-sm mb-3">Plano Completo</p>
            <div class="flex items-baseline gap-2">
              <span class="text-2xl text-slate-500 font-bold">R$</span>
              <h3 class="text-6xl font-black text-white tracking-tighter drop-shadow-lg">59</h3>
              <span class="text-xl text-slate-500 font-medium">/mês</span>
            </div>
          </div>

          <div class="space-y-5 mb-12">
            {#each [
              'Venda de Ovos, Trufas e Cestas',
              'Controle de Estoque Real',
              'Relatórios de Vendas e Lucro',
              'Controle de Fiado por Cliente',
              'Aplicativo no Celular e Computador',
              'Ajuda pelo WhatsApp'
            ] as feature}
            <div class="flex items-center gap-4">
              <div class="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(236,72,153,0.4)]">
                <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>
              <span class="text-slate-200 font-medium text-sm md:text-base leading-tight">{feature}</span>
            </div>
            {/each}
          </div>

          <a href="/cadastro" class="block w-full text-center py-5 text-xl font-black text-white bg-gradient-to-r from-amber-500 to-pink-600 rounded-2xl shadow-[0_10px_40px_rgba(236,72,153,0.4)] transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] hover:shadow-[0_15px_50px_rgba(236,72,153,0.6)] relative overflow-hidden group/btn">
            <span class="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover/btn:animate-shine"></span>
            Testar 7 dias grátis
          </a>
          <p class="text-xs text-slate-500 text-center mt-5 font-medium uppercase tracking-widest">Cancele quando quiser</p>
        </div>
      </div>

    </div>
  </section>

  <!-- ==================== FOOTER ==================== -->
  <footer class="py-12 border-t border-white/[0.04] bg-[#030206] relative z-20">
    <div class="max-w-7xl mx-auto px-6">
      <div class="flex flex-col md:flex-row justify-between items-center gap-8">
        
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 p-[1px] relative">
            <div class="w-full h-full rounded-xl bg-[#06040A] flex items-center justify-center relative z-10">
               <span class="text-lg font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-amber-200 to-pink-400">Z</span>
            </div>
          </div>
          <span class="text-xl font-black tracking-tighter text-white">Zelo<span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-pink-500">PDV</span></span>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-8 text-sm font-bold tracking-wide text-slate-500">
          <a href="/" class="hover:text-amber-400 transition-colors">Início</a>
          <a href="/privacidade" class="hover:text-amber-400 transition-colors">Privacidade</a>
          <a href="/termos" class="hover:text-amber-400 transition-colors">Termos</a>
        </div>

        <div class="text-slate-600 text-sm font-medium tracking-wide">
          &copy; {new Date().getFullYear()} Téchne Sistemas
        </div>
      </div>
    </div>
  </footer>

  <!-- ==================== WHATSAPP ==================== -->
  <a
    href="https://wa.me/5514991537503?text=Oi%2C%20estou%20na%20p%C3%A1gina%20da%20P%C3%A1scoa%20do%20ZeloPDV%20e%20gostaria%20de%20tirar%20uma%20d%C3%BAvida."
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Falar no WhatsApp"
    class="fixed bottom-8 right-8 z-[100] flex items-center gap-3 bg-[#111111] border border-white/10 hover:border-[#25D366]/50 text-white font-bold text-sm px-5 py-4 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.8)] transition-all duration-500 hover:scale-105 active:scale-95 group overflow-hidden"
  >
    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[#25D366]/10 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:animate-shine"></div>
    <div class="relative z-10 w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center shadow-[0_0_15px_rgba(37,211,102,0.6)]">
      <svg class="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    </div>
    <span class="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 whitespace-nowrap tracking-wide">Tirar dúvidas</span>
  </a>

</div>

<style>
  /* Base Animators */
  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(30px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes gradient-slow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  @keyframes float-slow {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(5deg); }
  }
  @keyframes float-fast {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-15px) rotate(-5deg); }
  }
  @keyframes pulse-slow {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.05); }
  }
  @keyframes shine {
    100% { transform: translateX(150%) skew(-20deg); }
  }

  /* Classes */
  .animate-fade-in-up {
    animation: fade-in-up 1s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .animate-fade-in {
    animation: fade-in 0.4s ease-out both;
  }
  .animate-gradient-slow {
    background-size: 200% 200%;
    animation: gradient-slow 6s ease infinite;
  }
  .animate-float-slow {
    animation: float-slow 8s ease-in-out infinite;
  }
  .animate-float-fast {
    animation: float-fast 5s ease-in-out infinite;
  }
  .animate-pulse-slow {
    animation: pulse-slow 6s ease-in-out infinite;
  }
  .animate-shine {
    animation: shine 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  /* Utility Delays */
  .delay-100 { animation-delay: 0.1s; }
  .delay-200 { animation-delay: 0.2s; }
  .delay-300 { animation-delay: 0.3s; }

  /* Premium Hover Glow utility */
  .box-hover-glow:hover {
    box-shadow: 0 20px 60px -15px rgba(251, 191, 36, 0.1), 0 0 30px rgba(236, 72, 153, 0.1);
  }

  ::-webkit-scrollbar {
    width: 8px;
  }
  ::-webkit-scrollbar-track {
    background: #06040A;
  }
  ::-webkit-scrollbar-thumb {
    background: #2a1f3d;
    border-radius: 4px;
  }
</style>
