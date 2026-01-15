<svelte:head>
  <title>Zelo PDV — Sistema de caixa simples para seu negócio</title>
  <meta name="description" content="Zelo PDV: venda rápido, controle o fiado, saiba o que está acabando e feche o caixa certinho. Comece em minutos." />
</svelte:head>

<script>
  export let params;
</script>

<!-- HERO com gradientes sutis -->
<section class="pt-16 pb-20 relative overflow-hidden">
  <!-- Gradientes de fundo -->
  <div class="absolute inset-0 -z-10 bg-gradient-to-br from-sky-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800"></div>
  <!-- Círculos de gradiente difusos -->
  <div class="absolute top-0 left-1/4 w-96 h-96 bg-sky-400/20 dark:bg-sky-500/10 rounded-full blur-3xl -z-10"></div>
  <div class="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-400/15 dark:bg-violet-500/10 rounded-full blur-3xl -z-10"></div>
  
  <div class="mx-auto max-w-7xl px-4">
    <div class="grid lg:grid-cols-12 gap-10 items-center">
      <div class="lg:col-span-7">
        <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-slate-900 dark:text-white">
          Venda rápido.<br/>
          <span class="text-sky-600 dark:text-sky-400">Controle fácil.</span>
        </h1>
        <p class="mt-5 text-lg text-slate-600 dark:text-slate-300 max-w-xl">
          O caixa do seu mercadinho, lanchonete ou loja na palma da mão. 
          Registre vendas, controle fiado, saiba o que está acabando e feche o caixa certinho — <strong>sem precisar de contador.</strong>
        </p>
        <div class="mt-7 flex flex-wrap gap-4">
          <a href="/cadastro" class="btn-primary text-base px-6 py-3">Testar 30 dias grátis</a>
          <a href="/login" class="btn-secondary text-base px-6 py-3">Já tenho conta</a>
        </div>
        <div class="mt-6 flex items-center text-sm text-slate-500 dark:text-slate-400 gap-4">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Sistema online
          </span>
          <span>✓ Sem cartão de crédito</span>
          <span>✓ Cancele quando quiser</span>
        </div>
      </div>
      
      <!-- MOCK UI PREVIEW com glassmorphism -->
      <div class="lg:col-span-5">
        <div class="rounded-2xl border border-white/20 dark:border-slate-600/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl p-5 shadow-2xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-xs uppercase tracking-wide font-medium text-slate-600 dark:text-slate-400">Caixa Aberto</div>
            <div class="text-xs px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 font-medium">R$ 438,05 esperado</div>
          </div>
          <div class="grid grid-cols-3 gap-3 text-xs">
            <div class="p-3 rounded-xl bg-white/80 dark:bg-slate-700/50 backdrop-blur border border-slate-200/50 dark:border-slate-600/30">
              <div class="text-slate-500 dark:text-slate-400">Dinheiro</div>
              <div class="mt-1 font-bold text-slate-900 dark:text-white">R$ 237,60</div>
            </div>
            <div class="p-3 rounded-xl bg-white/80 dark:bg-slate-700/50 backdrop-blur border border-slate-200/50 dark:border-slate-600/30">
              <div class="text-slate-500 dark:text-slate-400">Cartão</div>
              <div class="mt-1 font-bold text-slate-900 dark:text-white">R$ 481,50</div>
            </div>
            <div class="p-3 rounded-xl bg-white/80 dark:bg-slate-700/50 backdrop-blur border border-slate-200/50 dark:border-slate-600/30">
              <div class="text-slate-500 dark:text-slate-400">Pix</div>
              <div class="mt-1 font-bold text-slate-900 dark:text-white">R$ 461,99</div>
            </div>
          </div>
          <div class="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-900/20 p-3 text-xs flex items-center justify-between backdrop-blur">
            <div>
              <div class="text-amber-700 dark:text-amber-400 font-medium">Fiado pendente</div>
              <div class="font-bold text-amber-800 dark:text-amber-300">R$ 312,00</div>
            </div>
            <button class="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-medium hover:bg-amber-600 transition">Receber</button>
          </div>
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-3 rounded-xl bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/30 backdrop-blur">
              <div class="text-red-600 dark:text-red-400 font-medium">⚠️ Acabando</div>
              <div class="mt-1 font-bold text-red-700 dark:text-red-300">5 produtos</div>
              <div class="mt-1 text-[10px] text-red-500 dark:text-red-400">Repor antes de perder venda!</div>
            </div>
            <div class="p-3 rounded-xl bg-white/80 dark:bg-slate-700/50 border border-slate-200/50 dark:border-slate-600/30 backdrop-blur">
              <div class="text-slate-500 dark:text-slate-400">Hoje</div>
              <div class="mt-1 font-bold text-slate-900 dark:text-white">14 vendas</div>
              <div class="mt-1 text-[10px] text-slate-400">Ticket médio: R$ 31,29</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FUNCIONALIDADES com ícones SVG e glassmorphism -->
