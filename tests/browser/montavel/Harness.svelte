<script>
  import Modal from '../../../src/lib/components/modals/ModalProdutoMontavel.svelte';

  let output = '';
  let open = true;
  let currentProduto;

  const produto = {
    id: 1,
    nome: 'Montagem teste',
    modifierGroups: [
      {
        id: 'massa',
        name: 'Massa',
        order: 0,
        minSelections: 1,
        maxSelections: 1,
        pricingMode: 'substituir',
        options: [
          { id: 'penne', name: 'Penne', priceDelta: 20 },
          { id: 'fusilli', name: 'Fusilli', priceDelta: 25 }
        ]
      },
      {
        id: 'extras',
        name: 'Extras',
        order: 1,
        minSelections: 0,
        maxSelections: 2,
        allowsQuantity: true,
        maxPerOption: 3,
        pricingMode: 'somar',
        options: [
          { id: 'bacon', name: 'Bacon', priceDelta: 3 },
          { id: 'queijo', name: 'Queijo', priceDelta: 2 },
          { id: 'ovo', name: 'Ovo', priceDelta: 1 }
        ]
      },
      {
        id: 'molho',
        name: 'Molho opcional',
        order: 2,
        minSelections: 0,
        maxSelections: 1,
        pricingMode: 'somar',
        options: [{ id: 'tomate', name: 'Tomate', priceDelta: 1 }]
      },
    ]
  };

  const produtoSemOpcoes = {
    id: 2,
    nome: 'Produto com grupo vazio',
    modifierGroups: [{
      id: 'indisponivel',
      name: 'Grupo sem estoque',
      order: 0,
      minSelections: 1,
      maxSelections: 1,
      pricingMode: 'somar',
      options: [{ id: 'sem-estoque', name: 'Sem estoque', priceDelta: 2, linkedProduct: { available: false } }]
    }]
  };

  currentProduto = produto;
</script>

<button type="button" on:click={() => open = true}>Abrir montagem</button>
<button type="button" on:click={() => { currentProduto = produtoSemOpcoes; open = true; }}>Mostrar grupo sem opções</button>

<Modal
  {open}
  produto={currentProduto}
  precoBase={20}
  on:close={() => open = false}
  on:confirm={(event) => output = JSON.stringify(event.detail)}
/>

<output style="display: block; max-width: 100%; overflow-wrap: anywhere; white-space: pre-wrap;">{output}</output>
