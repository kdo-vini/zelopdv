<script>
	// Relatórios: modo por caixa e por período (multi-caixas agregados)
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { ensureActiveSubscription } from '$lib/guards';
	import { withTimeout } from '$lib/utils';
	import { addToast } from '$lib/stores/ui';

	export let params;

	let loading = true;
	let errorMessage = '';

	// Modo de relatório: 'caixa' (existente) ou 'periodo'
	let modoRelatorio = 'caixa';

	// UID do usuário autenticado
	let uid = null;

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
			uid = userData?.user?.id;
			if (!uid) { window.location.href = '/login'; return; }

			await carregarCaixasRecentes();
			if (caixas.length) {
				caixaSelecionado = caixas[0]?.id;
				await carregarRelatorioDoCaixa(caixaSelecionado);
			}
			await carregarFechamentosRecentes();
			// Carrega período inicial (hoje) para modo 'periodo'
			aplicarPreset('hoje');
			await carregarRelatorioPeriodo();
		} catch (err) {
			errorMessage = err?.message || 'Erro ao carregar relatórios.';
		} finally {
			loading = false;
		}
	});

	async function carregarCaixasRecentes() {
		const corte = new Date(); corte.setDate(corte.getDate() - 60);
		try {
			const { data: cs, error: cErr } = await withTimeout(
				supabase
					.from('caixas')
					.select('id, data_abertura, data_fechamento, valor_inicial')
					.eq('id_usuario', uid)
					.gte('data_abertura', corte.toISOString())
					.order('data_abertura', { ascending: false })
			);
			if (!cErr) caixas = cs || [];
		} catch (e) {
			addToast('Erro ao carregar caixas: ' + e.message, 'error');
		}
	}

	async function carregarFechamentosRecentes() {
		const limite = new Date(); limite.setDate(limite.getDate() - 30);
		try {
			const { data: hs, error: hErr } = await withTimeout(
				supabase
					.from('caixa_fechamentos')
					.select('id, data_fechamento, total_dinheiro, total_cartao, total_pix, total_geral, valor_inicial, valor_esperado_em_gaveta, valor_contado_em_gaveta, diferenca, quantidade_vendas')
					.eq('id_usuario', uid)
					.gte('data_fechamento', limite.toISOString())
					.order('data_fechamento', { ascending: false })
			);
			if (!hErr) fechamentos = hs || [];
		} catch (e) {
			addToast('Erro ao carregar fechamentos: ' + e.message, 'error');
		}
	}

	async function carregarRelatorioDoCaixa(idCaixa) {
		if (!idCaixa) return;
		try {
			loading = true;
			errorMessage = '';
			// 1. Info do caixa
			const pCaixa = supabase
				.from('caixas')
				.select('id, data_abertura, data_fechamento, valor_inicial')
				.eq('id', idCaixa)
				.single();

			// 2. Vendas do caixa
			const pVendas = supabase
				.from('vendas')
				.select('id, valor_total, forma_pagamento, valor_recebido, valor_troco, created_at')
				.eq('id_caixa', idCaixa)
				.order('id', { ascending: true });

			// 3. Movimentações
			const pMovs = supabase
				.from('caixa_movimentacoes')
				.select('tipo, valor, motivo, created_at')
				.eq('id_caixa', idCaixa)
				.order('created_at', { ascending: false });

			// Executa em paralelo
			const [resCaixa, resVendas, resMovs] = await withTimeout(Promise.all([pCaixa, pVendas, pMovs]));

			if (resCaixa.error) throw resCaixa.error;
			caixaInfo = resCaixa.data;

			if (resVendas.error) throw resVendas.error;
			vendas = resVendas.data || [];

			if (resMovs.error) throw resMovs.error;
			movs = resMovs.data || [];

			// Dependentes das vendas: itens e pagamentos
			const ids = vendas.map(v => v.id);
			vendasItens = [];
			vendasPagamentos = [];

			if (ids.length) {
				const pItens = supabase
					.from('vendas_itens')
					.select('id_venda, id_produto, nome_produto_na_venda, quantidade, preco_unitario_na_venda')
					.in('id_venda', ids);

				const pPags = supabase
					.from('vendas_pagamentos')
					.select('id_venda, forma_pagamento, valor')
					.in('id_venda', ids);

				const [resItens, resPags] = await withTimeout(Promise.all([pItens, pPags]));

				if (resItens.error) throw resItens.error;
				vendasItens = resItens.data || [];

				if (resPags.error) throw resPags.error;
				vendasPagamentos = resPags.data || [];

				// Produtos map
				const pids = Array.from(new Set(vendasItens.map(it => it.id_produto).filter(Boolean)));
				produtosMap = new Map();
				if (pids.length) {
					const { data: ps, error: pErr } = await withTimeout(
						supabase.from('produtos').select('id, nome, preco').in('id', pids)
					);
					if (!pErr && ps) {
						produtosMap = new Map(ps.map(p => [p.id, p]));
					}
				}
			}
		} catch (err) {
			addToast('Erro ao carregar dados do caixa: ' + err.message, 'error');
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

	// ---------------- Relatório por Período (multi-caixas) ----------------

	let preset = 'hoje'; // hoje | ontem | ultimos7 | ultimos30 | mesAtual | mesAnterior | personalizado
	const presetOpcoes = [
		{ key: 'hoje', label: 'Hoje' },
		{ key: 'ontem', label: 'Ontem' },
		{ key: 'ultimos7', label: 'Últimos 7' },
		{ key: 'ultimos30', label: 'Últimos 30' },
		{ key: 'mesAtual', label: 'Mês atual' },
		{ key: 'mesAnterior', label: 'Mês anterior' },
		{ key: 'personalizado', label: 'Personalizado' }
	];
	let dataInicio = null;
	let dataFim = null;
	let periodoLoading = false;
	let periodoVendas = [];
	let periodoPagamentos = [];
	let periodoItens = [];
	let periodoMovs = [];
	let periodoCaixas = [];

	function aplicarPreset(p) {
		preset = p;
		const hoje = new Date();
		const hojeY = hoje.getFullYear();
		const hojeM = hoje.getMonth();
		if (p === 'hoje') {
			dataInicio = new Date(hojeY, hojeM, hoje.getDate());
			dataFim = new Date(hojeY, hojeM, hoje.getDate());
		} else if (p === 'ontem') {
			const d = new Date(); d.setDate(d.getDate() - 1);
			dataInicio = new Date(d.getFullYear(), d.getMonth(), d.getDate());
			dataFim = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		} else if (p === 'ultimos7') {
			const dIni = new Date(); dIni.setDate(dIni.getDate() - 6);
			dataInicio = new Date(dIni.getFullYear(), dIni.getMonth(), dIni.getDate());
			dataFim = new Date(hojeY, hojeM, hoje.getDate());
		} else if (p === 'ultimos30') {
			const dIni = new Date(); dIni.setDate(dIni.getDate() - 29);
			dataInicio = new Date(dIni.getFullYear(), dIni.getMonth(), dIni.getDate());
			dataFim = new Date(hojeY, hojeM, hoje.getDate());
		} else if (p === 'mesAtual') {
			dataInicio = new Date(hojeY, hojeM, 1);
			dataFim = new Date(hojeY, hojeM + 1, 0);
		} else if (p === 'mesAnterior') {
			const mAnterior = new Date(hojeY, hojeM - 1, 1);
			dataInicio = mAnterior;
			dataFim = new Date(mAnterior.getFullYear(), mAnterior.getMonth() + 1, 0);
		} else if (p === 'personalizado') {
			if (!dataInicio || !dataFim) {
				dataInicio = new Date(hojeY, hojeM, hoje.getDate());
				dataFim = new Date(hojeY, hojeM, hoje.getDate());
			}
		}
	}

	function isoStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0).toISOString(); }
	function isoEnd(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999).toISOString(); }

	// Strings para inputs date (evita bind em expressão)
	$: dataInicioStr = dataInicio ? new Date(dataInicio.getTime() - dataInicio.getTimezoneOffset()*60000).toISOString().slice(0,10) : '';
	$: dataFimStr = dataFim ? new Date(dataFim.getTime() - dataFim.getTimezoneOffset()*60000).toISOString().slice(0,10) : '';

	async function carregarRelatorioPeriodo() {
		if (!uid || !dataInicio || !dataFim) return;
		periodoLoading = true;
		try {
			// 1. Vendas
			const pVendas = supabase
				.from('vendas')
				.select('id, valor_total, forma_pagamento, valor_recebido, valor_troco, created_at')
				.eq('id_usuario', uid)
				.gte('created_at', isoStart(dataInicio))
				.lte('created_at', isoEnd(dataFim))
				.order('created_at', { ascending: true });

			// 2. Caixas
			const pCaixas = supabase
				.from('caixas')
				.select('id, data_abertura, data_fechamento, valor_inicial')
				.eq('id_usuario', uid)
				.lte('data_abertura', isoEnd(dataFim))
				.or(`data_fechamento.is.null,data_fechamento.gte.${isoStart(dataInicio)}`);

			const [resVendas, resCaixas] = await withTimeout(Promise.all([pVendas, pCaixas]));

			if (resVendas.error) throw resVendas.error;
			periodoVendas = resVendas.data || [];
			const vendaIds = periodoVendas.map(v => v.id);

			if (resCaixas.error) { /* toleramos */ }
			periodoCaixas = resCaixas.data || [];
			const cxIds = periodoCaixas.map(c => c.id);

			// 3. Dependentes (Pagamentos, Itens, Movimentações)
			periodoPagamentos = [];
			periodoItens = [];
			periodoMovs = [];

			const promises = [];
			if (vendaIds.length) {
				promises.push(
					supabase.from('vendas_pagamentos').select('id_venda, forma_pagamento, valor').in('id_venda', vendaIds)
				);
				promises.push(
					supabase.from('vendas_itens').select('id_venda, id_produto, nome_produto_na_venda, quantidade, preco_unitario_na_venda').in('id_venda', vendaIds)
				);
			} else {
				promises.push(Promise.resolve({ data: [], error: null }));
				promises.push(Promise.resolve({ data: [], error: null }));
			}

			if (cxIds.length) {
				promises.push(
					supabase.from('caixa_movimentacoes').select('id_caixa, tipo, valor, created_at').in('id_caixa', cxIds).gte('created_at', isoStart(dataInicio)).lte('created_at', isoEnd(dataFim))
				);
			} else {
				promises.push(Promise.resolve({ data: [], error: null }));
			}

			const [resPags, resItens, resMovs] = await withTimeout(Promise.all(promises));

			if (resPags.error) throw resPags.error;
			periodoPagamentos = resPags.data || [];

			if (resItens.error) throw resItens.error;
			periodoItens = resItens.data || [];

			if (resMovs.error && cxIds.length) { /* log? */ }
			periodoMovs = resMovs.data || [];
		} catch (e) {
			addToast('Erro ao carregar relatório do período: ' + e.message, 'error');
			errorMessage = e?.message || 'Erro ao carregar relatório do período.';
		} finally {
			periodoLoading = false;
		}
	}

	// KPIs período (dinheiro líquido)
	$: periodoDinheiroSimplesLiquido = (periodoVendas||[])
		.filter(v => v.forma_pagamento === 'dinheiro')
		.reduce((a,v)=> a + Math.max(0, Number(v.valor_recebido||0) - Number(v.valor_troco||0)),0);
	$: periodoDinheiroMultiploLiquido = (periodoVendas||[])
		.filter(v => v.forma_pagamento === 'multiplo')
		.reduce((acc,v)=> {
			const linhas = (periodoPagamentos||[]).filter(p => p.id_venda === v.id && p.forma_pagamento === 'dinheiro');
			if (!linhas.length) return acc;
			const soma = linhas.reduce((s,p)=> s + Number(p.valor||0),0);
			const troco = Number(v.valor_troco||0);
			return acc + Math.max(0, soma - troco);
		},0);
	$: periodoDinheiroLiquido = periodoDinheiroSimplesLiquido + periodoDinheiroMultiploLiquido;
	$: periodoPix = (periodoVendas||[]).filter(v => v.forma_pagamento === 'pix').reduce((a,v)=> a + Number(v.valor_total||0),0) + (periodoPagamentos||[]).filter(p=> p.forma_pagamento === 'pix').reduce((a,p)=> a + Number(p.valor||0),0);
	$: periodoCartaoDebito = (periodoVendas||[]).filter(v => v.forma_pagamento === 'cartao_debito').reduce((a,v)=> a + Number(v.valor_total||0),0) + (periodoPagamentos||[]).filter(p=> p.forma_pagamento === 'cartao_debito').reduce((a,p)=> a + Number(p.valor||0),0);
	$: periodoCartaoCredito = (periodoVendas||[]).filter(v => v.forma_pagamento === 'cartao_credito').reduce((a,v)=> a + Number(v.valor_total||0),0) + (periodoPagamentos||[]).filter(p=> p.forma_pagamento === 'cartao_credito').reduce((a,p)=> a + Number(p.valor||0),0);
	$: periodoFiado = (periodoVendas||[]).filter(v => v.forma_pagamento === 'fiado').reduce((a,v)=> a + Number(v.valor_total||0),0) + (periodoPagamentos||[]).filter(p=> p.forma_pagamento === 'fiado').reduce((a,p)=> a + Number(p.valor||0),0);
	$: periodoTotalGeral = (periodoVendas||[]).reduce((a,v)=> a + Number(v.valor_total||0),0);
	$: periodoQtdVendas = (periodoVendas||[]).length;
	$: periodoTicketMedio = periodoQtdVendas ? periodoTotalGeral / periodoQtdVendas : 0;
	$: periodoTotalSangria = (periodoMovs||[]).filter(m=> m.tipo==='sangria').reduce((a,m)=> a + Number(m.valor||0),0);
	$: periodoTotalSuprimento = (periodoMovs||[]).filter(m=> m.tipo==='suprimento').reduce((a,m)=> a + Number(m.valor||0),0);

	// Série diária (para futuro gráfico / export) – simples agregação client-side
	$: periodoSerieDiaria = (() => {
		const map = new Map();
		for (const v of (periodoVendas||[])) {
			const day = v.created_at ? new Date(v.created_at).toISOString().slice(0,10) : 'unknown';
			const prev = map.get(day) || { dia: day, total: 0, qtd: 0 };
			prev.total += Number(v.valor_total||0);
			prev.qtd += 1;
			map.set(day, prev);
		}
		return Array.from(map.values()).sort((a,b)=> a.dia.localeCompare(b.dia));
	})();

	// Top produtos período
	let periodoOrdenarTop = 'receita';
	let periodoOrdenarDirecao = 'desc';
	$: periodoTopProdutos = (() => {
		const map = new Map();
		for (const it of (periodoItens||[])) {
			const key = it.nome_produto_na_venda || 'Item';
			const qtd = Number(it.quantidade||0);
			const receita = Number(it.preco_unitario_na_venda||0) * qtd; // usa preço capturado na venda
			const prev = map.get(key) || { nome: key, quantidade: 0, receita: 0 };
			prev.quantidade += qtd;
			prev.receita += receita;
			map.set(key, prev);
		}
		let arr = Array.from(map.values());
		const dir = periodoOrdenarDirecao === 'asc' ? 1 : -1;
		if (periodoOrdenarTop === 'quantidade') arr.sort((a,b)=> dir*(a.quantidade - b.quantidade));
		else if (periodoOrdenarTop === 'alfabetica') arr.sort((a,b)=> dir*a.nome.localeCompare(b.nome,'pt-BR'));
		else arr.sort((a,b)=> dir*(a.receita - b.receita));
		return arr.slice(0, 10);
	})();
