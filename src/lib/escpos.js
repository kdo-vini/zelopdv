// src/lib/escpos.js
// Builder de comandos ESC/POS + formatação dos cupons (Tier A) em bytes.
// Saída: Uint8Array que vai direto para a impressora térmica via printer.js.
//
// Codepage: tentamos CP850 (multilingue, comum em térmicas) — se algum char não
// estiver no mapa, faz fallback para a versão ASCII (á → a). Funciona em
// qualquer impressora ESC/POS, do Epson TM-T20 ao clone genérico de R$ 250.

/* eslint-disable no-bitwise */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Mapa CP850 para os caracteres PT-BR mais usados.
 * Para qualquer char fora desse mapa caímos no fallback ASCII (sem acento).
 * Fonte: tabela CP850 oficial (IBM PC Latin-1 Multilingual).
 */
const CP850 = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87,
  'ê': 0x88, 'ë': 0x89, 'è': 0x8a, 'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'Å': 0x8f,
  'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99,
  'Ü': 0x9a, 'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7,
  'Á': 0xb5, 'Â': 0xb6, 'À': 0xb7, 'Ã': 0xc6, 'ã': 0xc7, 'Ê': 0xd2, 'Ë': 0xd3, 'È': 0xd4,
  'Í': 0xd6, 'Î': 0xd7, 'Ï': 0xd8, 'Ó': 0xe0, 'ß': 0xe1, 'Ô': 0xe2, 'Ò': 0xe3, 'õ': 0xe4, 'Õ': 0xe5,
  'Ú': 0xe9, 'Û': 0xea, 'Ù': 0xeb, '°': 0xf8,
};

/** ASCII fold para chars PT-BR sem entrada no CP850. */
const ASCII_FOLD = {
  'á':'a','à':'a','â':'a','ã':'a','ä':'a','å':'a',
  'Á':'A','À':'A','Â':'A','Ã':'A','Ä':'A','Å':'A',
  'é':'e','è':'e','ê':'e','ë':'e',
  'É':'E','È':'E','Ê':'E','Ë':'E',
  'í':'i','ì':'i','î':'i','ï':'i',
  'Í':'I','Ì':'I','Î':'I','Ï':'I',
  'ó':'o','ò':'o','ô':'o','õ':'o','ö':'o',
  'Ó':'O','Ò':'O','Ô':'O','Õ':'O','Ö':'O',
  'ú':'u','ù':'u','û':'u','ü':'u',
  'Ú':'U','Ù':'U','Û':'U','Ü':'U',
  'ç':'c','Ç':'C',
  'ñ':'n','Ñ':'N',
  '°':'o','ª':'a','º':'o','—':'-','–':'-','’':"'",'‘':"'",'“':'"','”':'"','…':'...',' ':' ',
};

/** Encode 1 string em bytes CP850 com fallback ASCII. */
function encode(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) { out.push(code); continue; }
    if (CP850[ch] != null) { out.push(CP850[ch]); continue; }
    const fold = ASCII_FOLD[ch];
    if (fold != null) { out.push(fold.charCodeAt(0)); continue; }
    out.push(0x3f); // '?' para chars desconhecidos
  }
  return Uint8Array.from(out);
}

/** Versão "fold" para cálculos de largura — caracteres CP850 ocupam 1 col na térmica. */
function visibleLen(str) {
  return String(str ?? '').length;
}

