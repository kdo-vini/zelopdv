<script>
  import { Check } from 'lucide-svelte';
</script>

<section id="pricing" class="py-24 relative" style="background: var(--bg-panel);">
  <div class="max-w-4xl mx-auto px-6 text-center">
    <div class="mb-12">
      <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">Um preço. Tudo dentro.</h2>
      <p class="text-lg" style="color: var(--text-muted);">Sem letra miúda. Sem surpresa no fim do mês.</p>
    </div>

    <div class="relative max-w-lg mx-auto">
      <div
        class="relative rounded-2xl p-8 md:p-12 border-2 transition-shadow hover:shadow-[0_12px_24px_-8px_rgba(2,132,199,0.40)]"
        style="background: var(--bg-card); border-color: var(--primary);"
      >
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
          <p class="text-sm text-sky-300/80">30 dias pra testar. Se não rolar, é só cancelar.</p>
        </div>

        <ul class="space-y-4 text-left mb-10 max-w-xs mx-auto">
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300">
              <Check class="size-3.5" aria-hidden="true" />
            </div>
            <span>Vendas Ilimitadas</span>
          </li>
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300">
              <Check class="size-3.5" aria-hidden="true" />
            </div>
            <span>Controle de Estoque e Fiado</span>
          </li>
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300">
              <Check class="size-3.5" aria-hidden="true" />
            </div>
            <span>Controle de lucro e despesa</span>
          </li>
          <li class="flex items-center gap-3 text-slate-200">
            <div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300">
              <Check class="size-3.5" aria-hidden="true" />
            </div>
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
          Sem cartão. Cancele a qualquer hora.
        </p>
      </div>

      <div class="mt-6 max-w-lg mx-auto text-center">
        <p class="text-sm" style="color: var(--text-label);">
          Precisa de <strong style="color: var(--text-main);">cardápio online</strong> publicado do estoque?
          <a href="/extensoes#menu" class="text-sky-400 hover:text-sky-300 underline underline-offset-2">ZeloMenu +R$ 40/mês</a>
          ·
          <a href="/extensoes#mesas" class="text-sky-400 hover:text-sky-300 underline underline-offset-2">Mesas +R$ 30/mês</a>
          ·
          <a href="/extensoes#acessos" class="text-sky-400 hover:text-sky-300 underline underline-offset-2">Acessos +R$ 30/mês</a>
        </p>
      </div>
    </div>
  </div>
</section>
