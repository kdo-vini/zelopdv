import { money } from './caixa.js';

export function getFiadoState(saldo) {
  const value = money(saldo);
  if (value > 0) return { key: 'devedor', label: 'Em aberto', value, signedValue: value };
  if (value < 0) return { key: 'credor', label: 'Crédito disponível', value: Math.abs(value), signedValue: value };
  return { key: 'neutro', label: 'Sem saldo', value: 0, signedValue: 0 };
}

export function getFiadoEntryMeta(natureza) {
  const map = {
    saldo_inicial: { label: 'Saldo anterior', direction: 'debit' },
    debito_venda: { label: 'Compra fiado', direction: 'debit' },
    pagamento: { label: 'Pagamento recebido', direction: 'credit' },
    estorno_venda: { label: 'Estorno de venda', direction: 'credit' }
  };
  return map[natureza] || { label: 'Lançamento', direction: 'neutral' };
}

export function buildFiadoStatement(entries = []) {
  let balance = 0;
  return [...entries]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || Number(a.id || 0) - Number(b.id || 0))
    .map((entry) => {
      balance = money(balance + Number(entry.valor || 0));
      return { ...entry, balanceAfter: balance, meta: getFiadoEntryMeta(entry.natureza) };
    })
    .reverse();
}
