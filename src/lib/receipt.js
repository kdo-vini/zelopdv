// src/lib/receipt.js
// Builder HTML Tier A para cupons — usado como fallback quando WebUSB não
// está disponível ou a impressora não está conectada. Chama window.print()
// dentro de um iframe oculto (sem popup, funciona em PWA).

import { maskPhone, maskDocumento } from '$lib/masks.js';

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

function formaLabel(f) {
  if (!f) return '';
  if (f === 'dinheiro') return 'Dinheiro';
  if (f === 'cartao') return 'Cartão';
  if (f === 'cartao_debito') return 'Cartão (Débito)';
  if (f === 'cartao_credito') return 'Cartão (Crédito)';
  if (f === 'pix') return 'PIX';
  if (f === 'fiado') return 'Fiado';
  if (f === 'multiplo' || f === 'múltiplo') return 'Múltiplos';
  return String(f).charAt(0).toUpperCase() + String(f).slice(1);
}

const SHARED_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { margin: 0; }
html, body { background: #fff; }
body {
  font-family: 'Courier New', Courier, monospace;
  background: #fff; color: #000;
  font-size: 13px; line-height: 1.45; font-weight: 600;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cupom, .cupom * { color: #000 !important; opacity: 1 !important; text-shadow: none !important; }
.cupom { margin: 0 auto; padding: 10px 8px; }
.sep { border: none; border-top: 2px dashed #000; margin: 7px 0; }
.sep-solid { border: none; border-top: 2px solid #000; margin: 7px 0; }

/* Header */
.logo { max-height: 52px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto 8px; filter: grayscale(1) contrast(1.35); }
.nome-empresa { font-size: 16px; font-weight: 900; text-align: center; letter-spacing: .035em; text-transform: uppercase; }
.meta-empresa { font-size: 11px; font-weight: 700; text-align: center; color: #000; margin-top: 3px; line-height: 1.45; }
.titulo-cupom { font-size: 12px; font-weight: 900; text-align: center; letter-spacing: .1em; text-transform: uppercase; margin-top: 6px; }

/* Pedido */
.info-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; margin: 1px 0; }
.info-row .label { color: #000; }
.info-row .val { font-weight: 900; }

/* Itens */
.items-header { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: #000;
  display: flex; justify-content: space-between; margin-bottom: 3px; }
.item-row { display: flex; gap: 4px; margin: 3px 0; font-size: 12px; font-weight: 700; }
.item-qtd { min-width: 24px; font-weight: 900; flex-shrink: 0; }
.item-nome { flex: 1; font-weight: 800; }
.item-sub { width: 74px; text-align: right; flex-shrink: 0; white-space: nowrap; font-weight: 900; }
.item-unit { font-size: 11px; font-weight: 700; color: #000; margin-left: 28px; margin-top: -2px; }
.item-obs { font-size: 11px; font-weight: 700; color: #000; margin-left: 28px; margin-top: 1px; font-style: italic; }

/* Totais */
.total-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; padding: 1px 0; }
.total-row.desconto .val { color: #000; }
.total-row.grand { font-size: 17px; font-weight: 900; padding: 5px 0 3px; letter-spacing: .01em; }

/* Pagamento */
.pgto-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; padding: 1px 0; }
.pgto-row .forma { color: #000; }
.pgto-row span:last-child { font-weight: 900; }
.pgto-nota { font-size: 11px; font-weight: 700; color: #000; font-style: italic; margin-top: 3px; }

/* Rodapé */
.rodape { text-align: center; font-size: 11px; font-weight: 700; color: #000; margin-top: 6px; line-height: 1.55; }
.nao-fiscal { text-align: center; font-size: 10px; font-weight: 700; color: #000; letter-spacing: .08em; text-transform: uppercase; margin-top: 4px; }

/* Títulos de bloco */
.titulo-mov { font-size: 13px; font-weight: 800; text-align: center; text-transform: uppercase; margin: 4px 0; }
.mov-valor-linha { font-size: 15px; font-weight: 900; padding: 4px 0; }

@media print {
  html, body { margin: 0 !important; padding: 0 !important; width: 100%; }
  body { font-size: 13px; font-weight: 700; }
  .cupom { margin: 0 !important; padding: 1.5mm 2mm; max-width: none; }
  .sep, .sep-solid { border-top-width: 2px; }
}
`;

function paperWidthCss(largura) {
  return largura === '58mm' ? '58mm' : '80mm';
}

/**
 * HTML cupom de venda — Tier A.
 * Aceita o mesmo shape de buildVendaEscPos().
 */
export function buildReceiptHTML({ estabelecimento = {}, venda = {}, opcoes = {} } = {}) {
  const largura = estabelecimento?.largura_bobina || '80mm';
  const width = paperWidthCss(largura);
  const logoUrl = estabelecimento?.logoUrl || estabelecimento?.logotipo_url || null;
  const nomeEmpresa = estabelecimento?.nome_exibicao || 'Zelo PDV';
  const rodape = estabelecimento?.rodape_recibo || 'Obrigado pela preferência!';

  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR');
  const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const pedidoNum = escHtml(String(venda.numeroVenda ?? venda.idVenda ?? venda.id ?? '—'));

  const itens = Array.isArray(venda.itens) ? venda.itens : [];
  const subtotalCalc = itens.reduce((s, it) => s + Number(it.quantidade || 1) * Number(it.preco_unitario || it.preco_unitario_na_venda || 0), 0);
  const subtotal = venda.subtotal != null ? Number(venda.subtotal) : subtotalCalc;
  const desconto = Number(venda.desconto || 0);
  const taxa = Number(venda.taxaEntrega || 0);
  const total = venda.total != null ? Number(venda.total) : (subtotal - desconto + taxa);
  const recebido = venda.valorRecebido != null ? Number(venda.valorRecebido) : null;
  const troco = venda.troco != null ? Number(venda.troco) : (recebido != null ? Math.max(0, recebido - total) : 0);
  const pagamentos = Array.isArray(venda.pagamentos) ? venda.pagamentos.map(p => ({
    forma: p.forma || p.forma_pagamento,
    valor: Number(p.valor || 0),
    pessoaNome: p.pessoaNome || p.pessoa_nome || null
  })) : [];

  const titulo = opcoes.titulo || 'CUPOM NÃO FISCAL';
  const naoFiscal = opcoes.naoFiscal !== false;

  let metaParts = [];
  if (estabelecimento.endereco) metaParts.push(escHtml(estabelecimento.endereco));
  if (estabelecimento.contato) metaParts.push(escHtml(maskPhone(estabelecimento.contato)));
  if (estabelecimento.documento) metaParts.push('CNPJ/CPF: ' + escHtml(maskDocumento(estabelecimento.documento)));

  const itensHtml = itens.map(it => {
    const nome = String(it.nome || it.nome_produto_na_venda || '').replace(/^\s*\d+\s*x\s*/i, '');
    const qtd = Number(it.quantidade || 1);
    const unit = Number(it.preco_unitario || it.preco_unitario_na_venda || 0);
    const sub = qtd * unit;
    const obs = String(it.observacao || it.obs || '').trim();
    return `
      <div class="item-row">
        <span class="item-qtd">${qtd}x</span>
        <span class="item-nome">${escHtml(nome)}</span>
        <span class="item-sub">${fmtBRL(sub)}</span>
      </div>
      ${qtd > 1 ? `<div class="item-unit">${fmtBRL(unit)} cada</div>` : ''}
      ${obs ? `<div class="item-obs">${escHtml(obs)}</div>` : ''}
    `;
  }).join('');

  let pgtoHtml = '';
  if (venda.formaPagamento === 'multiplo' && pagamentos.length) {
    pgtoHtml = `
      <div class="pgto-row"><span class="forma">Pagamento</span><span>Múltiplos</span></div>
      ${pagamentos.map(p => {
        const meta = p.forma === 'fiado' && p.pessoaNome ? ` <span style="color:#000;font-weight:900">(${escHtml(p.pessoaNome)})</span>` : '';
        return `<div class="pgto-row" style="padding-left:8px"><span class="forma">${escHtml(formaLabel(p.forma))}${meta}</span><span>${fmtBRL(p.valor)}</span></div>`;
      }).join('')}
      ${troco > 0 ? `<div class="pgto-row"><span>Troco</span><span>${fmtBRL(troco)}</span></div>` : ''}
    `;
  } else if (venda.formaPagamento) {
    pgtoHtml = `
      <div class="pgto-row"><span class="forma">Pagamento</span><span>${escHtml(formaLabel(venda.formaPagamento))}</span></div>
      ${recebido != null && venda.formaPagamento === 'dinheiro' ? `<div class="pgto-row"><span>Recebido</span><span>${fmtBRL(recebido)}</span></div>` : ''}
      ${troco > 0 ? `<div class="pgto-row"><span>Troco</span><span>${fmtBRL(troco)}</span></div>` : ''}
      ${venda.formaPagamento === 'fiado' ? `<div class="pgto-nota">Lançado em conta — a receber depois</div>` : ''}
    `;
  }

  const tipoPedidoHtml = (() => {
    if (venda.tipoPedido === 'delivery') return `<div class="info-row"><span class="label">Tipo</span><span class="val">🛵 Delivery</span></div>`;
    if (venda.mesaNumero != null) return `<div class="info-row"><span class="label">Mesa</span><span class="val">#${escHtml(venda.mesaNumero)}</span></div>`;
    return '';
  })();

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Cupom #${pedidoNum}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    ${SHARED_CSS}
    @page { size: ${width} auto; margin: 0; }
    .cupom { width: ${width}; }
  </style>
</head>
<body>
<div class="cupom">

  ${logoUrl ? `<img class="logo" src="${escHtml(logoUrl)}" alt="Logo" onerror="this.style.display='none'">` : ''}
  <div class="nome-empresa">${escHtml(nomeEmpresa)}</div>
  ${metaParts.length ? `<div class="meta-empresa">${metaParts.join('<br>')}</div>` : ''}
  <div class="titulo-cupom">${escHtml(titulo)}</div>

  <hr class="sep">

  <div class="info-row">
    <span class="label">Pedido</span><span class="val">#${pedidoNum}</span>
  </div>
  <div class="info-row">
    <span class="label">${dataStr}</span><span class="val">${horaStr}</span>
  </div>
  ${tipoPedidoHtml}
  ${opcoes.copia ? `<div class="info-row" style="justify-content:center;font-weight:700">** 2ª VIA / CÓPIA **</div>` : ''}

  <hr class="sep">

  <div class="items-header">
    <span>Item</span><span>Valor</span>
  </div>
  ${itensHtml || '<div style="text-align:center;color:#000;font-weight:700;padding:4px 0">Nenhum item</div>'}

  <hr class="sep">

  <div class="total-row">
    <span>Subtotal</span><span>${fmtBRL(subtotal)}</span>
  </div>
  ${desconto > 0 ? `<div class="total-row desconto"><span>Desconto</span><span class="val">− ${fmtBRL(desconto)}</span></div>` : ''}
  ${taxa > 0 ? `<div class="total-row"><span>Taxa de entrega</span><span>+ ${fmtBRL(taxa)}</span></div>` : ''}
  <hr class="sep-solid">
  <div class="total-row grand">
    <span>TOTAL</span><span>${fmtBRL(total)}</span>
  </div>

  <hr class="sep">

  ${pgtoHtml}

  <hr class="sep">

  <div class="rodape">
    ${escHtml(rodape)}<br>
    ${estabelecimento.contato ? escHtml(maskPhone(estabelecimento.contato)) : escHtml(nomeEmpresa)}
  </div>
  ${naoFiscal ? '<div class="nao-fiscal">* não fiscal — uso interno *</div>' : ''}

</div>
<script>
  window.onload = function() { setTimeout(function() { window.print(); }, 80); };
<\/script>
</body>
</html>`;
}

/**
 * HTML cupom de movimentação de caixa (sangria/suprimento).
 */
export function buildMovCaixaHTML({ estabelecimento = {}, mov = {} } = {}) {
  const largura = estabelecimento?.largura_bobina || '80mm';
  const width = paperWidthCss(largura);
  const nome = escHtml(estabelecimento?.nome_exibicao || 'Zelo PDV');
  const rodape = escHtml(estabelecimento?.rodape_recibo || 'Obrigado!');

  const isSaida = mov.tipo === 'saida';
  const titulo = isSaida ? 'SANGRIA DE CAIXA' : 'SUPRIMENTO DE CAIXA';
  const rotuloValor = isSaida ? 'Valor retirado' : 'Valor adicionado';
  const dt = mov.created_at ? new Date(mov.created_at) : new Date();

  let metaParts = [];
  if (estabelecimento.endereco) metaParts.push(escHtml(estabelecimento.endereco));
  if (estabelecimento.contato) metaParts.push(escHtml(maskPhone(estabelecimento.contato)));
  if (estabelecimento.documento) metaParts.push('CNPJ/CPF: ' + escHtml(maskDocumento(estabelecimento.documento)));

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${titulo}</title>
  <style>
    ${SHARED_CSS}
    @page { size: ${width} auto; margin: 0; }
    .cupom { width: ${width}; }
  </style>
</head>
<body>
<div class="cupom">
  <div class="nome-empresa">${nome}</div>
  ${metaParts.length ? `<div class="meta-empresa">${metaParts.join('<br>')}</div>` : ''}
  <div class="titulo-cupom">${titulo}</div>

  <hr class="sep">

  <div class="info-row"><span class="label">Movimentação</span><span class="val">#${escHtml(mov.idMov ?? '—')}</span></div>
  <div class="info-row"><span class="label">Caixa</span><span class="val">#${escHtml(mov.idCaixa ?? '—')}</span></div>
  <div class="info-row">
    <span class="label">${dt.toLocaleDateString('pt-BR')}</span>
    <span class="val">${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
  </div>
  ${mov.motivo ? `<div class="info-row" style="margin-top:4px"><span class="label" style="margin-right:4px">Motivo:</span><span>${escHtml(mov.motivo)}</span></div>` : ''}

  <hr class="sep-solid">

  <div class="total-row grand mov-valor-linha">
    <span>${rotuloValor}</span><span>${fmtBRL(mov.valor)}</span>
  </div>

  <hr class="sep">

  <div class="rodape">${rodape}</div>
  <div class="nao-fiscal">* documento de controle interno *</div>

</div>
<script>
  window.onload = function() { setTimeout(function() { window.print(); }, 80); };
<\/script>
</body>
</html>`;
}

/**
 * HTML cupom de pagamento de fiado.
 */
export function buildPagamentoFiadoHTML({ estabelecimento = {}, pagamento = {} } = {}) {
  const largura = estabelecimento?.largura_bobina || '80mm';
  const width = paperWidthCss(largura);
  const nome = escHtml(estabelecimento?.nome_exibicao || 'Zelo PDV');
  const dt = new Date();

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Recibo de Pagamento Fiado</title>
  <style>
    ${SHARED_CSS}
    @page { size: ${width} auto; margin: 0; }
    .cupom { width: ${width}; }
  </style>
</head>
<body>
<div class="cupom">
  <div class="nome-empresa">${nome}</div>
  ${estabelecimento.contato ? `<div class="meta-empresa">${escHtml(maskPhone(estabelecimento.contato))}</div>` : ''}
  <div class="titulo-cupom">RECIBO DE PAGAMENTO (FIADO)</div>

  <hr class="sep">

  <div class="info-row"><span class="label">Cliente</span><span class="val">${escHtml(pagamento.nomePessoa || '—')}</span></div>
  <div class="info-row">
    <span class="label">${dt.toLocaleDateString('pt-BR')}</span>
    <span class="val">${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
  </div>
  ${pagamento.saldoAnterior != null ? `<div class="info-row"><span class="label">Saldo anterior</span><span>${fmtBRL(pagamento.saldoAnterior)}</span></div>` : ''}

  <hr class="sep-solid">

  <div class="total-row grand">
    <span>Valor pago</span><span>${fmtBRL(pagamento.valor)}</span>
  </div>
  ${pagamento.saldoAtual != null ? `<div class="info-row"><span class="label">Saldo restante</span><span>${fmtBRL(pagamento.saldoAtual)}</span></div>` : ''}

  <hr class="sep">

  <div class="rodape">Obrigado!</div>
  <div class="nao-fiscal">* documento de controle interno *</div>
</div>
<script>
  window.onload = function() { setTimeout(function() { window.print(); }, 80); };
<\/script>
</body>
</html>`;
}

export { escHtml, formaLabel };
