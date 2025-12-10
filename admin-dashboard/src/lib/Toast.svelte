<script>
  import { toasts, removeToast } from '$lib/toast';
  
  function getToastClass(type) {
    const classes = {
      success: 'bg-green-900/90 border-green-700 text-green-100',
      error: 'bg-red-900/90 border-red-700 text-red-100',
      warning: 'bg-amber-900/90 border-amber-700 text-amber-100',
      info: 'bg-sky-900/90 border-sky-700 text-sky-100'
    };
    return classes[type] || classes.info;
  }
  
  function getIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }
</script>

<div class="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm animate-slide-in {getToastClass(toast.type)}"
      role="alert"
    >
      <span class="text-xl">{getIcon(toast.type)}</span>
      <span class="flex-1">{toast.message}</span>
      <button
        on:click={() => removeToast(toast.id)}
        class="text-white/70 hover:text-white transition"
        aria-label="Fechar"
      >
        ✕
      </button>
    </div>
  {/each}
</div>

<style>
  @keyframes slide-in {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .animate-slide-in {
    animation: slide-in 0.3s ease-out;
  }
</style>