</script>

<h1 class="text-2xl font-semibold mb-4">Relatórios</h1>
{#if errorMessage}
	<div class="mb-4 text-sm text-red-600">{errorMessage}</div>
{/if}

<!-- Barra de modo / filtros -->
<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-4">
	<div class="flex flex-wrap items-center gap-3 text-sm">
		<button class="px-3 py-1 rounded border" class:btn-primary={modoRelatorio==='caixa'} on:click={() => modoRelatorio='caixa'}>Por Caixa</button>
		<button class="px-3 py-1 rounded border" class:btn-primary={modoRelatorio==='periodo'} on:click={() => modoRelatorio='periodo'}>Por Período</button>
	</div>
	{#if modoRelatorio === 'caixa'}
		<div class="grid md:grid-cols-2 gap-4 items-end">
			<div>
				<label class="block text-sm text-slate-600 mb-1" for="select-caixa">Selecionar caixa</label>
				<select id="select-caixa" class="input-form" bind:value={caixaSelecionado} on:change={() => carregarRelatorioDoCaixa(caixaSelecionado)}>
					{#each caixas as c}
						<option value={c.id}>#{c.id} — {new Date(c.data_abertura).toLocaleString()} {c.data_fechamento ? `(fechado ${new Date(c.data_fechamento).toLocaleString()})` : '(aberto)'}</option>
					{/each}
				</select>
			</div>
			<div class="flex gap-2 justify-end">
				<button class="btn-secondary" on:click={exportarResumoCSV}>Exportar Resumo</button>
				<button class="btn-secondary" on:click={exportarVendasCSV}>Exportar Vendas</button>
				<button class="btn-secondary" on:click={exportarItensCSV}>Exportar Itens</button>
			</div>
		</div>
	{:else}
		<div class="space-y-3">
			<div class="flex flex-wrap gap-2 text-xs">
				{#each presetOpcoes as op}
					<button class="px-2 py-1 rounded border" class:bg-sky-600={preset===op.key} class:text-white={preset===op.key} on:click={() => { aplicarPreset(op.key); carregarRelatorioPeriodo(); }}>{op.label}</button>
				{/each}
			</div>
			<div class="grid sm:grid-cols-3 gap-4 items-end">
				<div>
					<label for="periodo-inicio" class="block text-sm mb-1">Início</label>
					<input id="periodo-inicio" type="date" class="input-form" value={dataInicioStr} on:change={(e)=> { dataInicio = new Date(e.target.value+'T00:00:00'); preset='personalizado'; }} />
				</div>
				<div>
					<label for="periodo-fim" class="block text-sm mb-1">Fim</label>
					<input id="periodo-fim" type="date" class="input-form" value={dataFimStr} on:change={(e)=> { dataFim = new Date(e.target.value+'T00:00:00'); preset='personalizado'; }} />
				</div>
				<div class="flex gap-2 items-end">
					<button class="btn-primary" on:click={carregarRelatorioPeriodo} disabled={periodoLoading}>{periodoLoading?'Carregando...':'Atualizar'}</button>
				</div>
			</div>
			<div class="text-xs text-slate-500">Período: {dataInicio ? dataInicio.toLocaleDateString() : ''} – {dataFim ? dataFim.toLocaleDateString() : ''} ({preset})</div>
		</div>
	{/if}
</section>


{#if loading}
	<div>Carregando...</div>
{:else}
	{#if modoRelatorio === 'caixa'}
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
	{:else}
		<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-4">
			<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Total de Vendas</div>
					<div class="text-xl font-semibold">{fmt(periodoTotalGeral)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Qtd. de Vendas</div>
					<div class="text-xl font-semibold">{periodoQtdVendas}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Ticket Médio</div>
					<div class="text-xl font-semibold">{fmt(periodoTicketMedio)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Dinheiro Líquido</div>
					<div class="text-xl font-semibold">{fmt(periodoDinheiroLiquido)}</div>
				</div>
			</div>

			<div class="grid sm:grid-cols-3 gap-4">
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Cartão Débito</div>
					<div class="text-lg font-semibold">{fmt(periodoCartaoDebito)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Cartão Crédito</div>
					<div class="text-lg font-semibold">{fmt(periodoCartaoCredito)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Pix</div>
					<div class="text-lg font-semibold">{fmt(periodoPix)}</div>
				</div>
			</div>

			<div class="grid sm:grid-cols-3 gap-4">
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Fiado</div>
					<div class="text-lg font-semibold">{fmt(periodoFiado)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Sangrias</div>
					<div class="text-lg font-semibold text-amber-700">{fmt(periodoTotalSangria)}</div>
				</div>
				<div class="p-3 rounded border">
					<div class="text-xs text-slate-500">Suprimentos</div>
					<div class="text-lg font-semibold text-green-700">{fmt(periodoTotalSuprimento)}</div>
				</div>
			</div>

			<!-- Série diária -->
			<div>
				<h2 class="font-semibold mb-2">Série Diária</h2>
				{#if periodoSerieDiaria.length === 0}
					<div class="text-sm text-slate-600">Sem vendas no período.</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-slate-500">
									<th class="py-2 pr-4">Dia</th>
									<th class="py-2 pr-4">Qtd</th>
									<th class="py-2">Total</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each periodoSerieDiaria as d}
								<tr>
									<td class="py-2 pr-4">{new Date(d.dia).toLocaleDateString()}</td>
									<td class="py-2 pr-4">{d.qtd}</td>
									<td class="py-2">{fmt(d.total)}</td>
								</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<!-- Top produtos período -->
			<div>
				<h2 class="font-semibold mb-2">Top Produtos (Período)</h2>
				<div class="mb-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
					<div class="flex items-center gap-2">
						<label for="p-top-order">Ordenar por</label>
						<select id="p-top-order" class="input-form max-w-52" bind:value={periodoOrdenarTop}>
							<option value="receita">Receita</option>
							<option value="quantidade">Quantidade</option>
							<option value="alfabetica">Produto</option>
						</select>
					</div>
					<div class="flex items-center gap-2">
						<label for="p-top-dir">Direção</label>
						<select id="p-top-dir" class="input-form max-w-40" bind:value={periodoOrdenarDirecao}>
							<option value="desc">Maior → menor / Z → A</option>
							<option value="asc">Menor → maior / A → Z</option>
						</select>
					</div>
				</div>
				{#if periodoTopProdutos.length === 0}
					<div class="text-sm text-slate-600">Sem itens no período.</div>
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
								{#each periodoTopProdutos as p}
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
		</section>
	{/if}
{/if}