class Builder {
  constructor() { /** @type {number[][]} */ this.parts = []; }
  raw(arr) {
    if (arr instanceof Uint8Array) this.parts.push(Array.from(arr));
    else this.parts.push(arr);
    return this;
  }
  text(s) { return this.raw(encode(s)); }
  /** Texto + LF. */
  line(s = '') { this.text(s); this.parts.push([LF]); return this; }
  newline(n = 1) { for (let i = 0; i < n; i++) this.parts.push([LF]); return this; }
  init() { return this.raw([ESC, 0x40]); }
  /**
   * ESC 7 n1 n2 n3 — ajusta intensidade de impressão.
   * n1 = heating dots (0–255, padrão 7): mais = mais escuro
   * n2 = heating time (3–255, padrão 80): mais = mais escuro (unidades de 10µs)
   * n3 = heating interval (0–255, padrão 2): mantemos baixo
   * Valores aqui produzem impressão bem mais escura sem risco de queimar o papel.
   */
  darkness() { return this.raw([ESC, 0x37, 15, 200, 2]); }
  /** ESC t 2 → CP850 (Multilingual Latin 1). */
  selectCodepage() { return this.raw([ESC, 0x74, 0x02]); }
  /** ESC R 8 → caracteres internacionais Latin-American. */
  charset() { return this.raw([ESC, 0x52, 0x08]); }
  align(a) {
    const m = a === 'center' ? 1 : a === 'right' ? 2 : 0;
    return this.raw([ESC, 0x61, m]);
  }
  bold(on) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  /** GS ! n — bit 0x10 = double width, 0x01 = double height. */
  size({ width = false, height = false } = {}) {
    const n = (width ? 0x10 : 0) | (height ? 0x01 : 0);
    return this.raw([GS, 0x21, n]);
  }
  underline(on) { return this.raw([ESC, 0x2d, on ? 1 : 0]); }
  /** GS V 66 0 — partial cut com alimentação prévia (mais confiável que B 0). */
  cut() { return this.raw([GS, 0x56, 0x42, 0x00]); }
  /** ESC d n — alimenta n linhas. */
  feed(n) { return this.raw([ESC, 0x64, Math.max(0, Math.min(255, n))]); }
  toBytes() {
    const total = this.parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

/* --------------------------------------------------------------------------
 * Helpers de formatação para layout 2-colunas dentro de N caracteres
 * -------------------------------------------------------------------------- */

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(v || 0))
    .replace(/ /g, ' ');
}
function repeat(ch, n) { return ch.repeat(Math.max(0, n)); }
/** Quebra texto em múltiplas linhas respeitando largura, sem cortar palavras. */
function wrap(text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) { cur = w; continue; }
    if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  // Se uma palavra solo > width, força corte
  return lines.flatMap(l => {
    if (l.length <= width) return [l];
    const chunks = [];
    for (let i = 0; i < l.length; i += width) chunks.push(l.slice(i, i + width));
    return chunks;
  });
}

/** Linha "Esquerda ............ Direita" preenchida com pontos até largura. */
function dotLine(left, right, width) {
  const r = String(right ?? '');
  const maxL = Math.max(0, width - r.length - 1);
  const l = String(left ?? '').slice(0, maxL);
  const fill = Math.max(1, width - l.length - r.length);
  return l + repeat(' ', fill) + r;
}

/** Coluna esquerda/direita simples (sem dots), à direita alinhada. */
function twoCol(left, right, width) {
  const r = String(right ?? '');
  const l = String(left ?? '').slice(0, Math.max(0, width - r.length - 1));
  const fill = Math.max(1, width - l.length - r.length);
  return l + repeat(' ', fill) + r;
}

