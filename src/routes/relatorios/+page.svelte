<script>
	// Relatórios: modo por caixa e por período (multi-caixas agregados)
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { ensureActiveSubscription, hasMesasAddon } from '$lib/guards';
	import { hasPermission as hasAccessPermission } from '$lib/accessControl';
	import { resolveAppIcon } from '$lib/icons/appIcons';
	import { withTimeout } from '$lib/utils';
	import { addToast } from '$lib/stores/ui';
	import { requiresAdminPin } from '$lib/adminPinPrompt';
	import {
		calculateExpectedDrawer,
		calculateMovementSummary,
		calculatePaymentSummary,
		calculatePlatformFees,
		calculateRestaurantRevenue,
		calculateRevenue
	} from '$lib/finance/caixa';
	import { formatPaymentMethod } from '$lib/finance/paymentMethods';
	import { buildPaymentPresentation } from '$lib/finance/paymentReport';
	
	// Gráficos visuais
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import { PLATAFORMAS_PRESET } from '$lib/profileUtils';
	import { Banknote, ChartNoAxesColumnIncreasing, ChevronDown, FileText, Sheet, ShoppingBag } from 'lucide-svelte';


	let loading = true;
	let errorMessage = '';

	// Modo de relatório: 'caixa' (existente) ou 'periodo'
	let modoRelatorio = 'caixa';

	// UID do usuário autenticado
	let uid = null;
	let mesasAddonAtivo = false;
	let pinConfigured = false;
	let pinStatus = 'loading';

	async function loadAdminPinStatus() {
		pinStatus = 'loading';
		try {
			const { data: { session } } = await supabase.auth.getSession();
			if (!session?.access_token) throw new Error('Sessão expirada.');
			const response = await fetch('/api/auth/admin-pin', {
				headers: { authorization: `Bearer ${session.access_token}` },
			});
			const status = await response.json().catch(() => ({}));
			if (!response.ok || typeof status.enabled !== 'boolean') {
				throw new Error(status?.error || 'Não foi possível validar o PIN.');
			}
			pinConfigured = requiresAdminPin(status);
			pinStatus = 'ready';
			return true;
		} catch (error) {
			pinConfigured = false;
			pinStatus = 'error';
			console.error('[relatorios] admin PIN status:', error);
			return false;
		}
	}

	async function retryAdminPin() {
		if (!await loadAdminPinStatus() || !uid) return;
		try {
			await carregarCaixasRecentes();
			if (caixas.length) {
				caixaSelecionado = caixas[0]?.id;
				await carregarRelatorioDoCaixa(caixaSelecionado);
			}
			await carregarFechamentosRecentes();
			aplicarPreset('hoje');
			await carregarRelatorioPeriodo();
		} catch (error) {
			errorMessage = error?.message || 'Erro ao carregar relatórios.';
		}
	}

	// Filtro: lista de caixas do usuário (últimos 60 dias) e caixa selecionado
	let caixas = [];
	let caixaSelecionado = null; // id
	let caixaInfo = null; // dados do caixa selecionado

	// Dados
	let vendas = [];
	let vendasItens = [];
	let vendasPagamentos = [];
	let vendasTaxasPlataforma = [];
	let comandasMesaCaixa = [];
	let produtosMap = new Map(); // id_produto -> { id, nome, preco }
	let pessoasMap = new Map(); // id_cliente -> { nome }
	let periodoProdutosMap = new Map(); // id_produto -> { id, nome, preco, id_categoria, categorias }
	let movs = [];
	let fechamentos = [];

	// Active platforms loaded from empresa_perfil
	let plataformasAtivas = [];

	// Platform color map (Tailwind classes + hex for charts/PDF)
	const PLATFORM_COLORS = {
		ifood:   { color: 'bg-orange-500', textColor: 'text-orange-500 dark:text-orange-400', hex: '#f97316' },
		rappi:   { color: 'bg-fuchsia-500', textColor: 'text-fuchsia-500 dark:text-fuchsia-400', hex: '#d946ef' },
		'99food':{ color: 'bg-red-400', textColor: 'text-red-400 dark:text-red-300', hex: '#f87171' },
		aiqfome: { color: 'bg-yellow-400', textColor: 'text-yellow-500 dark:text-yellow-400', hex: '#facc15' },
		keeta:   { color: 'bg-sky-400', textColor: 'text-sky-400 dark:text-sky-300', hex: '#38bdf8' },
	};
	const DEFAULT_PLAT_COLOR = { color: 'bg-teal-500', textColor: 'text-teal-500 dark:text-teal-400', hex: '#14b8a6' };

	// Pagination state for "Vendas do Caixa" table
	const VENDAS_PER_PAGE = 10;
	let vendasPage = 1;
	let vendaDetalheAbertaId = null;

	function alternarDetalheVenda(vendaId) {
		vendaDetalheAbertaId = vendaDetalheAbertaId === vendaId ? null : vendaId;
	}

	// Helpers
	const fmt = (n) => `R$ ${Number(n || 0).toFixed(2)}`;
	const reportPlatforms = () => [...plataformasAtivas, ...PLATAFORMAS_PRESET];
	const formatForma = (f) => formatPaymentMethod(f, { platforms: reportPlatforms() });

	const PAYMENT_COLORS = {
		dinheiro: { color: 'bg-emerald-500', textColor: 'text-emerald-600 dark:text-emerald-400', hex: '#22c55e' },
		pix: { color: 'bg-cyan-500', textColor: 'text-cyan-600 dark:text-cyan-400', hex: '#06b6d4' },
		cartao_debito: { color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400', hex: '#3b82f6' },
		cartao_credito: { color: 'bg-purple-500', textColor: 'text-purple-600 dark:text-purple-400', hex: '#8b5cf6' },
		cartao: { color: 'bg-slate-500', textColor: 'text-slate-600 dark:text-slate-400', hex: '#64748b' },
		vale_refeicao: { color: 'bg-fuchsia-500', textColor: 'text-fuchsia-600 dark:text-fuchsia-400', hex: '#d946ef' },
		fiado: { color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400', hex: '#f59e0b' },
	};

	function withPaymentVisuals(presentation) {
		return [
			...presentation.items.map((item) => ({ ...item, ...(PAYMENT_COLORS[item.id] || DEFAULT_PLAT_COLOR) })),
			...presentation.extras.map((item) => ({ ...item, ...(PLATFORM_COLORS[item.id] || DEFAULT_PLAT_COLOR) })),
		];
	}

	function chunkArray(arr, size = 1000) {
		const chunks = [];
		for (let i = 0; i < arr.length; i += size) {
			chunks.push(arr.slice(i, i + size));
		}
		return chunks;
	}

	function buildItensSubtotalMap(itens) {
		const map = new Map();
		for (const item of itens || []) {
			const vendaId = item.id_venda;
			const subtotal = Number(item.preco_unitario_na_venda || 0) * Number(item.quantidade || 0);
			map.set(vendaId, (map.get(vendaId) || 0) + subtotal);
		}
		return map;
	}

	function calcularResumoMesas(comandas, itensSubtotalMap) {
		return (comandas || []).reduce((acc, comanda) => {
			const subtotalItens = Number(itensSubtotalMap.get(comanda.id_venda) || 0);
			const couvert = Number(comanda.couvert_valor || 0);
			const desconto = Number(comanda.desconto || 0);
			const totalCalculado = Number(comanda.total_calculado || 0);
			const taxaServico = Math.max(0, totalCalculado - subtotalItens - couvert + desconto);

			acc.comandas += 1;
			acc.couvert += couvert;
			acc.descontos += desconto;
			acc.taxaServico += taxaServico;
			return acc;
		}, {
			comandas: 0,
			couvert: 0,
			descontos: 0,
			taxaServico: 0,
		});
	}

	async function carregarComandasMesaPorVendas(vendaIds) {
		if (!mesasAddonAtivo || !vendaIds?.length) return [];

		const resultados = await withTimeout(Promise.all(
			chunkArray(vendaIds, 1000).map((batch) =>
				supabase
					.from('comandas')
					.select('id_venda, desconto, couvert_valor, total_calculado')
					.eq('status', 'fechada')
					.in('id_venda', batch)
			)
		));

		let comandas = [];
		for (const resultado of resultados) {
			if (resultado.error) throw resultado.error;
			comandas = comandas.concat(resultado.data || []);
		}
		return comandas;
	}

	onMount(async () => {
		const authCtx = await ensureActiveSubscription({ requireProfile: true });
		if (!authCtx) return;
		if (authCtx.isSubUser && !(await hasAccessPermission('relatorios.ver'))) {
			addToast('Seu cargo não tem acesso aos relatórios.', 'warning');
			window.location.href = '/app';
			return;
		}
		const { waitAuthReady } = await import('$lib/authStore');
		await waitAuthReady();
		try {
			uid = authCtx.ownerUserId || authCtx.userId;
			if (!uid) { window.location.href = '/login'; return; }
			mesasAddonAtivo = await hasMesasAddon(uid);

			// Carrega PIN administrativo
			const { data: perfilData } = await supabase
				.from('empresa_perfil')
				.select('plataformas_pagamento')
				.eq('user_id', uid)
				.maybeSingle();
			if (!await loadAdminPinStatus()) return;
			plataformasAtivas = (perfilData?.plataformas_pagamento || []).filter(p => p.ativo !== false);

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
		vendasPage = 1;
		vendaDetalheAbertaId = null;
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
				.select('id, numero_venda, valor_total, forma_pagamento, valor_recebido, valor_troco, valor_desconto, tipo_pedido, taxa_entrega, created_at, id_cliente')
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
			vendasTaxasPlataforma = [];
			comandasMesaCaixa = [];

			if (ids.length) {
				const pItens = supabase
					.from('vendas_itens')
					.select('id_venda, id_produto, nome_produto_na_venda, quantidade, preco_unitario_na_venda')
					.in('id_venda', ids);

				const pPags = supabase
					.from('vendas_pagamentos')
					.select('id_venda, forma_pagamento, valor')
					.in('id_venda', ids);

				const pTaxas = supabase
					.from('vendas_taxas_plataforma')
					.select('id_venda, plataforma_id, plataforma_nome, taxa_pct, valor_bruto, valor_taxa')
					.in('id_venda', ids);

				const pComandasMesa = carregarComandasMesaPorVendas(ids);
				const [resItens, resPags, resTaxas, comandasMesa] = await withTimeout(Promise.all([pItens, pPags, pTaxas, pComandasMesa]));

				if (resItens.error) throw resItens.error;
				vendasItens = resItens.data || [];

				if (resPags.error) throw resPags.error;
				vendasPagamentos = resPags.data || [];

				if (!resTaxas.error) vendasTaxasPlataforma = resTaxas.data || [];
				comandasMesaCaixa = comandasMesa || [];

				// Produtos map (com categoria para permitir filtro nos relatórios)
				const pids = Array.from(new Set(vendasItens.map(it => it.id_produto).filter(Boolean)));
				produtosMap = new Map();
				if (pids.length) {
					const { data: ps, error: pErr } = await withTimeout(
						supabase
							.from('produtos')
							.select('id, nome, preco, id_categoria, categorias(id, nome)')
							.in('id', pids)
					);
					if (!pErr && ps) {
						produtosMap = new Map(ps.map(p => [p.id, p]));
					}
				}
			}

			// Pessoas map (for fiado tooltip)
			const clienteIds = Array.from(new Set(vendas.filter(v => v.id_cliente).map(v => v.id_cliente)));
			pessoasMap = new Map();
			if (clienteIds.length) {
				const { data: ps2, error: ps2Err } = await withTimeout(
					supabase.from('pessoas').select('id, nome').in('id', clienteIds)
				);
				if (!ps2Err && ps2) pessoasMap = new Map(ps2.map(p => [p.id, p]));
			}
		} catch (err) {
			addToast('Erro ao carregar dados do caixa: ' + err.message, 'error');
			errorMessage = err?.message || 'Erro ao carregar dados do caixa.';
		} finally {
			loading = false;
		}
	}

	$: resumoPagamentosCaixa = calculatePaymentSummary(vendas, vendasPagamentos);
	$: pagamentosCaixa = buildPaymentPresentation(resumoPagamentosCaixa, { platforms: reportPlatforms() });
	$: totalDinheiro = resumoPagamentosCaixa.dinheiro;
	$: totalCartaoDebito = resumoPagamentosCaixa.cartaoDebito;
	$: totalCartaoCredito = resumoPagamentosCaixa.cartaoCredito;
	$: totalCartaoLegacy = resumoPagamentosCaixa.cartaoLegacy;
	$: totalCartao = resumoPagamentosCaixa.totalCartao;
	$: totalPix = resumoPagamentosCaixa.pix;
	$: totalValeRefeicao = resumoPagamentosCaixa.valeRefeicao;
	$: totalFiado = resumoPagamentosCaixa.fiado;
	$: totalBruto = resumoPagamentosCaixa.totalBruto;
	$: totalGeral = resumoPagamentosCaixa.totalGeral;
	$: qtdVendas = (vendas || []).length;
	$: ticketMedio = qtdVendas ? totalGeral / qtdVendas : 0;

	// Movimentações resumo
	$: resumoMovsCaixa = calculateMovementSummary(movs);
	$: totalSangria = resumoMovsCaixa.sangria;
	$: totalSuprimento = resumoMovsCaixa.suprimento;
	$: saldoEsperadoGaveta = calculateExpectedDrawer({
		valorInicial: caixaInfo?.valor_inicial,
		dinheiroLiquido: totalDinheiro,
		sangria: totalSangria,
		suprimento: totalSuprimento
	});
	$: totalDescontosCaixa = (vendas || []).reduce((a, v) => a + Number(v.valor_desconto || 0), 0);
	$: resumoTaxasCaixa = calculatePlatformFees(vendasTaxasPlataforma);
	$: totalCustosPlataformaCaixa = resumoTaxasCaixa.total;
	$: receitaLiquidaCaixa = calculateRevenue({ totalGeral, custosPlataforma: totalCustosPlataformaCaixa });
	$: caixaItensSubtotalMap = buildItensSubtotalMap(vendasItens);
	$: resumoMesasCaixa = calcularResumoMesas(comandasMesaCaixa, caixaItensSubtotalMap);

	// Delivery breakdown (caixa)
	$: totalTaxaEntregaCaixa = (vendas || []).filter(v => v.tipo_pedido === 'delivery').reduce((a, v) => a + Number(v.taxa_entrega || 0), 0);
	$: receitaRestauranteCaixa = calculateRestaurantRevenue({ totalGeral, taxaEntrega: totalTaxaEntregaCaixa, custosPlataforma: totalCustosPlataformaCaixa });
	$: vendasPorTipoCaixa = (() => {
		const result = [];
		const retiradaVendas = (vendas || []).filter(v => (v.tipo_pedido || 'retirada') === 'retirada');
		if (retiradaVendas.length > 0) result.push({ tipo: 'retirada', label: 'Retirada', icon: 'retirada', qtd: retiradaVendas.length, total: retiradaVendas.reduce((a, v) => a + Number(v.valor_total || 0), 0), taxaEntrega: 0 });
		const deliveryVendas = (vendas || []).filter(v => v.tipo_pedido === 'delivery');
		if (deliveryVendas.length > 0) result.push({ tipo: 'delivery', label: 'Delivery', icon: 'delivery', qtd: deliveryVendas.length, total: deliveryVendas.reduce((a, v) => a + Number(v.valor_total || 0), 0), taxaEntrega: deliveryVendas.reduce((a, v) => a + Number(v.taxa_entrega || 0), 0) });
		return result;
	})();
	$: platTotaisCaixa = pagamentosCaixa.extras.map((item) => ({ ...item, ...(PLATFORM_COLORS[item.id] || DEFAULT_PLAT_COLOR) }));
	$: caixaPagItems = withPaymentVisuals(pagamentosCaixa).filter(p => p.value > 0);
	$: caixaPagTotal = caixaPagItems.reduce((a, p) => a + p.value, 0);

	// Paginação das vendas do caixa (mais recentes primeiro)
	$: vendasSorted = [...(vendas||[])].reverse();
	$: vendasTotalPages = Math.max(1, Math.ceil(vendasSorted.length / VENDAS_PER_PAGE));
	$: vendasPageButtons = (() => {
		if (vendasTotalPages <= 7) return Array.from({length: vendasTotalPages}, (_, i) => i+1);
		const btns = [1];
		if (vendasPage > 3) btns.push(null);
		for (let p = Math.max(2, vendasPage-1); p <= Math.min(vendasTotalPages-1, vendasPage+1); p++) btns.push(p);
		if (vendasPage < vendasTotalPages-2) btns.push(null);
		btns.push(vendasTotalPages);
		return btns;
	})();
	$: vendasExibidas = vendasSorted.slice((vendasPage-1)*VENDAS_PER_PAGE, vendasPage*VENDAS_PER_PAGE);

	// Produtos vendidos no caixa — lista completa (sem TOP fixo), com filtro por categoria.
	let ordenarTop = 'receita'; // 'receita' | 'quantidade' | 'alfabetica'
	let ordenarDirecao = 'desc'; // 'desc' | 'asc'
	let categoriaFiltro = ''; // '' = todas. Pode ser id da categoria ou '__sem__' para sem categoria.
	let mostrarFiltrosProdutos = false;

	// Lista de categorias derivadas dos produtos vendidos no caixa (com fallback 'Sem categoria').
	$: categoriasDoCaixa = (() => {
		const map = new Map();
		let temSemCategoria = false;
		for (const it of (vendasItens || [])) {
			const prod = it.id_produto ? produtosMap.get(it.id_produto) : null;
			const cat = prod?.categorias;
			if (cat?.id) map.set(cat.id, cat.nome || 'Categoria');
			else temSemCategoria = true;
		}
		const arr = Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
		arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
		if (temSemCategoria) arr.push({ id: '__sem__', nome: 'Sem categoria' });
		return arr;
	})();

	$: topProdutos = (() => {
		const map = new Map();
		for (const it of (vendasItens || [])) {
			const prod = it.id_produto ? produtosMap.get(it.id_produto) : null;
			const catId = prod?.categorias?.id || null;
			if (categoriaFiltro) {
				const matches = categoriaFiltro === '__sem__' ? !catId : catId === categoriaFiltro;
				if (!matches) continue;
			}
			const key = it.nome_produto_na_venda || 'Item';
			const qtd = Number(it.quantidade || 0);
			// Receita = valor do produto * quantidade. Preferimos o preço atual do produto
			// quando disponível; senão, usamos o preço salvo na venda.
			const precoProduto = it.id_produto ? Number(prod?.preco || 0) : Number(it.preco_unitario_na_venda || 0);
			const receita = precoProduto * qtd;
			const prev = map.get(key) || {
				nome: key,
				quantidade: 0,
				receita: 0,
				categoria: prod?.categorias?.nome || (catId ? 'Categoria' : 'Sem categoria'),
			};
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
		return arr;
	})();

	// Export dropdown state
	let showExportDropdown = false;

	function getExportData() {
		const isCaixa = modoRelatorio === 'caixa';
		const periodoLabel = isCaixa
			? (caixaInfo?.data_abertura
				? `${new Date(caixaInfo.data_abertura).toLocaleDateString('pt-BR')} – ${caixaInfo?.data_fechamento ? new Date(caixaInfo.data_fechamento).toLocaleDateString('pt-BR') : 'aberto'}`
				: 'Caixa')
			: `${dataInicio ? dataInicio.toLocaleDateString('pt-BR') : ''} – ${dataFim ? dataFim.toLocaleDateString('pt-BR') : ''}`;

		if (isCaixa) {
			// Build serie diaria from vendas
			const serieMap = new Map();
			for (const v of (vendas || [])) {
				const day = v.created_at ? new Date(v.created_at).toISOString().slice(0,10) : 'unknown';
				const prev = serieMap.get(day) || { dia: day, total: 0, qtd: 0 };
				prev.total += Number(v.valor_total || 0);
				prev.qtd += 1;
				serieMap.set(day, prev);
			}
			const serieDiariaCaixa = Array.from(serieMap.values()).sort((a,b) => a.dia.localeCompare(b.dia));

			const catCaixa = categoriaFiltro
				? (categoriasDoCaixa.find(c => c.id === categoriaFiltro)?.nome || null)
				: null;

			return {
				periodo: periodoLabel,
				modo: 'caixa',
				caixaId: caixaInfo?.id,
				kpis: {
					totalGeral,
					qtdVendas,
					ticketMedio,
					dinheiro: totalDinheiro,
				},
				pagamentos: {
					...pagamentosCaixa.pagamentos,
					extras: platTotaisCaixa.map(p => ({ label: p.label, value: p.value, hex: p.hex })),
				},
				serieDiaria: serieDiariaCaixa,
				topProdutos,
				produtosCategoriaFiltro: catCaixa,
				balanco: {
					sangria: totalSangria,
					suprimento: totalSuprimento,
					descontos: totalDescontosCaixa,
				},
			};
		} else {
			const catPeriodo = periodoCategoriaFiltro
				? (categoriasDoPeriodo.find(c => c.id === periodoCategoriaFiltro)?.nome || null)
				: null;

			return {
				periodo: periodoLabel,
				modo: 'periodo',
				kpis: {
					totalGeral: periodoTotalGeral,
					qtdVendas: periodoQtdVendas,
					ticketMedio: periodoTicketMedio,
					dinheiro: periodoDinheiroLiquido,
				},
				pagamentos: {
					...pagamentosPeriodo.pagamentos,
					extras: platTotaisPeriodo.map(p => ({ label: p.label, value: p.value, hex: p.hex })),
				},
				serieDiaria: periodoSerieDiaria,
				topProdutos: periodoTopProdutos,
				produtosCategoriaFiltro: catPeriodo,
				balanco: {
					sangria: periodoTotalSangria,
					suprimento: periodoTotalSuprimento,
					descontos: periodoTotalDescontos,
				},
			};
		}
	}

	async function exportarPDF() {
		if (exporting) return;
		exporting = true;
		try {
			const dados = getExportData();
			const { generatePDFReport } = await import('$lib/utils/pdfReport');
			await generatePDFReport(dados);
			addToast('PDF gerado com sucesso!', 'success');
		} catch (e) {
			addToast('Erro ao gerar PDF: ' + e.message, 'error');
		} finally {
			showExportDropdown = false;
			exporting = false;
		}
	}

	async function exportarExcel() {
		if (exporting) return;
		exporting = true;
		try {
			const dados = getExportData();
			const { generateExcelReport } = await import('$lib/utils/excelReport');
			await generateExcelReport(dados);
			addToast('Excel gerado com sucesso!', 'success');
		} catch (e) {
			addToast('Erro ao gerar Excel: ' + e.message, 'error');
		} finally {
			showExportDropdown = false;
			exporting = false;
		}
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
	let exporting = false;
	let periodoVendas = [];
	let periodoPagamentos = [];
	let periodoItens = [];
	let periodoComandasMesa = [];
	let periodoMovs = [];
	let periodoCaixas = [];
	let periodoDespesas = [];
	let periodoTaxasPlataforma = [];

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
			// 1. Vendas (fetch all with pagination)
			let allVendas = [];
			let page = 0;
			let pageSize = 1000;
			let fetchMore = true;

			while (fetchMore) {
				const { data: batch, error: batchErr } = await supabase
					.from('vendas')
					.select('id, numero_venda, valor_total, forma_pagamento, valor_recebido, valor_troco, valor_desconto, tipo_pedido, taxa_entrega, created_at')
					.eq('id_usuario', uid)
					.gte('created_at', isoStart(dataInicio))
					.lte('created_at', isoEnd(dataFim))
					.order('created_at', { ascending: true })
					.range(page * pageSize, (page + 1) * pageSize - 1);

				if (batchErr) throw batchErr;

				if (batch && batch.length > 0) {
					allVendas = [...allVendas, ...batch];
					if (batch.length < pageSize) fetchMore = false;
					else page++;
				} else {
					fetchMore = false;
				}
			}
			const pVendas = Promise.resolve({ data: allVendas, error: null }); // Mock promise for compatibility

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

			// 3. Dependentes (Pagamentos, Itens, Movimentações, Taxas Plataforma)
			periodoPagamentos = [];
			periodoItens = [];
			periodoComandasMesa = [];
			periodoMovs = [];
			periodoTaxasPlataforma = [];

			const promises = [];

			if (vendaIds.length) {
				const batches = chunkArray(vendaIds, 1000);

				// Fetch payments in batches
				const payPromises = batches.map(batch =>
					supabase.from('vendas_pagamentos').select('id_venda, forma_pagamento, valor').in('id_venda', batch)
				);
				promises.push(Promise.all(payPromises).then(results => {
					let all = [];
					results.forEach(r => { if(r.data) all = [...all, ...r.data]; });
					return { data: all, error: null };
				}));

				// Fetch items in batches
				const itemPromises = batches.map(batch =>
					supabase.from('vendas_itens').select('id_venda, id_produto, nome_produto_na_venda, quantidade, preco_unitario_na_venda').in('id_venda', batch)
				);
				promises.push(Promise.all(itemPromises).then(results => {
					let all = [];
					results.forEach(r => { if(r.data) all = [...all, ...r.data]; });
					return { data: all, error: null };
				}));

				// Fetch platform fees in batches
				const taxasPromises = batches.map(batch =>
					supabase.from('vendas_taxas_plataforma').select('id_venda, plataforma_id, plataforma_nome, taxa_pct, valor_bruto, valor_taxa').in('id_venda', batch)
				);
				promises.push(Promise.all(taxasPromises).then(results => {
					let all = [];
					results.forEach(r => { if(r.data) all = [...all, ...r.data]; });
					return { data: all, error: null };
				}));

			} else {
				promises.push(Promise.resolve({ data: [], error: null })); // payments placeholder
				promises.push(Promise.resolve({ data: [], error: null })); // items placeholder
				promises.push(Promise.resolve({ data: [], error: null })); // taxas placeholder
			}

			if (cxIds.length) {
				const batches = chunkArray(cxIds, 1000);
				const movPromises = batches.map(batch =>
					supabase.from('caixa_movimentacoes').select('id_caixa, tipo, valor, created_at').in('id_caixa', batch).gte('created_at', isoStart(dataInicio)).lte('created_at', isoEnd(dataFim))
				);
				promises.push(Promise.all(movPromises).then(results => {
					let all = [];
					results.forEach(r => { if(r.data) all = [...all, ...r.data]; });
					return { data: all, error: null };
				}));
			} else {
				promises.push(Promise.resolve({ data: [], error: null }));
			}
			
			// 4. Despesas (expenses) - pagination (similar to sales)
			// For expenses, we just need a loop if count > 1000.
			// Implementing simple pagination loop for expenses
			promises.push((async () => {
				let allExp = [];
				let page = 0;
				let fetchMore = true;
				while(fetchMore) {
					const { data, error } = await supabase.from('expenses')
						.select('amount')
						.eq('user_id', uid)
						.gte('date', isoStart(dataInicio))
						.lte('date', isoEnd(dataFim))
						.order('date', { ascending: false })
						.range(page * 1000, (page + 1) * 1000 - 1);
					
					if (error) throw error;
					if (data && data.length > 0) {
						allExp = [...allExp, ...data];
						if (data.length < 1000) fetchMore = false;
						else page++;
					} else {
						fetchMore = false;
					}
				}
				return { data: allExp, error: null };
			})());

			const [resPags, resItens, resTaxasPlat, resMovs, resDespesas] = await withTimeout(Promise.all(promises));

			if (resPags.error) throw resPags.error;
			periodoPagamentos = resPags.data || [];

			if (resItens.error) throw resItens.error;
			periodoItens = resItens.data || [];

			if (!resTaxasPlat.error) periodoTaxasPlataforma = resTaxasPlat.data || [];

			if (resMovs.error && cxIds.length) { /* log? */ }
			periodoMovs = resMovs.data || [];

			if (resDespesas.error) console.error('Error fetching expenses:', resDespesas.error); // optional log
			periodoDespesas = resDespesas.data || [];
			periodoComandasMesa = vendaIds.length ? await carregarComandasMesaPorVendas(vendaIds) : [];

			// Produtos do período com categoria (para filtro por categoria)
			const pPids = Array.from(new Set((periodoItens || []).map(it => it.id_produto).filter(Boolean)));
			periodoProdutosMap = new Map();
			if (pPids.length) {
				const batches = chunkArray(pPids, 1000);
				const results = await Promise.all(
					batches.map(batch =>
						supabase
							.from('produtos')
							.select('id, nome, preco, id_categoria, categorias(id, nome)')
							.in('id', batch)
					)
				);
				for (const r of results) {
					if (!r.error && r.data) {
						for (const p of r.data) periodoProdutosMap.set(p.id, p);
					}
				}
			}
		} catch (e) {
			addToast('Erro ao carregar relatório do período: ' + e.message, 'error');
			errorMessage = e?.message || 'Erro ao carregar relatório do período.';
		} finally {
			periodoLoading = false;
		}
	}

	$: resumoPagamentosPeriodo = calculatePaymentSummary(periodoVendas, periodoPagamentos);
	$: pagamentosPeriodo = buildPaymentPresentation(resumoPagamentosPeriodo, { platforms: reportPlatforms() });
	$: periodoDinheiroLiquido = resumoPagamentosPeriodo.dinheiro;
	$: periodoPix = resumoPagamentosPeriodo.pix;
	$: periodoCartaoDebito = resumoPagamentosPeriodo.cartaoDebito;
	$: periodoCartaoCredito = resumoPagamentosPeriodo.cartaoCredito;
	$: periodoCartaoLegacy = resumoPagamentosPeriodo.cartaoLegacy;
	$: periodoValeRefeicao = resumoPagamentosPeriodo.valeRefeicao;
	$: periodoFiado = resumoPagamentosPeriodo.fiado;
	$: periodoTotalBruto = resumoPagamentosPeriodo.totalBruto;
	$: periodoTotalGeral = resumoPagamentosPeriodo.totalGeral;
	$: periodoQtdVendas = (periodoVendas||[]).length;
	$: periodoTicketMedio = periodoQtdVendas ? periodoTotalGeral / periodoQtdVendas : 0;
	$: resumoMovsPeriodo = calculateMovementSummary(periodoMovs);
	$: periodoTotalSangria = resumoMovsPeriodo.sangria;
	$: periodoTotalSuprimento = resumoMovsPeriodo.suprimento;
	$: periodoTotalDescontos = (periodoVendas||[]).reduce((a,v)=> a + Number(v.valor_desconto||0),0);
	$: periodoTotalDespesas = (periodoDespesas||[]).reduce((a,e)=> a + Number(e.amount||0),0);
	$: resumoTaxasPeriodo = calculatePlatformFees(periodoTaxasPlataforma);
	$: periodoTotalCustosPlataforma = resumoTaxasPeriodo.total;
	$: periodoItensSubtotalMap = buildItensSubtotalMap(periodoItens);
	$: resumoMesasPeriodo = calcularResumoMesas(periodoComandasMesa, periodoItensSubtotalMap);
	$: periodoReceitaLiquida = calculateRevenue({ totalGeral: periodoTotalGeral, despesas: periodoTotalDespesas, custosPlataforma: periodoTotalCustosPlataforma });

	// Delivery breakdown (periodo)
	$: periodoTotalTaxaEntrega = (periodoVendas||[]).filter(v => v.tipo_pedido === 'delivery').reduce((a, v) => a + Number(v.taxa_entrega || 0), 0);
	$: periodoReceitaRestaurante = calculateRestaurantRevenue({ totalGeral: periodoTotalGeral, taxaEntrega: periodoTotalTaxaEntrega, despesas: periodoTotalDespesas, custosPlataforma: periodoTotalCustosPlataforma });
	$: periodoVendasPorTipo = (() => {
		const result = [];
		const retiradaVendas = (periodoVendas||[]).filter(v => (v.tipo_pedido || 'retirada') === 'retirada');
		if (retiradaVendas.length > 0) result.push({ tipo: 'retirada', label: 'Retirada', icon: 'retirada', qtd: retiradaVendas.length, total: retiradaVendas.reduce((a, v) => a + Number(v.valor_total || 0), 0), taxaEntrega: 0 });
		const deliveryVendas = (periodoVendas||[]).filter(v => v.tipo_pedido === 'delivery');
		if (deliveryVendas.length > 0) result.push({ tipo: 'delivery', label: 'Delivery', icon: 'delivery', qtd: deliveryVendas.length, total: deliveryVendas.reduce((a, v) => a + Number(v.valor_total || 0), 0), taxaEntrega: deliveryVendas.reduce((a, v) => a + Number(v.taxa_entrega || 0), 0) });
		return result;
	})();
	$: platTotaisPeriodo = pagamentosPeriodo.extras.map((item) => ({ ...item, ...(PLATFORM_COLORS[item.id] || DEFAULT_PLAT_COLOR) }));
	$: periodoPagItems = withPaymentVisuals(pagamentosPeriodo).filter(p => p.value > 0);
	$: periodoPagTotal = periodoPagItems.reduce((a, p) => a + p.value, 0);

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

	// Produtos vendidos no período — lista completa, com filtro por categoria.
	let periodoOrdenarTop = 'receita';
	let periodoOrdenarDirecao = 'desc';
	let periodoCategoriaFiltro = '';
	let periodoMostrarFiltros = false;

	$: categoriasDoPeriodo = (() => {
		const map = new Map();
		let temSemCategoria = false;
		for (const it of (periodoItens || [])) {
			const prod = it.id_produto ? periodoProdutosMap.get(it.id_produto) : null;
			const cat = prod?.categorias;
			if (cat?.id) map.set(cat.id, cat.nome || 'Categoria');
			else temSemCategoria = true;
		}
		const arr = Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
		arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
		if (temSemCategoria) arr.push({ id: '__sem__', nome: 'Sem categoria' });
		return arr;
	})();

	$: periodoTopProdutos = (() => {
		const map = new Map();
		for (const it of (periodoItens||[])) {
			const prod = it.id_produto ? periodoProdutosMap.get(it.id_produto) : null;
			const catId = prod?.categorias?.id || null;
			if (periodoCategoriaFiltro) {
				const matches = periodoCategoriaFiltro === '__sem__' ? !catId : catId === periodoCategoriaFiltro;
				if (!matches) continue;
			}
			const key = it.nome_produto_na_venda || 'Item';
			const qtd = Number(it.quantidade||0);
			const receita = Number(it.preco_unitario_na_venda||0) * qtd; // usa preço capturado na venda
			const prev = map.get(key) || {
				nome: key,
				quantidade: 0,
				receita: 0,
				categoria: prod?.categorias?.nome || (catId ? 'Categoria' : 'Sem categoria'),
			};
			prev.quantidade += qtd;
			prev.receita += receita;
			map.set(key, prev);
		}
		let arr = Array.from(map.values());
		const dir = periodoOrdenarDirecao === 'asc' ? 1 : -1;
		if (periodoOrdenarTop === 'quantidade') arr.sort((a,b)=> dir*(a.quantidade - b.quantidade));
		else if (periodoOrdenarTop === 'alfabetica') arr.sort((a,b)=> dir*a.nome.localeCompare(b.nome,'pt-BR'));
		else arr.sort((a,b)=> dir*(a.receita - b.receita));
		return arr;
	})();
	import AdminLock from '$lib/components/AdminLock.svelte';
</script>

<AdminLock pinConfigured={pinConfigured} {pinStatus} onPinRetry={retryAdminPin}>
<div class="mb-6 flex items-end justify-between">
	<div>
		<h1 class="text-xl font-bold" style="color: var(--text-main);">Relatórios</h1>
	</div>
</div>
{#if errorMessage}
	<div class="mb-4 text-sm text-red-600">{errorMessage}</div>
{/if}

<!-- Barra de modo / filtros -->
<section class="rounded-xl p-4 mb-4 space-y-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
	<div class="flex flex-wrap items-center gap-3 text-sm">
		<button class="px-3 py-1 rounded-sm border" class:btn-primary={modoRelatorio==='caixa'} on:click={() => modoRelatorio='caixa'}>Por Caixa</button>
		<button class="px-3 py-1 rounded-sm border" class:btn-primary={modoRelatorio==='periodo'} on:click={() => modoRelatorio='periodo'}>Por Período</button>
	</div>
	{#if modoRelatorio === 'caixa'}
		<div class="grid md:grid-cols-2 gap-4 items-end">
			<div>
				<label class="block text-sm mb-1" style="color: var(--text-label);" for="select-caixa">Selecionar caixa</label>
				<select id="select-caixa" class="input-form" bind:value={caixaSelecionado} on:change={() => carregarRelatorioDoCaixa(caixaSelecionado)}>
					{#each caixas as c}
						<option value={c.id}>#{c.id} — {new Date(c.data_abertura).toLocaleString()} {c.data_fechamento ? `(fechado ${new Date(c.data_fechamento).toLocaleString()})` : '(aberto)'}</option>
					{/each}
				</select>
			</div>
			<div class="flex gap-2 justify-end relative">
				<button class="btn-primary flex items-center gap-2" on:click={() => showExportDropdown = !showExportDropdown}>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
					Exportar Relatório
					<svg class="w-3 h-3 transition-transform" class:rotate-180={showExportDropdown} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
				</button>
				{#if showExportDropdown}
					<button type="button" class="export-dropdown-backdrop fixed inset-0 z-40" aria-label="Fechar opções de exportação" on:click={() => showExportDropdown = false}></button>
					<div class="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl border py-1 min-w-[200px] animate-fade-in" style="background: var(--bg-card); border-color: var(--border-subtle);">
						<button class="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors" style="color: var(--text-main);" on:click={exportarPDF} disabled={exporting}>
							<FileText class="size-4 text-slate-300" aria-hidden="true" />
							<div class="text-left">
								<div class="font-medium">Exportar PDF</div>
								<div class="text-xs" style="color: var(--text-muted);">Relatório visual com gráficos</div>
							</div>
						</button>
						<div class="mx-2" style="border-top: 1px solid var(--border-subtle);"></div>
						<button class="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors" style="color: var(--text-main);" on:click={exportarExcel} disabled={exporting}>
							<Sheet class="size-4 text-emerald-300" aria-hidden="true" />
							<div class="text-left">
								<div class="font-medium">Exportar Excel</div>
								<div class="text-xs" style="color: var(--text-muted);">Planilha com abas formatadas</div>
							</div>
						</button>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="space-y-3">
			<div class="flex flex-wrap gap-2 text-xs">
				{#each presetOpcoes as op}
					<button class="px-2 py-1 rounded-sm border" class:bg-sky-600={preset===op.key} class:text-white={preset===op.key} on:click={() => { aplicarPreset(op.key); carregarRelatorioPeriodo(); }}>{op.label}</button>
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
				<div class="flex gap-2 items-end relative">
					<button class="btn-primary" on:click={carregarRelatorioPeriodo} disabled={periodoLoading}>{periodoLoading?'Carregando...':'Atualizar'}</button>
					<button class="btn-secondary flex items-center gap-2" on:click={() => showExportDropdown = !showExportDropdown}>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
						Exportar
						<svg class="w-3 h-3 transition-transform" class:rotate-180={showExportDropdown} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
					</button>
					{#if showExportDropdown}
						<button type="button" class="export-dropdown-backdrop fixed inset-0 z-40" aria-label="Fechar opções de exportação" on:click={() => showExportDropdown = false}></button>
						<div class="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl border py-1 min-w-[200px] animate-fade-in" style="background: var(--bg-card); border-color: var(--border-subtle);">
							<button class="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors" style="color: var(--text-main);" on:click={exportarPDF} disabled={exporting}>
								<FileText class="size-4 text-slate-300" aria-hidden="true" />
								<div class="text-left">
									<div class="font-medium">Exportar PDF</div>
									<div class="text-xs" style="color: var(--text-muted);">Relatório visual com gráficos</div>
								</div>
							</button>
							<div class="mx-2" style="border-top: 1px solid var(--border-subtle);"></div>
							<button class="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors" style="color: var(--text-main);" on:click={exportarExcel} disabled={exporting}>
								<Sheet class="size-4 text-emerald-300" aria-hidden="true" />
								<div class="text-left">
									<div class="font-medium">Exportar Excel</div>
									<div class="text-xs" style="color: var(--text-muted);">Planilha com abas formatadas</div>
								</div>
							</button>
						</div>
					{/if}
				</div>
			</div>
			<div class="text-xs text-muted">Período: {dataInicio ? dataInicio.toLocaleDateString() : ''} – {dataFim ? dataFim.toLocaleDateString() : ''}</div>
		</div>
	{/if}
</section>


{#if loading}
	<div class="flex flex-col items-center justify-center py-16 gap-3">
		<div class="w-8 h-8 rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)] animate-spin"></div>
		<p class="text-sm text-muted">Carregando relatórios...</p>
	</div>
{:else}
	{#if modoRelatorio === 'caixa'}
		{#if !caixaSelecionado}
			<div class="flex flex-col items-center justify-center py-16 gap-2">
				<ChartNoAxesColumnIncreasing class="size-10 text-muted" />
				<p class="text-sm text-muted">Selecione um caixa ao lado para visualizar os relatórios.</p>
			</div>
		{:else}
		<section class="flex min-h-full flex-col gap-5">
			<!-- ✦ HERO: Receita Líquida -->
			<div class="card-hero">
				<div class="flex items-center gap-2 text-sm font-medium mb-1" style="color: var(--text-muted);">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
					Receita Líquida
				</div>
				<div class="text-3xl font-bold tracking-tight tabular-nums" style="color: var(--text-main);">{fmt(totalTaxaEntregaCaixa > 0 ? receitaRestauranteCaixa : receitaLiquidaCaixa)}</div>
				<div class="flex flex-wrap items-center gap-2 mt-2 text-sm" style="color: var(--text-muted);">
					<span>Bruto: {fmt(totalGeral)}</span>
					{#if totalDescontosCaixa > 0}
						<span class="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full text-xs">Descontos: -{fmt(totalDescontosCaixa)}</span>
					{/if}
					{#if totalCustosPlataformaCaixa > 0}
						<span class="bg-rose-500/15 text-rose-400 px-2 py-0.5 rounded-full text-xs">Plataformas: -{fmt(totalCustosPlataformaCaixa)}</span>
					{/if}
					{#if totalTaxaEntregaCaixa > 0}
						<span class="bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full text-xs">Entregador: -{fmt(totalTaxaEntregaCaixa)}</span>
					{/if}
				</div>
			</div>

			<!-- ✦ KPIs -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400"><Banknote class="size-3.5" aria-hidden="true" /></span>
						Vendas Brutas
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{fmt(totalGeral)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400"><ShoppingBag class="size-3.5" aria-hidden="true" /></span>
						Qtd. Vendas
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{qtdVendas}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400"><ChartNoAxesColumnIncreasing class="size-3.5" aria-hidden="true" /></span>
						Ticket Médio
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{fmt(ticketMedio)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-400"><Banknote class="size-3.5" aria-hidden="true" /></span>
						Dinheiro Líq.
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{fmt(totalDinheiro)}</div>
				</div>
			</div>

			<!-- ✦ Formas de Pagamento (unified card) -->
			{#if caixaPagItems.length > 0}
			<div class="card-mini">
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-main);">Formas de Pagamento</h3>
				<!-- Proportional bar -->
				<div class="flex h-3 rounded-full overflow-hidden mb-4">
					{#each caixaPagItems as p}
						<div class="{p.color}" style="width: {Math.max(caixaPagTotal > 0 ? (p.value / caixaPagTotal * 100) : 0, 2)}%"></div>
					{/each}
				</div>
				<!-- Legend -->
				<div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
					{#each caixaPagItems as p}
						<div class="flex items-center gap-2">
							<span class="w-2.5 h-2.5 rounded-full {p.color} shrink-0"></span>
							<div>
								<div class="text-xs text-muted">{p.label}</div>
								<div class="text-sm font-semibold {p.textColor}">{fmt(p.value)} <span class="text-xs font-normal text-muted">({caixaPagTotal > 0 ? (p.value / caixaPagTotal * 100).toFixed(1) : 0}%)</span></div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			{/if}

			<!-- ✦ Custos de Plataforma (caixa) -->
			{#if resumoTaxasCaixa.byPlatform.length > 0}
			<div class="card-mini">
				<div class="flex items-center justify-between gap-3 mb-3">
					<h3 class="text-sm font-semibold" style="color: var(--text-main);">Custos de Plataforma</h3>
					<div class="text-sm font-bold text-rose-600 dark:text-rose-400">-{fmt(totalCustosPlataformaCaixa)}</div>
				</div>
				<p class="text-xs mb-3" style="color: var(--text-muted);">
					Comissão das plataformas (snapshot da taxa configurada no momento da venda). Já descontado da Receita Líquida acima.
				</p>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each resumoTaxasCaixa.byPlatform as plat}
						<div class="rounded-lg card-inset">
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs font-medium text-main">{plat.nome}</span>
								<span class="text-xs text-muted">{plat.qtdVendas} venda{plat.qtdVendas === 1 ? '' : 's'}</span>
							</div>
							<div class="text-base font-bold text-rose-600 dark:text-rose-400">-{fmt(plat.total)}</div>
							<div class="text-xs text-muted mt-0.5">Bruto na plataforma: {fmt(plat.brutoTotal)}</div>
						</div>
					{/each}
				</div>
			</div>
			{/if}

			<!-- ✦ Tipos de Pedido (caixa) -->
			{#if vendasPorTipoCaixa.length > 0}
			<div class="card-mini">
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-main);">Tipos de Pedido</h3>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#each vendasPorTipoCaixa as t}
						<div class="flex flex-col gap-1 p-3 rounded-lg card-inset">
							<div class="text-xs text-muted font-medium flex items-center gap-1.5">
								<svelte:component this={resolveAppIcon(t.icon)} class="size-3.5" aria-hidden="true" />
								<span>{t.label}</span>
							</div>
							<div class="text-lg font-bold text-main">{fmt(t.total)}</div>
							<div class="text-xs text-muted">{t.qtd} venda{t.qtd !== 1 ? 's' : ''}</div>
							{#if t.taxaEntrega > 0}
								<div class="text-xs text-purple-500 dark:text-purple-400">Taxa entrega: {fmt(t.taxaEntrega)}</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if totalTaxaEntregaCaixa > 0}
					<div class="mt-3 pt-3 border-t border-[var(--border-card)] grid grid-cols-2 gap-4">
						<div>
							<div class="text-xs text-muted mb-1">Receita do Restaurante</div>
							<div class="text-base font-bold text-main">{fmt(receitaRestauranteCaixa)}</div>
						</div>
						<div>
							<div class="text-xs text-purple-500 dark:text-purple-400 mb-1">Taxas de Entrega (entregador)</div>
							<div class="text-base font-bold text-purple-600 dark:text-purple-400">{fmt(totalTaxaEntregaCaixa)}</div>
						</div>
					</div>
				{/if}
			</div>
			{/if}

			<!-- ✦ Movimentações & Caixa -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-2 h-2 rounded-full bg-red-500"></span>
						Sangrias
					</div>
					<div class="text-lg font-bold text-red-600 dark:text-red-400">{totalSangria > 0 ? '-' : ''}{fmt(totalSangria)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-2 h-2 rounded-full bg-green-500"></span>
						Suprimentos
					</div>
					<div class="text-lg font-bold text-green-600 dark:text-green-400">+{fmt(totalSuprimento)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-2 h-2 rounded-full bg-amber-500"></span>
						Descontos
					</div>
					<div class="text-lg font-bold text-amber-600 dark:text-amber-400">{totalDescontosCaixa > 0 ? '-' : ''}{fmt(totalDescontosCaixa)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-2 h-2 rounded-full" style="background: var(--text-muted);"></span>
						Saldo Gaveta
					</div>
					<div class="text-lg font-bold text-main">{fmt(saldoEsperadoGaveta)}</div>
					<div class="text-[10px] text-muted mt-0.5">Inicial: {fmt(caixaInfo?.valor_inicial || 0)}</div>
				</div>
			</div>

			{#if mesasAddonAtivo}
			<div class="card-mini">
				<div class="flex items-center justify-between gap-3 mb-3">
					<div>
						<h3 class="text-sm font-semibold" style="color: var(--text-main);">Resumo do Módulo Mesas</h3>
						<div class="text-xs text-muted">Ajustes vindos das comandas fechadas do salão.</div>
					</div>
					<div class="text-xs text-muted">{resumoMesasCaixa.comandas} comanda{resumoMesasCaixa.comandas === 1 ? '' : 's'}</div>
				</div>
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Couvert / repasse músico</div>
						<div class="text-lg font-bold text-main">{fmt(resumoMesasCaixa.couvert)}</div>
					</div>
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Descontos em comandas</div>
						<div class="text-lg font-bold text-amber-600 dark:text-amber-400">{resumoMesasCaixa.descontos > 0 ? '-' : ''}{fmt(resumoMesasCaixa.descontos)}</div>
					</div>
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Taxa de serviço</div>
						<div class="text-lg font-bold text-emerald-600 dark:text-emerald-400">+{fmt(resumoMesasCaixa.taxaServico)}</div>
					</div>
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Comandas fechadas</div>
						<div class="text-lg font-bold text-main">{resumoMesasCaixa.comandas}</div>
					</div>
				</div>
			</div>
			{/if}

			<!-- Produtos Vendidos (lista completa, com filtro por categoria) -->
			<div class="card-mini">
				<div class="flex items-center justify-between mb-3 gap-2">
					<div class="min-w-0">
						<h2 class="font-semibold text-main">
							Produtos Vendidos
							<span class="text-sm font-normal text-muted">({topProdutos.length})</span>
						</h2>
						<p class="mt-0.5 text-xs text-muted">Resumo agrupado por produto.</p>
						{#if categoriaFiltro}
							{@const _cat = categoriasDoCaixa.find(c => c.id === categoriaFiltro)}
							<div class="text-xs text-muted mt-0.5">
								Filtrado: <span class="text-main font-medium">{_cat?.nome || 'Categoria'}</span>
								<button class="ml-1 underline" on:click={() => categoriaFiltro = ''}>limpar</button>
							</div>
						{/if}
					</div>
					<button
						class="relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors {mostrarFiltrosProdutos || categoriaFiltro ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-400 text-sky-700 dark:text-sky-300' : 'border-[var(--border-card)] text-main hover:bg-[var(--accent-light)]'}"
						aria-label="Abrir filtros"
						title="Filtros"
						on:click={() => mostrarFiltrosProdutos = !mostrarFiltrosProdutos}
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h18M6 12h12M10 20h4" /></svg>
						Filtros
						{#if categoriaFiltro}
							<span class="ml-0.5 inline-flex w-4 h-4 rounded-full bg-sky-500 text-white items-center justify-center text-[10px] font-bold">1</span>
						{/if}
					</button>
				</div>
				{#if mostrarFiltrosProdutos}
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 p-3 rounded-lg card-inset">
						<div>
							<label for="top-order" class="block text-xs uppercase tracking-wide text-muted mb-1">Ordenar por</label>
							<select id="top-order" class="input-form w-full" bind:value={ordenarTop}>
								<option value="receita">Receita</option>
								<option value="quantidade">Quantidade</option>
								<option value="alfabetica">Produto</option>
							</select>
						</div>
						<div>
							<label for="top-dir" class="block text-xs uppercase tracking-wide text-muted mb-1">Direção</label>
							<select id="top-dir" class="input-form w-full" bind:value={ordenarDirecao}>
								<option value="desc">Maior → menor</option>
								<option value="asc">Menor → maior</option>
							</select>
						</div>
						<div>
							<label for="top-cat" class="block text-xs uppercase tracking-wide text-muted mb-1">Categoria</label>
							<select id="top-cat" class="input-form w-full" bind:value={categoriaFiltro}>
								<option value="">Todas</option>
								{#each categoriasDoCaixa as c}
									<option value={c.id}>{c.nome}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}
				{#if topProdutos.length === 0}
					<div class="text-sm text-muted text-center py-8">Nenhum produto vendido neste caixa{categoriaFiltro ? ' nesta categoria' : ''}.</div>
				{:else}
					<div class="overflow-x-auto max-h-[480px] overflow-y-auto rounded-lg border border-[var(--border-card)]">
						<table class="min-w-full text-sm">
							<thead class="sticky top-0" style="background: var(--bg-panel);">
								<tr class="text-left text-xs text-muted">
									<th class="py-2 px-3 font-medium">Produto</th>
									<th class="py-2 px-3 font-medium hidden sm:table-cell">Categoria</th>
									<th class="py-2 px-3 font-medium text-center">Qtd.</th>
									<th class="py-2 px-3 font-medium text-right">Receita</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-[var(--border-card)]">
								{#each topProdutos as p}
									<tr class="hover:bg-[var(--accent-light)]">
										<td class="py-2 px-3 text-main">{p.nome}</td>
										<td class="py-2 px-3 text-xs text-muted hidden sm:table-cell">{p.categoria || '—'}</td>
										<td class="py-2 px-3 text-center tabular-nums">{p.quantidade}</td>
										<td class="py-2 px-3 text-right font-medium tabular-nums">{fmt(p.receita)}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot class="sticky bottom-0" style="background: var(--bg-panel);">
								<tr class="text-sm font-semibold">
									<td class="py-2 px-3" colspan="2">Total</td>
									<td class="py-2 px-3 text-center">{topProdutos.reduce((a,p)=>a+p.quantidade,0)}</td>
									<td class="py-2 px-3 text-right">{fmt(topProdutos.reduce((a,p)=>a+p.receita,0))}</td>
								</tr>
							</tfoot>
						</table>
					</div>
				{/if}
			</div>

			<!-- Vendas: cupons individuais do caixa -->
			<div class="card-mini">
				<div class="mb-3">
					<h2 class="font-semibold text-main">
						Vendas do Caixa
						<span class="text-sm font-normal text-muted">({vendas.length})</span>
					</h2>
					<p class="mt-0.5 text-xs text-muted">Cupons individuais. Abra uma venda para conferir cliente, itens e valores.</p>
				</div>
				{#if vendas.length === 0}
					<div class="text-sm text-muted">Sem vendas para este caixa.</div>
				{:else}
					<div class="rounded-lg border border-[var(--border-card)]">
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-xs text-muted border-b border-[var(--border-card)]">
									<th class="py-2 pr-3 font-medium">#</th>
									<th class="py-2 pr-3 font-medium">Horário</th>
									<th class="py-2 pr-3 font-medium">Forma</th>
									<th class="py-2 text-right font-medium">Total</th>
									<th class="py-2 pl-3 text-right font-medium"><span class="sr-only">Detalhes</span></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-[var(--border-card)]">
								{#each vendasExibidas as v}
									{@const hasFiado = v.forma_pagamento === 'fiado' || (v.forma_pagamento === 'multiplo' && vendasPagamentos.some(p => p.id_venda === v.id && p.forma_pagamento === 'fiado'))}
									{@const cliente = v.id_cliente ? pessoasMap.get(v.id_cliente) : null}
									{@const itens = vendasItens.filter(i => i.id_venda === v.id)}
									{@const pagamentos = vendasPagamentos.filter(p => p.id_venda === v.id)}
									<tr class="hover:bg-[var(--accent-light)]">
										<td class="py-2 pr-3 text-muted text-xs">{v.numero_venda || v.id}</td>
										<td class="py-2 pr-3 text-main text-xs">{v.created_at ? new Date(v.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '-'}</td>
										<td class="py-2 pr-3">
											<span class="text-xs font-medium {hasFiado ? 'text-amber-500' : 'text-main'}">{formatForma(v.forma_pagamento)}</span>
										</td>
										<td class="py-2 text-right font-semibold text-main text-xs tabular-nums">{fmt(v.valor_total)}</td>
										<td class="py-2 pl-3 text-right">
											<button
												type="button"
												class="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300 dark:hover:bg-sky-900/30"
												aria-expanded={vendaDetalheAbertaId === v.id}
												aria-controls={`venda-detalhes-${v.id}`}
												on:click={() => alternarDetalheVenda(v.id)}
											>
												<span>{vendaDetalheAbertaId === v.id ? 'Ocultar' : 'Detalhes'}</span>
												<span class="transition-transform" class:rotate-180={vendaDetalheAbertaId === v.id}><ChevronDown class="size-4" aria-hidden="true" /></span>
											</button>
										</td>
									</tr>
									{#if vendaDetalheAbertaId === v.id}
										<tr id={`venda-detalhes-${v.id}`} style="background: var(--bg-card);">
											<td colspan="5" class="p-3">
												<div class="grid gap-3 md:grid-cols-3">
													<section class="min-w-0">
														<p class="text-xs font-medium text-muted">Itens</p>
														{#if itens.length}
															<ul class="mt-1 space-y-1 text-sm text-main">
																{#each itens as it}
																	<li class="break-words">{it.quantidade}× {it.nome_produto_na_venda}</li>
																{/each}
															</ul>
														{:else}
															<p class="mt-1 text-sm text-muted">Sem itens registrados.</p>
														{/if}
													</section>
													<section>
														<p class="text-xs font-medium text-muted">Pagamento</p>
														{#if pagamentos.length}
															<ul class="mt-1 space-y-1 text-sm text-main">
																{#each pagamentos as pagamento}
																	<li>{formatForma(pagamento.forma_pagamento)} · {fmt(pagamento.valor)}</li>
																{/each}
															</ul>
														{:else}
															<p class="mt-1 text-sm text-main">{formatForma(v.forma_pagamento)}</p>
														{/if}
														{#if Number(v.valor_desconto || 0) > 0 || Number(v.valor_troco || 0) > 0}
															<p class="mt-2 text-xs text-muted">{#if Number(v.valor_desconto || 0) > 0}Desconto: {fmt(v.valor_desconto)}{/if}{#if Number(v.valor_desconto || 0) > 0 && Number(v.valor_troco || 0) > 0} · {/if}{#if Number(v.valor_troco || 0) > 0}Troco: {fmt(v.valor_troco)}{/if}</p>
														{/if}
													</section>
													<section>
														<p class="text-xs font-medium text-muted">Cliente</p>
														<p class="mt-1 text-sm text-main">{cliente?.nome || 'Não informado'}</p>
														<p class="mt-2 text-xs text-muted">Total: <span class="font-semibold text-main">{fmt(v.valor_total)}</span></p>
													</section>
												</div>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Controles de paginação -->
					{#if vendasTotalPages > 1}
						<div class="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-card)]">
							<span class="text-xs text-muted">
								{(vendasPage-1)*VENDAS_PER_PAGE + 1}–{Math.min(vendasPage*VENDAS_PER_PAGE, vendas.length)} de {vendas.length} vendas
							</span>
							<div class="flex items-center gap-1">
								<button
									class="px-2 py-1 text-xs rounded-sm border border-[var(--border-card)] hover:bg-[var(--accent-light)] disabled:opacity-40 transition-colors"
									disabled={vendasPage === 1}
									on:click={() => vendasPage--}
								>← Ant.</button>
								{#each vendasPageButtons as pg}
									{#if pg === null}
										<span class="px-1 text-xs text-muted">…</span>
									{:else}
										<button
											class="px-2 py-1 text-xs rounded-sm border transition-colors {pg === vendasPage ? 'bg-sky-500 text-white border-sky-500' : 'border-[var(--border-card)] hover:bg-[var(--accent-light)]'}"
											on:click={() => vendasPage = pg}
										>{pg}</button>
									{/if}
								{/each}
								<button
									class="px-2 py-1 text-xs rounded-sm border border-[var(--border-card)] hover:bg-[var(--accent-light)] disabled:opacity-40 transition-colors"
									disabled={vendasPage === vendasTotalPages}
									on:click={() => vendasPage++}
								>Próx. →</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Movimentações de Caixa -->
			<div class="card-mini">
				<h2 class="font-semibold" style="color: var(--text-main);">Movimentações do Caixa</h2>
				{#if movs.length === 0}
					<div class="mt-3 flex flex-1 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm" style="border-color: var(--border-subtle); color: var(--text-muted);">
						Sem sangrias ou suprimentos neste caixa.
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-xs" style="color: var(--text-muted);">
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
		<section class="space-y-5">
			<!-- ✦ HERO: Receita Líquida -->
			<div class="card-hero">
				<div class="flex items-center gap-2 text-muted text-sm font-medium mb-1">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
					Receita Líquida
				</div>
				<div class="text-3xl font-bold text-white tracking-tight">{fmt(periodoTotalTaxaEntrega > 0 ? periodoReceitaRestaurante : periodoReceitaLiquida)}</div>
				<div class="flex flex-wrap items-center gap-2 mt-2 text-sm" style="color: var(--text-muted);">
					<span>Bruto: {fmt(periodoTotalGeral)}</span>
					{#if periodoTotalDescontos > 0}
						<span class="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full text-xs">Descontos: -{fmt(periodoTotalDescontos)}</span>
					{/if}
					{#if periodoTotalCustosPlataforma > 0}
						<span class="bg-rose-500/15 text-rose-400 px-2 py-0.5 rounded-full text-xs">Plataformas: -{fmt(periodoTotalCustosPlataforma)}</span>
					{/if}
					{#if periodoTotalDespesas > 0}
						<span class="bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full text-xs">Despesas: -{fmt(periodoTotalDespesas)}</span>
					{/if}
					{#if periodoTotalTaxaEntrega > 0}
						<span class="bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full text-xs">Entregador: -{fmt(periodoTotalTaxaEntrega)}</span>
					{/if}
				</div>
			</div>

			<!-- ✦ KPIs -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400"><Banknote class="size-3.5" aria-hidden="true" /></span>
						Vendas Brutas
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{fmt(periodoTotalGeral)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400"><ShoppingBag class="size-3.5" aria-hidden="true" /></span>
						Qtd. Vendas
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{periodoQtdVendas}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400"><ChartNoAxesColumnIncreasing class="size-3.5" aria-hidden="true" /></span>
						Ticket Médio
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{fmt(periodoTicketMedio)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-5 h-5 rounded-sm bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-400"><Banknote class="size-3.5" aria-hidden="true" /></span>
						Dinheiro Líq.
					</div>
					<div class="text-xl font-bold tabular-nums" style="color: var(--text-main);">{fmt(periodoDinheiroLiquido)}</div>
				</div>
			</div>

			<!-- ✦ Formas de Pagamento (unified card) -->
			{#if periodoPagItems.length > 0}
			<div class="card-mini">
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-main);">Formas de Pagamento</h3>
				<!-- Proportional bar -->
				<div class="flex h-3 rounded-full overflow-hidden mb-4">
					{#each periodoPagItems as p}
						<div class="{p.color}" style="width: {Math.max(periodoPagTotal > 0 ? (p.value / periodoPagTotal * 100) : 0, 2)}%"></div>
					{/each}
				</div>
				<!-- Legend -->
				<div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
					{#each periodoPagItems as p}
						<div class="flex items-center gap-2">
							<span class="w-2.5 h-2.5 rounded-full {p.color} shrink-0"></span>
							<div>
								<div class="text-xs text-muted">{p.label}</div>
								<div class="text-sm font-semibold {p.textColor}">{fmt(p.value)} <span class="text-xs font-normal text-muted">({periodoPagTotal > 0 ? (p.value / periodoPagTotal * 100).toFixed(1) : 0}%)</span></div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			{/if}

			<!-- ✦ Custos de Plataforma (periodo) -->
			{#if resumoTaxasPeriodo.byPlatform.length > 0}
			<div class="card-mini">
				<div class="flex items-center justify-between gap-3 mb-3">
					<h3 style="color: var(--text-main);">Custos de Plataforma</h3>
					<div class="text-sm font-bold text-rose-600 dark:text-rose-400">-{fmt(periodoTotalCustosPlataforma)}</div>
				</div>
				<p class="text-xs mb-3" style="color: var(--text-muted);">
					Comissão das plataformas (snapshot da taxa configurada no momento da venda). Já descontado da Receita Líquida acima.
				</p>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each resumoTaxasPeriodo.byPlatform as plat}
						<div class="rounded-lg card-inset">
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs font-medium text-main">{plat.nome}</span>
								<span class="text-xs text-muted">{plat.qtdVendas} venda{plat.qtdVendas === 1 ? '' : 's'}</span>
							</div>
							<div class="text-base font-bold text-rose-600 dark:text-rose-400">-{fmt(plat.total)}</div>
							<div class="text-xs text-muted mt-0.5">Bruto na plataforma: {fmt(plat.brutoTotal)}</div>
						</div>
					{/each}
				</div>
			</div>
			{/if}

			<!-- ✦ Tipos de Pedido (periodo) -->
			{#if periodoVendasPorTipo.length > 0}
			<div class="card-mini">
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-main);">Tipos de Pedido</h3>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#each periodoVendasPorTipo as t}
						<div class="flex flex-col gap-1 p-3 rounded-lg card-inset">
							<div class="text-xs text-muted font-medium flex items-center gap-1.5">
								<svelte:component this={resolveAppIcon(t.icon)} class="size-3.5" aria-hidden="true" />
								<span>{t.label}</span>
							</div>
							<div class="text-lg font-bold text-main">{fmt(t.total)}</div>
							<div class="text-xs text-muted">{t.qtd} venda{t.qtd !== 1 ? 's' : ''}</div>
							{#if t.taxaEntrega > 0}
								<div class="text-xs text-purple-500 dark:text-purple-400">Taxa entrega: {fmt(t.taxaEntrega)}</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if periodoTotalTaxaEntrega > 0}
					<div class="mt-3 pt-3 border-t border-[var(--border-card)] grid grid-cols-2 gap-4">
						<div>
							<div class="text-xs text-muted mb-1">Receita do Restaurante</div>
							<div class="text-base font-bold text-main">{fmt(periodoReceitaRestaurante)}</div>
						</div>
						<div>
							<div class="text-xs text-purple-500 dark:text-purple-400 mb-1">Taxas de Entrega (entregador)</div>
							<div class="text-base font-bold text-purple-600 dark:text-purple-400">{fmt(periodoTotalTaxaEntrega)}</div>
						</div>
					</div>
				{/if}
			</div>
			{/if}

			<!-- ✦ Movimentações -->
			<div class="grid grid-cols-3 gap-3">
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-2 h-2 rounded-full bg-red-500"></span>
						Sangrias
					</div>
					<div class="text-lg font-bold text-red-600 dark:text-red-400">{periodoTotalSangria > 0 ? '-' : ''}{fmt(periodoTotalSangria)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-2 h-2 rounded-full bg-green-500"></span>
						Suprimentos
					</div>
					<div class="text-lg font-bold text-green-600 dark:text-green-400">+{fmt(periodoTotalSuprimento)}</div>
				</div>
				<div class="card-mini">
					<div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
						<span class="w-2 h-2 rounded-full bg-amber-500"></span>
						Descontos
					</div>
					<div class="text-lg font-bold text-amber-600 dark:text-amber-400">{periodoTotalDescontos > 0 ? '-' : ''}{fmt(periodoTotalDescontos)}</div>
				</div>
			</div>


			<!-- Gráficos Visuais -->
			{#if mesasAddonAtivo}
			<div class="card-mini">
				<div class="flex items-center justify-between gap-3 mb-3">
					<div>
						<h3 class="text-sm font-semibold" style="color: var(--text-main);">Resumo do Módulo Mesas</h3>
						<div class="text-xs text-muted">Totais das comandas fechadas dentro do período selecionado.</div>
					</div>
					<div class="text-xs text-muted">{resumoMesasPeriodo.comandas} comanda{resumoMesasPeriodo.comandas === 1 ? '' : 's'}</div>
				</div>
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Couvert / repasse músico</div>
						<div class="text-lg font-bold text-main">{fmt(resumoMesasPeriodo.couvert)}</div>
					</div>
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Descontos em comandas</div>
						<div class="text-lg font-bold text-amber-600 dark:text-amber-400">{resumoMesasPeriodo.descontos > 0 ? '-' : ''}{fmt(resumoMesasPeriodo.descontos)}</div>
					</div>
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Taxa de serviço</div>
						<div class="text-lg font-bold text-emerald-600 dark:text-emerald-400">+{fmt(resumoMesasPeriodo.taxaServico)}</div>
					</div>
					<div class="rounded-lg card-inset">
						<div class="text-xs text-muted mb-1">Comandas fechadas</div>
						<div class="text-lg font-bold text-main">{resumoMesasPeriodo.comandas}</div>
					</div>
				</div>
			</div>
			{/if}

			<div class="grid lg:grid-cols-2 gap-6">
				<!-- Gráfico de Barras: Vendas diárias -->
				<div class="p-4 rounded-lg border card-inset">
					<BarChart 
						title="Vendas por Dia"
						data={periodoSerieDiaria.slice(-14).map(d => ({
							label: new Date(d.dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
							value: d.total,
							extra: d.qtd + ' vendas'
						}))}
						barColor="bg-indigo-500"
						maxHeight={140}
					/>
				</div>
				
				<!-- Gráfico de Rosca: Formas de Pagamento -->
				<div class="p-4 rounded-lg border card-inset">
					<DonutChart
						title="Formas de Pagamento"
						data={periodoPagItems.map((payment) => ({ label: payment.label, value: payment.value, color: payment.hex }))}
						size={160}
					/>
				</div>
			</div>

			<!-- Série diária -->
			<div>
				<h2 class="font-semibold text-main mb-2">Série Diária</h2>
				{#if periodoSerieDiaria.length === 0}
					<div class="text-sm text-muted">Sem vendas no período.</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-xs" style="color: var(--text-muted);">
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

			<!-- Produtos Vendidos (Período) — lista completa com filtro por categoria -->
			<div class="card-mini">
				<div class="flex items-center justify-between mb-3 gap-2">
					<div class="min-w-0">
						<h2 class="font-semibold text-main">
							Produtos Vendidos (Período)
							<span class="text-sm font-normal text-muted">({periodoTopProdutos.length})</span>
						</h2>
						{#if periodoCategoriaFiltro}
							{@const _cat = categoriasDoPeriodo.find(c => c.id === periodoCategoriaFiltro)}
							<div class="text-xs text-muted mt-0.5">
								Filtrado: <span class="text-main font-medium">{_cat?.nome || 'Categoria'}</span>
								<button class="ml-1 underline" on:click={() => periodoCategoriaFiltro = ''}>limpar</button>
							</div>
						{/if}
					</div>
					<button
						class="relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors {periodoMostrarFiltros || periodoCategoriaFiltro ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-400 text-sky-700 dark:text-sky-300' : 'border-[var(--border-card)] text-main hover:bg-[var(--accent-light)]'}"
						aria-label="Abrir filtros"
						title="Filtros"
						on:click={() => periodoMostrarFiltros = !periodoMostrarFiltros}
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h18M6 12h12M10 20h4" /></svg>
						Filtros
						{#if periodoCategoriaFiltro}
							<span class="ml-0.5 inline-flex w-4 h-4 rounded-full bg-sky-500 text-white items-center justify-center text-[10px] font-bold">1</span>
						{/if}
					</button>
				</div>
				{#if periodoMostrarFiltros}
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 p-3 rounded-lg card-inset">
						<div>
							<label for="p-top-order" class="block text-xs uppercase tracking-wide text-muted mb-1">Ordenar por</label>
							<select id="p-top-order" class="input-form w-full" bind:value={periodoOrdenarTop}>
								<option value="receita">Receita</option>
								<option value="quantidade">Quantidade</option>
								<option value="alfabetica">Produto</option>
							</select>
						</div>
						<div>
							<label for="p-top-dir" class="block text-xs uppercase tracking-wide text-muted mb-1">Direção</label>
							<select id="p-top-dir" class="input-form w-full" bind:value={periodoOrdenarDirecao}>
								<option value="desc">Maior → menor</option>
								<option value="asc">Menor → maior</option>
							</select>
						</div>
						<div>
							<label for="p-top-cat" class="block text-xs uppercase tracking-wide text-muted mb-1">Categoria</label>
							<select id="p-top-cat" class="input-form w-full" bind:value={periodoCategoriaFiltro}>
								<option value="">Todas</option>
								{#each categoriasDoPeriodo as c}
									<option value={c.id}>{c.nome}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}
				{#if periodoTopProdutos.length === 0}
					<div class="text-sm text-muted">Sem itens no período{periodoCategoriaFiltro ? ' nesta categoria' : ''}.</div>
				{:else}
					<div class="overflow-x-auto max-h-[480px] overflow-y-auto rounded-lg border border-[var(--border-card)]">
						<table class="min-w-full text-sm">
							<thead class="sticky top-0" style="background: var(--bg-panel);">
								<tr class="text-left text-xs text-muted">
									<th class="py-2 px-3 font-medium">Produto</th>
									<th class="py-2 px-3 font-medium hidden sm:table-cell">Categoria</th>
									<th class="py-2 px-3 font-medium text-center">Qtd.</th>
									<th class="py-2 px-3 font-medium text-right">Receita</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-[var(--border-card)]">
								{#each periodoTopProdutos as p}
									<tr class="hover:bg-[var(--accent-light)]">
										<td class="py-2 px-3 text-main">{p.nome}</td>
										<td class="py-2 px-3 text-xs text-muted hidden sm:table-cell">{p.categoria || '—'}</td>
										<td class="py-2 px-3 text-center tabular-nums">{p.quantidade}</td>
										<td class="py-2 px-3 text-right font-medium tabular-nums">{fmt(p.receita)}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot class="sticky bottom-0" style="background: var(--bg-panel);">
								<tr class="text-sm font-semibold">
									<td class="py-2 px-3" colspan="2">Total</td>
									<td class="py-2 px-3 text-center">{periodoTopProdutos.reduce((a,p)=>a+p.quantidade,0)}</td>
									<td class="py-2 px-3 text-right">{fmt(periodoTopProdutos.reduce((a,p)=>a+p.receita,0))}</td>
								</tr>
							</tfoot>
						</table>
					</div>
				{/if}
			</div>
		</section>
	{/if}
{/if}
</AdminLock>

<style>
  .export-dropdown-backdrop {
    border: 0;
    padding: 0;
    background: transparent;
  }

  /* ── Card vocabulary ─────────────────────────────────────── */
  .card-panel {
    background: var(--bg-panel);
    border: 1px solid var(--border-card);
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .card-hero {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .card-mini {
    background: var(--bg-panel);
    border: 1px solid var(--border-card);
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .card-inset {
    background: rgba(15, 23, 42, 0.3);
    border: 1px solid var(--border-card);
    border-radius: 0.5rem;
    padding: 0.75rem;
  }
</style>
