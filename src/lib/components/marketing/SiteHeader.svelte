<script>
  import { page } from '$app/stores';
  import { Menu, Sparkles, X } from 'lucide-svelte';

  // Quando uma página tem banner promocional ABOVE the nav (ex: homepage Easter banner),
  // passa 'top-9' ou similar. Default 'top-0'.
  export let topOffset = 'top-0';
  export let easterDays = 0;
  // Páginas com seções #features/#pricing/#faq próprias (ex: landings de segmento)
  // passam true pra não mandar o visitante de volta pra home.
  export let localAnchors = false;

  let showMobileMenu = false;

  // Hash anchors só funcionam quando a seção existe na própria página. Senão, /#anchor.
  $: useLocal = localAnchors || $page.url.pathname === '/';
  $: featuresHref = useLocal ? '#features' : '/#features';
  $: pricingHref = useLocal ? '#pricing' : '/#pricing';
  $: faqHref = useLocal ? '#faq' : '/#faq';
</script>

<!-- NAV (Simples e Flutuante) -->
<nav class="fixed {topOffset} w-full z-50 transition-all duration-300 border-b border-white/5 backdrop-blur-md" style="background: color-mix(in srgb, var(--bg-app) 80%, transparent);">
  <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <a href="/" class="flex items-center gap-2">
        <img src="/logo-horizontal.webp" alt="Zelo PDV" class="h-32 md:h-40 w-auto" />
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
      {#if easterDays > 0}
        <a href="/pascoa" class="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium hover:bg-sky-500/15 transition-colors">
          <Sparkles class="size-3.5" aria-hidden="true" />
          <span>Páscoa em {easterDays} {easterDays === 1 ? 'dia' : 'dias'}</span>
        </a>
      {/if}
      <a href="/login" class="text-sm font-medium text-white hover:text-sky-400 transition-colors hidden md:block">Entrar</a>
      <!-- CTA do header: só desktop. Em mobile o usuário tem o CTA grande na hero + opção dentro do menu. -->
      <a href="/cadastro" class="hidden md:inline-block px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all hover:scale-105 active:scale-95">
        Testar 14 dias grátis
      </a>
      <!-- Hamburger button (mobile only) -->
      <button
        class="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white transition-colors"
        aria-label={showMobileMenu ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={showMobileMenu}
        on:click={() => showMobileMenu = !showMobileMenu}
      >
        {#if showMobileMenu}
          <X class="size-5" aria-hidden="true" />
        {:else}
          <Menu class="size-5" aria-hidden="true" />
        {/if}
      </button>
    </div>
  </div>

  <!-- Mobile menu panel -->
  {#if showMobileMenu}
    <div class="md:hidden border-t border-white/5 backdrop-blur-md px-6 py-4 flex flex-col gap-4" style="background: color-mix(in srgb, var(--bg-app) 95%, transparent);">
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
