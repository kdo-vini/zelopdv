import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, CreditCard,
  PackageSearch, ShoppingBag, WalletCards
} from 'lucide-svelte';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const number = (value, digits = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value) || 0);
const percent = (value) => `${number((Number(value) || 0) * 100, 0)}%`;
const field = (label, value) => ({ label, valor: value });

const routes = {
  estoque: { href: '/gestao/produtos', label: 'Abrir estoque' },
  caixa: { href: '/gestao/caixa', label: 'Ver caixa' },
  fiado: { href: '/gestao/fichario', label: 'Ver fichário' },
  produto: { href: '/gestao/produtos', label: 'Ver produtos' },
  relatorios: { href: '/relatorios', label: 'Ver relatórios' },
};

const evidence = {
  revenue: (e) => [field('Vendas no dia', money(e.revenue_today)), field('Média comparável', money(e.baseline_avg)), field('Variação', percent(e.delta_pct)), field('Dias comparados', number(e.n_baseline))],
  ticket: (e) => [field('Ticket no dia', money(e.ticket_today)), field('Referência', money(e.ticket_baseline)), field('Variação', percent(e.delta_ticket_pct)), field('Vendas no dia', number(e.qtd_today))],
  productDrop: (e) => [field('Produto', e.nome_produto || 'Produto'), field('Unidades nos últimos 7 dias', number(e.qty_last7)), field('Média semanal anterior', number(e.baseline_avg_7d)), field('Variação', percent(e.delta_pct))],
  concentration: (e) => [field('Produto', e.nome_produto || 'Produto'), field('Participação nas vendas', percent(e.share_pct)), field('Vendas do produto', money(e.revenue_product_30d)), field('Vendas totais', money(e.revenue_total_30d))],
  payment: (e) => [field('Forma de pagamento', e.forma || 'Não informada'), field('Participação recente', percent(e.share_recent)), field('Participação anterior', percent(e.share_previous)), field('Mudança', percent(e.shift_pp))],
  fiado: (e) => [field('Fiado emitido em 30 dias', money(e.fiado_issued_30d)), field('Participação das vendas', percent(e.share_pct)), field('Vendas no período', money(e.revenue_30d)), field('Saldo atual no fichário', money(e.saldo_fiado_total_atual))],
  cash: (e) => [field('Fechamentos analisados', number(e.n_closures_checked)), field('Com diferença', number(e.n_with_difference)), field('Soma das diferenças', money(e.sum_differences)), field('Média por diferença', money(e.avg_difference))],
  stockCoverage: (e) => [field('Produto', e.nome_produto || 'Produto'), field('Estoque atual', number(e.estoque_atual)), field('Cobertura no ritmo médio', `${number(e.coverage_days, 1)} dias`), field('Consumo médio diário', number(e.consumo_diario_medio, 1))],
  stockZero: (e) => [field('Produto', e.nome_produto || 'Produto'), field('Estoque atual', number(e.estoque_atual)), field('Dias com saída em 7 dias', number(e.dias_com_venda_7d)), field('Consumo médio diário', number(e.consumo_diario_medio_7d, 1))],
  openCash: (e) => [field('Aberto desde', e.data_abertura || 'Não informado'), field('Tempo aberto', `${number(e.horas_aberto, 1)} horas`), field('Valor inicial', money(e.valor_inicial))],
};

export const signalPresenters = {
  REVENUE_BELOW_WEEKDAY_AVG: { titulo: 'Vendas abaixo do ritmo habitual', icone: ArrowDownRight, tagClass: 'attention', perguntaSugerida: 'O que pode explicar essa queda nas vendas?', acaoSugerida: routes.relatorios, formatEvidence: evidence.revenue },
  REVENUE_ABOVE_WEEKDAY_AVG: { titulo: 'Vendas acima do ritmo habitual', icone: ArrowUpRight, tagClass: 'info', perguntaSugerida: 'O que ajudou as vendas a subirem?', acaoSugerida: routes.relatorios, formatEvidence: evidence.revenue },
  AVG_TICKET_DOWN: { titulo: 'Ticket médio abaixo da referência', icone: ShoppingBag, tagClass: 'attention', perguntaSugerida: 'Como posso melhorar o ticket médio?', acaoSugerida: routes.relatorios, formatEvidence: evidence.ticket },
  PRODUCT_SALES_DROP: { titulo: 'Um produto perdeu saída', icone: PackageSearch, tagClass: 'attention', perguntaSugerida: 'O que mudou nas vendas deste produto?', acaoSugerida: routes.produto, formatEvidence: evidence.productDrop },
  TOP_PRODUCT_CONCENTRATION: { titulo: 'Vendas concentradas em um produto', icone: ShoppingBag, tagClass: 'info', perguntaSugerida: 'Como reduzir a dependência deste produto?', acaoSugerida: routes.produto, formatEvidence: evidence.concentration },
  PAYMENT_MIX_SHIFT: { titulo: 'Mudança na forma de pagamento', icone: CreditCard, tagClass: 'info', perguntaSugerida: 'O que essa mudança de pagamentos indica?', acaoSugerida: routes.relatorios, formatEvidence: evidence.payment },
  FIADO_ISSUED_SHARE_HIGH: { titulo: 'Fiado ganhou espaço nas vendas', icone: WalletCards, tagClass: 'attention', perguntaSugerida: 'Como acompanhar melhor o fiado?', acaoSugerida: routes.fiado, formatEvidence: evidence.fiado },
  CASH_DIFFERENCE_RECURRING: { titulo: 'Diferenças recorrentes no caixa', icone: Banknote, tagClass: 'critical', perguntaSugerida: 'Como investigar as diferenças de caixa?', acaoSugerida: routes.caixa, formatEvidence: evidence.cash },
  STOCK_COVERAGE_LOW: { titulo: 'Estoque com cobertura curta', icone: PackageSearch, tagClass: 'attention', perguntaSugerida: 'Como planejar a reposição deste produto?', acaoSugerida: routes.estoque, formatEvidence: evidence.stockCoverage },
  STOCK_ZERO_WITH_DEMAND: { titulo: 'Produto zerado com saída recente', icone: AlertCircle, tagClass: 'critical', perguntaSugerida: 'Como priorizar a reposição deste produto?', acaoSugerida: routes.estoque, formatEvidence: evidence.stockZero },
  CAIXA_LEFT_OPEN: { titulo: 'Caixa continua aberto', icone: Banknote, tagClass: 'attention', perguntaSugerida: 'O que preciso conferir antes de fechar o caixa?', acaoSugerida: routes.caixa, formatEvidence: evidence.openCash },
};

export function getSignalPresenter(signal) {
  return signalPresenters[signal?.type] || { titulo: 'Ponto para acompanhar', icone: AlertCircle, tagClass: 'info', perguntaSugerida: 'O que estes números mostram?', acaoSugerida: routes.relatorios, formatEvidence: () => [] };
}

export function confiancaHumana(confidence, evidenceData = {}) {
  const sample = Number(evidenceData.n_baseline || evidenceData.sample_size || evidenceData.n_recent || 0);
  const suffix = sample ? ` nas últimas ${sample} referências comparáveis` : ' no histórico recente';
  if (Number(confidence) >= 0.7) return `Comparando com${suffix}.`;
  return `Comparando com${suffix}; ainda com pouco histórico, leve como indício.`;
}

