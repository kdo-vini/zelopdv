<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  export let params;

  let ready = false;

  onMount(async () => {
    const ok = await ensureActiveSubscription({ requireProfile: true });
    if (!ok) return;
    ready = true;
  });
</script>

{#if ready}
  <slot />
{:else}
  <p>Verificando autenticação...</p>
{/if}
