<script>
  /** Zelo bell mascot, simplified line version for UI (until the vector from the agency lands). Inherits currentColor. */
  let { size = 22, title = '' } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'}>
  <rect x="9.5" y="2.5" width="5" height="3" rx="1.2" />
  <path d="M4.5 13.5a7.5 7.5 0 0 1 15 0" />
  <path d="M3 13.5h18v1.2a5.8 5.8 0 0 1-5.8 5.8H8.8A5.8 5.8 0 0 1 3 14.7z" />
  <circle cx="9.6" cy="10.4" r=".9" fill="currentColor" stroke="none" />
  <circle cx="14.4" cy="10.4" r=".9" fill="currentColor" stroke="none" />
</svg>
