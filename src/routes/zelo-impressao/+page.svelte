<script>
  import { ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL, ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL } from '$lib/zeloImpressaoClient.js';

  const downloadUrl = ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL;
  const canonicalUrl = ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL;

  const passos = [
    'Baixe o instalador no computador onde a impressora está conectada.',
    'Clique em Avançar, Avançar, Instalar e aguarde a conclusão.',
    'Abra o Zelo Impressão e deixe o aplicativo rodando nesse computador.',
    'No Zelo PDV ou no ZeloChat, clique em Conectar impressora e digite o código exibido no app.',
    'Escolha a impressora e faça um teste de impressão.',
  ];
</script>

<svelte:head>
  <title>Zelo Impressão — instalação simples para PDV e ZeloChat</title>
  <meta name="description" content="Baixe o Zelo Impressão para conectar sua impressora térmica no Windows e imprimir automaticamente pedidos do Zelo PDV e do ZeloChat." />
  <link rel="canonical" href={canonicalUrl} />
</svelte:head>

<div class="min-h-screen bg-[#0b1020] text-white">
  <section class="mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
    <div class="max-w-3xl">
      <span class="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Windows 10/11</span>
      <h1 class="mt-5 text-4xl font-black tracking-tight md:text-6xl">Zelo Impressão</h1>
      <p class="mt-4 max-w-2xl text-lg text-slate-300 md:text-xl">
        O instalador oficial para deixar o <strong class="text-white">Zelo PDV</strong> e o <strong class="text-white">ZeloChat</strong>
        imprimindo automaticamente no computador da operação.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:-translate-y-0.5 hover:bg-sky-400"
        >Baixar instalador</a>
        <a
          href="/login"
          class="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
        >Voltar ao Zelo PDV</a>
      </div>
      <p class="mt-3 text-sm text-slate-400">Depois de baixar: é só <strong class="text-slate-200">Avançar, Avançar, Instalar e pronto</strong>.</p>
    </div>

    <div class="mt-12 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
      <div class="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
        <h2 class="text-xl font-bold text-white">Como instalar</h2>
        <ol class="mt-5 grid gap-4">
          {#each passos as passo, index}
            <li class="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sm font-bold text-sky-200">{index + 1}</span>
              <p class="text-sm leading-6 text-slate-300">{passo}</p>
            </li>
          {/each}
        </ol>
      </div>

      <div class="grid gap-6">
        <div class="rounded-3xl border border-emerald-400/20 bg-emerald-400/8 p-6">
          <h3 class="text-lg font-bold text-white">Quando usar</h3>
          <p class="mt-3 text-sm leading-6 text-slate-200">
            Recomendado para operações que querem impressão automática estável, sem depender de permissões do navegador.
          </p>
        </div>

        <div class="rounded-3xl border border-amber-400/20 bg-amber-400/8 p-6">
          <h3 class="text-lg font-bold text-white">Também funciona com</h3>
          <ul class="mt-3 grid gap-2 text-sm leading-6 text-slate-200">
            <li>• pedidos do ZeloChat</li>
            <li>• impressão automática estilo iFood</li>
            <li>• impressoras instaladas no Windows</li>
            <li>• PDV e Chat no mesmo computador</li>
          </ul>
        </div>

        <div class="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h3 class="text-lg font-bold text-white">Precisa de ajuda?</h3>
          <p class="mt-3 text-sm leading-6 text-slate-300">
            Se o app abrir mas o navegador não conectar, volte ao PDV ou ao Chat e clique em <strong class="text-white">Conectar impressora</strong>.
            O sistema vai pedir o código exibido pelo próprio Zelo Impressão.
          </p>
        </div>
      </div>
    </div>
  </section>
</div>