function centerLine(text, width) {
  const t = String(text ?? '').slice(0, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return repeat(' ', pad) + t;
}

function formaLabel(f) {
  if (!f) return '';
  if (f === 'dinheiro') return 'Dinheiro';
  if (f === 'cartao') return 'Cartao';
  if (f === 'cartao_debito') return 'Cartao Debito';
  if (f === 'cartao_credito') return 'Cartao Credito';
  if (f === 'pix') return 'PIX';
  if (f === 'fiado') return 'Fiado';
  if (f === 'multiplo' || f === 'múltiplo') return 'Multiplos';
  return String(f).charAt(0).toUpperCase() + String(f).slice(1);
}

function numberFrom(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstNumber(object, keys) {
  for (const key of keys) {
    if (object?.[key] != null && object[key] !== '') return numberFrom(object[key]);
  }
  return 0;
}

function getReceiptCharges(venda, subtotal, desconto) {
  const couvert = firstNumber(venda, ['couvert', 'couvert_valor', 'couvertValor']);
  const taxaServicoPct = firstNumber(venda, ['taxaServicoPct', 'taxa_pct', 'taxa_servico_pct']);
  const taxaServicoKeys = ['taxaServico', 'taxa_servico', 'taxaServicoValor', 'taxa_servico_valor', 'taxa_valor'];
  const hasTaxaServicoValor = taxaServicoKeys.some(key => venda?.[key] != null && venda[key] !== '');
  const taxaServico = hasTaxaServicoValor
    ? firstNumber(venda, taxaServicoKeys)
    : Math.max(0, subtotal + couvert - desconto) * (taxaServicoPct / 100);
  const taxaEntrega = venda?.tipoPedido === 'delivery' ? firstNumber(venda, ['taxaEntrega']) : 0;

  return { couvert, taxaServicoPct, taxaServico, taxaEntrega };
}

function tipoPedidoLabel(t) {
  if (t === 'delivery') return 'Delivery';
  if (t === 'retirada') return 'Retirada';
  if (t === 'mesa') return 'Mesa';
  return null;
}

/* --------------------------------------------------------------------------
 * Cupom de Venda (Tier A)
 * -------------------------------------------------------------------------- */

/**
 * @typedef {Object} EstabelecimentoCupom
 * @property {string} nome_exibicao
 * @property {string} [documento]
 * @property {string} [contato]
 * @property {string} [endereco]
 * @property {'58mm'|'80mm'} [largura_bobina]
 * @property {string} [rodape_recibo]
 *
 * @typedef {Object} VendaCupom
 * @property {string|number} [numeroVenda]
 * @property {string|number} [idVenda]
 * @property {Array<{nome?:string, nome_produto_na_venda?:string, quantidade:number, preco_unitario?:number, preco_unitario_na_venda?:number}>} itens
 * @property {number} [subtotal]
 * @property {number} [desconto]
 * @property {number} [total]
 * @property {number} [couvert] - couvert da mesa, em reais
 * @property {number} [taxaServico] - taxa de serviço, em reais
 * @property {number} [taxaServicoPct] - percentual da taxa de serviço
 * @property {number} [taxa_pct] - alias persistido do percentual de Mesas
 * @property {number} [taxa_valor] - alias persistido do valor de Mesas
 * @property {number} [taxaEntrega] - taxa de entrega, somente para delivery
 * @property {number} [valorRecebido]
 * @property {number} [troco]
 * @property {string} [formaPagamento]
 * @property {Array<{forma:string, valor:number, pessoaNome?:string}>} [pagamentos]
 * @property {'retirada'|'delivery'|'mesa'} [tipoPedido]
 * @property {string|number} [mesaNumero]
 * @property {string} [titulo] — override para "Recibo"/"Pré-conta" etc
 */

/**
 * @param {{ estabelecimento: EstabelecimentoCupom, venda: VendaCupom, opcoes?: { titulo?: string, naoFiscal?: boolean, copia?: boolean } }} payload
 */
export function buildVendaEscPos(payload) {
  const est = payload?.estabelecimento || {};
  const venda = payload?.venda || {};
  const opcoes = payload?.opcoes || {};
  const largura = est.largura_bobina || '80mm';
  const cols = largura === '58mm' ? 28 : 32;

  const b = new Builder();
  b.init().darkness().selectCodepage().charset();

  /* HEADER */
  b.align('center').bold(true).size({ width: true, height: true });
  // Em double-width cada char ocupa 2 cols, então quebramos em metade.
  const nameWidth = Math.max(8, Math.floor(cols / 2));
  for (const ln of wrap(String(est.nome_exibicao || 'Zelo PDV').toUpperCase(), nameWidth)) {
    b.line(ln);
  }
  b.size({}).bold(false);

  if (est.endereco) for (const ln of wrap(est.endereco, cols)) b.line(ln);
  if (est.contato) for (const ln of wrap(est.contato, cols)) b.line(ln);
  if (est.documento) for (const ln of wrap('CNPJ/CPF: ' + est.documento, cols)) b.line(ln);

  b.newline();

  /* TÍTULO + PEDIDO */
  const titulo = opcoes.titulo || 'CUPOM NAO FISCAL';
  b.bold(true);
  for (const ln of wrap(titulo, cols)) b.line(centerLine(ln, cols));
  b.bold(false);

  const pedidoNum = String(venda.numeroVenda ?? venda.idVenda ?? '—');
  const tipo = tipoPedidoLabel(venda.tipoPedido);
  b.align('left');
  b.line(repeat('-', cols));
  b.line(twoCol('Pedido', '#' + pedidoNum, cols));
  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR');
  const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  b.line(twoCol(dataStr, horaStr, cols));
  if (tipo) b.line(twoCol('Tipo', tipo, cols));
  if (venda.mesaNumero != null) b.line(twoCol('Mesa', String(venda.mesaNumero), cols));
  if (opcoes.copia) b.bold(true).line(centerLine('** 2a VIA / COPIA **', cols)).bold(false);

  b.line(repeat('-', cols));

  /* ITENS */
  // Layout: "qx Nome do produto..............R$ 12,34"
  // Largura coluna direita = 10 (R$ XX.XXX,XX max ~ 11)
  const valColW = 11;
  const descColW = cols - valColW - 1; // 1 espaço de gutter
  const itens = Array.isArray(venda.itens) ? venda.itens : [];

  if (!itens.length) {
    b.line(centerLine('(sem itens)', cols));
  } else {
    for (const it of itens) {
      const nomeRaw = String(it.nome || it.nome_produto_na_venda || '').replace(/^\s*\d+\s*x\s*/i, '');
      const qtd = Number(it.quantidade || 1);
      const unit = Number(it.preco_unitario || it.preco_unitario_na_venda || 0);
      const sub = qtd * unit;
      const prefix = `${qtd}x `;
      const headLine = prefix + nomeRaw;
      const wrapped = wrap(headLine, descColW);
      // 1ª linha leva o valor à direita
      b.line(twoCol(wrapped[0], fmtBRL(sub), cols));
      for (let i = 1; i < wrapped.length; i++) {
        b.line(repeat(' ', prefix.length) + wrapped[i]);
      }
      // Se quantidade > 1, mostra preço unitário em linha discreta
      if (qtd > 1) {
        b.line(repeat(' ', prefix.length) + `${fmtBRL(unit)} cada`);
      }
      const obs = String(it.observacao || it.obs || '').trim();
      if (obs) {
        for (const ln of wrap(obs, descColW)) {
          b.line(repeat(' ', prefix.length) + ln);
        }
      }
    }
  }

  /* TOTAIS */
  b.line(repeat('-', cols));

  const subtotalCalc = itens.reduce((s, it) => s + Number(it.quantidade || 1) * Number(it.preco_unitario || it.preco_unitario_na_venda || 0), 0);
  const subtotal = venda.subtotal != null ? Number(venda.subtotal) : subtotalCalc;
  const desconto = Number(venda.desconto || 0);
  const { couvert, taxaServicoPct, taxaServico, taxaEntrega } = getReceiptCharges(venda, subtotal, desconto);
  const total = venda.total != null ? Number(venda.total) : (subtotal - desconto + couvert + taxaServico + taxaEntrega);

  b.line(twoCol('Subtotal', fmtBRL(subtotal), cols));
  if (couvert > 0) b.line(twoCol('Couvert', '+ ' + fmtBRL(couvert), cols));
  if (desconto > 0) b.line(twoCol('Desconto', '- ' + fmtBRL(desconto), cols));
  if (taxaServico > 0) b.line(twoCol(`Taxa servico${taxaServicoPct > 0 ? ` (${taxaServicoPct}%)` : ''}`, '+ ' + fmtBRL(taxaServico), cols));
  if (taxaEntrega > 0) b.line(twoCol('Taxa entrega', '+ ' + fmtBRL(taxaEntrega), cols));

  b.bold(true).size({ width: false, height: true });
  b.line(twoCol('TOTAL', fmtBRL(total), cols));
  b.size({}).bold(false);

  /* PAGAMENTO */
  b.line(repeat('-', cols));

  if (venda.formaPagamento === 'multiplo' && Array.isArray(venda.pagamentos) && venda.pagamentos.length) {
    b.line('Pagamento (multiplo):');
    for (const p of venda.pagamentos) {
      const meta = p.forma === 'fiado' && p.pessoaNome ? ` (${p.pessoaNome})` : '';
      b.line('  ' + twoCol(formaLabel(p.forma) + meta, fmtBRL(p.valor), cols - 2));
    }
    if (Number(venda.troco || 0) > 0) {
      b.line(twoCol('Troco', fmtBRL(venda.troco), cols));
    }
  } else if (venda.formaPagamento) {
    b.line(twoCol('Pagamento', formaLabel(venda.formaPagamento), cols));
    if (venda.formaPagamento === 'dinheiro' && venda.valorRecebido != null) {
      b.line(twoCol('Recebido', fmtBRL(venda.valorRecebido), cols));
      if (Number(venda.troco || 0) > 0) {
        b.line(twoCol('Troco', fmtBRL(venda.troco), cols));
      }
    }
    if (venda.formaPagamento === 'fiado') {
      b.line(centerLine('* lancado em conta — a receber *', cols));
    }
  }

  /* RODAPÉ */
  b.newline();
  b.align('center');
  if (opcoes.naoFiscal) {
    for (const ln of wrap('* nao fiscal — uso interno *', cols)) b.line(centerLine(ln, cols));
  }
  for (const ln of wrap(est.rodape_recibo || 'Obrigado pela preferencia!', cols)) {
    b.line(centerLine(ln, cols));
  }
  if (est.contato) for (const ln of wrap(est.contato, cols)) b.line(ln);

  b.newline();
  b.feed(2);
  b.cut();

  return b.toBytes();
}

/* --------------------------------------------------------------------------
 * Cupom de Movimentação de Caixa (Sangria / Suprimento)
 * -------------------------------------------------------------------------- */

/**
 * @param {{ estabelecimento: EstabelecimentoCupom, mov: { idMov?: any, idCaixa?: any, tipo: 'saida'|'entrada'|'suprimento', valor: number, motivo?: string, created_at?: string|Date } }} payload
 */
export function buildMovCaixaEscPos({ estabelecimento, mov }) {
  const est = estabelecimento || {};
  const largura = est.largura_bobina || '80mm';
  const cols = largura === '58mm' ? 28 : 32;

  const isSaida = mov.tipo === 'saida';
  const titulo = isSaida ? 'SANGRIA DE CAIXA' : 'SUPRIMENTO DE CAIXA';
  const rotuloValor = isSaida ? 'Valor retirado' : 'Valor adicionado';

  const b = new Builder();
  b.init().darkness().selectCodepage().charset();

  b.align('center').bold(true).size({ width: true, height: true });
  const nameWidth = Math.max(8, Math.floor(cols / 2));
  for (const ln of wrap(String(est.nome_exibicao || 'Zelo PDV').toUpperCase(), nameWidth)) {
    b.line(ln);
  }
  b.size({}).bold(false);
  if (est.endereco) for (const ln of wrap(est.endereco, cols)) b.line(ln);
  if (est.contato) for (const ln of wrap(est.contato, cols)) b.line(ln);
  if (est.documento) for (const ln of wrap('CNPJ/CPF: ' + est.documento, cols)) b.line(ln);

  b.newline();
  b.bold(true);
  for (const ln of wrap(titulo, cols)) b.line(centerLine(ln, cols));
  b.bold(false);
  b.align('left');
  b.line(repeat('-', cols));

  const dt = mov.created_at ? new Date(mov.created_at) : new Date();
  b.line(twoCol('Movimentacao', '#' + (mov.idMov ?? '—'), cols));
  b.line(twoCol('Caixa', '#' + (mov.idCaixa ?? '—'), cols));
  b.line(twoCol(dt.toLocaleDateString('pt-BR'), dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), cols));
  if (mov.motivo) {
    b.newline();
    b.line('Motivo:');
    for (const ln of wrap(mov.motivo, cols)) b.line(ln);
  }

  b.line(repeat('-', cols));

  b.bold(true).size({ height: true });
  b.line(twoCol(rotuloValor, fmtBRL(mov.valor), cols));
  b.size({}).bold(false);

  b.newline();
  b.align('center');
  b.line('* documento de controle interno *');
  b.feed(2);
  b.cut();

  return b.toBytes();
}

/* --------------------------------------------------------------------------
 * Cupom de Pagamento de Fiado
 * -------------------------------------------------------------------------- */

/**
 * @param {{ estabelecimento: EstabelecimentoCupom, pagamento: { nomePessoa: string, valor: number, saldoAnterior?: number, saldoAtual?: number } }} payload
 */
export function buildPagamentoFiadoEscPos({ estabelecimento, pagamento }) {
  const est = estabelecimento || {};
  const largura = est.largura_bobina || '80mm';
  const cols = largura === '58mm' ? 28 : 32;

  const b = new Builder();
  b.init().darkness().selectCodepage().charset();

  b.align('center').bold(true).size({ width: true, height: true });
  const nameWidth = Math.max(8, Math.floor(cols / 2));
  for (const ln of wrap(String(est.nome_exibicao || 'Zelo PDV').toUpperCase(), nameWidth)) {
    b.line(ln);
  }
  b.size({}).bold(false);
  if (est.endereco) for (const ln of wrap(est.endereco, cols)) b.line(ln);
  if (est.contato) for (const ln of wrap(est.contato, cols)) b.line(ln);
  if (est.documento) for (const ln of wrap('CNPJ/CPF: ' + est.documento, cols)) b.line(ln);

  b.newline();
  b.bold(true);
  for (const ln of wrap('RECIBO DE PAGAMENTO (FIADO)', cols)) b.line(centerLine(ln, cols));
  b.bold(false);
  b.align('left');
  b.line(repeat('-', cols));

  const dt = new Date();
  // Nome do cliente pode ser longo — quebra em wrap pra não ser cortado pelo slice em twoCol.
  const nomePessoa = String(pagamento.nomePessoa || '—');
  if (nomePessoa.length <= cols - 'Cliente'.length - 2) {
    b.line(twoCol('Cliente', nomePessoa, cols));
  } else {
    b.line('Cliente:');
    for (const ln of wrap(nomePessoa, cols)) b.line(ln);
  }
  b.line(twoCol(dt.toLocaleDateString('pt-BR'), dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), cols));

  if (pagamento.saldoAnterior != null) b.line(twoCol('Saldo anterior', fmtBRL(pagamento.saldoAnterior), cols));
  b.line(repeat('-', cols));

  b.bold(true).size({ height: true });
  b.line(twoCol('Valor pago', fmtBRL(pagamento.valor), cols));
  b.size({}).bold(false);

  if (pagamento.saldoAtual != null) {
    b.line(twoCol('Saldo restante', fmtBRL(pagamento.saldoAtual), cols));
  }

  b.newline();
  b.align('center');
  b.line('Obrigado!');
  b.feed(2);
  b.cut();

  return b.toBytes();
}

