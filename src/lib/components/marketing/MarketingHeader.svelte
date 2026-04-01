<script>
  import { page } from '$app/stores';

  export let variant = 'dark';

  let showMobileMenu = false;

  $: isBlogRoute = $page.url.pathname.startsWith('/blog');
  $: navLinks = [
    { href: isBlogRoute ? '/#features' : '#features', label: 'Funcionalidades' },
    { href: '/blog', label: 'Blog' },
    { href: isBlogRoute ? '/#pricing' : '#pricing', label: 'Preços' },
    { href: isBlogRoute ? '/#faq' : '#faq', label: 'Dúvidas' }
  ];
  $: isLight = variant === 'light';
</script>

<nav
  class="fixed top-0 w-full z-50 border-b border-white/5 backdrop-blur-md"
  style={`background: ${isLight ? 'color-mix(in srgb, var(--blog-surface) 78%, transparent)' : 'var(--bg-app)'}; border-color: ${isLight ? 'var(--blog-border)' : 'rgba(255,255,255,0.05)'}`}
>
  <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
    <a href="/" class="flex items-center gap-2">
      <img src="/logo-horizontal.png" alt="Zelo PDV" class="h-32 md:h-40 w-auto" />
    </a>

    <div class="hidden md:flex items-center gap-8 text-sm font-medium">
      {#each navLinks as link}
        <a
          href={link.href}
          class="transition-colors"
          style={`color: ${isLight ? 'var(--blog-muted)' : 'var(--text-muted)'}`}
        >
          {link.label}
        </a>
      {/each}
    </div>

    <div class="flex items-center gap-4">
      <a
        href="/login"
        class="hidden md:block text-sm font-medium transition-colors hover:text-sky-400"
        style={`color: ${isLight ? 'var(--blog-text)' : 'white'}`}
      >
        Entrar
      </a>
      <a
        href="/cadastro"
        class="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all hover:scale-105 active:scale-95"
      >
        Testar 30 dias grátis
      </a>
      <button
        class="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border text-slate-300 transition-colors"
        aria-label={showMobileMenu ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={showMobileMenu}
        on:click={() => (showMobileMenu = !showMobileMenu)}
        style={`border-color: ${isLight ? 'var(--blog-border)' : 'rgba(255,255,255,0.1)'}; background: ${isLight ? 'var(--blog-surface)' : 'rgba(255,255,255,0.05)'}; color: ${isLight ? 'var(--blog-text)' : 'rgb(203 213 225)'}`}
      >
        {#if showMobileMenu}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        {:else}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        {/if}
      </button>
    </div>
  </div>

  {#if showMobileMenu}
    <div
      class="md:hidden border-t px-6 py-4 flex flex-col gap-4"
      style={`background: ${isLight ? 'var(--blog-surface)' : 'var(--bg-panel)'}; border-color: ${isLight ? 'var(--blog-border)' : 'rgba(255,255,255,0.05)'}`}
    >
      {#each navLinks as link}
        <a
          href={link.href}
          class="py-2 text-sm font-medium transition-colors"
          style={`color: ${isLight ? 'var(--blog-text)' : 'var(--text-label)'}`}
          on:click={() => (showMobileMenu = false)}
        >
          {link.label}
        </a>
      {/each}
      <div class="mt-1 flex flex-col gap-2 pt-2 border-t" style={`border-color: ${isLight ? 'var(--blog-border)' : 'rgba(255,255,255,0.1)'}`}>
        <a
          href="/login"
          class="w-full text-center px-5 py-3 text-sm font-semibold transition-colors hover:text-sky-400"
          style={`color: ${isLight ? 'var(--blog-text)' : 'white'}`}
          on:click={() => (showMobileMenu = false)}
        >
          Entrar
        </a>
        <a
          href="/cadastro"
          class="w-full text-center px-5 py-3 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-full shadow-lg shadow-sky-900/40 transition-all"
          on:click={() => (showMobileMenu = false)}
        >
          Testar grátis
        </a>
      </div>
    </div>
  {/if}
</nav>
