<script>
  import { toasts, removeToast } from '$lib/stores/ui';
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';

  // Cores por tipo
  const colors = {
    info: 'bg-slate-800 text-white border-slate-600',
    success: 'bg-emerald-600 text-white border-emerald-500',
    error: 'bg-red-600 text-white border-red-500',
    warning: 'bg-amber-500 text-black border-amber-400'
  };
</script>

<div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      animate:flip
      in:fly={{ y: 20, duration: 300 }}
      out:fade={{ duration: 200 }}
      class="pointer-events-auto min-w-[300px] max-w-sm p-4 rounded-md shadow-lg border flex items-start justify-between gap-3 {colors[toast.type] || colors.info}"
    >
      <div class="text-sm font-medium">{toast.message}</div>
      <button on:click={() => removeToast(toast.id)} class="opacity-70 hover:opacity-100 transition-opacity">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  {/each}
</div>
