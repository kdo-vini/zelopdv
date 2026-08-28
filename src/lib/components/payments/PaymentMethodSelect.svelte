<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  /** @type {Array<{id: string, label: string, taxPct?: number}>} */
  export let methods = [];
  export let value = '';
  export let id = undefined;
  export let ariaLabel = 'Forma de pagamento';
  export let disabled = false;

  function handleChange(event) {
    value = event.currentTarget.value;
    dispatch('change', { value });
  }
</script>

<select {id} class="payment-method-select" bind:value aria-label={ariaLabel} {disabled} on:change={handleChange}>
  {#each methods as method (method.id)}
    <option value={method.id}>{method.label}{method.taxPct != null ? ` (${method.taxPct}%)` : ''}</option>
  {/each}
</select>

<style>
  .payment-method-select {
    width: 100%;
    min-width: 0;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-main);
    font: inherit;
    font-weight: 600;
  }

  .payment-method-select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }
</style>
