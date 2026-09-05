import { env } from '$env/dynamic/private';

const ABACATEPAY_BASE_URL = env.ABACATEPAY_BASE_URL || process.env.ABACATEPAY_BASE_URL || 'https://api.abacatepay.com/v2';
const ABACATEPAY_API_KEY = env.ABACATEPAY_API_KEY || process.env.ABACATEPAY_API_KEY;
export const ABACATEPAY_TIMEOUT_MS = 15_000;

export function isAbacatePayConfigured() {
  return Boolean(ABACATEPAY_API_KEY);
}

function ensureConfigured() {
  if (!ABACATEPAY_API_KEY) {
    throw new Error('AbacatePay não configurado. Defina ABACATEPAY_API_KEY.');
  }
}

async function abacateRequest(path, { method = 'GET', body, searchParams } = {}) {
  let url;
  let serializedBody;
  try {
    ensureConfigured();
    url = new URL(path, ABACATEPAY_BASE_URL.endsWith('/') ? ABACATEPAY_BASE_URL : `${ABACATEPAY_BASE_URL}/`);
    serializedBody = body ? JSON.stringify(body) : undefined;
  } catch (error) {
    error.dispatchStarted = false;
    throw error;
  }
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${ABACATEPAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: serializedBody,
      signal: AbortSignal.timeout(ABACATEPAY_TIMEOUT_MS),
    });

    // The deadline remains active through body consumption, with no POST retry.
    const payload = await response.json();
    const success = payload?.success;
    const hasExplicitFailure = success === false || payload?.error;

    if (!response.ok || hasExplicitFailure) {
      const message = payload?.error || `AbacatePay respondeu com ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    if (!payload?.data) throw new Error('Resposta AbacatePay sem dados.');
    return payload;
  } catch (error) {
    error.dispatchStarted = true;
    throw error;
  }
}

export async function createTransparentPixCharge(data) {
  const payload = await abacateRequest('transparents/create', {
    method: 'POST',
    body: {
      method: 'PIX',
      data,
    },
  });

  return payload?.data || null;
}

export async function checkTransparentPixCharge(id) {
  const payload = await abacateRequest('transparents/check', {
    method: 'GET',
    searchParams: { id },
  });

  return payload?.data || null;
}

export async function listTransparentPixCharges(externalId) {
  const payload = await abacateRequest('transparents/list', {
    searchParams: { externalId, limit: 2 },
  });
  if (!Array.isArray(payload.data)) throw new Error('Lista AbacatePay inválida.');
  // A page cursor means the lookup cannot be treated as one unique charge.
  if (payload.pagination?.next) throw new Error('Mais de uma cobrança para a reserva Pix.');
  return payload.data;
}
