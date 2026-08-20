<script>
  import { tick } from 'svelte';
  import { confirmModal } from '$lib/stores/ui';

  let dialogElement;
  let returnFocusElement = null;

  function resolve(value) {
    if ($confirmModal.resolve) $confirmModal.resolve(value);
  }

  function handleCancel(event) {
    event?.preventDefault();
    resolve(false);
  }

  function handleConfirm() {
    resolve(true);
  }

  $effect(() => {
    const shouldOpen = $confirmModal.isOpen;
    if (!dialogElement) return;

    if (shouldOpen && !dialogElement.open) {
      returnFocusElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      dialogElement.showModal();
      tick().then(() => dialogElement?.querySelector('[data-confirm-cancel]')?.focus());
    } else if (!shouldOpen && dialogElement.open) {
      dialogElement.close();
      const target = returnFocusElement;
      returnFocusElement = null;
      tick().then(() => {
        if (target?.isConnected) target.focus();
      });
    }
  });
</script>

<dialog
  bind:this={dialogElement}
  class="confirm-dialog"
  aria-modal="true"
  aria-labelledby="confirm-dialog-title"
  aria-describedby={$confirmModal.message ? 'confirm-dialog-description' : undefined}
  oncancel={handleCancel}
>
  <div class="confirm-dialog-body">
    <h2 id="confirm-dialog-title">{$confirmModal.title}</h2>
    {#if $confirmModal.message}
      <p id="confirm-dialog-description">{$confirmModal.message}</p>
    {/if}
    <div class="confirm-dialog-actions">
      <button type="button" data-confirm-cancel onclick={() => resolve(false)}>Cancelar</button>
      <button type="button" class="confirm-dialog-confirm" onclick={handleConfirm}>Confirmar</button>
    </div>
  </div>
</dialog>

<style>
  .confirm-dialog {
    width: min(28rem, calc(100vw - 2rem));
    max-width: none;
    margin: auto;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    color: var(--text-main);
    box-shadow: 0 1.5rem 4rem color-mix(in srgb, var(--bg-app) 60%, transparent);
  }

  .confirm-dialog::backdrop {
    background: color-mix(in srgb, var(--bg-app) 72%, transparent);
  }

  .confirm-dialog-body {
    padding: 1.25rem;
  }

  h2 {
    margin: 0;
    color: var(--text-main);
    font-size: 1rem;
    font-weight: 700;
  }

  p {
    margin: 0.625rem 0 0;
    color: var(--text-label);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .confirm-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.625rem;
    margin-top: 1.25rem;
  }

  button {
    min-height: 2.75rem;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--bg-input);
    color: var(--text-main);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--border-strong);
  }

  .confirm-dialog-confirm {
    border-color: var(--primary);
    background: var(--primary);
    color: var(--primary-text);
  }

  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    .confirm-dialog-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    button {
      width: 100%;
    }
  }
</style>
