<script>
  /** Search input with icon and optional shortcut. Zelo Design System → SearchField. */
  import { Search } from 'lucide-svelte';
  import Kbd from './Kbd.svelte';
  let { value = $bindable(''), placeholder = 'Buscar', shortcut = '', id = undefined, inputRef = $bindable(null), ...rest } = $props();
</script>

<label class="search">
  <Search size={18} strokeWidth={1.75} aria-hidden="true" />
  <input {id} type="search" bind:value bind:this={inputRef} {placeholder} {...rest} />
  {#if shortcut}<Kbd>{shortcut}</Kbd>{/if}
</label>

<style>
  .search { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; border-radius: var(--zelo-radius-control); background: var(--bg-input); border: 1px solid var(--border-subtle); color: var(--text-muted); }
  .search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus); }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: 400 15px var(--zelo-font-ui); color: var(--text-main); }
  .search input::placeholder { color: var(--text-muted); }
</style>
