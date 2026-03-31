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
  <title>Recibo #${pedidoNum} - ${escapeHtml(nomeEmpresa)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      padding: 16px 8px;
    }
    .cupom {
      width: ${cupomWidth};
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.10);
    }

    /* Header */
    .header {
      background: #EA1D2C;
      padding: 18px 16px 14px;
      text-align: center;
      color: #fff;
    }
    .header .logo-wrap {
      margin-bottom: 8px;
    }
    .header .logo {
      max-height: 52px;
      max-width: 100%;
      object-fit: contain;
      border-radius: 6px;
    }
    .header .nome-empresa {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    .header .meta-empresa {
      font-size: 11px;
      opacity: 0.85;
      margin-top: 4px;
      line-height: 1.5;
    }

    /* Status badge */
    .status-bar {
      background: #F2F2F2;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #E8E8E8;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #2ECC71;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-badge .dot {
      width: 6px;
      height: 6px;
      background: #fff;
      border-radius: 50%;
      display: inline-block;
    }
    .pedido-info {
      font-size: 11px;
      color: #666;
      text-align: right;
    }
    .pedido-info strong {
      display: block;
      font-size: 13px;
      color: #333;
    }

    /* Body */
    .body { padding: 14px 16px; }

    /* Divider */
    .divider {
      border: none;
      border-top: 1px dashed #D8D8D8;
      margin: 12px 0;
    }

    /* Section title */
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #999;
      margin-bottom: 8px;
    }

    /* Items table */
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    table.items td {
      padding: 5px 0;
      vertical-align: top;
      line-height: 1.4;
    }
    .qtd {
      width: 26px;
      color: #EA1D2C;
      font-weight: 700;
      font-size: 11px;
      padding-top: 6px !important;
    }
    .produto {
      color: #333;
      padding-left: 4px !important;
    }
    .subtotal {
      width: 80px;
      text-align: right;
      color: #333;
      font-weight: 600;
      white-space: nowrap;
    }

    /* Totals */
    .totais { font-size: 12px; }
    .linha-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3px 0;
      color: #555;
    }
    .linha-total.desconto { color: #EA1D2C; }
    .linha-total.grand-total {
      font-size: 16px;
      font-weight: 700;
      color: #222;
      padding: 6px 0 2px;
    }
    .linha-total.grand-total span:last-child {
      color: #EA1D2C;
    }

    /* Payment */
    .pagamento-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #F2F2F2;
      border: 1px solid #E0E0E0;
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #444;
      margin: 2px 0;
    }
    .multi-pag { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .multi-pag .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      font-size: 12px;
      padding: 3px 0;
      color: #555;
    }

    /* Footer */
    .rodape {
      background: #FAFAFA;
      border-top: 1px solid #EFEFEF;
      padding: 12px 16px;
      text-align: center;
    }
    .rodape .obrigado {
      font-size: 13px;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }
    .rodape .sub {
      font-size: 10px;
      color: #AAA;
    }

    /* Troco destaque */
    .troco-box {
      background: #FFF8E1;
      border: 1px solid #FFE082;
      border-radius: 8px;
      padding: 8px 10px;
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #795548;
      font-weight: 600;
    }

    @media print {
      body { background: #fff; padding: 0; }
      .cupom { box-shadow: none; border-radius: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="cupom">

    <div class="header">
      ${logoUrl ? `<div class="logo-wrap"><img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" onerror="this.parentElement.style.display='none'" /></div>` : ''}
      <div class="nome-empresa">${escapeHtml(nomeEmpresa)}</div>
      ${metaParts.length ? `<div class="meta-empresa">${metaParts.join(' &bull; ')}</div>` : ''}
    </div>

    <div class="status-bar">
      <span class="status-badge"><span class="dot"></span>Pago</span>
      <div class="pedido-info">
        <strong>#${pedidoNum}</strong>
        ${dataStr} &bull; ${horaStr}
      </div>
    </div>

    <div class="body">

      <div class="section-title">Itens do pedido</div>
      <table class="items" aria-label="Itens">
        <tbody>
          ${linhas || '<tr><td colspan="3" style="text-align:center;color:#bbb;padding:10px 0;font-size:12px">Nenhum item</td></tr>'}
        </tbody>
      </table>

      <hr class="divider">

      <div class="totais">
        <div class="linha-total">
          <span>Subtotal</span>
          <span>${fmt(subtotalExibido)}</span>
        </div>
        ${descontoVal > 0 ? `
        <div class="linha-total desconto">
          <span>Desconto</span>
          <span>- ${fmt(descontoVal)}</span>
        </div>` : ''}
        <div class="linha-total grand-total">
          <span>Total</span>
          <span>${fmt(totalCalc)}</span>
        </div>
      </div>

      <hr class="divider">

      <div class="section-title">Pagamento</div>
      ${venda.formaPagamento !== 'multiplo' ? `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="pagamento-chip">${escapeHtml(formaLabel(venda.formaPagamento))}</span>
          ${recebido != null && venda.formaPagamento === 'dinheiro' ? `<span style="font-size:11px;color:#888">Recebido: ${fmt(recebido)}</span>` : ''}
        </div>
        ${venda.formaPagamento === 'fiado' ? `<div style="font-size:11px;color:#E67E22;margin-top:6px;font-style:italic">Lançado em conta — a receber depois</div>` : ''}
        ${trocoVal > 0 ? `
        <div class="troco-box">
          <span>Troco</span>
          <span>${fmt(trocoVal)}</span>
        </div>` : ''}
      ` : `
        <div class="multi-pag">
          ${pagamentos.map(p => {
    const label = escapeHtml(formaLabel(p.forma));
    const meta = p.forma === 'fiado' && p.pessoaNome ? ` <span style="color:#999;font-weight:400">(${escapeHtml(p.pessoaNome)})</span>` : '';
    return `<div class="row"><span class="pagamento-chip">${label}${meta}</span><span style="font-weight:600;font-size:12px">${fmt(p.valor)}</span></div>`;
  }).join('')}
        </div>
        ${trocoVal > 0 ? `
        <div class="troco-box">
          <span>Troco</span>
          <span>${fmt(trocoVal)}</span>
        </div>` : ''}
      `}

    </div>

    <div class="rodape">
      <div class="obrigado">Obrigado pela preferência!</div>
      <div class="sub">${contato ? escapeHtml(maskPhone(contato)) : escapeHtml(nomeEmpresa)}</div>
    </div>

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
