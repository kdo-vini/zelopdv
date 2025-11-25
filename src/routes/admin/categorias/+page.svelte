<script>
  import { onMount } from 'svelte';
  export let params;
  onMount(() => { window.location.href = '/admin/cadastros'; });
</script>

<h1 class="text-2xl font-semibold mb-4">Categorias</h1>
<p class="text-slate-600">Esta página foi unificada em Cadastros. Você será redirecionado…</p>
