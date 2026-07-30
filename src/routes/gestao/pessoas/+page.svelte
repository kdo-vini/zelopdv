<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { maskPhone } from '$lib/masks';
  import * as Select from '$lib/components/ui/select/index.js';
  import { getFiadoState } from '$lib/finance/fiado';
  export let params;

  let pessoas = [];
  let loading = true;
  let errorMsg = '';
  let form = { id: null, nome: '', tipo: 'cliente', contato: '' };
  let uid = null;

  async function load() {
    loading = true; errorMsg = '';
    const { data, error } = await supabase.from('pessoas').select('id,nome,tipo,contato,saldo_fiado').order('nome');
    if (error) errorMsg = error.message;
    pessoas = data || [];
    loading = false;
  }

  function edit(p) { form = { id: p.id, nome: p.nome, tipo: p.tipo, contato: maskPhone(p.contato || '') }; }
  function clear() { form = { id: null, nome: '', tipo: 'cliente', contato: '' }; }

  async function save() {
    errorMsg = '';
    if (!form.nome.trim()) { errorMsg = 'Informe o nome.'; return; }
    const digits = (form.contato || '').replace(/\D/g, '');
    if (digits && digits.length > 11) { errorMsg = 'Contato deve ter no máximo 11 dígitos.'; return; }
    if (form.id) {
      const { error } = await supabase.from('pessoas').update({ nome: form.nome, tipo: form.tipo, contato: form.contato }).eq('id', form.id);
      if (error) { errorMsg = error.message; return; }
    } else {
      if (!uid) {
        const { data: userData } = await supabase.auth.getUser();
        uid = userData?.user?.id || null;
      }
      const payload = { nome: form.nome, tipo: form.tipo, contato: form.contato };
      if (uid) payload.id_usuario = uid;
      const { error } = await supabase.from('pessoas').insert(payload);
      if (error) { errorMsg = error.message; return; }
    }
    clear(); load();
  }

  async function remove(id) {
    const ok = await confirmAction('Excluir pessoa', 'Tem certeza que deseja excluir esta pessoa? O saldo precisa estar quitado. O histórico de fiado desta pessoa também será apagado.');
    if (!ok) return;
    const { error } = await supabase.rpc('fiado_excluir_pessoa', { p_id_pessoa: id });
    if (error) {
      const message = error.code === '23514'
        ? 'Não é possível excluir uma pessoa com saldo de fiado em aberto ou crédito pendente.'
        : error.message;
      addToast(message, 'error');
      return;
    }
    addToast('Pessoa excluída.', 'success');
    load();
  }

  onMount(async () => {
    const { data: userData } = await supabase.auth.getUser();
    uid = userData?.user?.id || null;
    await load();
  });
</script>

