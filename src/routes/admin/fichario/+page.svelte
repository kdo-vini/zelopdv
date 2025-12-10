<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  export let params;

  let pessoas = [];
  let pessoaSelecionada = null;
  let saldo = 0;
  let valorPagamento = '';
  let addAoCaixa = true;
  let imprimirRecibo = true;
  let loading = true;
  let errorMsg = '';
  
  let history = [];
  let loadingHistory = false;

  async function loadPessoas(){
    const { data, error } = await supabase.from('pessoas').select('id,nome,tipo,saldo_fiado').order('nome');
    if(error){ errorMsg = error.message; return; }
    pessoas = data || [];
  }

  async function selecionar(id){
    pessoaSelecionada = pessoas.find(p => p.id === id) || null;
    saldo = pessoaSelecionada ? Number(pessoaSelecionada.saldo_fiado || 0) : 0;
    history = [];
    if(pessoaSelecionada){
      await loadHistory(pessoaSelecionada.id);
    }
  }

  async function loadHistory(pessoaId){
    loadingHistory = true;
    const { data, error } = await supabase
      .from('vendas')
      .select('id, created_at, valor_total, vendas_itens(nome_produto_na_venda)')
      .eq('id_cliente', pessoaId)
      .eq('forma_pagamento', 'fiado')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if(!error){
      history = data || [];
    } else {
	  console.error('Erro history:', error);
	  // Se erro por coluna missing, não crasha, só mostra vazio
	}
    loadingHistory = false;
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
    if(pessoaSelecionada) selecionar(pessoaSelecionada.id);
  }

  async function deletarVenda(id){
    if(!confirm('Deseja realmente apagar esta transação do histórico?')) return;
    
    // Deleta a venda (cascata deve cuidar dos itens, se configurado, ou deixa orfão se sem FK cascade)
    // Assume-se que o usuário quer remover o registro visual.
    const { error } = await supabase.from('vendas').delete().eq('id', id);
    
    if(error){
      alert('Erro ao apagar: ' + error.message);
    } else {
      // Recarrega histórico
      if(pessoaSelecionada) await loadHistory(pessoaSelecionada.id);
    }
  }

  function buildReciboPagamento(nome, valor){
    const dt = new Date().toLocaleString('pt-BR');
    return `Zelo PDV\n\nRECIBO DE PAGAMENTO (FIADO)\n\nPessoa: ${nome}\nValor: R$ ${valor.toFixed(2)}\nData: ${dt}\n\nObrigado!`;
  }

  onMount(async () => { loading = true; await loadPessoas(); loading = false; });
</script>

