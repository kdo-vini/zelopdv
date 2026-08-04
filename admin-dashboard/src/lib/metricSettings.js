export const METRIC_SETTINGS_TABLE = 'admin_company_metric_settings'

export function createMetricSettingsMap(rows = []) {
  return new Map((rows || []).map((row) => [row.user_id, row]))
}

export function isMetricIncluded(userId, settingsByUserId) {
  return settingsByUserId?.get(userId)?.include_in_metrics !== false
}

export function getMetricAccountName(account = {}) {
  return account.nome_exibicao || account.razao_social || account.email || 'Conta sem identificação'
}

export function getMetricAccountStatus(subscription) {
  if (!subscription) return 'Sem assinatura'
  if (subscription.status === 'active') return 'Ativa'
  if (subscription.status === 'trialing') return 'Trial'
  if (subscription.status === 'canceled') return 'Cancelada'
  return subscription.status || 'Sem status'
}