<section class="py-20 relative">
  <div class="mx-auto max-w-7xl px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Tudo que você precisa. Nada que confunde.</h2>
      <p class="mt-4 text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">Feito pra quem trabalha, não pra quem quer estudar sistema. Liga, vende, fecha o caixa.</p>
    </div>
    
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Card 1 -->
      <div class="group p-6 rounded-2xl border border-white/30 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
        <div class="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-2">Venda em segundos</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400">Digita o nome, clica, vende. Sem tela travada, sem esperar carregar. Simples assim.</p>
      </div>

      <!-- Card 2 -->
      <div class="group p-6 rounded-2xl border border-white/30 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
        <div class="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-2">Controle o fiado</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400">Anotou no caderno e esqueceu? Aqui não. Veja quem deve, quanto e desde quando.</p>
      </div>

      <!-- Card 3 -->
      <div class="group p-6 rounded-2xl border border-white/30 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
        <div class="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-2">Saiba o que está acabando</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400">O sistema avisa antes de faltar. Você repõe a tempo e não perde venda.</p>
      </div>

      <!-- Card 4 -->
      <div class="group p-6 rounded-2xl border border-white/30 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
        <div class="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-2">Feche o caixa certinho</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400">Sem sobrar nem faltar centavos. O sistema calcula tudo pra você conferir.</p>
      </div>

      <!-- Card 5 -->
      <div class="group p-6 rounded-2xl border border-white/30 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
        <div class="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-2">Relatórios simples</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400">Veja quanto vendeu por dia, semana ou mês. Baixe em Excel se precisar.</p>
      </div>

      <!-- Card 6 -->
      <div class="group p-6 rounded-2xl border border-white/30 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
        <div class="w-12 h-12 rounded-xl bg-pink-100 dark:bg-pink-900/50 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
        </div>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-2">Imprime recibo</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400">Impressora térmica de 58mm ou 80mm. Conecta no USB e imprima no navegador.</p>
      </div>
    </div>
  </div>
</section>

<!-- ESTATÍSTICAS com fundo diferenciado -->
<section class="py-16 relative overflow-hidden">
  <div class="absolute inset-0 bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-900/80"></div>
  <div class="mx-auto max-w-7xl px-4 relative">
    <div class="grid md:grid-cols-3 gap-6">
      <div class="p-6 rounded-2xl bg-white/70 dark:bg-slate-800/60 backdrop-blur-lg border border-white/50 dark:border-slate-700/50 text-center">
        <div class="text-5xl font-bold bg-gradient-to-r from-sky-500 to-sky-600 bg-clip-text text-transparent">40%</div>
        <p class="mt-3 text-slate-700 dark:text-slate-300 font-medium">menos tempo fechando caixa</p>
        <p class="mt-2 text-xs text-slate-500">Estudos com pequenos comércios</p>
      </div>
      <div class="p-6 rounded-2xl bg-white/70 dark:bg-slate-800/60 backdrop-blur-lg border border-white/50 dark:border-slate-700/50 text-center">
        <div class="text-5xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">Zero</div>
        <p class="mt-3 text-slate-700 dark:text-slate-300 font-medium">erros de troco quando confere</p>
        <p class="mt-2 text-xs text-slate-500">Clientes usando fechamento de caixa</p>
      </div>
      <div class="p-6 rounded-2xl bg-white/70 dark:bg-slate-800/60 backdrop-blur-lg border border-white/50 dark:border-slate-700/50 text-center">
        <div class="text-5xl font-bold bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">15 min</div>
        <p class="mt-3 text-slate-700 dark:text-slate-300 font-medium">pra configurar e começar</p>
        <p class="mt-2 text-xs text-slate-500">Sem instalação, sem treinamento</p>
      </div>
    </div>
  </div>
