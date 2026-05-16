const REFERRAL_CODE_MAX_LENGTH = 24;

export const REFERRAL_STATUSES = {
  clicked: 'Clique',
  signed_up: 'Cadastro',
  trial_started: 'Teste iniciado',
  pending_payment: 'Pendente pagamento',
  paid_manual_confirmed: 'Pagamento confirmado',
  reward_approved: 'Recompensa aprovada',
  reward_applied: 'Recompensa aplicada',
  rejected: 'Rejeitada',
};

export const REWARD_STATUSES = {
  pending: 'Pendente',
  approved: 'Aprovada',
  applied: 'Aplicada',
  cancelled: 'Cancelada',
};

export function makeReferralCodeBase(name, fallback = 'ZELO') {
  const raw = (name || fallback || 'ZELO').toString();
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const code = normalized.slice(0, REFERRAL_CODE_MAX_LENGTH);
  return code || 'ZELO';
}

export function normalizeReferralCode(code) {
  return makeReferralCodeBase(code, '');
}

export function buildReferralLink(origin, code) {
  const cleanOrigin = (origin || '').replace(/\/+$/, '');
  return `${cleanOrigin}/indica/${encodeURIComponent(normalizeReferralCode(code))}`;
}

export function buildWhatsAppReferralUrl(link) {
  const message = `Estou usando o Zelo para administrar meu negócio, controlar vendas, caixa e estoque de forma simples. Se quiser testar, usa meu link de indicação e você ganha uma condição especial: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function formatReferralStatus(status) {
  return REFERRAL_STATUSES[status] || status || '-';
}

export function formatRewardStatus(status) {
  return REWARD_STATUSES[status] || status || '-';
}
