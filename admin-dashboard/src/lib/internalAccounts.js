const INTERNAL_ACCOUNT_USER_IDS = new Set([
  'd5625be9-abef-4371-a8e7-e915220aec42', // Donutopia
  '4aaab75b-d701-4e97-902f-8a891ec3951a', // Techne
])

const INTERNAL_ACCOUNT_EMAILS = new Set([
  'kdo.vini@gmail.com',
  'techne.br@gmail.com',
])

const INTERNAL_ACCOUNT_NAMES = new Set([
  'donutopia',
  'techne',
])

export const INTERNAL_ACCOUNT_LABELS = ['Donutopia', 'Techne']

function normalize(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function isInternalAccount(account = {}) {
  if (account.user_id && INTERNAL_ACCOUNT_USER_IDS.has(account.user_id)) {
    return true
  }

  const normalizedEmail = normalize(account.email)
  if (normalizedEmail && INTERNAL_ACCOUNT_EMAILS.has(normalizedEmail)) {
    return true
  }

  const normalizedName = normalize(account.nome_exibicao)
  if (normalizedName && INTERNAL_ACCOUNT_NAMES.has(normalizedName)) {
    return true
  }

  return false
}

export function filterExternalAccounts(rows = [], mapper = (row) => row) {
  return rows.filter((row) => !isInternalAccount(mapper(row)))
}
