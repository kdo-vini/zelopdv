<script>
  import GestaoSidebar from '$lib/components/GestaoSidebar.svelte';
</script>

<div class="flex h-screen overflow-hidden" style="background: var(--bg-app);">
  <GestaoSidebar />
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <main class="flex-1 overflow-y-auto p-6 md:p-8">
      <slot />
    </main>
  </div>
</div>
