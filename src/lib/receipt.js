// src/lib/receipt.js
// Pure HTML builder for receipts. Safe to unit test.

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
  if (f === 'cartao_debito') return 'Cartão (débito)';
  if (f === 'cartao_credito') return 'Cartão (crédito)';
  if (f === 'pix') return 'Pix';
  if (f === 'fiado') return 'Fiado';
  if (f === 'multiplo' || f === 'múltiplo') return 'Vários';
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
  const trocoVal = venda.troco != null ? Number(venda.troco) : (recebido != null ? (recebido - totalCalc) : 0);
  const pagamentos = Array.isArray(venda.pagamentos) ? venda.pagamentos.map(p => ({
    forma: p.forma || p.forma_pagamento,
    valor: Number(p.valor || 0),
    pessoaNome: p.pessoaNome || p.pessoa_nome || null
  })) : [];

  let metaLinhas = [];
  if (endereco) metaLinhas.push(escapeHtml(endereco));
  if (contato) metaLinhas.push(escapeHtml(contato));
  if (documento) metaLinhas.push(`CNPJ/CPF: ${escapeHtml(documento)}`);
  const metaHtml = metaLinhas.length ? metaLinhas.join(' • ') : '';

  // debug overlay removed per request; options.debug is ignored

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recibo - ${escapeHtml(nomeEmpresa)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin:0; padding:8px; color:#222; }
    .cupom { width: ${larguraBobina === '58mm' ? '220px' : '320px'}; max-width:100%; margin:0 auto; }
    header { text-align:center; padding-bottom:8px; border-bottom:1px dashed #ddd; }
    .logo { max-height:56px; max-width:100%; object-fit:contain; margin-bottom:6px; }
    h1.nome { font-size:16px; font-weight:600; margin:4px 0 0; }
    .meta { font-size:11px; color:#555; margin-top:6px; line-height:1.4; }
    .pedido { margin-top:8px; font-size:12px; display:flex; justify-content:space-between; }
    table.items { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
    table.items td, table.items th { padding:4px 0; vertical-align:top; }
    table.items thead th { font-size:11px; color:#555; text-align:left; padding-bottom:6px; border-bottom:1px solid #eee; }
    .qtd { width:28px; }
    .subtotal { width:90px; text-align:right; }
  .totais { margin-top:8px; border-top:1px dashed #ddd; padding-top:6px; font-size:13px; }
    .totais .linha { display:flex; justify-content:space-between; margin:4px 0; }
    .totais .total { font-weight:700; font-size:15px; }
  .pagamentos { margin-top:6px; border-top:1px dashed #eee; padding-top:6px; }
  .pagamentos .row { display:flex; justify-content:space-between; margin:2px 0; font-size:12px; }
  .pagamentos .row .meta { color:#666; font-size:11px; }
    .rodape { text-align:center; font-size:11px; color:#666; margin-top:10px; line-height:1.4; }
    @media print { body { margin:0; } .cupom { padding:0; } }
  </style>
</head>
<body onload="window.print(); setTimeout(()=>window.close(), 300);">
  <div class="cupom">
    <header>
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" onerror="this.style.display='none'" />` : ''}
      <h1 class="nome">${escapeHtml(nomeEmpresa)}</h1>
      ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ''}
    </header>

    <div class="pedido">
      <div>Pedido: <strong>${escapeHtml(String(venda.idVenda || venda.id || '—'))}</strong></div>
      <div>${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>

    <table class="items" aria-label="Itens">
      <thead>
        <tr>
          <th class="qtd">Qtd</th>
          <th>Produto</th>
          <th class="subtotal">Total</th>
        </tr>
      </thead>
      <tbody>
        ${linhas || '<tr><td colspan="4" style="text-align:center;color:#999;padding:12px 0">Nenhum item</td></tr>'}
      </tbody>
    </table>

    <div class="totais">
      <div class="linha"><span>Subtotal</span><span>${fmt(subtotalExibido)}</span></div>
      ${descontoVal > 0 ? `<div class="linha" style="color:#c00"><span>Desconto</span><span>-${fmt(descontoVal)}</span></div>` : ''}
      <div class="linha total"><span>Total</span><strong>${fmt(totalCalc)}</strong></div>
      ${venda.formaPagamento !== 'multiplo' ? (recebido != null ? `<div class="linha"><span>Recebido</span><span>${fmt(recebido)}</span></div>` : '') : ''}
      ${trocoVal > 0 ? `<div class="linha"><span>Troco</span><span>${fmt(trocoVal)}</span></div>` : ''}
      <div style="margin-top:6px" class="linha"><span>Pagamento</span><strong>${escapeHtml(formaLabel(venda.formaPagamento))}</strong></div>
      ${venda.formaPagamento === 'fiado' ? `<div class="linha" style="font-size:11px;color:#555;display:block;margin-top:4px">Lançado em saldo de fiado (não recebido agora).</div>` : ''}
      ${venda.formaPagamento === 'multiplo' && pagamentos.length ? `
        <div class="pagamentos" aria-label="Pagamentos">
          ${pagamentos.map(p => {
    const label = escapeHtml(formaLabel(p.forma));
    const meta = p.forma === 'fiado' && p.pessoaNome ? ` <span class="meta">• ${escapeHtml(p.pessoaNome)}</span>` : '';
    return `<div class="row"><span>${label}${meta}</span><span>${fmt(p.valor)}</span></div>`;
  }).join('')}
        </div>
      ` : ''}
    </div>

    ${venda.formaPagamento === 'multiplo' && pagamentos.length ? (() => {
      // Rodapé-resumo: Recebido via: Pix X · Cartão Y · Dinheiro Z (troco T)
      const somar = (forms) => pagamentos.filter(p => forms.includes(p.forma)).reduce((s, p) => s + Number(p.valor || 0), 0);
      const pixT = somar(['pix']);
      const cartaoT = somar(['cartao_debito', 'cartao_credito', 'cartao']);
      const dinheiroT = somar(['dinheiro']);
      const partes = [];
      if (pixT > 0) partes.push(`Pix ${fmt(pixT)}`);
      if (cartaoT > 0) partes.push(`Cartão ${fmt(cartaoT)}`);
      if (dinheiroT > 0) partes.push(`Dinheiro ${fmt(dinheiroT)}`);
      const trocoStr = trocoVal > 0 ? ` (troco ${fmt(trocoVal)})` : '';
      return `<div class="rodape" style="margin-top:6px">Recebido via: ${partes.join(' · ')}${trocoStr}</div>`;
    })() : ''}

    <div class="rodape">
      Obrigado pela preferência!<br/>
      ${contato ? escapeHtml(contato) : escapeHtml(nomeEmpresa)}
    </div>

  </div>
</body>
</html>`;

  return html;
}

export { escapeHtml, formaLabel };
