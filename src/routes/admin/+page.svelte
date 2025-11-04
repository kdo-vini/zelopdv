<script>
  // Layout em /admin já faz a verificação de sessão.
</script>

<h1 class="text-2xl font-semibold mb-4">Admin</h1>
<p class="text-slate-600 dark:text-slate-300 mb-6">Bem-vindo! Escolha uma das opções para gerenciar seu PDV.</p>

<section class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
  <a href="/admin/cadastros" class="p-4 rounded-lg border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
    <div class="font-semibold mb-1">Cadastros</div>
    <div class="text-sm text-slate-500">Gerencie Categorias e Produtos</div>
  </a>
  <a href="/admin/estoque" class="p-4 rounded-lg border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
    <div class="font-semibold mb-1">Estoque</div>
    <div class="text-sm text-slate-500">Editar quantidades de produtos com controle de estoque</div>
  </a>
  <a href="/admin/caixa" class="p-4 rounded-lg border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
    <div class="font-semibold mb-1">Fechar Caixa</div>
    <div class="text-sm text-slate-500">Conferência de valores e fechamento</div>
  </a>
  <a href="/relatorios" class="p-4 rounded-lg border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
    <div class="font-semibold mb-1">Relatórios</div>
    <div class="text-sm text-slate-500">Vendas do caixa atual</div>
  </a>
</section>
