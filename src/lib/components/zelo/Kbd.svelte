<script>
  /** Keyboard shortcut chip (F2, F9, ⌘K). Zelo Design System → Kbd. */
  let { children, class: className = '' } = $props();
</script>

<kbd class="kbd {className}">{@render children?.()}</kbd>

<style>
  .kbd {
    display: inline-flex; align-items: center; height: 22px; padding: 0 6px;
    border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-sunken);
    color: var(--text-muted); font: 500 11px/1 var(--zelo-font-num);
  }
  /* inside a solid action (CTA) the chip becomes a translucent tint of the action ink */
  :global(.on-action) .kbd {
    background: color-mix(in srgb, var(--primary-text) 12%, transparent);
    border-color: color-mix(in srgb, var(--primary-text) 18%, transparent);
    color: color-mix(in srgb, var(--primary-text) 80%, transparent);
  }
</style>
