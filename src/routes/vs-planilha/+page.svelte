<svelte:head>
  <title>Zelo PDV vs Planilha de Excel — Por que trocar para um sistema PDV?</title>
  <meta name="description" content="Ainda controlando sua lanchonete numa planilha de Excel? Veja por que um sistema PDV específico para lanchonetes economiza tempo, evita erros e mostra seu lucro real." />
  <meta name="keywords" content="sistema pdv vs planilha excel, controlar lanchonete no excel, planilha de vendas lanchonete, substituir planilha por sistema pdv" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/vs-planilha" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://zelopdv.com.br/vs-planilha" />
  <meta property="og:title" content="Zelo PDV vs Planilha de Excel — Por que trocar?" />
  <meta property="og:description" content="Ainda controlando sua lanchonete numa planilha? Veja o que você está perdendo e por que um sistema PDV dedicado muda o jogo." />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="Zelo PDV" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Zelo PDV vs Planilha de Excel" />
  <meta name="twitter:description" content="Ainda controlando sua lanchonete numa planilha? Veja o que você está perdendo." />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  <!-- Article Schema -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Zelo PDV vs Planilha de Excel: Por que trocar para um sistema PDV?",
    "description": "Comparação entre usar planilha de Excel e um sistema PDV dedicado para lanchonetes e pequenos negócios. Descubra o que você está perdendo.",
    "url": "https://zelopdv.com.br/vs-planilha",
    "datePublished": "2026-04-01",
    "dateModified": "2026-04-15",
    "author": { "@type": "Organization", "name": "Téchne Sistemas" },
    "publisher": {
      "@type": "Organization",
      "name": "Téchne Sistemas",
      "logo": { "@type": "ImageObject", "url": "https://zelopdv.com.br/favicon.png" }
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": "https://zelopdv.com.br/vs-planilha" }
  })}</script>`}

  <!-- FAQPage Schema -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Vale a pena trocar a planilha de Excel por um sistema PDV?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sim, especialmente se você registra mais de 10 vendas por dia. Um sistema PDV registra vendas em segundos (sem digitar), controla o estoque automaticamente, calcula o lucro real cruzando despesas com receita, e funciona no celular sem precisar de arquivo compartilhado. A planilha exige digitação manual e não avisa quando o estoque acaba."
        }
      },
      {
        "@type": "Question",
        "name": "Quanto tempo leva para migrar da planilha para o Zelo PDV?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Em média 15 a 30 minutos. Você cadastra seus produtos (ou importa de uma lista), configura as categorias e já está pronto para vender. Não precisa instalar nada — o sistema roda direto no navegador."
        }
      },
      {
        "@type": "Question",
        "name": "Preciso ter computador para usar o Zelo PDV?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Não. O Zelo PDV funciona em qualquer celular, tablet ou computador com Chrome ou Edge. Muitos lanchonetes usam só o celular no balcão. O sistema também funciona offline e sincroniza quando a internet voltar."
        }
      }
    ]
  })}</script>`}

  <!-- SoftwareApplication Schema -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Zelo PDV",
    "url": "https://zelopdv.com.br",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web Browser, Android, iOS",
    "offers": {
      "@type": "Offer",
      "price": "59.00",
      "priceCurrency": "BRL",
      "priceValidUntil": "2027-12-31",
      "availability": "https://schema.org/InStock"
    }
  })}</script>`}
</svelte:head>

<script>
  import SiteHeader from "$lib/components/marketing/SiteHeader.svelte";
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import { resolveAppIcon } from '$lib/icons/appIcons';
  import { ArrowRight, ChevronDown, CircleCheckBig, CircleX, Sheet, Zap } from 'lucide-svelte';

  const comparisonRows = [
    { feature: 'Registrar uma venda', excel: 'Digitar manualmente na célula', zelo: 'Toque no produto — feito em 3 segundos', excelhit: false },
    { feature: 'Controle de fiado', excel: 'Outra aba ou caderno separado', zelo: 'Integrado com histórico e limite de crédito', excelhit: false },
    { feature: 'Acesso pelo celular', excel: 'Arquivo pesado, difícil de usar', zelo: 'App PWA, funciona em qualquer tela', excelhit: false },
    { feature: 'Fechamento de caixa', excel: 'Contar na mão e calcular fórmulas', zelo: 'Conferência automática e conferência cega', excelhit: false },
    { feature: 'Relatório de lucro real', excel: 'Só se você lançar tudo certo', zelo: 'Automático: vendas menos despesas', excelhit: false },
    { feature: 'Estoque atualizado', excel: 'Não — precisa lançar manualmente', zelo: 'Descontado a cada venda automaticamente', excelhit: false },
    { feature: 'Funcionamento offline', excel: 'Depende do arquivo salvo localmente', zelo: 'PWA — funciona sem internet', excelhit: false },
    { feature: 'Suporte quando travar', excel: 'Você resolve sozinho', zelo: 'WhatsApp em horário comercial', excelhit: false },
  ];

  const painPoints = [
    {
      icon: '⏳',
      title: 'Tempo perdido toda semana',
      body: 'Cada venda precisa ser digitada na planilha. No rush do almoço, isso não acontece — e no fim do dia você passa horas tentando lembrar o que vendeu.'
    },
    {
      icon: 'compareFail',
      title: 'Erro humano silencioso',
      body: 'Uma célula errada, uma fórmula quebrada ou uma aba desatualizada e seu "lucro" vira mentira. Você pode estar perdendo dinheiro sem saber.'
    },
    {
      icon: 'smartphone',
      title: 'Não funciona no celular de verdade',
      body: 'Abrir Excel no celular no meio do atendimento é inviável. Então você vai para o papel ou o caderno — e volta à estaca zero.'
    }
  ];

  function openSupportChat() {
    window.dispatchEvent(new CustomEvent('zelo:open-support-chat'));
  }
</script>

<div class="min-h-screen font-sans overflow-x-hidden" style="background: var(--bg-app); color: var(--text-label);">
  <SiteHeader />

  <!-- HERO -->
  <section class="relative pt-40 pb-20 overflow-hidden border-b border-white/5">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-xs font-semibold mb-6">
        Comparação Honesta
      </div>
      <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6" style="text-wrap: balance;">
        Ainda controlando sua lanchonete<br class="hidden md:block" />
        numa planilha?
      </h1>
      <p class="text-lg md:text-xl max-w-2xl mx-auto mb-5 md:mb-8 leading-relaxed" style="color: var(--text-muted);">
        A planilha foi feita para escritório. Seu negócio merece uma ferramenta feita para o balcão.
        Veja o que você está deixando para trás.
      </p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mb-3 md:mb-4">
        <a href="/cadastro" class="w-full sm:w-auto px-8 py-3.5 md:py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1 text-center">
          Testar 30 dias grátis — sem cartão
        </a>
        <a href="#comparacao" class="px-1 py-2 md:py-4 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4 transition-colors">
          Ver comparação
        </a>
      </div>
      <p class="text-xs md:text-sm" style="color: var(--text-muted);">
        30 dias grátis. Sem cartão, sem cobrança automática.
        <button type="button" on:click={openSupportChat} class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
          Tem dúvida? Fala com a gente.
        </button>
      </p>
    </div>
  </section>

  <!-- PAIN POINTS -->
  <section class="py-20 bg-white/2 border-y border-white/5">
    <div class="max-w-6xl mx-auto px-6">
      <h2 class="text-2xl md:text-3xl font-bold text-white text-center mb-12">
        O que acontece com quem usa planilha
      </h2>
      <div class="grid md:grid-cols-3 gap-6">
        {#each painPoints as point}
          <div class="p-6 rounded-2xl border border-white/5 bg-white/3">
            <div class="mb-4 text-sky-300">
              <svelte:component this={resolveAppIcon(point.icon)} class="size-8" aria-hidden="true" />
            </div>
            <h3 class="text-white font-semibold mb-2">{point.title}</h3>
            <p class="text-slate-400 text-sm leading-relaxed">{point.body}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- COMPARISON TABLE -->
  <section id="comparacao" class="py-24">
    <div class="max-w-5xl mx-auto px-6">
      <h2 class="text-2xl md:text-3xl font-bold text-white text-center mb-4">
        Planilha de Excel × Zelo PDV
      </h2>
      <p class="text-slate-400 text-center mb-12">Funcionalidade por funcionalidade, lado a lado.</p>

      <div class="rounded-2xl border border-white/10 overflow-hidden">
        <!-- Table header -->
        <div class="grid grid-cols-3 bg-white/5 border-b border-white/10">
          <div class="px-6 py-4 text-sm font-semibold text-slate-400">Funcionalidade</div>
          <div class="px-6 py-4 text-sm font-semibold text-slate-500 text-center border-l border-white/5">
            <span class="flex items-center justify-center gap-2">
              <Sheet class="size-4" aria-hidden="true" />
              Planilha Excel
            </span>
          </div>
          <div class="px-6 py-4 text-sm font-semibold text-sky-400 text-center border-l border-white/5">
            <span class="flex items-center justify-center gap-2">
              <Zap class="size-4" aria-hidden="true" />
              Zelo PDV
            </span>
          </div>
        </div>

        {#each comparisonRows as row, i}
          <div class="grid grid-cols-3 border-b border-white/5 {i % 2 === 0 ? 'bg-transparent' : 'bg-white/2'} hover:bg-white/4 transition-colors">
            <div class="px-6 py-4 text-sm text-white font-medium flex items-center">{row.feature}</div>
            <div class="px-6 py-4 border-l border-white/5">
              <div class="flex items-start gap-2">
                <CircleX class="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
                <span class="text-slate-500 text-xs leading-relaxed">{row.excel}</span>
              </div>
            </div>
            <div class="px-6 py-4 border-l border-white/5">
              <div class="flex items-start gap-2">
                <CircleCheckBig class="mt-0.5 size-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span class="text-slate-300 text-xs leading-relaxed">{row.zelo}</span>
              </div>
            </div>
          </div>
        {/each}

        <!-- Footer row -->
        <div class="grid grid-cols-3 bg-white/4">
          <div class="px-6 py-5 text-sm font-semibold text-white">Custo mensal</div>
          <div class="px-6 py-5 border-l border-white/5 text-center">
            <span class="text-slate-400 text-sm">Grátis — mas custa seu tempo</span>
          </div>
          <div class="px-6 py-5 border-l border-white/5 text-center">
            <span class="text-emerald-400 font-bold text-lg">R$ 59/mês</span>
            <span class="block text-slate-500 text-xs mt-0.5">30 dias grátis para testar</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- MIGRAÇÃO -->
  <section class="py-20 bg-white/2 border-y border-white/5">
    <div class="max-w-2xl mx-auto px-6 text-center">
      <h2 class="text-xl md:text-2xl text-white font-bold leading-relaxed mb-4">
        Da planilha pro Zelo em 15 a 30 minutos
      </h2>
      <p class="text-slate-400 leading-relaxed mb-8">
        Cadastre seus produtos, configure as categorias e comece a vender. Não precisa instalar nada e ninguém pede seu cartão. Se travar em qualquer passo, chama no WhatsApp que a gente migra junto com você.
      </p>
      <a href="/cadastro" class="inline-flex items-center gap-2 px-8 py-3.5 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1">
        Começar agora — 30 dias grátis
        <ArrowRight class="size-4" aria-hidden="true" />
      </a>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="py-24">
    <div class="max-w-3xl mx-auto px-6">
      <h2 class="text-2xl md:text-3xl font-bold text-white text-center mb-12">Dúvidas sobre trocar a planilha</h2>

      <div class="space-y-4">
        <details class="group rounded-2xl border border-white/5 bg-white/2 hover:bg-white/4 transition-colors overflow-hidden">
          <summary class="flex items-center justify-between px-6 py-5 cursor-pointer list-none">
            <span class="font-semibold text-white text-sm">Vale a pena trocar a planilha de Excel por um sistema PDV?</span>
            <ChevronDown class="ml-4 size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-5 text-slate-400 text-sm leading-relaxed">
            Sim, especialmente se você registra mais de 10 vendas por dia. Um sistema PDV registra vendas em segundos (sem digitar), controla o estoque automaticamente, calcula o lucro real cruzando despesas com receita e funciona no celular sem precisar de arquivo compartilhado. A planilha exige digitação manual e não avisa quando o estoque acaba.
          </div>
        </details>

        <details class="group rounded-2xl border border-white/5 bg-white/2 hover:bg-white/4 transition-colors overflow-hidden">
          <summary class="flex items-center justify-between px-6 py-5 cursor-pointer list-none">
            <span class="font-semibold text-white text-sm">Quanto tempo leva para migrar da planilha para o Zelo PDV?</span>
            <ChevronDown class="ml-4 size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-5 text-slate-400 text-sm leading-relaxed">
            Em média 15 a 30 minutos. Você cadastra seus produtos, configura as categorias e já está pronto para vender. Não precisa instalar nada — o sistema roda direto no navegador. Se tiver dúvida no meio do caminho, o suporte via WhatsApp está disponível para ajudar.
          </div>
        </details>

        <details class="group rounded-2xl border border-white/5 bg-white/2 hover:bg-white/4 transition-colors overflow-hidden">
          <summary class="flex items-center justify-between px-6 py-5 cursor-pointer list-none">
            <span class="font-semibold text-white text-sm">Preciso ter computador para usar o Zelo PDV?</span>
            <ChevronDown class="ml-4 size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div class="px-6 pb-5 text-slate-400 text-sm leading-relaxed">
            Não. O Zelo PDV funciona em qualquer celular, tablet ou computador com Chrome ou Edge. Muitas lanchonetes usam apenas o celular no balcão. O sistema também funciona offline e sincroniza quando a internet voltar.
          </div>
        </details>
      </div>
    </div>
  </section>

  <!-- FINAL CTA -->
  <section class="py-20 relative overflow-hidden">
    <div class="absolute inset-0 bg-linear-to-br from-sky-900/30 via-transparent to-indigo-900/20 pointer-events-none"></div>
    <div class="max-w-3xl mx-auto px-6 text-center relative z-10">
      <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
        Pronto para deixar a planilha para trás?
      </h2>
      <p class="text-slate-400 text-lg mb-8">
        30 dias grátis. Sem cartão. Sem burocracia.
      </p>
      <a href="/cadastro" class="inline-flex items-center gap-2 px-10 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold text-lg shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1">
        Começar agora grátis
        <ArrowRight class="size-5" aria-hidden="true" />
      </a>
      <p class="text-xs md:text-sm" style="color: var(--text-muted);">
        30 dias grátis. Sem cartão, sem cobrança automática.
        <button type="button" on:click={openSupportChat} class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
          Tem dúvida? Fala com a gente.
        </button>
      </p>
    </div>
  </section>

  <MarketingFooter />
</div>
