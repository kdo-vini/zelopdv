<script>
  import { page } from '$app/stores';
  import { ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL, ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL } from '$lib/zeloImpressaoClient.js';

  const downloadUrl = ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL;
  const canonicalUrl = ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL;

  const passos = [
    'Baixe o arquivo no computador onde a impressora está instalada.',
    'Se aparecer a tela azul de proteção do Windows (SmartScreen), clique em "Mais informações" no canto inferior esquerdo e depois em "Executar mesmo assim".',
    'Quando terminar, abra o Zelo Impressão. Se a janela sumir, ele continua aberto no ícone perto do relógio do Windows.',
    'No Zelo PDV ou no ZeloChat, abra a parte de impressão e digite o código de 6 números que aparece na tela do Zelo Impressão.',
    'Escolha a sua impressora e clique em Imprimir teste.',
  ];

  $: downloadPending = $page.url.searchParams.get('download') === 'not-ready';
</script>

<svelte:head>
  <title>Zelo Impressão — passo a passo para instalar e configurar</title>
  <meta name="description" content="Veja o passo a passo para baixar, instalar, abrir e configurar o Zelo Impressão no Windows sem precisar de suporte técnico." />
  <link rel="canonical" href={canonicalUrl} />
</svelte:head>

<div class="min-h-screen bg-[#0b1020] text-white">
  <section class="mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
    {#if downloadPending}
      <div class="mb-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm text-amber-100 shadow-lg shadow-amber-950/20">
        O link direto do instalador já está reservado em <strong class="text-white">zelopdv.com.br/downloads/zelo-impressao/latest/Zelo-Impressao-Setup.exe</strong>,
        mas o arquivo ainda não foi publicado nesta hospedagem. Assim que o `.exe` for enviado para esse path, o download passará a começar automaticamente por essa mesma URL.
      </div>
    {/if}

    <div class="max-w-3xl">
      <span class="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Windows 10/11</span>
      <h1 class="mt-5 text-4xl font-black tracking-tight md:text-6xl">Zelo Impressão</h1>
      <p class="mt-4 max-w-2xl text-lg text-slate-300 md:text-xl">
        Siga este passo a passo para instalar sozinho e deixar o <strong class="text-white">Zelo PDV</strong> e o <strong class="text-white">ZeloChat</strong>
        imprimindo automaticamente nesse computador.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <a
          href={downloadUrl}
          class="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:-translate-y-0.5 hover:bg-sky-400"
        >Baixar instalador</a>
        <a
          href="/login"
          class="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
        >Voltar ao Zelo PDV</a>
      </div>
      <p class="mt-3 text-sm text-slate-400">Na primeira instalação, se aparecer a tela azul do Windows, clique em "Mais informações" e depois em "Executar mesmo assim".</p>
      <p class="mt-2 text-xs text-slate-500 break-all">Link direto oficial: {downloadUrl}</p>
    </div>

    <div class="mt-12 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
      <div class="rounded-3xl border border-white/10 bg-white/4 p-6 shadow-2xl shadow-black/20">
        <h2 class="text-xl font-bold text-white">Passo a passo</h2>
        <ol class="mt-5 grid gap-4">
          {#each passos as passo, index}
            <li class="flex gap-4 rounded-2xl border border-white/8 bg-white/3 p-4">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sm font-bold text-sky-200">{index + 1}</span>
              <p class="text-sm leading-6 text-slate-300">{passo}</p>
            </li>
          {/each}
        </ol>
      </div>

      <div class="grid gap-6">
        <div class="rounded-3xl border border-emerald-400/20 bg-emerald-400/8 p-6">
          <h3 class="text-lg font-bold text-white">Na primeira instalação</h3>
          <p class="mt-3 text-sm leading-6 text-slate-200">
            Se aparecer a tela azul de proteção do Windows, clique em <strong class="text-white">"Mais informações"</strong> no canto inferior esquerdo e depois em <strong class="text-white">"Executar mesmo assim"</strong> para concluir a instalação.
          </p>
        </div>

        <div class="rounded-3xl border border-amber-400/20 bg-amber-400/8 p-6">
          <h3 class="text-lg font-bold text-white">Como abrir depois</h3>
          <ul class="mt-3 grid gap-2 text-sm leading-6 text-slate-200">
            <li>• procure o ícone do Zelo Impressão perto do relógio do Windows</li>
            <li>• se não aparecer de primeira, clique na setinha para mostrar os outros ícones</li>
            <li>• clique no ícone para abrir a tela novamente</li>
            <li>• deixe esse programa aberto nesse computador</li>
          </ul>
        </div>

        <div class="rounded-3xl border border-white/10 bg-white/4 p-6">
          <h3 class="text-lg font-bold text-white">Depois de instalar</h3>
          <p class="mt-3 text-sm leading-6 text-slate-300">
            Volte ao PDV ou ao Chat, clique em <strong class="text-white">Conectar impressora</strong>, digite o código que aparece na tela do Zelo Impressão
            e depois escolha a impressora para fazer o teste.
          </p>
        </div>
      </div>
    </div>
  </section>
</div>
