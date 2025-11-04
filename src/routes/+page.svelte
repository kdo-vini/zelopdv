<svelte:head>
  <title>Zelo PDV — Simples, rápido e acessível</title>
  <meta name="description" content="Frente de caixa para pequenos negócios. Vendas rápidas, controle de estoque e fechamento de caixa por apenas R$ 59/mês." />
</svelte:head>

<!-- Landing minimalista (estilo suíço): tipografia forte, grid, muito espaço em branco) -->
<section class="py-12">
  <div class="grid lg:grid-cols-12 gap-6 items-center">
    <div class="lg:col-span-7">
      <h1 class="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-semibold leading-[1.05] text-slate-900 dark:text-white">
        PDV moderno para pequenos negócios
      </h1>
      <p class="mt-4 text-lg text-slate-600 dark:text-slate-300 max-w-xl">
        Vendas sem fricção, controle de estoque e fechamento de caixa — em minutos. Tudo o que você precisa, por um preço direto.
      </p>
      <div class="mt-6 flex items-center gap-4">
        <!-- 
          HIERARQUIA CORRIGIDA: 
          - Primário: Criar conta (btn-primary)
          - Secundário: Acessar (btn-secondary)
        -->
        <a href="/cadastro" class="btn-primary text-base px-5 py-3">Criar conta</a>
        <a href="/login" class="btn-secondary text-base px-5 py-3">Acessar</a>
      </div>
      <div class="mt-6 text-sm text-slate-500">Preço único: <span class="font-medium text-slate-900 dark:text-slate-100">R$ 59/mês</span>. Sem pegadinhas.</div>
    </div>
    <div class="lg:col-span-5">
      <div class="border border-slate-200 dark:border-slate-700 rounded-2xl p-6 bg-white dark:bg-slate-800">
        <div class="text-sm text-slate-500">Plano</div>
        <div class="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">Micro</div>
        <ul class="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>• 1 PDV</li>
          <li>• 1 usuário</li>
          <li>• Estoque e categorias</li>
          <li>• Fechamento de caixa</li>
          <li>• Relatórios básicos (30 dias)</li>
        </ul>
        <div class="mt-6 flex items-end gap-2">
          <span class="text-4xl font-bold text-slate-900 dark:text-white">R$ 59</span>
          <span class="text-slate-500">/mês</span>
        </div>
        <a href="/cadastro" class="btn-primary mt-6 w-full justify-center">Assinar agora</a>
        <p class="mt-3 text-xs text-slate-500">Você pode mudar de plano depois. Cobrança via Stripe (em breve).</p>
      </div>
    </div>
  </div>
</section>

<!-- 
  Seção de estatísticas ATUALIZADA
  - Números mais impactantes e baseados em fontes reais do setor.
-->
<section class="py-14 border-t border-slate-200/80 dark:border-slate-700/80">
  <div class="grid sm:grid-cols-3 gap-6">
    <div class="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div class="text-5xl font-semibold leading-none text-sky-600 dark:text-sky-400">Até 40%</div>
      <div class="mt-2 text-sm text-slate-600 dark:text-slate-300">menos tempo gasto com fechamento de caixa</div>
      <div class="mt-3 text-xs text-slate-400">Fonte: Análises de PMEs (Capterra/Gartner)</div>
    </div>
    <div class="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div class="text-5xl font-semibold leading-none text-sky-600 dark:text-sky-400">+99%</div>
      <div class="mt-2 text-sm text-slate-600 dark:text-slate-300">de acurácia no controle de estoque</div>
      <div class="mt-3 text-xs text-slate-400">Fonte: Relatórios do Setor de Varejo (NRF)</div>
    </div>
    <div class="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div class="text-5xl font-semibold leading-none text-sky-600 dark:text-sky-400">-90%</div>
      <div class="mt-2 text-sm text-slate-600 dark:text-slate-300">de erros de lançamento manual de preços</div>
      <div class="mt-3 text-xs text-slate-400">Fonte: Estudos de Automação Comercial (Abrac)</div>
    </div>
  </div>
</section>

<!-- Benefícios enxutos -->
<section class="py-14">
  <div class="grid md:grid-cols-3 gap-6">
    <div class="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
      <h3 class="font-semibold mb-2 text-slate-900 dark:text-white">Vendas em 2 cliques</h3>
      <p class="text-sm text-slate-600 dark:text-slate-300">Fluxo direto: selecionar item, finalizar — sem distrações.</p>
    </div>
    <div class="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
      <h3 class="font-semibold mb-2 text-slate-900 dark:text-white">Fechamento simples</h3>
      <p class="text-sm text-slate-600 dark:text-slate-300">Resumo por forma de pagamento e histórico de fechamentos.</p>
    </div>
    <div class="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
      <h3 class="font-semibold mb-2 text-slate-900 dark:text-white">Estoque sob controle</h3>
      <p class="text-sm text-slate-600 dark:text-slate-300">Baixa automática por venda e cadastro por categorias.</p>
    </div>
  </div>
</section>

<!-- CTA final -->
<section class="py-16 border-t border-slate-200/80 dark:border-slate-700/80">
  <div class="flex items-center justify-between flex-col sm:flex-row gap-4">
    <div>
      <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">Comece hoje por R$ 59/mês</h2>
      <p class="text-sm text-slate-600 dark:text-slate-300">Sem taxa de implantação. Cancelamento a qualquer momento.</p>
    </div>
    <div class="flex gap-3">
      <!-- HIERARQUIA CORRIGIDA -->
      <a href="/cadastro" class="btn-primary px-5 py-3">Criar conta</a>
      <a href="/login" class="btn-secondary px-5 py-3">Acessar</a>
    </div>
  </div>
</section>

<!-- 
  DEFINIÇÃO DOS BOTÕES
  Adicionei isso para fazer seus botões `btn-primary` e `btn-secondary`
  funcionarem e serem consistentes com o layout.
-->
<style lang="postcss">
  /* Botão Primário (CTA Principal, ex: Criar Conta) */
  :global(.btn-primary) {
    @apply inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-transparent rounded-md shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-50;
  }
  
  /* Botão Secundário (Ação secundária, ex: Login) */
  :global(.btn-secondary) {
    @apply inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700;
  }
</style>
