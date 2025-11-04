<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  let loading = true;
  let erro = '';
  let userId = null;
  let produtos = [];
  let busca = '';
  let toast = '';
  let toastTimer = null;

  async function carregar() {
    erro = '';
    loading = true;
    try {
      // Requer sessão
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login'; return; }
      userId = session.user.id;
      // Busca apenas produtos com controle de estoque ativo
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, estoque_atual, controlar_estoque')
        .eq('id_usuario', userId)
        .eq('controlar_estoque', true)
        .order('nome', { ascending: true });
      if (error) throw error;
      produtos = (data || []).map(p => ({ ...p, _tmpEstoque: p.estoque_atual, _saving: false, _msg: '' }));
    } catch (e) {
      erro = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  onMount(carregar);

  function filtrados() {
    const q = (busca || '').toLowerCase().trim();
    if (!q) return produtos;
    return produtos.filter(p => String(p.nome || '').toLowerCase().includes(q));
  }

  async function salvarLinha(p) {
    if (!p || p._saving) return;
    const novo = Number(p._tmpEstoque);
    if (Number.isNaN(novo) || novo < 0) { p._msg = 'Valor inválido'; return; }
    p._saving = true; p._msg = '';
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ estoque_atual: novo })
        .eq('id', p.id)
        .eq('id_usuario', userId);
      if (error) throw error;
  p.estoque_atual = novo;
  p._msg = 'Salvo';
  // Toast global para dar feedback claro
  toast = 'Estoque salvo com sucesso';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = ''; }, 2000);
  setTimeout(() => { p._msg = ''; }, 1200);
    } catch (e) {
      p._msg = e?.message || 'Erro ao salvar';
    } finally {
      p._saving = false;
    }
  }
</script>

<h1 class="text-2xl font-semibold mb-4">Estoque</h1>
<p class="text-slate-600 dark:text-slate-300 mb-3">Edite as quantidades de produtos com controle de estoque habilitado.</p>

{#if toast}
  <div class="fixed top-4 right-4 bg-emerald-600 text-white px-3 py-2 rounded shadow">
    {toast}
  </div>
{/if}

<div class="flex items-center gap-2 mb-4">
  <input
    placeholder="Buscar produto..."
    class="w-full sm:w-80 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
    bind:value={busca}
  />
  <button class="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" on:click={carregar}>
    Atualizar
  </button>
</div>

{#if loading}
  <p>Carregando estoque...</p>
{:else if erro}
  <p class="text-red-500">{erro}</p>
{:else}
  {#if filtrados().length === 0}
    <p class="text-slate-500">Nenhum produto com controle de estoque encontrado.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="min-w-[520px] w-full text-sm">
        <thead>
          <tr class="text-left border-b border-slate-200 dark:border-slate-700">
            <th class="py-2 pr-4">Produto</th>
            <th class="py-2 pr-4 w-40">Estoque Atual</th>
            <th class="py-2 pr-4 w-32"></th>
            <th class="py-2 pr-4 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtrados() as p (p.id)}
            <tr class="border-b border-slate-100 dark:border-slate-800">
              <td class="py-2 pr-4">
                <div class="font-medium">{p.nome}</div>
                <div class="text-xs text-slate-500">ID: {p.id}</div>
              </td>
              <td class="py-2 pr-4">
                <input type="number" min="0" step="1" class="w-28 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
                  bind:value={p._tmpEstoque}
                  on:keydown={(e) => { if (e.key === 'Enter') salvarLinha(p); }}
                />
              </td>
              <td class="py-2 pr-4">
                <button class="px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:bg-slate-400"
                  disabled={p._saving}
                  on:click={() => salvarLinha(p)}>
                  {p._saving ? 'Salvando...' : 'Salvar'}
                </button>
              </td>
              <td class="py-2 pr-4 text-xs">
                {#if p._msg}
                  <span class="text-slate-500">{p._msg}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}
