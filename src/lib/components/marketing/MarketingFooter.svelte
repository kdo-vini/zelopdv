<script>
  import { page } from '$app/stores';

  export let variant = 'dark';

  $: isHomeRoute = $page.url.pathname === '/';
  $: featuresHref = isHomeRoute ? '#features' : '/#features';
  $: pricingHref = isHomeRoute ? '#pricing' : '/#pricing';
  $: faqHref = isHomeRoute ? '#faq' : '/#faq';
  $: isLight = variant === 'light';
</script>

<footer class:light={isLight}>
  <div class="footer-shell">
    <div class="footer-main">
      <div class="footer-brand">
        <img src="/logo-horizontal-cropped.webp" alt="Zelo PDV" width="144" height="45" loading="lazy" decoding="async" />
        <p>Seu caixa em ordem para você cuidar do negócio.</p>
      </div>

      <div>
        <h2>Produto</h2>
        <ul>
          <li><a href={featuresHref}>Funcionalidades</a></li>
          <li><a href={pricingHref}>Preços</a></li>
          <li><a href="/comparativos">Comparativos</a></li>
          <li><a href="/atualizacoes">Atualizações</a></li>
        </ul>
      </div>

      <div>
        <h2>Suporte</h2>
        <ul>
          <li><a href={faqHref}>Central de Ajuda</a></li>
          <li><a href="/contato?assunto=demo">Agendar demonstração</a></li>
          <li><a href="https://wa.me/5514991537503">Falar no WhatsApp</a></li>
          <li><a href="mailto:techne.br@gmail.com">Email</a></li>
        </ul>
      </div>

      <div>
        <h2>Legal</h2>
        <ul>
          <li><a href="/termos">Termos de Uso</a></li>
          <li><a href="/privacidade">Privacidade</a></li>
          <li><a href="https://instagram.com/techne.ia" target="_blank" rel="noopener noreferrer">@techne.ia</a></li>
        </ul>
      </div>
    </div>

    <div class="footer-bottom">
      <p>
        &copy; {new Date().getFullYear()} Téchne Sistemas. Todos os direitos reservados.
        <span>Techne Sistemas Tecnologia Da Informacao Ltda, CNPJ: 65.679.798/0001-95</span>
      </p>
      <strong>Feche o caixa sabendo o que sobrou.</strong>
    </div>
  </div>
</footer>

<style>
  footer {
    border-top: 1px solid var(--marketing-dark-border);
    background: var(--marketing-dark);
    color: var(--text-main);
  }

  footer.light {
    border-color: var(--blog-border);
    background: var(--blog-surface);
    color: var(--blog-text);
  }

  .footer-shell {
    width: min(100% - 3rem, 80rem);
    margin-inline: auto;
    padding-block: 4rem 2.5rem;
  }

  .footer-main {
    display: grid;
    grid-template-columns: minmax(16rem, 1.5fr) repeat(3, minmax(8rem, 0.5fr));
    gap: 3rem;
  }

  .footer-brand img {
    display: block;
    width: 9rem;
    height: 3.4rem;
    margin-bottom: 1.25rem;
    object-fit: contain;
  }

  .footer-brand p {
    max-width: 19rem;
    margin: 0;
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .light .footer-brand p {
    color: var(--blog-muted);
  }

  h2 {
    margin: 0 0 1rem;
    color: inherit;
    font-size: 0.875rem;
    font-weight: 750;
  }

  ul {
    display: grid;
    gap: 0.65rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
    transition: color 180ms ease;
  }

  .light a {
    color: var(--blog-muted);
  }

  a:hover {
    color: var(--link);
  }

  .light a:hover {
    color: var(--primary-hover);
  }

  .footer-bottom {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2rem;
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--marketing-dark-border);
  }

  .light .footer-bottom {
    border-color: var(--blog-border);
  }

  .footer-bottom p {
    max-width: 40rem;
    margin: 0;
    color: var(--marketing-dark-muted);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .light .footer-bottom p {
    color: var(--blog-muted);
  }

  .footer-bottom span {
    display: block;
    opacity: 0.72;
  }

  .footer-bottom strong {
    color: inherit;
    font-size: 1.125rem;
    text-align: right;
  }

  footer a:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }

  @media (max-width: 840px) {
    .footer-shell {
      width: min(100% - 2rem, 80rem);
    }

    .footer-main {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 2.5rem 1.5rem;
    }

    .footer-brand {
      grid-column: 1 / -1;
    }

    .footer-bottom {
      align-items: flex-start;
      flex-direction: column;
    }

    .footer-bottom strong {
      text-align: left;
    }
  }
</style>
