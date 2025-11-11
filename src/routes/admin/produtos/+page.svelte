<script>
  import { onMount } from 'svelte';
  import { waitAuthReady } from '$lib/authStore';
  import CategoriasManager from '$lib/components/CategoriasManager.svelte';
  import SubcategoriasManager from '$lib/components/SubcategoriasManager.svelte';
  import ProdutosManager from '$lib/components/ProdutosManager.svelte';
  let ready = false;
  onMount(async()=>{ await waitAuthReady(); ready = true; });
</script>

<h1 class="text-2xl font-semibold mb-4">Gerenciar produtos</h1>
<p class="text-slate-600 dark:text-slate-300 mb-6">Gerencie categorias, subcategorias e produtos e filtre a listagem de produtos.</p>

{#if !ready}
  <div>Verificando autenticação…</div>
{:else}
  <div class="grid xl:grid-cols-2 gap-6">
    <CategoriasManager />
    <SubcategoriasManager />
    <div class="xl:col-span-2">
      <ProdutosManager />
    </div>
  </div>
{/if}
