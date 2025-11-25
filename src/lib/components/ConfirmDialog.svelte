<script>
  import { confirmModal } from '$lib/stores/ui';
  import { fade, scale } from 'svelte/transition';

  function handleConfirm() {
    if ($confirmModal.resolve) $confirmModal.resolve(true);
  }

  function handleCancel() {
    if ($confirmModal.resolve) $confirmModal.resolve(false);
  }
</script>

{#if $confirmModal.isOpen}
  <!-- Backdrop -->
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <!-- Modal -->
    <div
      transition:scale={{ duration: 200, start: 0.95 }}
      class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700"
    >
      <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">{$confirmModal.title}</h3>
      <p class="text-slate-600 dark:text-slate-300 mb-6">{$confirmModal.message}</p>
      
      <div class="flex justify-end gap-3">
        <button
          class="px-4 py-2 rounded-md text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          on:click={handleCancel}
        >
          Cancelar
        </button>
        <button
          class="px-4 py-2 rounded-md text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-sm"
          on:click={handleConfirm}
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
{/if}
