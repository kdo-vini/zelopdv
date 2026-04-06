// src/lib/receipt.js
// Pure HTML builder for receipts. Safe to unit test.

import { maskPhone, maskDocumento } from '$lib/masks.js';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formaLabel(f) {
  if (!f) return '';
  if (f === 'dinheiro') return 'Dinheiro';
  if (f === 'cartao') return 'Cartão'; // legado
  if (f === 'cartao_debito') return 'Cartão Débito';
  if (f === 'cartao_credito') return 'Cartão Crédito';
  if (f === 'pix') return 'Pix';
  if (f === 'fiado') return 'Fiado';
  if (f === 'multiplo' || f === 'múltiplo') return 'Múltiplos';
  return String(f).charAt(0).toUpperCase() + String(f).slice(1);
}

export function buildReceiptHTML({ estabelecimento = {}, venda = {}, options = {} } = {}) {
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
  const now = new Date();

  const nomeEmpresa = estabelecimento?.nome_exibicao || 'Zelo PDV';
  const documento = estabelecimento?.documento || null;
  const contato = estabelecimento?.contato || null;
  const endereco = estabelecimento?.endereco || null;
  const larguraBobina = estabelecimento?.largura_bobina || '80mm';
  const logoUrl = estabelecimento?.logoUrl || estabelecimento?.logotipo_url || null;
  const cupomWidth = larguraBobina === '58mm' ? '220px' : '320px';

  const linhas = (venda.itens || []).map(i => {
    const nome = String(i.nome || i.nome_produto_na_venda || '').replace(/^\s*\d+\s*x\s*/i, '');
    const qtd = Number(i.quantidade || 1);
    const precoUnit = Number(i.preco_unitario || i.preco_unitario_na_venda || 0);
    const subtotal = qtd * precoUnit;
    return `<tr>
      <td class="qtd">${qtd}x</td>
      <td class="produto">${escapeHtml(nome)}</td>
      <td class="subtotal">${fmt(subtotal)}</td>
    </tr>`;
  }).join('');

  const subtotalCalc = (venda.itens || []).reduce((s, it) => s + (Number(it.quantidade || 1) * Number(it.preco_unitario || it.preco_unitario_na_venda || 0)), 0);
  const subtotalExibido = venda.subtotal != null ? Number(venda.subtotal) : subtotalCalc;
  const descontoVal = venda.desconto != null ? Number(venda.desconto) : 0;
  const totalCalc = venda.total != null ? Number(venda.total) : (subtotalExibido - descontoVal);
  const recebido = venda.valorRecebido != null ? Number(venda.valorRecebido) : null;
  const trocoVal = venda.troco != null ? Number(venda.troco) : (recebido != null ? Math.max(0, recebido - totalCalc) : 0);
  const pagamentos = Array.isArray(venda.pagamentos) ? venda.pagamentos.map(p => ({
    forma: p.forma || p.forma_pagamento,
    valor: Number(p.valor || 0),
    pessoaNome: p.pessoaNome || p.pessoa_nome || null
  })) : [];

  const dataStr = now.toLocaleDateString('pt-BR');
  const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const pedidoNum = escapeHtml(String(venda.numeroVenda || venda.idVenda || venda.id || '—'));

  let metaParts = [];
  if (endereco) metaParts.push(escapeHtml(endereco));
  if (contato) metaParts.push(escapeHtml(maskPhone(contato)));
  if (documento) metaParts.push(`CNPJ/CPF: ${escapeHtml(maskDocumento(documento))}`);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recibo #${pedidoNum}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      background: #fff;
      color: #000;
      padding: 12px;
    }
    .cupom { width: ${cupomWidth}; margin: 0 auto; }

    .logo { max-height: 48px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto 6px; }
    .nome-empresa { font-size: 14px; font-weight: bold; text-align: center; }
    .meta-empresa { font-size: 10px; text-align: center; margin-top: 3px; line-height: 1.5; }

    .sep { border: none; border-top: 1px dashed #000; margin: 8px 0; }

    .pedido-linha { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
    .pedido-linha strong { font-size: 12px; }

    table.items { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
    table.items td { padding: 3px 0; vertical-align: top; line-height: 1.4; }
    .qtd { width: 24px; font-weight: bold; }
    .produto { padding-left: 2px; }
    .subtotal { width: 72px; text-align: right; white-space: nowrap; }

    .linha-total { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
    .linha-total.grand-total { font-size: 14px; font-weight: bold; padding: 4px 0 2px; }
    .linha-total.desconto { font-size: 11px; }

    .pgto-linha { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }

    .rodape { text-align: center; font-size: 10px; margin-top: 4px; }

    @media print {
      body { padding: 0; }
      .cupom { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="cupom">

    ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" onerror="this.style.display='none'" />` : ''}
    <div class="nome-empresa">${escapeHtml(nomeEmpresa)}</div>
    ${metaParts.length ? `<div class="meta-empresa">${metaParts.join('<br>')}</div>` : ''}

    <hr class="sep">

    <div class="pedido-linha"><span>Pedido</span><strong>#${pedidoNum}</strong></div>
    <div class="pedido-linha"><span>${dataStr}</span><span>${horaStr}</span></div>
    ${venda.tipoPedido === 'delivery' ? `<div class="pedido-linha"><span>Tipo</span><strong>Delivery</strong></div>` : venda.tipoPedido === 'retirada' ? `<div class="pedido-linha"><span>Tipo</span><strong>Retirada</strong></div>` : ''}

    <hr class="sep">

    <table class="items" aria-label="Itens">
      <tbody>
        ${linhas || '<tr><td colspan="3" style="text-align:center;padding:6px 0">Nenhum item</td></tr>'}
      </tbody>
    </table>

    <hr class="sep">

    <div class="linha-total"><span>Subtotal (produtos)</span><span>${fmt(subtotalExibido)}</span></div>
    ${descontoVal > 0 ? `<div class="linha-total desconto"><span>Desconto</span><span>- ${fmt(descontoVal)}</span></div>` : ''}
    ${Number(venda.taxaEntrega || 0) > 0 ? `<div class="linha-total" style="font-size:11px"><span>Taxa de entrega</span><span>+ ${fmt(venda.taxaEntrega)}</span></div>` : ''}
    <div class="linha-total grand-total"><span>TOTAL</span><span>${fmt(totalCalc)}</span></div>

    <hr class="sep">

    ${venda.formaPagamento !== 'multiplo' ? `
      <div class="pgto-linha"><span>Pagamento</span><span>${escapeHtml(formaLabel(venda.formaPagamento))}</span></div>
      ${recebido != null && venda.formaPagamento === 'dinheiro' ? `<div class="pgto-linha"><span>Recebido</span><span>${fmt(recebido)}</span></div>` : ''}
      ${trocoVal > 0 ? `<div class="pgto-linha"><span>Troco</span><span>${fmt(trocoVal)}</span></div>` : ''}
      ${venda.formaPagamento === 'fiado' ? `<div style="font-size:10px;margin-top:4px;font-style:italic">Lançado em conta — a receber depois</div>` : ''}
    ` : `
      ${pagamentos.map(p => {
    const label = escapeHtml(formaLabel(p.forma));
    const meta = p.forma === 'fiado' && p.pessoaNome ? ` (${escapeHtml(p.pessoaNome)})` : '';
    return `<div class="pgto-linha"><span>${label}${meta}</span><span>${fmt(p.valor)}</span></div>`;
  }).join('')}
      ${trocoVal > 0 ? `<div class="pgto-linha"><span>Troco</span><span>${fmt(trocoVal)}</span></div>` : ''}
    `}

    <hr class="sep">

    <div class="rodape">Obrigado pela preferência!<br>${contato ? escapeHtml(maskPhone(contato)) : escapeHtml(nomeEmpresa)}</div>

  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 120);
    };
  <\/script>
</body>
</html>`;

  return html;
}

export { escapeHtml, formaLabel };