</section>

<!-- PREÇO -->
<section id="preco" class="py-20">
  <div class="mx-auto max-w-4xl px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold text-slate-900 dark:text-white">Sem surpresas na fatura</h2>
      <p class="mt-3 text-slate-600 dark:text-slate-400">Um preço só. Tudo incluso. Sem pegadinhas.</p>
    </div>
    
    <div class="relative">
      <!-- Badge -->
      <div class="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
        <span class="px-4 py-1.5 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 text-white text-sm font-medium shadow-lg">Mais popular</span>
      </div>
      
      <div class="p-8 rounded-3xl border-2 border-sky-500/50 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl shadow-2xl">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h3 class="text-2xl font-bold text-slate-900 dark:text-white">Acesso Completo</h3>
            <div class="mt-2 flex items-baseline gap-1">
              <span class="text-4xl font-bold text-sky-600 dark:text-sky-400">R$ 59</span>
              <span class="text-slate-500 dark:text-slate-400">/mês</span>
            </div>
            <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">Cobrado mensalmente. Cancele quando quiser.</p>
          </div>
          
          <div class="flex-1 md:max-w-sm">
            <ul class="space-y-3 text-sm">
              <li class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                Vendas ilimitadas
              </li>
              <li class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                Produtos ilimitados
              </li>
              <li class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                Fiado, estoque, relatórios
              </li>
              <li class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                Suporte via WhatsApp
              </li>
              <li class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                Atualizações automáticas
              </li>
            </ul>
          </div>
          
          <div class="md:text-right">
            <a href="/cadastro" class="inline-flex items-center justify-center w-full md:w-auto px-8 py-3 text-base font-medium text-white bg-sky-600 rounded-xl shadow-lg hover:bg-sky-700 transition-all hover:scale-105">
              Testar 30 dias grátis
            </a>
            <p class="mt-2 text-xs text-slate-500">Sem cartão de crédito</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ com fundo diferenciado -->
<section id="faq" class="py-20 bg-slate-900 dark:bg-slate-950">
  <div class="mx-auto max-w-4xl px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold text-white">Perguntas Frequentes</h2>
      <p class="mt-3 text-slate-400">Tire suas dúvidas antes de começar</p>
    </div>
    
    <div class="space-y-4">
      <details class="group rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
        <summary class="flex items-center justify-between cursor-pointer p-5 font-medium text-white hover:bg-slate-700/50 transition-colors">
          <span>Posso cancelar quando quiser?</span>
          <svg class="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="px-5 pb-5 text-sm text-slate-300">
          Sim! Sem fidelidade, sem multa. Cancela na hora pelo portal de pagamento.
        </div>
      </details>

      <details class="group rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
        <summary class="flex items-center justify-between cursor-pointer p-5 font-medium text-white hover:bg-slate-700/50 transition-colors">
          <span>Preciso instalar algo no computador?</span>
          <svg class="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="px-5 pb-5 text-sm text-slate-300">
          Não! Funciona no navegador (Chrome, Edge, etc). Abre o site, entra na conta e pronto.
        </div>
      </details>

      <details class="group rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
        <summary class="flex items-center justify-between cursor-pointer p-5 font-medium text-white hover:bg-slate-700/50 transition-colors">
          <span>Funciona no celular ou tablet?</span>
          <svg class="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="px-5 pb-5 text-sm text-slate-300">
          Funciona! Mas recomendamos computador ou tablet grande pra ficar mais confortável.
        </div>
      </details>

      <details class="group rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
        <summary class="flex items-center justify-between cursor-pointer p-5 font-medium text-white hover:bg-slate-700/50 transition-colors">
          <span>E se a internet cair?</span>
          <svg class="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="px-5 pb-5 text-sm text-slate-300">
          Precisa de internet pra funcionar. Recomendamos ter uma conexão estável ou 4G de backup.
        </div>
      </details>

      <details class="group rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
        <summary class="flex items-center justify-between cursor-pointer p-5 font-medium text-white hover:bg-slate-700/50 transition-colors">
          <span>Como peço ajuda se tiver problema?</span>
          <svg class="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="px-5 pb-5 text-sm text-slate-300">
          Manda mensagem no WhatsApp <strong>(14) 99153-7503</strong> ou e-mail. Respondemos rápido, principalmente se for urgente.
        </div>
      </details>

      <details class="group rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
        <summary class="flex items-center justify-between cursor-pointer p-5 font-medium text-white hover:bg-slate-700/50 transition-colors">
          <span>Demora muito pra configurar?</span>
          <svg class="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="px-5 pb-5 text-sm text-slate-300">
          Leva uns <strong>15 minutinhos</strong>. Cria a conta, cadastra seus produtos e já tá vendendo.
        </div>
      </details>
    </div>
  </div>
