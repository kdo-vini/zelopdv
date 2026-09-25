<script>
  import { tick } from 'svelte';
  import { confirmModal } from '$lib/stores/ui';
  import { zeloSurface } from '$lib/theme/surface';
  import { Button } from '$lib/components/ui/button';

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

<!-- Superfícies Zelo: painel claro (aninha data-surface="app" também no Brand), raio de sheet,
     cancelar discreto + confirmar primário (perigo quando `destructive`); sheet inferior no mobile. -->
<dialog
  bind:this={dialogElement}
  class="confirm-dialog"
  class:zelo={$zeloSurface}
  data-surface={$zeloSurface ? 'app' : undefined}
  aria-modal="true"
  aria-labelledby="confirm-dialog-title"
  aria-describedby={$confirmModal.message ? 'confirm-dialog-description' : undefined}
  oncancel={handleCancel}
>
  {#if $zeloSurface}
    <div class="zc-body">
      <span class="zc-handle" aria-hidden="true"></span>
      <h2 id="confirm-dialog-title" class="zc-title">{$confirmModal.title}</h2>
      {#if $confirmModal.message}
        <p id="confirm-dialog-description" class="zc-text">{$confirmModal.message}</p>
      {/if}
      <div class="zc-actions">
        <Button variant="quiet" size="touch" data-confirm-cancel onclick={() => resolve(false)}>{$confirmModal.cancelLabel || 'Cancelar'}</Button>
        {#if $confirmModal.destructive}
          <Button variant="danger" size="touch" class="zc-danger" onclick={handleConfirm}>{$confirmModal.confirmLabel || 'Confirmar'}</Button>
        {:else}
          <Button variant="primary" size="touch" onclick={handleConfirm}>{$confirmModal.confirmLabel || 'Confirmar'}</Button>
        {/if}
      </div>
    </div>
  {:else}
  <div class="confirm-dialog-body">
    <h2 id="confirm-dialog-title">{$confirmModal.title}</h2>
    {#if $confirmModal.message}
      <p id="confirm-dialog-description">{$confirmModal.message}</p>
    {/if}
    <div class="confirm-dialog-actions">
      <button type="button" data-confirm-cancel onclick={() => resolve(false)}>{$confirmModal.cancelLabel || 'Cancelar'}</button>
      <button type="button" class="confirm-dialog-confirm" onclick={handleConfirm}>{$confirmModal.confirmLabel || 'Confirmar'}</button>
    </div>
  </div>
  {/if}
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

  /* ── Zelo Design System ── */
  .confirm-dialog.zelo {
    width: min(26rem, calc(100vw - 32px));
    border: 1px solid var(--border-card);
    border-radius: var(--zelo-radius-sheet);
    background: var(--bg-panel);
    color: var(--text-main);
    font-family: var(--zelo-font-ui);
    box-shadow: var(--shadow-modal);
  }
  .confirm-dialog.zelo[open] { animation: zc-in var(--zelo-dur-base) var(--zelo-ease-spring) both; }
  .confirm-dialog.zelo::backdrop { background: color-mix(in srgb, var(--shadow-color) 42%, transparent); }
  .zc-body { padding: 24px; }
  .zc-handle { display: none; }
  .zc-title { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.25; letter-spacing: -0.015em; color: var(--text-main); }
  .zc-text { margin: 8px 0 0; font-size: 14.5px; line-height: 1.45; color: var(--text-label); }
  .zc-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
  /* O `Button` do sistema é um componente: estilos escopados não o alcançam sem :global */
  .zc-actions :global([data-slot="button"]) { min-width: 7.5rem; }
  .zc-actions :global(.zc-danger) { border-color: var(--status-error-border); color: var(--status-error-text); }
  .zc-actions :global(.zc-danger:hover) { background: var(--status-error-bg); }
  @keyframes zc-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }

  @media (max-width: 640px) {
    .confirm-dialog.zelo {
      width: 100%;
      max-width: 100%;
      max-height: calc(100dvh - 24px);
      margin: auto 0 0;
      border-bottom: 0;
      border-radius: var(--zelo-radius-sheet) var(--zelo-radius-sheet) 0 0;
    }
    .confirm-dialog.zelo[open] { animation-name: zc-sheet-in; }
    .zc-body { padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px)); }
    .zc-handle { display: block; width: 40px; height: 4px; margin: 0 auto 16px; border-radius: var(--zelo-radius-pill); background: var(--border-strong); }
    .zc-actions { display: grid; grid-template-columns: 1fr 1fr; }
    @keyframes zc-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
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
