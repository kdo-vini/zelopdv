<script>
  import { page } from '$app/stores';

  // Quando uma página tem banner promocional ABOVE the nav (ex: homepage Easter banner),
  // passa 'top-9' ou similar. Default 'top-0'.
  export let topOffset = 'top-0';

  let showMobileMenu = false;

  // Hash anchors só funcionam na própria homepage. Em outras páginas, ir pra /#anchor.
  $: isHomeRoute = $page.url.pathname === '/';
  $: featuresHref = isHomeRoute ? '#features' : '/#features';
  $: pricingHref = isHomeRoute ? '#pricing' : '/#pricing';
  $: faqHref = isHomeRoute ? '#faq' : '/#faq';
</script>

<!-- NAV (Simples e Flutuante) -->
<nav class="fixed {topOffset} w-full z-50 transition-all duration-300 border-b border-white/5 bg-[#0B0F19]/80 backdrop-blur-md">
  <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <a href="/" class="flex items-center gap-2">
        <img src="/logo-horizontal.png" alt="Zelo PDV" class="h-32 md:h-40 w-auto" />
      </a>
    </div>

    <div class="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
      <a href={featuresHref} class="hover:text-white transition-colors">Funcionalidades</a>
      <a href="/extensoes" class="hover:text-white transition-colors">Extensões</a>
      <a href="/precificacao" class="hover:text-white transition-colors">Precificação</a>
      <a href="/blog" class="hover:text-white transition-colors">Blog</a>
      <a href={pricingHref} class="hover:text-white transition-colors">Preços</a>
      <a href={faqHref} class="hover:text-white transition-colors">Dúvidas</a>
    </div>

    <div class="flex items-center gap-4">
      <a href="/login" class="text-sm font-medium text-white hover:text-sky-400 transition-colors hidden md:block">Entrar</a>
      <!-- CTA do header: só desktop. Em mobile o usuário tem o CTA grande na hero + opção dentro do menu. -->
      <a href="/cadastro" class="hidden md:inline-block px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all hover:scale-105 active:scale-95">
        Testar 30 dias grátis
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
    <div class="md:hidden border-t border-white/5 bg-[#0B0F19]/95 backdrop-blur-md px-6 py-4 flex flex-col gap-4">
      <a href={featuresHref} class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Funcionalidades</a>
      <a href="/extensoes" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Extensões</a>
      <a href="/precificacao" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Precificação</a>
      <a href="/blog" class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Blog</a>
      <a href={pricingHref} class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Preços</a>
      <a href={faqHref} class="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2" on:click={() => showMobileMenu = false}>Dúvidas</a>
      <div class="mt-1 flex flex-col gap-2 pt-2 border-t border-white/10">
        <a href="/login" class="w-full text-center px-5 py-3 text-sm font-semibold text-white hover:text-sky-400 transition-colors" on:click={() => showMobileMenu = false}>
          Entrar
        </a>
        <a href="/cadastro" class="w-full text-center px-5 py-3 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all" on:click={() => showMobileMenu = false}>
          Testar grátis
        </a>
      </div>
    </div>
  {/if}
</nav>
