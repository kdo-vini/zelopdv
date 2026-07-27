const LINE_WIDTH = 32;

function fmtMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function line(value = '') {
  return String(value).slice(0, LINE_WIDTH);
}

function wrapText(value, width = LINE_WIDTH) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = '';
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let offset = 0; offset < word.length; offset += width) {
        lines.push(word.slice(offset, offset + width));
      }
      continue;
    }

    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapIndentedText(value, indent = '  ') {
  return wrapText(value, Math.max(1, LINE_WIDTH - indent.length))
    .map((lineText) => `${indent}${lineText}`);
}

function separator(char = '-') {
  return char.repeat(LINE_WIDTH);
}

function row(label, value) {
  const left = String(label || '');
  const right = String(value || '');
  const gap = Math.max(1, LINE_WIDTH - left.length - right.length);
  return `${left}${' '.repeat(gap)}${right}`;
}

function modifierOptionNames(group) {
  if (Array.isArray(group?.optionNames)) return group.optionNames.filter(Boolean).join(', ');
  if (!Array.isArray(group?.selectedOptions)) return '';
  return group.selectedOptions
    .map((option) => {
      const name = option?.optionName || option?.name;
      if (!name) return '';
      const quantity = Number(option?.quantity || 1);
      return quantity > 1 ? `${quantity}x ${name}` : name;
    })
    .filter(Boolean)
    .join(', ');
}

function itemReceiptLines(item) {
  const productName = item?.productName || item?.product || item?.nome || 'Item';
  const quantity = Number(item?.quantity ?? item?.quantidade ?? 1);
  const lines = wrapText(`${quantity}x ${productName}`);

  const groups = item?.modifierGroups || item?.modifiers || [];
  for (const group of Array.isArray(groups) ? groups : []) {
    const options = modifierOptionNames(group);
    if (!options) continue;
    lines.push(...wrapIndentedText(`${group.groupName || group.name || 'Opções'}: ${options}`));
  }
  return lines;
}

function paymentLabel(order) {
  return order?.paymentMethod
    || order?.forma_pagamento
    || order?.payment?.declaredMethod
    || order?.payment?.method
    || '-';
}

function customerPhone(order) {
  return order?.customerPhone
    || order?.customer_phone
    || order?.telefone_cliente
    || order?.customer?.phone
    || '-';
}

/**
 * Builds the same plain-text kitchen ticket contract used by ZeloChat's
 * Zelo Impressão integration. Keeping this pure makes formatting testable
 * without requiring a local printer or a browser.
 */
export function buildOrderText(order, businessName = 'ZeloPDV') {
  const fulfillment = order?.fulfillment || {};
  const deliveryAddress = order?.deliveryAddress
    || fulfillment.deliveryAddress
    || fulfillment.delivery_address
    || fulfillment.address
    || '';
  const pickupTime = order?.pickupTime
    || fulfillment.pickupTime
    || fulfillment.pickup_time
    || '-';
  const observations = order?.observations || order?.observacoes || '';
  const items = order?.items || order?.pedido_itens || order?.itens || [];
  const shortId = String(order?.id || '').slice(-8).toUpperCase();
  const customerName = order?.customerName || order?.nome_cliente || 'Cliente';

  const rows = [
    line(String(businessName || 'ZeloPDV').toUpperCase()),
    separator('='),
    `PEDIDO #${shortId}`,
    `Cliente: ${customerName}`,
    `Tel: ${customerPhone(order)}`,
    separator(),
  ];

  for (const item of Array.isArray(items) ? items : []) rows.push(...itemReceiptLines(item));

  rows.push(
    separator(),
    row('TOTAL:', fmtMoney(order?.total)),
    `Pagamento: ${paymentLabel(order)}`,
  );

  if (deliveryAddress) rows.push('Entrega:', ...wrapText(deliveryAddress));
  else rows.push(`Retirada: ${pickupTime}`);

  if (observations) rows.push(separator(), ...wrapText(`Obs: ${observations}`));

  return `${rows.join('\n')}\n\n\n`;
}

export { LINE_WIDTH };
