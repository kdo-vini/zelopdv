<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  let empresas = [];
  let membrosPorEmpresa = new Map(); // id_empresa -> array de { id_usuario, role }
  let minhaMembership = new Map(); // id_empresa -> minha role
  let loading = true;
  let errorMessage = '';

  // Form de empresa
  let formEmpresa = { nome: '', cnpj: '' };

  // Form de adicionar membro
  let selectedEmpresaId = null;
  let novoMembroEmail = '';
  let novoMembroRole = 'atendente';

  onMount(async () => {
    await carregar();
    loading = false;
  });

  async function getUserId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  }

  async function carregar() {
    try {
      errorMessage = '';
      const uid = await getUserId();
      if (!uid) {
        window.location.href = '/login';
        return;
      }

      // 1) minhas memberships
      const { data: memberships, error: mErr } = await supabase
        .from('empresa_usuarios')
        .select('id_empresa, role')
        .eq('id_usuario', uid);
      if (mErr) throw mErr;

      const empresaIds = memberships.map(m => m.id_empresa);
      minhaMembership = new Map(memberships.map(m => [m.id_empresa, m.role]));

      // 2) empresas
      let listaEmpresas = [];
      if (empresaIds.length) {
        const { data: emp, error: eErr } = await supabase
          .from('empresas')
          .select('*')
          .in('id', empresaIds)
          .order('id', { ascending: true });
        if (eErr) throw eErr;
        listaEmpresas = emp;
      }
      empresas = listaEmpresas;

      // 3) membros por empresa (uma consulta por empresa para simplicidade)
      const mapa = new Map();
      for (const emp of empresas) {
        const { data: mbs, error: muErr } = await supabase
          .from('empresa_usuarios')
          .select('id_usuario, role')
          .eq('id_empresa', emp.id)
          .order('role');
        if (muErr) throw muErr;
        mapa.set(emp.id, mbs);
      }
      membrosPorEmpresa = mapa;
    } catch (err) {
      errorMessage = err?.message ?? 'Erro ao carregar empresas.';
    }
  }

  async function criarEmpresa(e) {
    e.preventDefault();
    const uid = await getUserId();
    if (!uid) return;

    const { data: nova, error } = await supabase
      .from('empresas')
      .insert({ nome: formEmpresa.nome, cnpj: formEmpresa.cnpj || null, id_owner: uid })
      .select('id')
      .single();
    if (error) { errorMessage = error.message; return; }

    // torna o criador admin
    const { error: meErr } = await supabase
      .from('empresa_usuarios')
      .insert({ id_empresa: nova.id, id_usuario: uid, role: 'admin' });
    if (meErr) { errorMessage = meErr.message; return; }

    formEmpresa = { nome: '', cnpj: '' };
    await carregar();
  }

  function podeGerenciar(empresaId) {
    const role = minhaMembership.get(empresaId);
    return role === 'admin';
  }

  async function adicionarMembro(e) {
    e.preventDefault();
    if (!selectedEmpresaId || !novoMembroEmail) return;
    if (!podeGerenciar(selectedEmpresaId)) { errorMessage = 'Acesso negado.'; return; }

    const { error } = await supabase.rpc('add_empresa_membro_por_email', {
      p_id_empresa: selectedEmpresaId,
      p_email: novoMembroEmail.trim(),
      p_role: novoMembroRole
    });
    if (error) { errorMessage = error.message; return; }

    novoMembroEmail = '';
    novoMembroRole = 'atendente';
    await carregar();
  }

  async function removerMembro(empresaId, userId) {
    if (!podeGerenciar(empresaId)) { errorMessage = 'Acesso negado.'; return; }
    if (!confirm('Remover este membro?')) return;
    const { error } = await supabase
      .from('empresa_usuarios')
      .delete()
      .eq('id_empresa', empresaId)
      .eq('id_usuario', userId);
    if (error) { errorMessage = error.message; return; }
    await carregar();
  }
</script>

<h1 class="text-2xl font-semibold mb-4">Empresas</h1>
{#if errorMessage}
  <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
{/if}

<section class="mb-8 bg-white dark:bg-slate-800 rounded-lg shadow p-4">
  <h2 class="font-semibold mb-3">Criar nova empresa</h2>
  <form on:submit={criarEmpresa} class="grid md:grid-cols-2 gap-4">
    <div>
      <label for="empresa-nome" class="block text-sm mb-1">Nome</label>
      <input id="empresa-nome" class="input-form" bind:value={formEmpresa.nome} required />
    </div>
    <div>
      <label for="empresa-cnpj" class="block text-sm mb-1">CNPJ (opcional)</label>
      <input id="empresa-cnpj" class="input-form" bind:value={formEmpresa.cnpj} />
    </div>
    <div class="md:col-span-2">
      <button class="btn-primary">Criar Empresa</button>
    </div>
  </form>
</section>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
  <h2 class="font-semibold mb-3">Minhas empresas</h2>
  {#if loading}
    <div>Carregando...</div>
  {:else if empresas.length === 0}
    <div class="text-sm text-slate-500">Você ainda não participa de nenhuma empresa.</div>
  {:else}
    <div class="space-y-6">
      {#each empresas as emp}
        <div class="border rounded-md">
          <div class="p-4 flex items-center justify-between">
            <div>
              <div class="font-medium">{emp.nome}</div>
              {#if emp.cnpj}
                <div class="text-xs text-slate-500">CNPJ: {emp.cnpj}</div>
              {/if}
            </div>
            <div class="text-xs rounded px-2 py-1 border bg-white dark:bg-slate-800">Minha função: {minhaMembership.get(emp.id)}</div>
          </div>
          <div class="p-4 border-t">
            <h3 class="font-semibold mb-2">Membros</h3>
            <ul class="space-y-2">
              {#each (membrosPorEmpresa.get(emp.id) || []) as m}
                <li class="flex items-center justify-between text-sm">
                  <span class="text-slate-600">{m.id_usuario}</span>
                  <span class="text-slate-800 font-medium">{m.role}</span>
                  {#if podeGerenciar(emp.id)}
                    <button class="btn-secondary" on:click={() => removerMembro(emp.id, m.id_usuario)}>Remover</button>
                  {/if}
                </li>
              {/each}
            </ul>

            {#if podeGerenciar(emp.id)}
              <form class="mt-4 grid md:grid-cols-3 gap-2" on:submit|preventDefault={() => { selectedEmpresaId = emp.id; adicionarMembro(new Event('submit')); }}>
                <input placeholder="E-mail do usuário" type="email" class="input-form" bind:value={novoMembroEmail} />
                <select class="input-form" bind:value={novoMembroRole}>
                  <option value="atendente">Atendente</option>
                  <option value="admin">Admin</option>
                </select>
                <button class="btn-primary">Adicionar</button>
              </form>
              <p class="text-xs text-slate-500 mt-1">Dica: o usuário precisa ter uma conta com este e-mail. A função localizará o usuário e criará/atualizará a permissão.</p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-*) */
</style>
