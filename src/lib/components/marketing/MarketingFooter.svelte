<script>
  import { page } from '$app/stores';

  export let variant = 'dark';

  $: isBlogRoute = $page.url.pathname.startsWith('/blog');
  $: featuresHref = isBlogRoute ? '/#features' : '#features';
  $: pricingHref = isBlogRoute ? '/#pricing' : '#pricing';
  $: faqHref = isBlogRoute ? '/#faq' : '#faq';
  $: isLight = variant === 'light';
</script>

<footer
  class="py-12 border-t"
  style={`background: ${isLight ? 'var(--blog-surface)' : 'var(--bg-app)'}; border-color: ${isLight ? 'var(--blog-border)' : 'rgba(255,255,255,0.1)'}`}
>
  <div class="max-w-7xl mx-auto px-6">
    <div class="grid md:grid-cols-4 gap-8 mb-12">
      <div>
        <img src="/logo-horizontal.png" alt="Zelo PDV" class="h-32 md:h-40 w-auto" />
        <p class="text-sm leading-relaxed" style={`color: ${isLight ? 'var(--blog-muted)' : 'var(--text-muted)'}`}>
          Tecnologia simples para negócios de alimentação que precisam vender bem e entender o próprio lucro.
        </p>
      </div>

      <div>
        <h4 class="font-semibold mb-4" style={`color: ${isLight ? 'var(--blog-text)' : 'white'}`}>Produto</h4>
        <ul class="space-y-2 text-sm" style={`color: ${isLight ? 'var(--blog-muted)' : 'var(--text-muted)'}`}>
          <li><a href={featuresHref} class="transition-colors hover:text-sky-400">Funcionalidades</a></li>
          <li><a href={pricingHref} class="transition-colors hover:text-sky-400">Preços</a></li>
          <li><a href="/precificacao" class="transition-colors hover:text-sky-400">Precificação</a></li>
          <li><a href="/blog" class="transition-colors hover:text-sky-400">Blog</a></li>
          <li><a href="/atualizacoes" class="transition-colors hover:text-sky-400">Atualizações</a></li>
        </ul>
      </div>

      <div>
        <h4 class="font-semibold mb-4" style={`color: ${isLight ? 'var(--blog-text)' : 'white'}`}>Suporte</h4>
        <ul class="space-y-2 text-sm" style={`color: ${isLight ? 'var(--blog-muted)' : 'var(--text-muted)'}`}>
          <li><a href={faqHref} class="transition-colors hover:text-sky-400">Central de Ajuda</a></li>
          <li><a href="https://wa.me/5514991537503" class="transition-colors hover:text-sky-400">Falar no WhatsApp</a></li>
          <li><a href="mailto:techne.br@gmail.com" class="transition-colors hover:text-sky-400">Email</a></li>
        </ul>
      </div>

      <div>
        <h4 class="font-semibold mb-4" style={`color: ${isLight ? 'var(--blog-text)' : 'white'}`}>Legal</h4>
        <ul class="space-y-2 text-sm" style={`color: ${isLight ? 'var(--blog-muted)' : 'var(--text-muted)'}`}>
          <li><a href="/termos" class="transition-colors hover:text-sky-400">Termos de Uso</a></li>
          <li><a href="/privacidade" class="transition-colors hover:text-sky-400">Privacidade</a></li>
        </ul>
      </div>
    </div>

    <div
      class="border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs"
      style={`color: ${isLight ? 'var(--blog-muted)' : 'var(--text-muted)'}; border-color: ${isLight ? 'var(--blog-border)' : 'rgba(255,255,255,0.05)'}`}
    >
      <div>
        &copy; {new Date().getFullYear()} <a href="https://techneia.com.br" target="_blank" rel="noopener noreferrer" class={`transition-colors ${isLight ? 'hover:text-sky-600' : 'hover:text-white'}`}>Téchne Sistemas</a>. <br class="hidden md:block" />
        Todos os direitos reservados. <br class="hidden md:block" />
        <span class="opacity-60">Techne Sistemas Tecnologia Da Informacao Ltda — CNPJ: 65.679.798/0001-95</span>
      </div>
      <div class="flex gap-4">
        <a href="https://instagram.com/techne.ia" target="_blank" rel="noopener noreferrer" class={`transition-colors ${isLight ? 'hover:text-sky-600' : 'hover:text-white'}`}>@techne.ia</a>
      </div>
    </div>
  </div>
</footer>
