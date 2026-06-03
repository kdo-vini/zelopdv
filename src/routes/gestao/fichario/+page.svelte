<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { logAuditAction } from '$lib/accessControl';
  import { addToast } from '$lib/stores/ui';
  import { printPagamentoFiado } from '$lib/printService';
  import { revertFiadoDebtForVenda } from '$lib/finance/saleOps';
  export let params;

  let pessoas = [];
  let pessoaSelecionada = null;
  let saldo = 0;
  let valorPagamento = '';
  let addAoCaixa = true;
  let imprimirRecibo = true;
  let loading = true;
  let salvando = false;
  let errorMsg = '';
  let ownerUserId = '';
  let operadorUserId = '';
  let isSubUser = false;
  
  let history = [];
  let loadingHistory = false;

  async function loadPessoas(){
    if (!ownerUserId) return;
    const { data, error } = await supabase.from('pessoas').select('id,nome,tipo,saldo_fiado,contato').eq('id_usuario', ownerUserId).order('nome');
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
      .eq('id_usuario', ownerUserId)
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
    if(salvando) return; // Previne duplo clique
    if(!pessoaSelecionada){ addToast('Selecione uma pessoa.', 'info'); return; }
    const valor = Number(valorPagamento);
    if(!valor || valor <= 0){ addToast('Informe um valor válido.', 'error'); return; }

    salvando = true;
    try {
      const { error: errPay } = await supabase.rpc('fiado_registrar_pagamento', { p_id_pessoa: pessoaSelecionada.id, p_valor: valor });
      if(errPay){ addToast(errPay.message, 'error'); return; }

    if(addAoCaixa){
      const { data: cx } = await supabase.from('caixas').select('id').eq('id_usuario', ownerUserId).is('data_fechamento', null).order('data_abertura', { ascending:false }).limit(1).maybeSingle();
      if(cx?.id){
        await supabase.from('caixa_movimentacoes').insert({
          id_caixa: cx.id,
          id_usuario: ownerUserId,
          id_operador: operadorUserId,
          tipo: 'suprimento',
          valor,
          motivo: `Pagamento fiado de ${pessoaSelecionada.nome}`
        });
      }
    }

    if (isSubUser) {
      logAuditAction({
        ownerUserId,
        action: 'fiado.pagamento_registrado',
        entityType: 'pessoa',
        entityId: pessoaSelecionada.id,
        details: {
          nome: pessoaSelecionada.nome,
          valor,
          addAoCaixa
        }
      });
    }

    addToast('Pagamento registrado com sucesso!', 'success');

    if(imprimirRecibo){
      try {
        const { data: perfilData } = await supabase
          .from('empresa_perfil')
          .select('nome_exibicao, documento, contato, endereco, largura_bobina, rodape_recibo')
          .eq('user_id', ownerUserId)
          .limit(1)
          .maybeSingle();
        const saldoAtual = Number((pessoaSelecionada?.saldo_fiado || 0)) - valor;
        await printPagamentoFiado({
          estabelecimento: {
            nome_exibicao: perfilData?.nome_exibicao || 'Zelo PDV',
            documento: perfilData?.documento || null,
            contato: perfilData?.contato || null,
            endereco: perfilData?.endereco || null,
            largura_bobina: perfilData?.largura_bobina || '80mm',
            rodape_recibo: perfilData?.rodape_recibo || 'Obrigado!',
          },
          pagamento: {
            nomePessoa: pessoaSelecionada.nome,
            valor,
            saldoAnterior: Number(pessoaSelecionada?.saldo_fiado || 0),
            saldoAtual: Math.max(0, saldoAtual),
          },
        });
      } catch (e) {
        console.warn('[Fiado] Falha ao imprimir recibo:', e?.message);
      }
    }

    valorPagamento = '';
    await loadPessoas();
    if(pessoaSelecionada) selecionar(pessoaSelecionada.id);
    } finally {
      salvando = false;
    }
  }

  // Controle do modal de deleção
  let itemParaDeletarId = null; 
  function solicitarDelecao(id) {
    itemParaDeletarId = id;
  }
  function cancelarDelecao() {
    itemParaDeletarId = null;
  }

  async function confirmarDelecao(){
    if(!itemParaDeletarId) return;
    const id = itemParaDeletarId;
    itemParaDeletarId = null;

    try {
      // Estorna a dívida no fichário ANTES de apagar a venda, para que o
      // saldo_fiado da pessoa fique consistente caso a venda seja fiado.
      await revertFiadoDebtForVenda(supabase, id);
    } catch (e) {
      addToast('Não foi possível estornar a dívida no fichário: ' + (e?.message || e), 'error');
      return;
    }

    await supabase.from('pedidos').update({ id_venda: null }).eq('id_venda', id);
    const { error } = await supabase.from('vendas').delete().eq('id', id);

    if(error){
      addToast('Erro ao apagar: ' + error.message, 'error');
    } else {
      addToast('Transação apagada.', 'success');
      // Recarrega lista de pessoas (saldo_fiado mudou) e histórico
      await loadPessoas();
      if(pessoaSelecionada){
        const refreshed = pessoas.find(p => p.id === pessoaSelecionada.id);
        if (refreshed){
          pessoaSelecionada = refreshed;
          saldo = Number(refreshed.saldo_fiado || 0);
        }
        await loadHistory(pessoaSelecionada.id);
      }
    }
  }

  function openWhatsApp(pessoa) {
    const numero = (pessoa.contato || '').replace(/\D/g, '');
    const saldoFormatado = Number(pessoa.saldo_fiado || 0).toFixed(2).replace('.', ',');
    const msg = `Olá ${pessoa.nome}! Passamos para avisar que você possui *R$ ${saldoFormatado}* na ficha pessoal em aberto conosco. Quando puder, regularize! Obrigado!`;
    const url = numero
      ? `https://wa.me/55${numero}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  onMount(async () => {
    loading = true;
    const authCtx = await ensureActiveSubscription({ requireProfile: true });
    if (!authCtx) {
      loading = false;
      return;
    }
    ownerUserId = authCtx.ownerUserId;
    operadorUserId = authCtx.userId;
    isSubUser = authCtx.isSubUser;
    await loadPessoas();
    loading = false;
  });
</script>

<section class="wrap">
  <div class="header border-b border-slate-700/60 pb-4 mb-6">
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Financeiro / Fichário</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Fichário (Fiado)</h1>
    </div>
    <a class="btn ghost" href="/gestao/pessoas">Gerenciar Pessoas</a>
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
          <div class="saldo-row">
            <span class="value">R$ {saldo.toFixed(2)}</span>
            <button class="btn-wa" title="Avisar via WhatsApp" on:click={() => openWhatsApp(pessoaSelecionada)}>
              <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </button>
          </div>
        </div>
        <label>Valor do pagamento
          <input type="number" min="0" step="0.01" placeholder="0,00" bind:value={valorPagamento} />
        </label>
				<div class="checks">
					<label class="flex items-center gap-2 cursor-pointer select-none text-sm" style="color: var(--text-label);">
						<input class="themed-checkbox" type="checkbox" bind:checked={addAoCaixa} />
						<span>Adicionar ao caixa atual</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer select-none text-sm" style="color: var(--text-label);">
						<input class="themed-checkbox" type="checkbox" bind:checked={imprimirRecibo} />
						<span>Imprimir recibo</span>
					</label>
				</div>
				
				<button class="btn-primary" disabled={salvando} on:click={registrarPagamento}>
					{salvando ? 'Processando...' : 'Registrar Pagamento'}
				</button>
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
											<button class="btn-icon danger" title="Apagar" on:click={() => solicitarDelecao(item.id)}>
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

  <!-- Modal de Confirmação de Deleção -->
  {#if itemParaDeletarId}
    <div class="modal-backdrop" on:click={cancelarDelecao}>
      <div class="modal" on:click|stopPropagation>
        <h3 class="modal-title">Apagar Transação?</h3>
        <p class="modal-text">Deseja realmente apagar esta transação do histórico?</p>
        <div class="modal-actions">
          <button class="btn ghost" on:click={cancelarDelecao}>Cancelar</button>
          <button class="btn-primary danger" on:click={confirmarDelecao}>Sim, apagar</button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
	.wrap{padding:20px;max-width:1100px;margin:0 auto;color:var(--text-label)}
	.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
	.title{font-size:24px;font-weight:bold;color:var(--text-main);margin:0}
	
	.grid{display:grid;grid-template-columns:1fr 1.5fr;gap:20px}
	@media (max-width:850px){.grid{grid-template-columns:1fr}}
	
	.card{background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:20px;display:flex;flex-direction:column}
	
	label{display:flex;flex-direction:column;color:var(--text-muted);font-size:14px;margin-bottom:12px}
	
	select,input[type="number"]{margin-top:6px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-main);padding:10px;font-size:15px}
	
	.saldo-box{background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:8px;padding:16px;text-align:center;margin-bottom:16px}
	.saldo-box .label{color:var(--text-muted);font-size:12px;text-transform:uppercase;display:block;margin-bottom:6px}
	.saldo-row{display:flex;align-items:center;justify-content:center;gap:10px}
	.saldo-box .value{color:var(--error);font-size:26px;font-weight:bold}
	.btn-wa{background:transparent;border:none;padding:4px;cursor:pointer;color:#25D366;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.15s}
	.btn-wa:hover{background:rgba(37,211,102,0.15)}
	.btn-wa svg{width:22px;height:22px}
	
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
		background: var(--bg-input);
		border: 2px solid var(--border-subtle);
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
		background: var(--success);
		border-color: var(--success);
		box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
	}
	.custom-check input:checked + .checkmark .icon {
		opacity: 1;
		transform: scale(1);
	}
	.custom-check .text {
		color: var(--text-label);
		font-size: 14px;
	}

	.btn.ghost{background:transparent;border:1px solid var(--border-strong);color:var(--text-muted);border-radius:6px;padding:6px 12px;text-decoration:none;font-size:13px}
	.btn-primary{background:var(--primary);border:none;color:white;border-radius:8px;height:44px;font-size:16px;width:100%;cursor:pointer}
	
	.hint{color:var(--text-muted);font-style:italic}
	.sub-hint{color:var(--text-muted);font-size:13px;margin-bottom:16px;line-height:1.4}
	.err{color:var(--error);margin-bottom:16px}
	.card-title{margin:0 0 10px 0;font-size:18px;color:var(--text-main)}
	
	table{width:100%;border-collapse:collapse;font-size:13px}
	th{text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border-subtle);padding:8px}
	td{padding:8px;border-bottom:1px solid var(--border-card);color:var(--text-label)}
	td.center{text-align:center}
	.btn-icon{background:transparent;border:none;padding:4px;cursor:pointer;color:var(--text-muted);border-radius:4px;display:flex;align-items:center;justify-content:center}
	.btn-icon:hover{background:var(--border-subtle);color:white}
	.btn-icon.danger:hover{background:rgba(239,68,68,0.2);color:var(--error)}
	.btn-icon svg{width:16px;height:16px}
	
	.empty{color:var(--text-muted);text-align:center;padding:20px}
	.placeholder-history{display:flex;align-items:center;justify-content:center;height:100px;color:var(--border-strong);font-style:italic}

  /* Modal Styles */
  .modal-backdrop{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000}
  .modal{background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;padding:24px;width:100%;max-width:400px;box-shadow:0 10px 25px rgba(0,0,0,0.2)}
  .modal-title{margin:0 0 12px 0;font-size:18px;color:var(--text-main);font-weight:bold}
  .modal-text{margin:0 0 24px 0;font-size:14px;color:var(--text-label)}
  .modal-actions{display:flex;justify-content:flex-end;gap:12px}
  .modal-actions .btn-primary.danger{background:var(--error);width:auto;padding:0 20px}
</style>
