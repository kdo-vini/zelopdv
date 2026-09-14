<!--
  Aviso de perda de módulo no wizard de assinatura.

  Aparece quando a seleção atual removeria uma capacidade que a empresa já usa
  (ex.: pagar ZeloPDV puro quando o ZeloMenu está ativo). Existe porque a tela
  deixava esse downgrade acontecer em silêncio: o total caía de R$99 para R$59
  sem nenhum sinal de que o cardápio online sairia do ar.
-->
<script>
  import { TriangleAlert } from 'lucide-svelte';

  /** @type {string[]} nomes legíveis das capacidades removidas */
  export let names = [];
  /** @type {number|null} valor mensal do pacote atual, para o atalho de volta */
  export let restorePrice = null;
  /** @type {(() => void)|null} */
  export let onRestore = null;
</script>

{#if names.length}
  <div class="status-card warning compact-status">
    <div class="status-icon"><TriangleAlert class="size-6" aria-hidden="true" /></div>
    <div>
      <strong>Este pacote remove {names.join(', ')}</strong>
      <div class="status-detail">
        Você usa esse módulo hoje. Se pagar assim, perde o acesso a ele.
        {#if onRestore}
          <button type="button" class="inline-restore" on:click={onRestore}>
            Manter meu pacote atual{restorePrice ? ` (R$ ${restorePrice}/mês)` : ''}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Mesmo padrão de .status-card.warning da tela de assinatura (DESIGN_PATTERNS §8). */
  .status-card {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 1rem 1.25rem;
    border-radius: 10px;
    font-size: 0.95rem;
    line-height: 1.5;
    background: color-mix(in srgb, var(--warning) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
    color: var(--status-warning-text);
  }

  .status-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .status-detail {
    font-size: 0.85rem;
    margin-top: 0.25rem;
    opacity: 0.85;
  }

  .inline-restore {
    display: block;
    margin-top: 0.4rem;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: 700;
    color: var(--link);
    text-decoration: underline;
    cursor: pointer;
  }

  .inline-restore:hover {
    color: var(--link-hover);
  }
</style>
