<script>
  import GestaoSidebar from '$lib/components/GestaoSidebar.svelte';
</script>

<div class="flex h-screen overflow-hidden" style="background: var(--bg-app);">
  <GestaoSidebar />
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <slot />
  </div>
</div>
