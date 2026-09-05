<script>
  import Modal from '../../../src/lib/components/modals/ModalProdutoMontavel.svelte';
  import '../../../src/themes/base.css';
  let output = '';
  let open = true;
  let initialPizza = null;
  let initialSelections = [];
  let editing = false;
  let product = {
    id: 12, nome: 'Monte sua pizza', tipo_produto: 'pizza',
    pizza_config: { version: 1, revision: 'revision', pricingMode: 'highest',
      sizes: [{ id: 'large', name: 'Grande', maxFlavors: 4 }, { id: 'small', name: 'Pequena', maxFlavors: 1 }],
      flavors: [
        { id: 'cal', name: 'Calabresa', prices: { large: 40, small: 30 } },
        { id: 'por', name: 'Portuguesa', prices: { large: 60 } },
        { id: 'fran', name: 'Frango', prices: { large: 50 } },
      ] },
    modifierGroups: [{ id: 'crust', name: 'Borda', pricingMode: 'somar', minSelections: 0, maxSelections: 1,
      options: [{ id: 'cat', name: 'Catupiry', priceDelta: 8 }] }]
  };
</script>
<button type="button" on:click={() => { initialPizza = null; initialSelections = []; editing = false; open = true; }}>Abrir pizza</button>
<button type="button" on:click={() => { const item = JSON.parse(output); initialPizza = item.pizza; initialSelections = item.selectedOptions; editing = true; open = true; }}>Editar pizza</button>
<Modal {open} {initialPizza} {initialSelections} {editing} produto={product} precoBase={999} on:close={() => open = false} on:confirm={event => output = JSON.stringify(event.detail)}/>
<output>{output}</output>
<style>:global(*) { box-sizing: border-box; } :global(body) { margin: 0; } output { overflow-wrap: anywhere; }</style>