</section>

<!-- CTA FINAL -->
<section class="py-20 bg-gradient-to-r from-sky-600 via-sky-700 to-blue-700">
  <div class="mx-auto max-w-4xl px-4 text-center">
    <h2 class="text-3xl sm:text-4xl font-bold text-white">Pronto pra organizar seu caixa?</h2>
    <p class="mt-4 text-sky-100 text-lg max-w-xl mx-auto">30 dias grátis. Sem cartão. Comece agora e veja a diferença.</p>
    <div class="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/cadastro" class="inline-flex items-center justify-center px-10 py-4 text-lg font-semibold text-sky-700 bg-white rounded-xl shadow-2xl hover:bg-sky-50 transition-all hover:scale-105">
        Começar grátis
      </a>
      <a href="/login" class="inline-flex items-center justify-center px-10 py-4 text-lg font-medium text-white border-2 border-white/40 rounded-xl hover:bg-white/10 transition-colors">
        Já tenho conta
      </a>
    </div>
  </div>
</section>

<!-- CONTATO -->
<section id="contato" class="py-16 border-t border-slate-200 dark:border-slate-700">
  <div class="mx-auto max-w-6xl px-4">
    <div class="grid md:grid-cols-2 gap-12">
      <div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white">Fale Conosco</h2>
        <p class="mt-3 text-slate-600 dark:text-slate-400">Dúvida? Problema? Sugestão? A gente responde rápido.</p>
        
        <div class="mt-8 space-y-4">
          <a href="https://wa.me/5514991537503?text=Oi!%20Vim%20pelo%20site%20do%20Zelo%20PDV." 
             target="_blank" rel="noopener"
             class="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-400 hover:shadow-lg transition-all group">
            <div class="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <svg class="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">WhatsApp</div>
              <div class="text-sm text-slate-500">(14) 99153-7503</div>
            </div>
          </a>

          <a href="mailto:techne.br@gmail.com" 
             class="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sky-400 hover:shadow-lg transition-all group">
            <div class="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center">
              <svg class="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white group-hover:text-sky-600 transition-colors">E-mail</div>
              <div class="text-sm text-slate-500">techne.br@gmail.com</div>
            </div>
          </a>
        </div>
      </div>

      <div class="flex flex-col justify-center">
        <div class="p-6 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 class="font-semibold text-slate-900 dark:text-white mb-4">Horário de Atendimento</h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-slate-600 dark:text-slate-400">Segunda a Sexta</span>
              <span class="font-medium text-slate-900 dark:text-white">9h às 18h</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-600 dark:text-slate-400">Sábado</span>
              <span class="font-medium text-slate-900 dark:text-white">9h às 12h</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-600 dark:text-slate-400">Domingo</span>
              <span class="text-slate-500">Fechado</span>
            </div>
          </div>
          <div class="mt-6 pt-4 border-t border-slate-200 dark:border-slate-600">
            <p class="text-xs text-slate-500 dark:text-slate-400">
              💡 <strong>Problema urgente?</strong> Manda mensagem no WhatsApp descrevendo o problema. A gente prioriza!
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<style lang="postcss">
  :global(.btn-primary) {
    @apply inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-transparent rounded-lg shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all disabled:opacity-50 active:scale-[.98];
  }
  :global(.btn-secondary) {
    @apply inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all disabled:opacity-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-[.98];
  }
</style>
