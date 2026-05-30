<script>
  import { dialogState, _resolveDialog } from '$lib/confirmDialog'
  import { fade, slide } from 'svelte/transition'
  import { tick } from 'svelte'

  let typedConfirm = ''
  let promptValue = ''
  let inputEl = null

  $: state = $dialogState
  // Reset + autofocus only when a new dialog opens (state identity changes).
  // Guarding on identity is required: because typedConfirm/promptValue are both
  // bound (bind:value) and assigned here, Svelte couples them so every keystroke
  // re-invalidates `state` and re-runs this block — without the guard it would
  // wipe the field on every character typed.
  let lastState = null
  $: if (state !== lastState) {
    lastState = state
    if (state) {
      if (state.mode === 'prompt') promptValue = state.defaultValue ?? ''
      typedConfirm = ''
      tick().then(() => inputEl?.focus())
    }
  }

  $: confirmDisabled = !!state && (
    (state.mode === 'confirm' && state.requireType && typedConfirm !== state.requireType) ||
    (state.mode === 'prompt' && state.required && !promptValue.trim())
  )

  function onCancel() {
    if (!state) return
    _resolveDialog(state.mode === 'prompt' ? null : false)
  }

  function onConfirm() {
    if (!state || confirmDisabled) return
    _resolveDialog(state.mode === 'prompt' ? promptValue : true)
  }

  function onKeydown(e) {
    if (!state) return
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      if (state.mode === 'prompt' && state.multiline) return
      e.preventDefault()
      onConfirm()
    }
  }

  const confirmStyles = {
    primary: 'bg-sky-500 hover:bg-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.4)]',
    danger:  'bg-rose-500 hover:bg-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)]',
    warning: 'bg-amber-500 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]',
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if state}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-md bg-[#0B0F19]/80"
    transition:fade={{ duration: 150 }}
    role="dialog"
    aria-modal="true"
  >
    <button
      class="absolute inset-0 cursor-default focus:outline-none"
      aria-label="Fechar"
      on:click={onCancel}
    ></button>
    <div
      class="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden"
      transition:slide={{ duration: 200, axis: 'y' }}
    >
      <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/50 to-transparent"></div>

      <div class="px-6 py-5 border-b border-slate-800">
        <h3 class="text-lg font-bold text-white tracking-wide">{state.title}</h3>
      </div>

      <div class="p-6 space-y-4">
        {#if state.message}
          <p class="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{state.message}</p>
        {/if}

        {#if state.mode === 'prompt'}
          {#if state.multiline}
            <textarea
              bind:this={inputEl}
              bind:value={promptValue}
              placeholder={state.placeholder}
              rows="3"
              class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner resize-none"
            ></textarea>
          {:else}
            <input
              bind:this={inputEl}
              bind:value={promptValue}
              placeholder={state.placeholder}
              class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
            />
          {/if}
        {/if}

        {#if state.mode === 'confirm' && state.requireType}
          <div class="space-y-1.5">
            <label class="block text-[13px] font-medium text-slate-400">
              {state.requireTypeHint || `Para confirmar, digite "${state.requireType}":`}
            </label>
            <input
              bind:this={inputEl}
              bind:value={typedConfirm}
              placeholder={state.requireType}
              class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all shadow-inner"
            />
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button
          type="button"
          on:click={onCancel}
          class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
        >
          {state.cancelLabel}
        </button>
        <button
          type="button"
          on:click={onConfirm}
          disabled={confirmDisabled}
          class="px-5 py-2 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed {confirmStyles[state.confirmStyle] || confirmStyles.primary}"
        >
          {state.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
