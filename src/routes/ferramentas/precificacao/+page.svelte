<script>
  import PricingSheet from "$lib/components/tools/PricingSheet.svelte";
  import BackLink from "$lib/components/ui/BackLink.svelte";
  import { zeloSurface } from "$lib/theme/surface.js";
</script>

<svelte:head>
  <title>Precificação | Ferramentas | Zelo PDV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="tool-page">
  {#if $zeloSurface}
    <header class="zelo-tool-page-head">
      <BackLink href="/ferramentas" label="Ferramentas" />
      <p class="type-eyebrow">Ferramentas / Precificação</p>
      <h1 class="type-title">Precificação</h1>
      <p class="type-body zelo-tool-page-subtitle">
        Cadastre custo e preço de venda e acompanhe CMV e margem de cada produto.
      </p>
    </header>
  {:else}
  <div class="tool-page-head">
    <BackLink href="/ferramentas" label="Ferramentas" />
    <h1 class="text-xl font-bold text-slate-100 tracking-tight mt-1">Precificação</h1>
    <p class="tool-page-subtitle">
      Cadastre custo e preço de venda e acompanhe CMV e margem de cada produto.
    </p>
  </div>
  {/if}

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

  .zelo-tool-page-head {
    max-width: 72rem;
    margin-inline: auto;
    margin-bottom: 1.25rem;
    padding: 0 1.5rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .zelo-tool-page-head .type-eyebrow {
    margin-top: 0.75rem;
  }

  .zelo-tool-page-head h1 {
    margin-top: 0.35rem;
  }

  .zelo-tool-page-subtitle {
    max-width: 60ch;
    margin-top: 0.5rem;
    color: var(--text-muted);
  }

  @media (max-width: 767px) {
    .zelo-tool-page-head {
      padding-inline: 0;
    }
  }
</style>