<div class="p-4 sm:p-6 max-w-6xl mx-auto">

  <!-- Page header -->
  <div class="mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4">
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Gestão / Cadastros</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Pessoas</h1>
    </div>
    <span class="text-xs text-slate-500 tabular-nums">{pessoas.length} registros</span>
  </div>

  {#if errorMsg}
    <div class="mb-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{errorMsg}</div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">

    <!-- Form panel -->
    <div class="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 h-fit">
      <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
        {form.id ? 'Editar pessoa' : 'Nova pessoa'}
      </p>

      <div class="space-y-3">
        <label class="block">
          <span class="field-label">Nome</span>
          <input class="field-input" bind:value={form.nome} placeholder="Nome completo" />
        </label>

        <label class="block">
          <span class="field-label">Tipo</span>
          <Select.Root bind:value={form.tipo}>
            <Select.Trigger class="field-input">
              {form.tipo === 'funcionario' ? 'Funcionário' : 'Cliente'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="cliente" label="Cliente" />
              <Select.Item value="funcionario" label="Funcionário" />
            </Select.Content>
          </Select.Root>
        </label>

        <label class="block">
          <span class="field-label">Contato</span>
          <input
            class="field-input"
            value={form.contato}
            placeholder="(00) 00000-0000"
            inputmode="numeric"
            on:input={(e) => { form.contato = maskPhone(e.target.value); e.target.value = form.contato; }}
          />
        </label>
      </div>

      <div class="flex gap-2 mt-5">
        <button class="action-primary flex-1" on:click={save}>
          {#if form.id}
            <!-- Heroicons: check -->
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            Salvar
          {:else}
            <!-- Heroicons: plus -->
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Cadastrar
          {/if}
        </button>
        {#if form.id}
          <button class="action-ghost" on:click={clear} title="Cancelar edição">
            <!-- Heroicons: x-mark -->
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Table panel -->
    <div class="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden">
      {#if loading}
        <div class="p-10 text-center text-slate-500 text-sm">Carregando...</div>
      {:else if pessoas.length === 0}
        <div class="p-10 text-center text-slate-500 text-sm">Nenhuma pessoa cadastrada.</div>
      {:else}
        <div class="table-scroll-wrapper">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-700/60">
                <th class="col-header px-4 sm:px-5 py-3 text-left min-w-[140px]">Nome</th>
                <th class="col-header px-3 sm:px-4 py-3 text-left min-w-[80px]">Tipo</th>
                <th class="col-header px-3 sm:px-4 py-3 text-left min-w-[130px]">Contato</th>
                <th class="col-header px-3 sm:px-4 py-3 text-right min-w-[120px]">Situação do fiado</th>
                <th class="px-3 sm:px-4 py-3 min-w-[100px]"></th>
              </tr>
            </thead>
            <tbody>
              {#each pessoas as p (p.id)}
                <tr class="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group">
                  <td class="px-4 sm:px-5 py-3 font-medium text-slate-100 whitespace-nowrap">{p.nome}</td>
                  <td class="px-3 sm:px-4 py-3">
                    <span class="type-badge {p.tipo === 'funcionario' ? 'type-func' : 'type-cli'}">
                      {p.tipo === 'funcionario' ? 'Func.' : 'Cliente'}
                    </span>
                  </td>
                  <td class="px-3 sm:px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">{maskPhone(p.contato) || '—'}</td>
                  <td class={`px-3 sm:px-4 py-3 text-right tabular-nums font-medium fiado-${getFiadoState(p.saldo_fiado).key}`}>
                    <span class="fiado-label">{getFiadoState(p.saldo_fiado).label}</span>
                    <span>R$ {Number(getFiadoState(p.saldo_fiado).value).toFixed(2)}</span>
                  </td>
                  <td class="px-3 sm:px-4 py-3">
                    <div class="flex items-center justify-end gap-1 actions-cell">
                      <!-- Fichário -->
                      <a
                        href="/gestao/fichario?p={p.id}"
                        class="icon-btn"
                        title="Ver fichário"
                        aria-label="Ver fichário de {p.nome}"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                      </a>
                      <!-- Editar -->
                      <button
                        class="icon-btn"
                        on:click={() => edit(p)}
                        title="Editar {p.nome}"
                        aria-label="Editar {p.nome}"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <!-- Excluir -->
                      <button
                        class="icon-btn icon-btn-danger"
                        on:click={() => remove(p.id)}
                        title="Excluir {p.nome}"
                        aria-label="Excluir {p.nome}"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

  </div>
</div>

<style>
  @reference "tailwindcss";

  .field-label {
    @apply block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1.5;
  }
  .field-input {
    @apply block w-full px-3 py-2 rounded-lg border bg-slate-900/60 text-slate-100 text-sm
           border-slate-600/60 placeholder-slate-600
           focus:outline-hidden focus:ring-1 focus:ring-sky-500 focus:border-sky-500
           transition-colors;
  }
  .action-primary {
    @apply inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
           bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white
           transition-colors;
  }
  .action-ghost {
    @apply inline-flex items-center justify-center p-2 rounded-lg text-sm
           bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200
           border border-slate-600/50 transition-colors;
  }

  .col-header {
    @apply text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500;
  }

  .type-badge {
    @apply inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full;
  }
  .type-cli  { @apply bg-sky-500/10 text-sky-400 border border-sky-500/20; }
  .type-func { background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle); }

  .icon-btn {
    @apply p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-600/60
           transition-colors;
  }
  .icon-btn-danger {
    @apply hover:text-red-400 hover:bg-red-500/10;
  }
  .fiado-label { display: block; margin-bottom: .125rem; font-size: .75rem; font-weight: 500; }
  .fiado-devedor { color: var(--status-warning-text); }
  .fiado-credor { color: var(--status-success-text); }
  .fiado-neutro { color: var(--text-muted); }

  /* Table horizontal scroll with fade hint */
  .table-scroll-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }
  .table-scroll-wrapper::-webkit-scrollbar { height: 6px; }
  .table-scroll-wrapper::-webkit-scrollbar-track { background: transparent; }
  .table-scroll-wrapper::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 3px; }

  /* Actions: hidden on desktop hover, visible on mobile touch */
  .actions-cell {
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .group:hover .actions-cell { opacity: 1; }

  @media (hover: none) and (pointer: coarse) {
    .actions-cell { opacity: 1; }
  }
</style>
