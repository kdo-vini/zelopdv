<section id="pricing" class="py-24 relative" style="background: var(--bg-panel);">
  <div class="max-w-4xl mx-auto px-6 text-center">
    <div class="mb-12">
      <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">Preço Único. Tudo Incluso.</h2>
      <p class="text-lg" style="color: var(--text-muted);">Sem pegadinhas, sem taxas extras de surpresa.</p>
    </div>

    <div class="relative max-w-lg mx-auto">
      <div class="absolute -inset-1 bg-linear-to-r from-sky-500 to-blue-600 rounded-2xl blur-sm opacity-30 animate-pulse"></div>

      <div class="relative rounded-2xl p-8 md:p-12 shadow-2xl animate-border-gradient" style="background: var(--bg-card);">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <span class="bg-sky-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-sky-500/40 tracking-wide uppercase">
            Plano Único
          </span>
        </div>

        <p class="font-medium mb-1" style="color: var(--text-label);">Acesso Completo</p>
        <div class="flex justify-center items-baseline gap-1 mb-6">
          <span class="text-2xl" style="color: var(--text-muted);">R$</span>
          <span class="text-6xl font-bold text-white tracking-tight">59</span>
          <span class="text-xl" style="color: var(--text-muted);">/mês</span>
        </div>

        <div class="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4 mb-8">
          <p class="text-sky-400 font-bold text-lg">30 Dias Grátis</p>
          <p class="text-sm text-sky-300/80">Teste por 30 dias. Se não amar, não paga.</p>
        </div>

        <ul class="space-y-4 text-left mb-10 max-w-xs mx-auto">
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</div>
            <span>Vendas Ilimitadas</span>
          </li>
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</div>
            <span>Controle de Estoque e Fiado</span>
          </li>
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</div>
            <span>Gestão Financeira (Lucro)</span>
          </li>
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</div>
            <span>Suporte via WhatsApp</span>
          </li>
        </ul>

        <a
          href="/cadastro"
          class="block w-full text-center py-4 text-lg font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-lg shadow-sky-900/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Começar teste gratuito
        </a>
        <p class="text-xs text-center mt-3" style="color: var(--text-muted);">
          Sem cartão de crédito necessário. Cancele quando quiser.
        </p>
      </div>
    </div>
  </div>
</section>

<style>
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
    background: conic-gradient(from var(--border-angle), transparent 20%, var(--primary) 80%, transparent 100%);
    -webkit-mask: linear-gradient(var(--primary-text) 0 0) content-box, linear-gradient(var(--primary-text) 0 0);
    mask: linear-gradient(var(--primary-text) 0 0) content-box, linear-gradient(var(--primary-text) 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: border-rotate 4s linear infinite;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-border-gradient::before {
      animation: none !important;
    }
  }
</style>
