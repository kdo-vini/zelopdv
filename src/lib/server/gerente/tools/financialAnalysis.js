/**
 * Análise financeira do Zelinho. Os números são calculados a partir das
 * vendas, itens, taxas, despesas e custos unitários atualmente cadastrados.
 * Não transforma cobertura parcial de custos em "lucro real".
 */
import { fetchVendas, fetchVendasItens, fetchVendasTaxas } from '../../intelligence/fetchers.js';
import { addDays, dayRangeUtc, localDateOf } from '../../intelligence/tz.js';
import { listarDespesas } from './finance.js';

const PERIODOS = new Set(['hoje', 'ontem', 'semana', 'mes']);

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function bounds(periodo, today) {
  if (periodo === 'hoje') return { inicio: today, fim: today };
  if (periodo === 'ontem') { const d = addDays(today, -1); return { inicio: d, fim: d }; }
  if (periodo === 'semana') return { inicio: addDays(today, -6), fim: today };
  return { inicio: `${today.slice(0, 7)}-01`, fim: today };
}

export async function resumoFinanceiro(db, ownerUserId, { periodo = 'mes', produto_id = null } = {}, { now = new Date() } = {}) {
  if (!PERIODOS.has(periodo)) return { ok: false, error: 'Posso calcular hoje, ontem, semana ou mês.' };
  const today = localDateOf(now.toISOString());
  const { inicio, fim } = bounds(periodo, today);
  const { startIso } = dayRangeUtc(inicio);
  const { endIso } = dayRangeUtc(fim);
  try {
    const vendas = await fetchVendas(db, ownerUserId, startIso, endIso);
    const vendaIds = vendas.map((venda) => venda.id);
    const itens = vendaIds.length ? await fetchVendasItens(db, vendaIds) : [];
    const taxas = vendaIds.length ? await fetchVendasTaxas(db, vendaIds) : [];
    const filteredItems = produto_id == null ? itens : itens.filter((item) => Number(item.id_produto) === Number(produto_id));
    const filteredVendaIds = produto_id == null ? null : new Set(filteredItems.map((item) => item.id_venda));
    const scopedVendas = filteredVendaIds ? vendas.filter((venda) => filteredVendaIds.has(venda.id)) : vendas;
    const receitaBruta = produto_id == null
      ? round2(scopedVendas.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0))
      : round2(filteredItems.reduce((sum, item) => sum + Number(item.quantidade || 0) * Number(item.preco_unitario_na_venda || 0), 0));
    const scopedVendaIds = new Set(scopedVendas.map((venda) => venda.id));
    const scopedTaxas = produto_id == null ? taxas.filter((taxa) => scopedVendaIds.has(taxa.id_venda)) : [];
    const custosPlataforma = round2(scopedTaxas.reduce((sum, taxa) => sum + Number(taxa.valor_taxa || 0), 0));
    const despesasResult = await listarDespesas(db, ownerUserId, { periodo }, { now });
    if (!despesasResult.ok) return despesasResult;
    const despesas = produto_id == null ? Number(despesasResult.data.total || 0) : 0;
    const productIds = [...new Set(filteredItems.map((item) => Number(item.id_produto)).filter((id) => Number.isInteger(id) && id > 0))];
    const productsResult = productIds.length
      ? await db.from('produtos').select('id, nome, custo_unitario').eq('id_usuario', ownerUserId).in('id', productIds)
      : { data: [], error: null };
    if (productsResult.error) return { ok: false, error: 'Não consegui consultar os custos dos produtos.' };
    const costs = new Map((productsResult.data || []).map((product) => [Number(product.id), product]));
    let custoProdutosConhecido = 0;
    let quantidadeComCusto = 0;
    let quantidadeSemCusto = 0;
    for (const item of filteredItems) {
      const qtd = Number(item.quantidade || 0);
      const product = costs.get(Number(item.id_produto));
      if (product?.custo_unitario != null) {
        custoProdutosConhecido = round2(custoProdutosConhecido + qtd * Number(product.custo_unitario));
        quantidadeComCusto += qtd;
      } else {
        quantidadeSemCusto += qtd;
      }
    }
    // “Resultado registrado” segue o conceito apresentado ao dono: vendas
    // menos despesas lançadas. Taxas de plataforma e custos de produto entram
    // apenas na estimativa, para não misturar uma despesa técnica conhecida
    // com o que foi efetivamente lançado no módulo de despesas.
    const resultadoRegistrado = round2(receitaBruta - despesas);
    const cobertura = quantidadeComCusto + quantidadeSemCusto === 0
      ? 'nenhum'
      : quantidadeSemCusto === 0 ? 'total' : quantidadeComCusto === 0 ? 'nenhum' : 'parcial';
    const lucroEstimado = cobertura === 'nenhum' ? null : round2(resultadoRegistrado - custoProdutosConhecido - custosPlataforma);
    return {
      ok: true,
      data: {
        periodo, inicio, fim, produto_id: produto_id == null ? null : Number(produto_id),
        faturamento: receitaBruta,
        despesas_registradas: round2(despesas),
        custos_plataforma: custosPlataforma,
        custo_produtos_conhecido: round2(custoProdutosConhecido),
        resultado_registrado: resultadoRegistrado,
        lucro_estimado: lucroEstimado,
        margem_estimada: lucroEstimado != null && receitaBruta > 0 ? round2((lucroEstimado / receitaBruta) * 100) : null,
        cobertura_custos: cobertura,
        quantidade_com_custo: quantidadeComCusto,
        quantidade_sem_custo: quantidadeSemCusto,
        fonte: 'vendas_detalhadas_e_despesas_registradas',
      },
    };
  } catch (error) {
    console.error('[gerente/financial-analysis]:', error?.message || error);
    return { ok: false, error: 'Não consegui calcular o resumo financeiro agora.' };
  }
}
