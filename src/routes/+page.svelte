<svelte:head>
  <title>Zelo PDV — Frente de caixa moderna para micro e pequenos</title>
  <meta name="description" content="Zelo PDV: vendas rápidas, fiado simples, estoque crítico, movimentações de caixa e relatórios leves. Comece em minutos." />
</svelte:head>

<!-- HERO -->
<section class="pt-16 pb-20 relative overflow-hidden">
  <div class="absolute inset-0 -z-10 bg-gradient-to-br from-sky-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800"></div>
  <div class="mx-auto max-w-7xl px-4">
    <div class="grid lg:grid-cols-12 gap-10 items-center">
      <div class="lg:col-span-7">
        <h1 class="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] text-slate-900 dark:text-white">
          PDV rápido. Gestão sem atrito.
        </h1>
        <p class="mt-5 text-lg text-slate-600 dark:text-slate-300 max-w-xl">
          Vendas em segundos, controle de vendas, estoque crítico, sangria e suprimento, fechamento confiável e painel diário.
        </p>
        <div class="mt-7 flex flex-wrap gap-4">
          <a href="/cadastro" class="btn-primary text-base px-6 py-3">Criar conta</a>
          <a href="/login" class="btn-secondary text-base px-6 py-3">Acessar</a>
          <div class="flex items-center text-sm text-slate-500 dark:text-slate-400 gap-2">
            <span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>Online</span>
            <span>R$ 59/mês fixo</span>
          </div>
        </div>
        <div class="mt-6 text-xs text-slate-500 dark:text-slate-400">Sem taxa de instalação. Cancelamento a qualquer momento.</div>
      </div>
      <!-- MOCK UI PREVIEW -->
      <div class="lg:col-span-5">
        <div class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/80 backdrop-blur p-4 shadow-lg space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-xs uppercase tracking-wide text-slate-500">Caixa Aberto</div>
            <div class="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">R$ 438,05 esperado</div>
          </div>
          <div class="grid grid-cols-3 gap-3 text-xs">
            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <div class="text-slate-500">Dinheiro</div>
              <div class="mt-1 font-semibold text-slate-900 dark:text-white">R$ 237,60</div>
            </div>
            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <div class="text-slate-500">Cartão</div>
              <div class="mt-1 font-semibold text-slate-900 dark:text-white">R$ 481,50</div>
            </div>
            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <div class="text-slate-500">Pix</div>
              <div class="mt-1 font-semibold text-slate-900 dark:text-white">R$ 461,99</div>
            </div>
          </div>
          <div class="rounded-md border border-slate-200 dark:border-slate-600 p-3 text-xs flex items-center justify-between">
            <div>
              <div class="text-slate-500">Fiado (saldo)</div>
              <div class="font-semibold text-slate-900 dark:text-white">R$ 312,00</div>
            </div>
            <button class="px-3 py-1 rounded bg-sky-600 text-white text-[11px] hover:bg-sky-700">Registrar Pagamento</button>
          </div>
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-3 rounded-lg border border-slate-200 dark:border-slate-600">
              <div class="text-slate-500">Estoque crítico</div>
              <div class="mt-1 font-semibold text-sky-600 dark:text-sky-400">5 itens</div>
              <div class="mt-1 text-[10px] text-slate-400">Repor hoje para evitar ruptura.</div>
            </div>
            <div class="p-3 rounded-lg border border-slate-200 dark:border-slate-600">
              <div class="text-slate-500">Atividade</div>
              <div class="mt-1 font-semibold text-slate-900 dark:text-white">14 eventos</div>
              <div class="mt-1 text-[10px] text-slate-400">Vendas + sangrias + suprimentos.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FUNCIONALIDADES CHAVE -->
<section class="py-20">
  <div class="mx-auto max-w-7xl px-4">
    <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Tudo essencial. Nada supérfluo.</h2>
    <p class="mt-3 text-slate-600 dark:text-slate-300 max-w-2xl text-sm">Construído para quem precisa operar, não configurar eternamente. Foco em velocidade, clareza e confiabilidade.</p>
    <div class="mt-10 grid md:grid-cols-3 gap-6">
      <div class="group p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-lg transition">
        <h3 class="font-semibold mb-2 flex items-center gap-2"><span class="w-2 h-2 bg-sky-600 rounded-full"></span> Frente de Caixa ágil</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Busca instantânea, atalhos de teclado e total já destacado. Finalize em segundos.</p>
      </div>

      
      <div class="group p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-lg transition">
        <h3 class="font-semibold mb-2 flex items-center gap-2"><span class="w-2 h-2 bg-sky-600 rounded-full"></span> Estoque crítico</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Indicadores de ruptura e itens críticos (≤3) para reposição inteligente.</p>
      </div>
      <div class="group p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-lg transition">
        <h3 class="font-semibold mb-2 flex items-center gap-2"><span class="w-2 h-2 bg-sky-600 rounded-full"></span> Caixa transparente</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Troco inicial, vendas por forma, sangrias e suprimentos integrados no esperado.</p>
      </div>
      <div class="group p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-lg transition">
        <h3 class="font-semibold mb-2 flex items-center gap-2"><span class="w-2 h-2 bg-sky-600 rounded-full"></span> Dashboard diário</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">KPIs do dia: ticket médio, atividade recente, alertas de estoque e horas de caixa aberto.</p>
      </div>
      <div class="group p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-lg transition">
        <h3 class="font-semibold mb-2 flex items-center gap-2"><span class="w-2 h-2 bg-sky-600 rounded-full"></span> Relatórios leves</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Exportação CSV de vendas e itens + histórico de fechamentos (30 dias).</p>
      </div>
    </div>
  </div>
