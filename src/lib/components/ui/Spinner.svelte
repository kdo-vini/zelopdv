<script>
  let { size = 'md', label = 'Carregando...' } = $props();
  const sizes = { sm: 'size-5', md: 'size-8', lg: 'size-12' };
</script>

<div
  class="rounded-full border-2 border-t-transparent animate-spin {sizes[size] ?? sizes.md}"
  style="border-color: var(--primary); border-top-color: transparent;"
  role="status"
  aria-label={label}
></div>
