<script>
  import CategoriasManager from '$lib/components/CategoriasManager.svelte';
  import SubcategoriasManager from '$lib/components/SubcategoriasManager.svelte';
  import ProdutosManager from '$lib/components/ProdutosManager.svelte';
  export let params;
</script>

<p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Gestão / Cadastros</p>
<h1 class="text-2xl font-semibold mb-4">Cadastros</h1>
<p class="text-slate-600 dark:text-slate-300 mb-6">Gerencie categorias e produtos em um só lugar.</p>

<div class="grid lg:grid-cols-2 gap-6">
  <CategoriasManager />
  <SubcategoriasManager />
  <div class="lg:col-span-2">
    <ProdutosManager />
  </div>
</div>