</section>

<!-- PROVA SOCIAL / BENEFÍCIOS EXPANDIDOS -->
<section class="py-14 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
  <div class="mx-auto max-w-7xl px-4">
    <div class="grid md:grid-cols-3 gap-6">
      <div class="p-6 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div class="text-4xl font-bold text-sky-600 dark:text-sky-400">40%</div>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">menos tempo fechando caixa ao fim do dia.</p>
        <p class="mt-3 text-[11px] text-slate-400">Estudos de PMEs — Capterra</p>
      </div>
      <div class="p-6 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div class="text-4xl font-bold text-sky-600 dark:text-sky-400">99%</div>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">acurácia no giro quando estoque crítico é monitorado.</p>
        <p class="mt-3 text-[11px] text-slate-400">NRF / Automação Varejo</p>
      </div>
      <div class="p-6 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div class="text-4xl font-bold text-sky-600 dark:text-sky-400">90%</div>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">redução de erros manuais em lançamentos simples.</p>
        <p class="mt-3 text-[11px] text-slate-400">Automação Comercial Brasil</p>
      </div>
    </div>
  </div>
</section>

<!-- FAQ CURTO -->
<section class="py-20">
  <div class="mx-auto max-w-4xl px-4">
    <h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-8">Perguntas rápidas</h2>
    <div class="space-y-6">
      <div>
        <h3 class="font-medium text-slate-900 dark:text-white">Posso cancelar quando quiser?</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">Sim. A assinatura é mensal e você cancela direto na plataforma de cobrança.</p>
      </div>
      <div>
        <h3 class="font-medium text-slate-900 dark:text-white">Como funciona o suporte?</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Suporte via WhatsApp e e-mail.
          WhatsApp:
          <a href="https://wa.me/5514991537503" target="_blank" rel="noopener" class="font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 whitespace-nowrap">(14) 99153-7503</a>
          • E-mail:
          <a href="mailto:techne.br@gmail.com" class="font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400">techne.br@gmail.com</a>.
          Prioridade para falhas operacionais.
        </p>
      </div>
      <div>
        <h3 class="font-medium text-slate-900 dark:text-white">Vocês integram com impressora?</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">Sim, emissão de recibo simplificado direto do navegador (80mm) já otimizada.</p>
      </div>
    </div>
  </div>
</section>

<!-- CTA FINAL -->
<section class="py-14 border-t border-slate-200 dark:border-slate-700">
  <div class="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-6">
    <div>
      <h2 class="text-3xl font-semibold text-slate-900 dark:text-white">Comece agora por R$ 59/mês</h2>
      <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Sem implantação, sem custo escondido. Tudo pronto em minutos.</p>
    </div>
    <div class="flex gap-3">
      <a href="/cadastro" class="btn-primary px-6 py-3">Criar conta</a>
      <a href="/login" class="btn-secondary px-6 py-3">Acessar</a>
    </div>
  </div>
</section>

<!-- CONTATO -->
<section class="py-8 border-t border-slate-200 dark:border-slate-700">
  <div class="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
    <div class="font-medium text-slate-900 dark:text-white">Contato</div>
    <div class="flex flex-wrap items-center gap-4">
      <a href="https://wa.me/5514991537503" target="_blank" rel="noopener" class="text-slate-700 hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-400">WhatsApp: <span class="whitespace-nowrap">(14) 99153-7503</span></a>
      <span class="hidden sm:block text-slate-300">•</span>
      <a href="mailto:techne.br@gmail.com" class="text-slate-700 hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-400">techne.br@gmail.com</a>
    </div>
  </div>
 </section>

<!-- STYLE -->
<style lang="postcss">
  :global(.btn-primary) {
    @apply inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-transparent rounded-md shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-50 active:scale-[.98];
  }
  :global(.btn-secondary) {
    @apply inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-[.98];
  }
</style>
