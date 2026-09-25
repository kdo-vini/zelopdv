<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  /** @type {Array<{id: string, label: string, taxPct?: number}>} */
  export let methods = [];
  export let value = '';
  export let id = undefined;
  export let ariaLabel = 'Forma de pagamento';
  export let disabled = false;
  /** Zelo Design System sizing (48px control, 12px radius). */
  export let zelo = false;

  function handleChange(event) {
    value = event.currentTarget.value;
    // `bind:value` on the parent listens to the component's `value` event;
    // keep the public change event for callers that need a semantic hook.
    dispatch('value', value);
    dispatch('change', value);
  }
</script>

<select {id} class="payment-method-select" class:zelo bind:value aria-label={ariaLabel} {disabled} on:change={handleChange}>
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

  .payment-method-select.zelo {
    height: 48px;
    padding: 0 14px;
    border-radius: var(--zelo-radius-control);
    font-weight: 500;
    font-size: 15px;
  }
  .payment-method-select.zelo:focus {
    box-shadow: 0 0 0 4px var(--focus);
  }
</style>