/* --------------------------------------------------------------------------
 * Teste de Impressão (usado no /perfil → Integrações para validar pareamento)
 * -------------------------------------------------------------------------- */

/**
 * @param {EstabelecimentoCupom} est
 */
export function buildTesteEscPos(est = {}) {
  const largura = est.largura_bobina || '80mm';
  const cols = largura === '58mm' ? 28 : 32;
  const b = new Builder();
  b.init().darkness().selectCodepage().charset();

  b.align('center').bold(true).size({ width: true, height: true });
  b.line('TESTE DE IMPRESSAO');
  b.size({}).bold(false);
  b.line('Zelo PDV');
  b.newline();
  b.align('left');
  b.line(repeat('-', cols));
  b.line('Se voce esta lendo isso, sua');
  b.line('impressora termica esta');
  b.line('configurada corretamente.');
  b.newline();
  b.line('Acentos: aeiouAEIOU acentuados');
  b.line('Cedilha: cao Coracao');
  b.line('Til:     mae pao manha');
  b.newline();
  b.line(`Largura: ${largura} (${cols} cols)`);
  b.line(`Data:    ${new Date().toLocaleString('pt-BR')}`);
  b.feed(2);
  b.cut();
  return b.toBytes();
}

/* exports utilitários para os componentes (caso queiram montar bytes manualmente) */
export const _internal = { encode, wrap, twoCol, centerLine, fmtBRL };
