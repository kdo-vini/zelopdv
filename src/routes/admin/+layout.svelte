<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  let ready = false;

  onMount(async () => {
    const ok = await ensureActiveSubscription({ requireProfile: true });
    if (!ok) return;
    ready = true;
  });
</script>

{#if ready}
  <div class="grid gap-4">
    <nav class="flex gap-3 text-sm">
      <a href="/admin" class="hover:underline">Dashboard</a>
      <a href="/admin/cadastros" class="hover:underline">Cadastros</a>
      <a href="/admin/estoque" class="hover:underline">Estoque</a>
      <a href="/admin/caixa" class="hover:underline">Fechar Caixa</a>
    </nav>
    <slot />
  </div>
{:else}
  <p>Verificando autenticação...</p>
{/if}
