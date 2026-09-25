<script>
  import { page } from '$app/stores';
  import { ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL, ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL } from '$lib/zeloImpressaoClient.js';
  import SiteHeader from '$lib/components/marketing/SiteHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SocialMeta from '$lib/components/seo/SocialMeta.svelte';

  const downloadUrl = ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL;
  const canonicalUrl = ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL;

  const passos = [
    'Baixe o arquivo no computador onde a impressora está instalada.',
    'Se aparecer a tela azul de proteção do Windows (SmartScreen), clique em "Mais informações" no canto inferior esquerdo e depois em "Executar mesmo assim".',
    'Quando terminar, abra o Zelo Impressão. Se a janela sumir, ele continua aberto no ícone perto do relógio do Windows.',
    'Volte ao Zelo PDV ou ao ZeloChat. O sistema encontra o aplicativo e tenta conectar automaticamente; só digite o código se ele for solicitado.',
    'Escolha a sua impressora e clique em Imprimir teste.',
  ];

  $: downloadPending = $page.url.searchParams.get('download') === 'not-ready';
</script>

<svelte:head>
  <title>Zelo Impressão — passo a passo para instalar e configurar</title>
  <meta name="description" content="Veja o passo a passo para baixar, instalar, abrir e configurar o Zelo Impressão no Windows sem precisar de suporte técnico." />
  <link rel="canonical" href={canonicalUrl} />
</svelte:head>

<SocialMeta
  title="Zelo Impressão — passo a passo para instalar e configurar"
  description="Veja o passo a passo para baixar, instalar, abrir e configurar o Zelo Impressão no Windows sem precisar de suporte técnico."
  url={canonicalUrl}
/>

<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-mk-accent/30 selection:text-mk-ink"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <SiteHeader />

  <main>
    <section class="mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
      {#if downloadPending}
        <div class="mb-8 rounded-2xl border border-mk-warn/30 bg-mk-warn/10 px-5 py-4 text-sm text-mk-warn-soft">
          O link direto do instalador já está reservado em <strong class="text-mk-ink">zelopdv.com.br/downloads/zelo-impressao/latest/Zelo-Impressao-Setup.exe</strong>,
          mas o arquivo ainda não foi publicado nesta hospedagem. Assim que o `.exe` for enviado para esse path, o download passará a começar automaticamente por essa mesma URL.
        </div>
      {/if}

      <div class="max-w-3xl">
        <h1 class="mt-5 text-4xl font-black tracking-tight md:text-6xl">Zelo Impressão</h1>
        <p class="mt-4 max-w-2xl text-lg leading-relaxed" style="color: var(--text-muted);">
          Siga este passo a passo para instalar sozinho e deixar o <strong class="text-mk-ink">Zelo PDV</strong> e o <strong class="text-mk-ink">ZeloChat</strong>
          imprimindo automaticamente nesse computador.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a
            href={downloadUrl}
            class="inline-flex items-center justify-center rounded-full bg-mk-accent-strong px-6 py-3 text-sm font-semibold text-mk-on-accent shadow-xl shadow-mk-glow/30 transition hover:-translate-y-0.5 hover:bg-mk-accent"
          >Baixar instalador</a>
          <a
            href="/login"
            class="inline-flex items-center justify-center rounded-full border border-mk-ink/10 bg-mk-ink/5 px-6 py-3 text-sm font-semibold text-mk-ink-soft transition hover:bg-mk-ink/10"
          >Voltar ao Zelo PDV</a>
        </div>
        <p class="mt-3 text-sm" style="color: var(--text-muted);">
          Na primeira instalação, se aparecer a tela azul do Windows, clique em "Mais informações" e depois em "Executar mesmo assim".
        </p>
        <p class="mt-2 text-xs break-all" style="color: var(--text-muted);">Link direto oficial: {downloadUrl}</p>
      </div>

      <div class="mt-12 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <div class="rounded-3xl border p-6" style="background: var(--bg-card); border-color: var(--border-card);">
          <h2 class="text-xl font-bold text-mk-ink">Passo a passo</h2>
          <ol class="mt-5 grid gap-4">
            {#each passos as passo, index}
              <li class="flex gap-4 rounded-2xl border p-4" style="border-color: var(--border-card); background: var(--bg-panel);">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mk-accent/15 text-sm font-bold text-mk-highlight">{index + 1}</span>
                <p class="text-sm leading-6" style="color: var(--text-label);">{passo}</p>
              </li>
            {/each}
          </ol>
        </div>

        <div class="grid gap-6">
          <div class="rounded-3xl border p-6" style="background: var(--bg-card); border-color: var(--border-emerald);">
            <h3 class="text-lg font-bold text-mk-ink">Na primeira instalação</h3>
            <p class="mt-3 text-sm leading-6" style="color: var(--text-label);">
              Se aparecer a tela azul de proteção do Windows, clique em <strong class="text-mk-ink">"Mais informações"</strong> no canto inferior esquerdo e depois em <strong class="text-mk-ink">"Executar mesmo assim"</strong> para concluir a instalação.
            </p>
          </div>

          <div class="rounded-3xl border p-6" style="background: var(--bg-card); border-color: var(--border-amber);">
            <h3 class="text-lg font-bold text-mk-ink">Como abrir depois</h3>
            <ul class="mt-3 grid gap-2 text-sm leading-6" style="color: var(--text-label);">
              <li>• procure o ícone do Zelo Impressão perto do relógio do Windows</li>
              <li>• se não aparecer de primeira, clique na setinha para mostrar os outros ícones</li>
              <li>• clique no ícone para abrir a tela novamente</li>
              <li>• deixe esse programa aberto nesse computador</li>
            </ul>
          </div>

          <div class="rounded-3xl border p-6" style="background: var(--bg-card); border-color: var(--border-card);">
            <h3 class="text-lg font-bold text-mk-ink">Depois de instalar</h3>
            <p class="mt-3 text-sm leading-6" style="color: var(--text-label);">
              Volte ao PDV ou ao Chat. A conexão acontece automaticamente quando o aplicativo está aberto. Se o sistema pedir uma confirmação, informe o código exibido no Zelo Impressão;
              depois escolha a impressora e faça o teste.
            </p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>
