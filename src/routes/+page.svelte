<svelte:head>
  <title>Zelo PDV - Sistema PDV simples para Lanchonetes</title>
  <meta name="description" content="Sistema PDV para lanchonete simples e direto ao ponto. Controle caixa, pedidos, estoque e fiado em segundos. Teste grátis o sistema ideal para lanchonetes e pequenos comércios." />
  <meta name="keywords" content="sistema PDV, PDV para lanchonete, sistema para lanchonete, controle de caixa, sistema de vendas simples, lanchonete, hamburgueria, mercadinho, PDV grátis" />
  <meta name="robots" content="index, follow" />
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/" />
  <meta property="og:title" content="Zelo PDV - Sistema PDV simples para Lanchonetes" />
  <meta property="og:description" content="Controle pedidos, estoque e caixa em segundos. Ideal para lanchonetes e pequenos comércios." />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.jpg" />

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content="https://zelopdv.com.br/" />
  <meta property="twitter:title" content="Zelo PDV - Simples e Direto ao Ponto" />
  <meta property="twitter:description" content="O sistema de caixa que coloca ordem no seu negócio. Controle de vendas, gestão de fiado e relatórios financeiros em um só lugar." />
  <meta property="twitter:image" content="https://zelopdv.com.br/og-image.jpg" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Zelo PDV",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "59.00",
      "priceCurrency": "BRL",
      "priceValidUntil": "2025-12-31"
    },
    "description": "Sistema de gestão e frente de caixa para pequenos negócios."
  }
  </script>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  
  // Efeito de Parallax suave no mouse
  let mouseX = 0;
  let mouseY = 0;
  
  function handleMouseMove(event) {
    mouseX = event.clientX / window.innerWidth - 0.5;
    mouseY = event.clientY / window.innerHeight - 0.5;
  }

  function handleSpotlight(e) {
    const card = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;

    requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
    });
  }
</script>

<div class="min-h-screen bg-[#0B0F19] text-slate-300 font-sans selection:bg-sky-500/30 selection:text-sky-200 overflow-x-hidden" on:mousemove={handleMouseMove}>
  
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
      </div>
    </div>
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

      <!-- MOCKUP DASHBOARD 3D -->
      <div class="mt-20 relative group">
        <!-- Mockup Container with Glow -->
        <div class="relative mx-auto max-w-5xl rounded-xl border border-white/10 shadow-2xl shadow-sky-900/40 overflow-hidden transform transition-transform duration-700 hover:scale-[1.01]">
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
          <div class="bg-[#161b22] aspect-[16/9] md:aspect-auto">
            <picture>
              <source srcset="/images/screenshots/dashboard-desktop.png" media="(min-width: 768px)">
              <img src="/images/screenshots/dashboard-desktop.png" alt="Tela de Vendas do Zelo PDV para Lanchonetes" class="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity" />
            </picture>
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
        <span class="text-lg font-bold text-white flex items-center gap-2">� Hamburguerias</span>
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
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-sky-900/20">
           <img src="/images/screenshots/sales-screen.png" alt="Tela de Vendas Lanchonete" class="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURE 2: FINANCEIRO (IMG Esquerda, Texto Direita) -->
  <section class="py-24 relative bg-white/[0.02]">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
      <div class="order-2 lg:order-1 relative group">
        <div class="absolute inset-0 bg-emerald-500/20 blur-[80px] rounded-full -z-10 group-hover:bg-emerald-500/30 transition-all duration-700"></div>
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-emerald-900/20">
           <img src="/images/screenshots/financial-screen.png" alt="Tela de Controle de Caixa Lanchonete" class="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity" />
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
        <div class="rounded-2xl border border-white/10 bg-[#121620] shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-amber-900/20">
           <img src="/images/screenshots/customers-screen.png" alt="Tela de Controle de Fiado Clientes" class="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity" />
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
             <span class="bg-sky-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-sky-500/40 tracking-wide uppercase">Oferta Especial</span>
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
            Testar 7 dias grátis
          </a>
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
          <div class="px-6 pb-6 text-slate-400 leading-relaxed">
            Você cria a conta e cadastra seu cartão para ativar o período de teste. A cobrança só inicia após 7 dias. Se cancelar antes, não paga nada.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Consigo emitir Nota Fiscal?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed">
             O foco do Zelo PDV é gestão gerencial e controle interno (não fiscal) para MEIs e pequenos negócios que não são obrigados a emitir NFC-e em todas as vendas. Emitimos recibos e comprovantes não fiscais.
          </div>
        </details>

        <details class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
          <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none">
            <span>Se eu tiver dúvidas, tem suporte?</span>
            <svg class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </summary>
          <div class="px-6 pb-6 text-slate-400 leading-relaxed">
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
    animation: fade-in-up 0.8s ease-out forwards;
    opacity: 0; /* Default hidden */
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
</style>