<section class="wrap">
  <div class="header">
    <h2 class="title">Fichário (Fiado)</h2>
    <a class="btn ghost" href="/admin/pessoas">Gerenciar Pessoas</a>
  </div>

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
        <div class="saldo-box">
          <span class="label">Saldo Devedor</span>
          <span class="value">R$ {saldo.toFixed(2)}</span>
        </div>
        <label>Valor do pagamento
          <input type="number" min="0" step="0.01" placeholder="0,00" bind:value={valorPagamento} />
        </label>
				<div class="checks">
					<label class="custom-check">
						<input type="checkbox" bind:checked={addAoCaixa} />
						<span class="checkmark">
							<svg viewBox="0 0 24 24" fill="none" class="icon"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</span>
						<span class="text">Adicionar ao caixa atual</span>
					</label>
					
					<label class="custom-check">
						<input type="checkbox" bind:checked={imprimirRecibo} />
						<span class="checkmark">
							<svg viewBox="0 0 24 24" fill="none" class="icon"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</span>
						<span class="text">Imprimir recibo</span>
					</label>
				</div>
				
				<button class="btn-primary" on:click={registrarPagamento}>Registrar Pagamento</button>
			{:else}
				<p class="hint">Selecione uma pessoa para ver saldo e pagar.</p>
			{/if}
		</div>

		<div class="card">
			<h3 class="card-title">Histórico de Compras (Fiado)</h3>
			<p class="sub-hint">
				Histórico recente de fiados. O débito é gerado na venda.
				<br/><small>O histórico pode ser apagado a cada 3 meses.</small>
			</p>

			{#if pessoaSelecionada}
				<div class="history-list">
					{#if loadingHistory}
						<p>Carregando...</p>
					{:else if history.length === 0}
						<p class="empty">Nenhuma compra recente.</p>
					{:else}
						<table>
							<thead><tr><th>Data</th><th>Itens</th><th>Valor</th><th style="width:40px"></th></tr></thead>
							<tbody>
								{#each history as item}
									<tr>
										<td>{new Date(item.created_at).toLocaleDateString()}</td>
										<td>
											{#if item.vendas_itens && item.vendas_itens.length}
												{item.vendas_itens.map(i => i.nome_produto_na_venda).join(', ').slice(0,40)}...
											{:else}-{/if}
										</td>
										<td>R$ {Number(item.valor_total).toFixed(2)}</td>
										<td class="center">
											<button class="btn-icon danger" title="Apagar" on:click={() => deletarVenda(item.id)}>
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			{:else}
				<div class="placeholder-history">Selecione uma pessoa.</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.wrap{padding:20px;max-width:1100px;margin:0 auto;color:#e5e7eb}
	.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
	.title{font-size:24px;font-weight:bold;color:#f3f4f6;margin:0}
	
	.grid{display:grid;grid-template-columns:1fr 1.5fr;gap:20px}
	@media (max-width:850px){.grid{grid-template-columns:1fr}}
	
	.card{background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:20px;display:flex;flex-direction:column}
	
	label{display:flex;flex-direction:column;color:#94a3b8;font-size:14px;margin-bottom:12px}
	
	select,input[type="number"]{margin-top:6px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f8fafc;padding:10px;font-size:15px}
	
	.saldo-box{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;margin-bottom:16px}
	.saldo-box .label{color:#94a3b8;font-size:12px;text-transform:uppercase}
	.saldo-box .value{display:block;color:#ef4444;font-size:26px;font-weight:bold}
	
	/* Custom Checkbox */
	.checks{margin-bottom:20px;display:flex;flex-direction:column;gap:12px}
	.custom-check {
		display: flex;
		flex-direction: row; /* override default column */
		align-items: center;
		cursor: pointer;
		user-select: none;
		gap: 12px;
		margin: 0;
	}
	.custom-check input { display: none; }
	.custom-check .checkmark {
		width: 24px; height: 24px;
		background: #0f172a;
		border: 2px solid #334155;
		border-radius: 6px;
		display: flex; align-items: center; justify-content: center;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.custom-check .icon {
		width: 16px; height: 16px;
		color: white;
		opacity: 0;
		transform: scale(0.5);
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.custom-check input:checked + .checkmark {
		background: #10b981;
		border-color: #10b981;
		box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
	}
	.custom-check input:checked + .checkmark .icon {
		opacity: 1;
		transform: scale(1);
	}
	.custom-check .text {
		color: #e2e8f0;
		font-size: 14px;
	}

	.btn.ghost{background:transparent;border:1px solid #475569;color:#94a3b8;border-radius:6px;padding:6px 12px;text-decoration:none;font-size:13px}
	.btn-primary{background:#2563eb;border:none;color:white;border-radius:8px;height:44px;font-size:16px;width:100%;cursor:pointer}
	
	.hint{color:#64748b;font-style:italic}
	.sub-hint{color:#64748b;font-size:13px;margin-bottom:16px;line-height:1.4}
	.err{color:#ef4444;margin-bottom:16px}
	.card-title{margin:0 0 10px 0;font-size:18px;color:#f1f5f9}
	
	table{width:100%;border-collapse:collapse;font-size:13px}
	th{text-align:left;color:#94a3b8;border-bottom:1px solid #334155;padding:8px}
	td{padding:8px;border-bottom:1px solid #1e293b;color:#cbd5e1}
	td.center{text-align:center}
	.btn-icon{background:transparent;border:none;padding:4px;cursor:pointer;color:#94a3b8;border-radius:4px;display:flex;align-items:center;justify-content:center}
	.btn-icon:hover{background:#334155;color:white}
	.btn-icon.danger:hover{background:rgba(239,68,68,0.2);color:#ef4444}
	.btn-icon svg{width:16px;height:16px}
	
	.empty{color:#64748b;text-align:center;padding:20px}
	.placeholder-history{display:flex;align-items:center;justify-content:center;height:100px;color:#475569;font-style:italic}
</style>
