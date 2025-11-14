<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { ensureActiveSubscription } from '$lib/guards';

	let loading = true;
	let errorMessage = '';

	// Filtro: lista de caixas do usuário (últimos 60 dias) e caixa selecionado
	let caixas = [];
	let caixaSelecionado = null; // id
	let caixaInfo = null; // dados do caixa selecionado

	// Dados
	let vendas = [];
	let vendasItens = [];
	let vendasPagamentos = [];
	let produtosMap = new Map(); // id_produto -> { id, nome, preco }
	let movs = [];
	let fechamentos = [];

	// Helpers
	const fmt = (n) => `R$ ${Number(n || 0).toFixed(2)}`;

	onMount(async () => {
		const ok = await ensureActiveSubscription({ requireProfile: true });
		if (!ok) return;
		const { waitAuthReady } = await import('$lib/authStore');
		await waitAuthReady();
		try {
			const { data: userData } = await supabase.auth.getUser();
			const uid = userData?.user?.id;
			if (!uid) { window.location.href = '/login'; return; }

			// Carrega caixas do usuário (últimos 60 dias)
			const corte = new Date(); corte.setDate(corte.getDate() - 60);
			const { data: cs, error: cErr } = await supabase
				.from('caixas')
				.select('id, data_abertura, data_fechamento, valor_inicial')
				.eq('id_usuario', uid)
				.gte('data_abertura', corte.toISOString())
				.order('data_abertura', { ascending: false });
			if (cErr) throw cErr;
			caixas = cs || [];
			if (caixas.length === 0) { loading = false; return; }
			caixaSelecionado = caixas[0]?.id;
			await carregarRelatorioDoCaixa(caixaSelecionado);

			// Histórico de fechamentos (30 dias)
			const limite = new Date(); limite.setDate(limite.getDate() - 30);
			const { data: hs, error: hErr } = await supabase
				.from('caixa_fechamentos')
				.select('id, data_fechamento, total_dinheiro, total_cartao, total_pix, total_geral, valor_inicial, valor_esperado_em_gaveta, valor_contado_em_gaveta, diferenca, quantidade_vendas')
				.eq('id_usuario', uid)
				.gte('data_fechamento', limite.toISOString())
				.order('data_fechamento', { ascending: false });
			if (hErr) throw hErr;
			fechamentos = hs || [];
		} catch (err) {
			errorMessage = err?.message || 'Erro ao carregar relatórios.';
		} finally {
			loading = false;
		}
	});

	async function carregarRelatorioDoCaixa(idCaixa) {
		if (!idCaixa) return;
		try {
			loading = true;
			errorMessage = '';
			// Info do caixa
			const { data: cx, error: cxErr } = await supabase
				.from('caixas')
				.select('id, data_abertura, data_fechamento, valor_inicial')
				.eq('id', idCaixa)
				.single();
			if (cxErr) throw cxErr;
			caixaInfo = cx;

			// Vendas do caixa
			const { data: vs, error: vErr } = await supabase
				.from('vendas')
				.select('id, valor_total, forma_pagamento, valor_recebido, valor_troco, created_at')
				.eq('id_caixa', idCaixa)
				.order('id', { ascending: true });
			if (vErr) throw vErr;
			vendas = vs || [];

			const ids = (vendas || []).map(v => v.id);
			vendasItens = [];
			if (ids.length) {
				const { data: its, error: iErr } = await supabase
					.from('vendas_itens')
					.select('id_venda, id_produto, nome_produto_na_venda, quantidade, preco_unitario_na_venda')
					.in('id_venda', ids);
				if (iErr) throw iErr;
				vendasItens = its || [];
				// Carrega preços atuais dos produtos para cálculo de receita conforme solicitação
				const pids = Array.from(new Set((vendasItens||[]).map(it => it.id_produto).filter(Boolean)));
				produtosMap = new Map();
				if (pids.length) {
					const { data: ps, error: pErr } = await supabase
						.from('produtos')
						.select('id, nome, preco')
						.in('id', pids);
					if (!pErr && ps) {
						produtosMap = new Map(ps.map(p => [p.id, p]));
					}
				}
			}

			// Pagamentos das vendas (para lidar com forma_pagamento = 'multiplo')
			vendasPagamentos = [];
			if (ids.length) {
				const { data: pags, error: pgsErr } = await supabase
					.from('vendas_pagamentos')
					.select('id_venda, forma_pagamento, valor')
					.in('id_venda', ids);
				if (pgsErr) throw pgsErr;
				vendasPagamentos = pags || [];
			}

			// Movimentações do caixa (sangria/suprimento)
			const { data: ms, error: mErr } = await supabase
				.from('caixa_movimentacoes')
				.select('tipo, valor, motivo, created_at')
				.eq('id_caixa', idCaixa)
				.order('created_at', { ascending: false });
			if (mErr) throw mErr;
			movs = ms || [];
		} catch (err) {
			errorMessage = err?.message || 'Erro ao carregar dados do caixa.';
		} finally {
			loading = false;
		}
	}

	// KPIs com suporte a múltiplos pagamentos (corrigido cálculo de dinheiro líquido)
	// Dinheiro em vendas simples: valor_recebido - valor_troco (não usar valor_total, pois pode haver troco)
	$: dinheiroSimplesLiquido = (vendas || [])
		.filter(v => v.forma_pagamento === 'dinheiro')
		.reduce((a, v) => a + Math.max(0, Number(v.valor_recebido || 0) - Number(v.valor_troco || 0)), 0);

	// Dinheiro em vendas múltiplas: soma das linhas "dinheiro" menos troco (se houver troco e linha dinheiro)
	$: dinheiroMultiploLiquido = (vendas || [])
		.filter(v => v.forma_pagamento === 'multiplo')
		.reduce((acc, v) => {
			const linhas = (vendasPagamentos || []).filter(p => p.id_venda === v.id && p.forma_pagamento === 'dinheiro');
			if (linhas.length === 0) return acc; // sem dinheiro nesta venda
			const soma = linhas.reduce((s, p) => s + Number(p.valor || 0), 0);
			const troco = Number(v.valor_troco || 0);
			return acc + Math.max(0, soma - troco);
		}, 0);

	// Para exibição total de dinheiro (líquido em gaveta)
	$: totalDinheiro = Number(dinheiroSimplesLiquido + dinheiroMultiploLiquido);

	// Demais formas: somamos vendas simples daquela forma + linhas de pagamentos múltiplos
	$: singleDebito = (vendas || []).filter(v => v.forma_pagamento === 'cartao_debito').reduce((a, v) => a + Number(v.valor_total || 0), 0);
	$: singleCredito = (vendas || []).filter(v => v.forma_pagamento === 'cartao_credito').reduce((a, v) => a + Number(v.valor_total || 0), 0);
	$: totalCartaoLegacy = (vendas || []).filter(v => v.forma_pagamento === 'cartao').reduce((a, v) => a + Number(v.valor_total || 0), 0);
	$: singlePix = (vendas || []).filter(v => v.forma_pagamento === 'pix').reduce((a, v) => a + Number(v.valor_total || 0), 0);
	$: pagDebito = (vendasPagamentos || []).filter(p => p.forma_pagamento === 'cartao_debito').reduce((a, p) => a + Number(p.valor || 0), 0);
	$: pagCredito = (vendasPagamentos || []).filter(p => p.forma_pagamento === 'cartao_credito').reduce((a, p) => a + Number(p.valor || 0), 0);
	$: pagPix = (vendasPagamentos || []).filter(p => p.forma_pagamento === 'pix').reduce((a, p) => a + Number(p.valor || 0), 0);
	$: totalCartaoDebito = Number(singleDebito + pagDebito);
	$: totalCartaoCredito = Number(singleCredito + pagCredito);
	$: totalCartao = Number(totalCartaoDebito + totalCartaoCredito + totalCartaoLegacy);
	$: totalPix = Number(singlePix + pagPix);
	$: totalGeral = Number((vendas || []).reduce((a, v) => a + Number(v.valor_total || 0), 0));
	$: qtdVendas = (vendas || []).length;
	$: ticketMedio = qtdVendas ? totalGeral / qtdVendas : 0;

	// Movimentações resumo
	$: totalSangria = (movs || []).filter(m => m.tipo === 'sangria').reduce((a, m) => a + Number(m.valor || 0), 0);
	$: totalSuprimento = (movs || []).filter(m => m.tipo === 'suprimento').reduce((a, m) => a + Number(m.valor || 0), 0);
	$: saldoEsperadoGaveta = Number((caixaInfo?.valor_inicial || 0) + totalDinheiro - totalSangria + totalSuprimento);

	// Top produtos (por receita total)
	let ordenarTop = 'receita'; // 'receita' | 'quantidade' | 'alfabetica'
	let ordenarDirecao = 'desc'; // 'desc' | 'asc'
	$: topProdutos = (() => {
		const map = new Map();
		for (const it of (vendasItens || [])) {
			const key = it.nome_produto_na_venda || 'Item';
			const qtd = Number(it.quantidade || 0);
			// Regra pedida: receita = valor do produto * quantidade
			// Preferimos o preço do produto (quando houver id_produto); senão, usamos o preço salvo na venda
			const precoProduto = it.id_produto ? Number(produtosMap.get(it.id_produto)?.preco || 0) : Number(it.preco_unitario_na_venda || 0);
			const receita = precoProduto * qtd;
			const prev = map.get(key) || { nome: key, quantidade: 0, receita: 0 };
			prev.quantidade += qtd;
			prev.receita += receita;
			map.set(key, prev);
		}
		let arr = Array.from(map.values());
		const dir = ordenarDirecao === 'asc' ? 1 : -1;
		if (ordenarTop === 'quantidade') {
			arr.sort((a, b) => dir * (a.quantidade - b.quantidade));
		} else if (ordenarTop === 'alfabetica') {
			arr.sort((a, b) => dir * a.nome.localeCompare(b.nome, 'pt-BR'));
		} else {
			arr.sort((a, b) => dir * (a.receita - b.receita));
		}
		return arr.slice(0, 10);
	})();

	// CSV helpers
	function downloadCSV(filename, rows) {
		const csv = rows.map(r => r.map(v => {
			const s = String(v ?? '');
			return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
		}).join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = filename; a.click();
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	}

	function exportarVendasCSV() {
		const header = ['id_venda', 'forma_pagamento', 'valor_total'];
		const rows = (vendas || []).map(v => [v.id, v.forma_pagamento, Number(v.valor_total || 0).toFixed(2)]);
		downloadCSV(`vendas_caixa_${caixaInfo?.id || ''}.csv`, [header, ...rows]);
	}
	function exportarItensCSV() {
		const header = ['id_venda', 'produto', 'quantidade', 'total_item'];
		const rows = (vendasItens || []).map(it => {
			const qtd = Number(it.quantidade || 0);
			const unit = it.id_produto ? Number(produtosMap.get(it.id_produto)?.preco || 0) : Number(it.preco_unitario_na_venda || 0);
			return [it.id_venda, it.nome_produto_na_venda, qtd, (unit * qtd).toFixed(2)];
		});
		downloadCSV(`itens_caixa_${caixaInfo?.id || ''}.csv`, [header, ...rows]);
	}
	function exportarResumoCSV() {
		const rows = [
			['Caixa', caixaInfo?.id || ''],
			['Abertura', caixaInfo?.data_abertura ? new Date(caixaInfo.data_abertura).toLocaleString() : ''],
			['Fechamento', caixaInfo?.data_fechamento ? new Date(caixaInfo.data_fechamento).toLocaleString() : '—'],
			['Valor inicial', Number(caixaInfo?.valor_inicial || 0).toFixed(2)],
			['Vendas (Dinheiro)', Number(totalDinheiro).toFixed(2)],
			['Vendas (Cartão - Débito)', Number(totalCartaoDebito).toFixed(2)],
			['Vendas (Cartão - Crédito)', Number(totalCartaoCredito).toFixed(2)],
			['Vendas (Cartão - Outros/legado)', Number(totalCartaoLegacy).toFixed(2)],
			['Vendas (Cartão - Total)', Number(totalCartao).toFixed(2)],
			['Vendas (Pix)', Number(totalPix).toFixed(2)],
			['Vendas (Total)', Number(totalGeral).toFixed(2)],
			['Qtd. vendas', qtdVendas],
			['Ticket médio', Number(ticketMedio).toFixed(2)],
			['Sangria', Number(totalSangria).toFixed(2)],
			['Suprimento', Number(totalSuprimento).toFixed(2)],
			['Saldo esperado em gaveta', Number(saldoEsperadoGaveta).toFixed(2)],
		];
		downloadCSV(`resumo_caixa_${caixaInfo?.id || ''}.csv`, rows);
	}
</script>

<h1 class="text-2xl font-semibold mb-4">Relatórios</h1>
{#if errorMessage}
	<div class="mb-4 text-sm text-red-600">{errorMessage}</div>
{/if}

<!-- Filtros: seleção de caixa -->
<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
	<div class="grid md:grid-cols-2 gap-4 items-end">
		<div>
			<label class="block text-sm text-slate-600 mb-1" for="select-caixa">Selecionar caixa</label>
			<select id="select-caixa" class="input-form" bind:value={caixaSelecionado} on:change={() => carregarRelatorioDoCaixa(caixaSelecionado)}>
				{#each caixas as c}
					<option value={c.id}>
						#{c.id} — {new Date(c.data_abertura).toLocaleString()} {c.data_fechamento ? `(fechado ${new Date(c.data_fechamento).toLocaleString()})` : '(aberto)'}
					</option>
				{/each}
			</select>
		</div>
		<div class="flex gap-2 justify-end">
			<button class="btn-secondary" on:click={exportarResumoCSV}>Exportar Resumo</button>
			<button class="btn-secondary" on:click={exportarVendasCSV}>Exportar Vendas</button>
			<button class="btn-secondary" on:click={exportarItensCSV}>Exportar Itens</button>
		</div>
	</div>
</section>

{#if loading}
	<div>Carregando...</div>
{:else}
	{#if !caixaSelecionado}
		<div class="text-sm text-slate-600">Nenhum caixa selecionado.</div>
	{:else}
		<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-4">
			<!-- KPIs -->
			<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Total de Vendas</div>
					<div class="text-xl font-semibold">{fmt(totalGeral)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Qtd. de Vendas</div>
					<div class="text-xl font-semibold">{qtdVendas}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Ticket Médio</div>
					<div class="text-xl font-semibold">{fmt(ticketMedio)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Valor Inicial do Caixa</div>
					<div class="text-xl font-semibold">{fmt(caixaInfo?.valor_inicial || 0)}</div>
				</div>
			</div>

			<div class="grid sm:grid-cols-3 gap-4">
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Dinheiro</div>
					<div class="text-lg font-semibold">{fmt(totalDinheiro)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Cartão</div>
					<div class="text-lg font-semibold">{fmt(totalCartao)}</div>
					<div class="text-xs text-slate-500 mt-1">Débito {fmt(totalCartaoDebito)} · Crédito {fmt(totalCartaoCredito)}{totalCartaoLegacy>0?` · Outros ${fmt(totalCartaoLegacy)}`:''}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Pix</div>
					<div class="text-lg font-semibold">{fmt(totalPix)}</div>
				</div>
			</div>

			<div class="grid sm:grid-cols-3 gap-4">
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Sangria</div>
					<div class="text-lg font-semibold text-amber-700">{fmt(totalSangria)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Suprimento</div>
					<div class="text-lg font-semibold text-green-700">{fmt(totalSuprimento)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Saldo Esperado em Gaveta</div>
					<div class="text-lg font-semibold">{fmt(saldoEsperadoGaveta)}</div>
				</div>
			</div>

			<!-- Top produtos -->
			<div>
				<h2 class="font-semibold mb-2">Top Produtos</h2>
				<div class="mb-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
					<div class="flex items-center gap-2">
						<label for="top-order">Ordenar por</label>
						<select id="top-order" class="input-form max-w-52" bind:value={ordenarTop}>
							<option value="receita">Receita</option>
							<option value="quantidade">Quantidade</option>
							<option value="alfabetica">Produto</option>
						</select>
					</div>
					<div class="flex items-center gap-2">
						<label for="top-dir">Direção</label>
						<select id="top-dir" class="input-form max-w-40" bind:value={ordenarDirecao}>
							<option value="desc">Maior → menor / Z → A</option>
							<option value="asc">Menor → maior / A → Z</option>
						</select>
					</div>
				</div>
				{#if topProdutos.length === 0}
					<div class="text-sm text-slate-600">Sem itens em vendas para este caixa.</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-slate-500">
									<th class="py-2 pr-4">Produto</th>
									<th class="py-2 pr-4">Quantidade</th>
									<th class="py-2">Receita</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each topProdutos as p}
									<tr>
										<td class="py-2 pr-4">{p.nome}</td>
										<td class="py-2 pr-4">{p.quantidade}</td>
										<td class="py-2">{fmt(p.receita)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<!-- Vendas -->
			<div>
				<h2 class="font-semibold mb-2">Vendas do Caixa</h2>
				{#if vendas.length === 0}
					<div class="text-sm text-slate-600">Sem vendas para este caixa.</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-slate-500">
									<th class="py-2 pr-4">#</th>
									<th class="py-2 pr-4">Horário</th>
									<th class="py-2 pr-4">Forma</th>
									<th class="py-2">Total</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each vendas as v}
									<tr>
										<td class="py-2 pr-4">{v.id}</td>
										<td class="py-2 pr-4">{v.created_at ? new Date(v.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '-'}</td>
										<td class="py-2 pr-4">{v.forma_pagamento}</td>
										<td class="py-2">{fmt(v.valor_total)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<!-- Movimentações de Caixa -->
			<div>
				<h2 class="font-semibold mb-2">Movimentações do Caixa</h2>
				{#if movs.length === 0}
					<div class="text-sm text-slate-600">Sem sangrias/suprimentos.</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-slate-500">
									<th class="py-2 pr-4">Quando</th>
									<th class="py-2 pr-4">Tipo</th>
									<th class="py-2 pr-4">Valor</th>
									<th class="py-2">Motivo</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each movs as m}
									<tr>
										<td class="py-2 pr-4">{m.created_at ? new Date(m.created_at).toLocaleString() : '-'}</td>
										<td class="py-2 pr-4">{m.tipo}</td>
										<td class="py-2 pr-4">{fmt(m.valor)}</td>
										<td class="py-2">{m.motivo || ''}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</section>
	{/if}
{/if}
