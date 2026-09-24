<script>
  import PricingSheet from "$lib/components/tools/PricingSheet.svelte";
  import BackLink from "$lib/components/ui/BackLink.svelte";
</script>

<svelte:head>
  <title>Precificação | Ferramentas | Zelo PDV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="tool-page">
  <div class="tool-page-head">
    <BackLink href="/ferramentas" label="Ferramentas" />
    <h1 class="text-xl font-bold text-slate-100 tracking-tight mt-1">Precificação</h1>
    <p class="tool-page-subtitle">
      Cadastre custo e preço de venda e acompanhe CMV e margem de cada produto.
    </p>
  </div>

  <PricingSheet />
</div>

<style>
  .tool-page-head {
    max-width: 72rem;
    margin-inline: auto;
    padding: 0 1.5rem;
    margin-bottom: 0.5rem;
  }

  .tool-page-subtitle {
    margin-top: 0.3rem;
    color: var(--text-muted);
    font-size: 0.95rem;
    max-width: 60ch;
  }
</style>
