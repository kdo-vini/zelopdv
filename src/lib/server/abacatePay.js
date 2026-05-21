import { env } from '$env/dynamic/private';

const ABACATEPAY_BASE_URL = env.ABACATEPAY_BASE_URL || process.env.ABACATEPAY_BASE_URL || 'https://api.abacatepay.com/v2';
const ABACATEPAY_API_KEY = env.ABACATEPAY_API_KEY || process.env.ABACATEPAY_API_KEY;

export function isAbacatePayConfigured() {
  return Boolean(ABACATEPAY_API_KEY);
}

function ensureConfigured() {
  if (!ABACATEPAY_API_KEY) {
    throw new Error('AbacatePay não configurado. Defina ABACATEPAY_API_KEY.');
  }
}

async function abacateRequest(path, { method = 'GET', body, searchParams } = {}) {
  ensureConfigured();

  const url = new URL(path, ABACATEPAY_BASE_URL.endsWith('/') ? ABACATEPAY_BASE_URL : `${ABACATEPAY_BASE_URL}/`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ABACATEPAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  const success = payload?.success;
  const hasExplicitFailure = success === false || payload?.error;

  if (!response.ok || hasExplicitFailure) {
    const message = payload?.error || `AbacatePay respondeu com ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
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
