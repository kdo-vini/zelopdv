export const TECHNE_WHATSAPP_NUMBER = '5514991537503'
export const LOGIN_URL = 'https://zelopdv.com.br/login'

export const COMMUNICATION_PLACEHOLDERS = [
  { token: '{{primeiro_nome}}', label: 'Primeiro nome' },
  { token: '{{nome_completo}}', label: 'Nome completo' },
  { token: '{{empresa}}', label: 'Empresa' },
  { token: '{{email}}', label: 'Email' },
  { token: '{{telefone}}', label: 'Telefone' },
  { token: '{{documento}}', label: 'Documento' },
  { token: '{{numero_techne}}', label: 'WhatsApp Techne' },
  { token: '{{link_login}}', label: 'Link de login' },
]

function normalizeString(value) {
  return String(value || '').trim()
}

function firstNameFrom(value) {
  const normalized = normalizeString(value)
  if (!normalized) return 'cliente'
  return normalized.split(/\s+/)[0]
}

export function buildCommunicationContext(recipient = {}) {
  const nomeCompleto =
    normalizeString(recipient.nome_exibicao) ||
    normalizeString(recipient.nome_completo) ||
    normalizeString(recipient.nome) ||
    normalizeString(recipient.email) ||
    'cliente'

  return {
    primeiro_nome: firstNameFrom(nomeCompleto),
    nome_completo: nomeCompleto,
    empresa: normalizeString(recipient.nome_exibicao) || nomeCompleto,
    email: normalizeString(recipient.email),
    telefone: normalizeString(recipient.phone),
    documento: normalizeString(recipient.documento),
    numero_techne: TECHNE_WHATSAPP_NUMBER,
    link_login: LOGIN_URL,
  }
}

export function applyCommunicationPlaceholders(template, recipient = {}) {
  const context = buildCommunicationContext(recipient)
  return String(template || '').replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) => {
    const normalizedKey = String(key || '').toLowerCase()
    return Object.prototype.hasOwnProperty.call(context, normalizedKey)
      ? context[normalizedKey]
      : match
  })
}
