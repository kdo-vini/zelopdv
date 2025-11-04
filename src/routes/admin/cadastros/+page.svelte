<script>
  import CategoriasManager from '$lib/components/CategoriasManager.svelte';
  import ProdutosManager from '$lib/components/ProdutosManager.svelte';
</script>

<h1 class="text-2xl font-semibold mb-4">Cadastros</h1>
<p class="text-slate-600 dark:text-slate-300 mb-6">Gerencie categorias e produtos em um só lugar.</p>

<div class="grid lg:grid-cols-2 gap-6">
  <CategoriasManager />
  <ProdutosManager />
</div>
