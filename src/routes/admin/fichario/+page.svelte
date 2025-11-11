<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';

	let pessoas = [];
	let pessoaSelecionada = null;
	let saldo = 0;
	let valorPagamento = '';
	let addAoCaixa = true;
	let imprimirRecibo = true;
	let loading = true;
	let errorMsg = '';

	async function loadPessoas(){
		const { data, error } = await supabase.from('pessoas').select('id,nome,tipo,saldo_fiado').order('nome');
		if(error){ errorMsg = error.message; return; }
		pessoas = data || [];
	}

	function selecionar(id){
		pessoaSelecionada = pessoas.find(p => p.id === id) || null;
		saldo = pessoaSelecionada ? Number(pessoaSelecionada.saldo_fiado || 0) : 0;
	}

	async function registrarPagamento(){
		if(!pessoaSelecionada){ alert('Selecione uma pessoa.'); return; }
		const valor = Number(valorPagamento);
		if(!valor || valor <= 0){ alert('Informe um valor válido.'); return; }

		const { error: errPay } = await supabase.rpc('fiado_registrar_pagamento', { p_id_pessoa: pessoaSelecionada.id, p_valor: valor });
		if(errPay){ alert(errPay.message); return; }

		if(addAoCaixa){
			const { data: cx } = await supabase.from('caixas').select('id').is('data_fechamento', null).order('data_abertura', { ascending:false }).limit(1).maybeSingle();
			if(cx?.id){
				await supabase.from('caixa_movimentacoes').insert({ id_caixa: cx.id, tipo: 'suprimento', valor, motivo: `Pagamento fiado de ${pessoaSelecionada.nome}` });
			}
		}

		if(imprimirRecibo){
			const win = window.open('', '_blank', 'width=380,height=600');
			win.document.write(`<pre style="font-family:ui-monospace,Menlo,Consolas,monospace">${buildReciboPagamento(pessoaSelecionada.nome, valor)}</pre>`);
			win.document.close(); win.focus(); win.print?.();
		}

		valorPagamento = '';
		await loadPessoas();
		selecionar(pessoaSelecionada.id);
	}

	function buildReciboPagamento(nome, valor){
		const dt = new Date().toLocaleString('pt-BR');
		return `Zelo PDV\n\nRECIBO DE PAGAMENTO (FIADO)\n\nPessoa: ${nome}\nValor: R$ ${valor.toFixed(2)}\nData: ${dt}\n\nObrigado!`;
	}

	onMount(async () => { loading = true; await loadPessoas(); loading = false; });
</script>

<section class="wrap">
	<h2 class="title">Fichário</h2>
	{#if errorMsg}<p class="err">{errorMsg}</p>{/if}
	<div class="grid">
		<div class="card">
			<label>Selecionar pessoa
				<select on:change={(e)=> selecionar(e.target.value)}>
					<option value="">-- selecione --</option>
					{#each pessoas as p}
						<option value={p.id}>{p.nome} • {p.tipo}</option>
					{/each}
				</select>
			</label>
			{#if pessoaSelecionada}
				<div class="saldo">Saldo atual: <strong>R$ {saldo.toFixed(2)}</strong></div>
				<label>Valor do pagamento
					<input type="number" min="0" step="0.01" bind:value={valorPagamento} />
				</label>
				<label class="inline"><input type="checkbox" bind:checked={addAoCaixa} /> Adicionar ao caixa atual (suprimento)</label>
				<label class="inline"><input type="checkbox" bind:checked={imprimirRecibo} /> Imprimir recibo</label>
				<button on:click={registrarPagamento}>Registrar pagamento</button>
			{/if}
		</div>
		<div class="card">
			<p>Registre aqui os pagamentos de fiado. O lançamento do débito é feito automaticamente na venda quando a forma for Fiado.</p>
			<a class="btn" href="/admin/pessoas">Gerenciar Pessoas</a>
		</div>
	</div>
</section>

<style>
	.wrap{padding:16px;max-width:900px;margin:0 auto}
	.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
	@media (max-width:800px){.grid{grid-template-columns:1fr}}
	.card{background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:14px}
	label{display:flex;flex-direction:column;color:#cbd5e1;font-size:13px;margin-bottom:10px}
	.inline{flex-direction:row;align-items:center;gap:8px}
	select,input{margin-top:6px;background:#0f172a;border:1px solid #1f2937;border-radius:8px;color:#e5e7eb;padding:8px}
	.saldo{margin:8px 0;color:#e5e7eb}
	.btn,button{background:#0f172a;border:1px solid #1f2937;color:#e5e7eb;border-radius:8px;height:36px;padding:0 12px;text-decoration:none;display:inline-flex;align-items:center}
	.err{color:#ef4444;margin:8px 0}
</style>
