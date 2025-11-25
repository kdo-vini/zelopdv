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

<div class="wrap">
	<h2 class="title">Pessoas</h2>
	{#if errorMsg}<p class="err">{errorMsg}</p>{/if}
	<div class="grid">
		<div class="card">
			<label>Nome<input bind:value={form.nome} placeholder="Nome completo" /></label>
			<label>Tipo
				<select bind:value={form.tipo}>
					<option value="cliente">Cliente</option>
					<option value="funcionario">Funcionário</option>
				</select>
			</label>
				<label>Contato<input bind:value={form.contato} placeholder="(xx) xxxxx-xxxx" inputmode="numeric" pattern="\\d*" maxlength="11" on:input={(e)=> form.contato = sanitizeContato(e.target.value)} /></label>
			<div class="actions">
				<button on:click={save}>{form.id ? 'Salvar' : 'Cadastrar'}</button>
				{#if form.id}<button class="ghost" on:click={clear}>Cancelar</button>{/if}
			</div>
		</div>
		<div class="card">
			{#if loading}
				<p>Carregando...</p>
			{:else}
				<table>
					<thead><tr><th>Nome</th><th>Tipo</th><th>Contato</th><th>Fiado</th><th></th></tr></thead>
					<tbody>
						{#each pessoas as p}
							<tr>
								<td>{p.nome}</td>
								<td>{p.tipo}</td>
								<td>{p.contato || '-'}</td>
								<td>R$ {Number(p.saldo_fiado||0).toFixed(2)}</td>
								<td class="right">
									<a class="link" href="/admin/fichario?p={p.id}">Fichário</a>
									<button class="ghost" on:click={() => edit(p)}>Editar</button>
									<button class="danger" on:click={() => remove(p.id)}>Excluir</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>
</div>

<style>
	.wrap{padding:16px}
	.grid{display:grid;grid-template-columns:380px 1fr;gap:12px}
	@media (max-width:900px){.grid{grid-template-columns:1fr}}
	.card{background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:14px}
	label{display:flex;flex-direction:column;color:#cbd5e1;font-size:13px;margin-bottom:10px}
	input,select{margin-top:6px;background:#0f172a;border:1px solid #1f2937;border-radius:8px;color:#e5e7eb;padding:8px}
	.actions{display:flex;gap:8px}
	button{background:#0f172a;border:1px solid #1f2937;color:#e5e7eb;border-radius:8px;height:34px;padding:0 12px}
	button.ghost{background:transparent}
	button.danger{border-color:#7f1d1d;color:#fecaca}
	.err{color:#ef4444;margin:8px 0}
	table{width:100%;border-collapse:collapse}
	th,td{border-bottom:1px solid #1f2937;padding:8px;text-align:left}
	td.right{text-align:right}
	.link{color:#93c5fd;text-decoration:none;margin-right:8px}
</style>
