import { normalizeBrazilianPhone } from '$lib/masks';

export function formatFiadoWhatsAppMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

export function getFiadoPaymentBalanceMessage(balance) {
  const value = Number(balance || 0);
  if (value > 0) return `Ainda restam ${formatFiadoWhatsAppMoney(value)} em aberto.`;
  if (value < 0) return `Você tem ${formatFiadoWhatsAppMoney(Math.abs(value))} de crédito disponível.`;
  return 'Sua dívida está quitada.';
}

export function buildFiadoPaymentMessage({ customerName, paymentAmount, currentBalance, businessName } = {}) {
  const name = String(customerName || 'cliente').trim() || 'cliente';
  const lines = [
    `*Olá, ${name}!*`,
    '',
    `*Pagamento confirmado:* ${formatFiadoWhatsAppMoney(paymentAmount)} recebido.`,
    `*${getFiadoPaymentBalanceMessage(currentBalance)}*`,
    '',
    'Agradecemos pela preferência e confiança em nosso trabalho!'
  ];

  const establishment = String(businessName || '').trim();
  if (establishment) lines.push('', `*${establishment}*`);

  return lines.join('\r\n');
}

export function buildFiadoPaymentWhatsAppUrl({ contact, customerName, paymentAmount, currentBalance, businessName } = {}) {
  const phone = normalizeBrazilianPhone(contact);
  if (!phone) return null;

  const message = buildFiadoPaymentMessage({ customerName, paymentAmount, currentBalance, businessName });
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
