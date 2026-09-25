<script>
  /** Status pill. tone: neutral | ok | warn | danger. Zelo Design System → StatusPill. */
  let { tone = 'neutral', dot = false, children, class: className = '' } = $props();
</script>

<span class="pill tone-{tone} {className}">{#if dot}<span class="dot" aria-hidden="true"></span>{/if}{@render children?.()}</span>

<style>
  .pill { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: var(--zelo-radius-pill); border: 1px solid var(--border-subtle); background: var(--bg-panel); color: var(--text-label); font-size: 12.5px; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent); }
  .tone-neutral .dot { color: var(--status-success-text); }
  .tone-ok { background: var(--status-success-bg); border-color: var(--status-success-border); color: var(--status-success-text); }
  .tone-warn { background: var(--status-warning-bg); border-color: var(--status-warning-border); color: var(--status-warning-text); }
  .tone-danger { background: var(--status-error-bg); border-color: var(--status-error-border); color: var(--status-error-text); }
</style>
