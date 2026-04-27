// Centraliza a comunicação com a API do Asaas (v3)
import { env } from '$env/dynamic/private';

// ASAAS_API_KEY stored without leading '$' in .env to avoid dotenv-expand issues
const API_KEY = env.ASAAS_API_KEY
  ? (env.ASAAS_API_KEY.startsWith('$') ? env.ASAAS_API_KEY : `$${env.ASAAS_API_KEY}`)
  : null;
const IS_SANDBOX = env.ASAAS_SANDBOX === 'true';

// URL direta do Asaas (usada se o proxy não estiver configurado)
const DIRECT_BASE_URL = IS_SANDBOX
  ? 'https://sandbox.asaas.com/api'
  : 'https://api.asaas.com';

// Configuração do Proxy (Cloudflare Worker)
const PROXY_URL = env.ASAAS_PROXY_URL ? env.ASAAS_PROXY_URL.trim() : '';
const PROXY_SECRET = env.ASAAS_PROXY_SECRET ? env.ASAAS_PROXY_SECRET.trim() : '';
const USE_PROXY = !!PROXY_URL;

if (!API_KEY && !USE_PROXY) {
  console.warn('[Asaas] ASAAS_API_KEY ou ASAAS_PROXY_URL ausente. Configure no .env local.');
}

/**
 * Helper genérico para requisições à API do Asaas v3
 */
async function asaasRequest(method, path, body = null) {
  // 3. Montagem da URL final
  let asaasUrl = '';
  if (USE_PROXY) {
    // Se for proxy, garante que a URL do proxy tenha protocolo
    let cleanProxy = PROXY_URL.replace(/\/$/, '');
    if (!cleanProxy.startsWith('http')) cleanProxy = `https://${cleanProxy}`;

    // Remove a barra inicial do path para não duplicar
    const cleanPath = path.replace(/^\//, '');
    asaasUrl = `${cleanProxy}/${cleanPath}`;
  } else {
    const cleanPath = path.replace(/^\//, '');
    asaasUrl = `${DIRECT_BASE_URL}/${cleanPath}`;
  }

  // Limpeza final: remove duplicidade de /v3/ ou barras triplas
  asaasUrl = asaasUrl.replace(/([^:]\/)\/+/g, "$1"); // Evita // que não seja o de https://

  const token = (API_KEY || '').trim();

  const headers = {
    'Content-Type': 'application/json',
    'access_token': token,
    'User-Agent': 'ZeloPDV-Server-Integration',
  };


  // Se for proxy, podemos passar um secret se configurado
  if (USE_PROXY && PROXY_SECRET) {
    headers['x-proxy-secret'] = PROXY_SECRET;
  }

  const options = { method, headers };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(asaasUrl, options);
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Se não for JSON, pode ser um erro de rede ou do proxy
      throw new Error(`Resposta inválida do servidor: ${text.substring(0, 100)}`);
    }

    if (!res.ok) {
      const errorMsg = data?.errors?.[0]?.description || data?.message || JSON.stringify(data);
      console.error(`[Asaas] ${method} ${path} → ${res.status}: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    console.error(`[Asaas Failure] ${method} ${path}:`, error.message);
    throw error;
  }
}

// ──── Customers ────────────────────────────────────────

export async function createCustomer(name, cpfCnpj, email, externalReference = '') {
  return asaasRequest('POST', '/v3/customers', {
    name,
    cpfCnpj: cpfCnpj.replace(/\D/g, ''),
    email,
    notificationDisabled: true,
    ...(externalReference ? { externalReference } : {}),
  });
}

export async function findCustomerByCpfCnpj(cpfCnpj) {
  const clean = cpfCnpj.replace(/\D/g, '');
  const data = await asaasRequest('GET', `/v3/customers?cpfCnpj=${clean}`);
  return data?.data?.[0] || null;
}

export async function findCustomerByEmail(email) {
  const data = await asaasRequest('GET', `/v3/customers?email=${encodeURIComponent(email)}`);
  return data?.data?.[0] || null;
}

// ──── Subscriptions ────────────────────────────────────

export async function createSubscription({
  customerId,
  billingType,
  value,
  nextDueDate,
  description = 'Assinatura Zelo PDV — Plano Mensal',
  externalReference = '',
}) {
  return asaasRequest('POST', '/v3/subscriptions', {
    customer: customerId,
    billingType,
    value,
    nextDueDate,
    cycle: 'MONTHLY',
    description,
    callback: {
      successUrl: 'https://admin.zelopdv.com.br/assinatura?success=1',
      autoRedirect: true
    },
    ...(externalReference ? { externalReference } : {}),
  });
}

export async function getSubscription(subscriptionId) {
  return asaasRequest('GET', `/v3/subscriptions/${subscriptionId}`);
}

// Update existing subscription value. Asaas does NOT pro-rata —
// the new value applies only to the next billing cycle.
export async function updateSubscriptionValue(subscriptionId, newValue, nextDueDate = null) {
  const body = { value: newValue };
  if (nextDueDate) body.nextDueDate = nextDueDate;
  return asaasRequest('POST', `/v3/subscriptions/${subscriptionId}`, body);
}

export async function removeSubscription(subscriptionId) {
  return asaasRequest('DELETE', `/v3/subscriptions/${subscriptionId}`);
}

export async function listSubscriptionPayments(subscriptionId) {
  return asaasRequest('GET', `/v3/subscriptions/${subscriptionId}/payments`);
}

// ──── Payments ─────────────────────────────────────────

export async function getPayment(paymentId) {
  return asaasRequest('GET', `/v3/payments/${paymentId}`);
}

export async function getPixQrCode(paymentId) {
  return asaasRequest('GET', `/v3/payments/${paymentId}/pixQrCode`);
}

export async function getPaymentInvoiceUrl(paymentId) {
  return asaasRequest('GET', `/v3/payments/${paymentId}/identificationField`);
}

// ──── Helpers ──────────────────────────────────────────

export function isConfigured() {
  return USE_PROXY ? !!PROXY_URL : !!API_KEY;
}

export function getBaseUrl() {
  return USE_PROXY ? PROXY_URL : DIRECT_BASE_URL;
}
