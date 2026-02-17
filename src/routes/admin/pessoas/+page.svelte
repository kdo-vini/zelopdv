<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  export let params;

  let pessoas = [];
  let loading = true;
  let errorMsg = '';
  let form = { id: null, nome: '', tipo: 'cliente', contato: '' };
  let uid = null;

	async function load() {
		loading = true; errorMsg='';
		const { data, error } = await supabase.from('pessoas').select('id,nome,tipo,contato,saldo_fiado').order('nome');
		if (error) errorMsg = error.message;
		pessoas = data || [];
		loading = false;
	}

	function edit(p){ form = { id:p.id, nome:p.nome, tipo:p.tipo, contato:p.contato||'' }; }
	function clear(){ form = { id:null, nome:'', tipo:'cliente', contato:'' }; }

	function sanitizeContato(v){
		// Permite apenas dígitos e limita a 11
		return (v||'').replace(/\D/g,'').slice(0,11);
	}

	async function save(){
		errorMsg='';
		if(!form.nome.trim()){ errorMsg='Informe o nome.'; return; }
		// normaliza contato: apenas dígitos e máximo 11
		form.contato = sanitizeContato(form.contato);
		if(form.contato && form.contato.length>11){ errorMsg='Contato deve ter no máximo 11 dígitos.'; return; }
		if(form.id){
			const { error } = await supabase.from('pessoas').update({ nome:form.nome, tipo:form.tipo, contato:form.contato }).eq('id', form.id);
			if(error){ errorMsg=error.message; return; }
		} else {
			if(!uid){
				const { data: userData } = await supabase.auth.getUser();
				uid = userData?.user?.id || null;
			}
			const payload = { nome:form.nome, tipo:form.tipo, contato:form.contato };
			if (uid) payload.id_usuario = uid; // satisfaz RLS
			const { error } = await supabase.from('pessoas').insert(payload);
			if(error){ errorMsg=error.message; return; }
		}
		clear(); load();
	}

	async function remove(id){
		if(!confirm('Excluir esta pessoa?')) return;
		const { error } = await supabase.from('pessoas').delete().eq('id', id);
		if(error){ alert(error.message); return; }
		load();
	}

	onMount(async () => {
	  const { data: userData } = await supabase.auth.getUser();
	  uid = userData?.user?.id || null;
	  await load();
	});
</script>

<div class="p-4">
	<h2 class="text-2xl font-semibold mb-4 text-slate-800 dark:text-white">Pessoas</h2>
	{#if errorMsg}<p class="text-red-500 mb-2">{errorMsg}</p>{/if}
	<div class="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
		<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 h-fit">
			<label class="block mb-3">
				<span class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Nome</span>
				<input class="input-form w-full" bind:value={form.nome} placeholder="Nome completo" />
			</label>
			<label class="block mb-3">
				<span class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Tipo</span>
				<select class="input-form w-full" bind:value={form.tipo}>
					<option value="cliente">Cliente</option>
					<option value="funcionario">Funcionário</option>
				</select>
			</label>
			<label class="block mb-3">
				<span class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Contato</span>
				<input class="input-form w-full" bind:value={form.contato} placeholder="(xx) xxxxx-xxxx" inputmode="numeric" pattern="\d*" maxlength="11" on:input={(e)=> form.contato = sanitizeContato(e.target.value)} />
			</label>
			<div class="flex gap-2 mt-4">
				<button class="btn-primary flex-1" on:click={save}>{form.id ? 'Salvar' : 'Cadastrar'}</button>
				{#if form.id}<button class="btn-ghost" on:click={clear}>Cancelar</button>{/if}
			</div>
		</div>

		<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm min-w-0">
			{#if loading}
				<div class="p-8 text-center text-slate-500">Carregando...</div>
			{:else}
				<div class="overflow-x-auto w-full">
					<table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
						<thead class="bg-slate-50 dark:bg-slate-700/50 uppercase font-medium text-xs text-slate-500 dark:text-slate-400">
							<tr>
								<th class="p-4">Nome</th>
								<th class="p-4">Tipo</th>
								<th class="p-4">Contato</th>
								<th class="p-4">Fiado</th>
								<th class="p-4"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100 dark:divide-slate-700">
							{#each pessoas as p}
								<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30">
									<td class="p-4 font-medium text-slate-900 dark:text-white">{p.nome}</td>
									<td class="p-4 uppercase text-xs tracking-wider">{p.tipo}</td>
									<td class="p-4">{p.contato || '-'}</td>
									<td class="p-4">R$ {Number(p.saldo_fiado||0).toFixed(2)}</td>
									<td class="p-4 text-right">
										<div class="flex justify-end gap-2">
											<a class="text-blue-600 hover:text-blue-800 text-xs font-semibold uppercase" href="/admin/fichario?p={p.id}">Fichário</a>
											<button class="text-slate-500 hover:text-slate-700 text-xs font-semibold uppercase" on:click={() => edit(p)}>Editar</button>
											<button class="text-red-500 hover:text-red-700 text-xs font-semibold uppercase" on:click={() => remove(p.id)}>Excluir</button>
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
	/* Small scoped styles if needed, but mostly using Tailwind now */
	.input-form { @apply block w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600; }
	.btn-primary { @apply bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md shadow-sm transition-colors duration-200; }
	.btn-ghost { @apply bg-transparent hover:bg-slate-100 text-slate-600 font-medium py-2 px-4 rounded transition-colors duration-200 border border-slate-300; }
</style>
