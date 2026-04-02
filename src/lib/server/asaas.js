// Centraliza a comunicação com a API do Asaas (v3)
import { env } from '$env/dynamic/private';

const API_KEY = env.ASAAS_API_KEY;
const IS_SANDBOX = env.ASAAS_SANDBOX === 'true';
const BASE_URL = IS_SANDBOX
  ? 'https://sandbox.asaas.com/api'
  : 'https://api.asaas.com';

if (!API_KEY) {
  console.warn('[Asaas] ASAAS_API_KEY ausente. Configure no .env local e na hospedagem.');
}

/**
 * Generic request helper for Asaas API v3
 */
async function asaasRequest(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': API_KEY,
    },
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data?.errors?.[0]?.description || data?.message || JSON.stringify(data);
    console.error(`[Asaas] ${method} ${path} → ${res.status}: ${errorMsg}`);
    throw new Error(errorMsg);
  }
  return data;
}

// ──── Customers ────────────────────────────────────────

/**
 * Create a customer in Asaas
 * @param {string} name - Customer name
 * @param {string} cpfCnpj - CPF or CNPJ (numbers only)
 * @param {string} email - Customer email
 * @param {string} [externalReference] - External reference (e.g. Supabase user_id)
 */
export async function createCustomer(name, cpfCnpj, email, externalReference = '') {
  return asaasRequest('POST', '/v3/customers', {
    name,
    cpfCnpj: cpfCnpj.replace(/\D/g, ''),
    email,
    notificationDisabled: false,
    ...(externalReference ? { externalReference } : {}),
  });
}

/**
 * Find customer by CPF/CNPJ
 */
export async function findCustomerByCpfCnpj(cpfCnpj) {
  const clean = cpfCnpj.replace(/\D/g, '');
  const data = await asaasRequest('GET', `/v3/customers?cpfCnpj=${clean}`);
  return data?.data?.[0] || null;
}

/**
 * Find customer by email
 */
export async function findCustomerByEmail(email) {
  const data = await asaasRequest('GET', `/v3/customers?email=${encodeURIComponent(email)}`);
  return data?.data?.[0] || null;
}

// ──── Subscriptions ────────────────────────────────────

/**
 * Create a subscription in Asaas
 * @param {Object} params
 * @param {string} params.customerId - Asaas customer ID
 * @param {string} params.billingType - 'PIX', 'CREDIT_CARD', or 'BOLETO'
 * @param {number} params.value - Monthly value in BRL (e.g. 59.00)
 * @param {string} [params.nextDueDate] - First due date (YYYY-MM-DD). For trial, set 30 days ahead
 * @param {string} [params.description] - Subscription description
 * @param {string} [params.externalReference] - External reference (e.g. Supabase user_id)
 */
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
    ...(externalReference ? { externalReference } : {}),
  });
}

/**
 * Get a subscription by ID
 */
export async function getSubscription(subscriptionId) {
  return asaasRequest('GET', `/v3/subscriptions/${subscriptionId}`);
}

/**
 * Cancel (remove) a subscription
 */
export async function removeSubscription(subscriptionId) {
  return asaasRequest('DELETE', `/v3/subscriptions/${subscriptionId}`);
}

/**
 * List payments for a subscription
 */
export async function listSubscriptionPayments(subscriptionId) {
  return asaasRequest('GET', `/v3/subscriptions/${subscriptionId}/payments`);
}

// ──── Payments ─────────────────────────────────────────

/**
 * Get a payment by ID
 */
export async function getPayment(paymentId) {
  return asaasRequest('GET', `/v3/payments/${paymentId}`);
}

/**
 * Get PIX QR Code for a payment
 * Returns { encodedImage, payload, expirationDate }
 */
export async function getPixQrCode(paymentId) {
  return asaasRequest('GET', `/v3/payments/${paymentId}/pixQrCode`);
}

/**
 * Get invoice/billing info URL for a payment
 */
export async function getPaymentInvoiceUrl(paymentId) {
  return asaasRequest('GET', `/v3/payments/${paymentId}/identificationField`);
}

// ──── Helpers ──────────────────────────────────────────

/**
 * Checks if Asaas is properly configured
 */
export function isConfigured() {
  return !!API_KEY;
}

/**
 * Returns the base URL being used (for debugging)
 */
export function getBaseUrl() {
  return BASE_URL;
}
