<script>
  import { createEventDispatcher } from 'svelte';
  import { Check } from 'lucide-svelte';
  import { models } from '$lib/modifierModels.js';

  export let productName = '';
  export let selectedModelId = '';

  const dispatch = createEventDispatcher();

  function select(model) {
    dispatch('select', model);
  }
</script>

<div class="modelo-grid" aria-label="Modelos de grupo">
  {#each models as model (model.id)}
    <button
      type="button"
      class="modelo-card"
      class:selected={selectedModelId === model.id}
      aria-pressed={selectedModelId === model.id}
      on:click={() => select(model)}
    >
      <span class="modelo-radio" aria-hidden="true">
        {#if selectedModelId === model.id}
          <Check size={13} strokeWidth={3} />
        {/if}
      </span>
      <span class="modelo-icon" aria-hidden="true">
        <svelte:component this={model.icon} size={25} strokeWidth={1.8} />
      </span>
      <span class="modelo-copy">
        <span class="modelo-label">{model.label}</span>
        <span class="modelo-description">{model.description}</span>
        <span class="modelo-example-row">
          <span class="modelo-example-label">Exemplo</span>
          <span class="modelo-example">{model.example(productName || 'Produto')}</span>
        </span>
      </span>
    </button>
  {/each}
</div>

<style>
  .modelo-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .modelo-card {
    position: relative;
    display: grid;
    grid-template-columns: 18px 40px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    width: 100%;
    min-height: 124px;
    padding: 14px;
    color: var(--text-main);
    font-family: inherit;
    text-align: left;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 140ms, background 140ms, transform 140ms;
  }

  .modelo-card:hover,
  .modelo-card:focus-visible {
    border-color: var(--primary);
    background: var(--accent-light);
    outline: none;
  }

  .modelo-card:active { transform: translateY(1px); }

  .modelo-card.selected {
    border-color: var(--primary);
    background: var(--accent-light);
  }

  .modelo-radio {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-top: 2px;
    border: 1px solid var(--border-subtle);
    border-radius: 50%;
    color: var(--primary-text);
    background: transparent;
  }

  .modelo-card.selected .modelo-radio {
    border-color: var(--primary);
    background: var(--primary);
  }

  .modelo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 55%, var(--border-card));
    border-radius: 50%;
  }

  .modelo-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .modelo-label {
    color: var(--text-main);
    font-size: 0.86rem;
    font-weight: 750;
    line-height: 1.25;
  }

  .modelo-description {
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.35;
  }

  .modelo-example-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-top: 6px;
    padding: 7px 8px;
    color: var(--text-label);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
  }

  .modelo-example-label {
    flex: 0 0 auto;
    padding: 2px 5px;
    color: var(--text-label);
    font-size: 0.62rem;
    font-weight: 700;
    background: var(--bg-panel);
    border-radius: 3px;
  }

  .modelo-example {
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.68rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 700px) {
    .modelo-grid { grid-template-columns: 1fr 1fr; }
  }

  @media (max-width: 420px) {
    .modelo-card { padding: 12px; }
    .modelo-description { font-size: 0.73rem; }
    .modelo-example-row { margin-top: 4px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .modelo-card { transition: none; }
  }
</style>
