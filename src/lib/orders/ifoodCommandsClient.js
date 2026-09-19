// Browser client for the iFood order APIs (Task 10 commands, Task 11 sync
// state). It only talks to Zelo's own server routes with the user's session
// token; the browser never calls iFood and never sees provider credentials.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SYNC_IDS = 100;

const ERROR_MESSAGES = Object.freeze({
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  forbidden: 'Seu cargo não pode fazer esta ação.',
  order_not_found: 'Pedido não encontrado nesta empresa.',
  revision_conflict: 'O pedido mudou. Atualize a fila e tente de novo.',
  connection_unavailable: 'A conexão com o iFood está indisponível. Use o Portal do Parceiro.',
  invalid_transition: 'Esta ação não vale para o momento atual do pedido.',
  invalid_payload: 'Informe um código de entrega válido ou um motivo de cancelamento.'
});

const GENERIC_SEND_ERROR = 'Não foi possível enviar ao iFood agora. Tente de novo.';

function resolveFetch(fetchImpl) {
  return fetchImpl ?? globalThis.fetch?.bind(globalThis);
}

async function accessToken(supabase) {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function messageFor(status, body) {
  if (status === 401) return ERROR_MESSAGES.unauthorized;
  const code = typeof body?.error === 'string' ? body.error : null;
  return (code && ERROR_MESSAGES[code]) || GENERIC_SEND_ERROR;
}

/**
 * Enqueue a provider action for an iFood order. Resolves to
 * `{ ok, status, commandId?, commandStatus?, message? }` and never throws for
 * HTTP errors; the message is always one of the fixed operator texts above.
 */
export async function sendIfoodCommand(supabase, order, intent, extra = {}, { fetchImpl } = {}) {
  const token = await accessToken(supabase);
  if (!token) return { ok: false, status: 401, message: ERROR_MESSAGES.unauthorized };

  const body = { intent, expectedRevision: Number(order?.revision) };
  if (intent === 'cancel') {
    if (typeof extra?.cancellationCode === 'string') body.cancellationCode = extra.cancellationCode;
    if (typeof extra?.reason === 'string' && extra.reason.trim()) body.reason = extra.reason.trim();
  }
  if (intent === 'verify_delivery_code') {
    const code = typeof extra?.code === 'string' && extra.code.trim()
      ? extra.code.trim()
      : (typeof extra?.deliveryCode === 'string' ? extra.deliveryCode.trim() : '');
    if (code) body.code = code;
  }

  let response;
  try {
    response = await resolveFetch(fetchImpl)(`/api/integrations/ifood/orders/${order.id}/commands`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    return { ok: false, status: 0, message: GENERIC_SEND_ERROR };
  }

  const payload = await readJson(response);
  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      commandId: payload?.commandId ?? null,
      commandStatus: payload?.status ?? null
    };
  }
  return { ok: false, status: response.status, message: messageFor(response.status, payload) };
}

/** Dynamic cancellation reasons for one iFood order, as `{ code, description }`. */
export async function fetchIfoodCancellationReasons(supabase, orderId, { fetchImpl } = {}) {
  const token = await accessToken(supabase);
  if (!token) return { ok: false, status: 401, message: ERROR_MESSAGES.unauthorized, reasons: [] };

  let response;
  try {
    response = await resolveFetch(fetchImpl)(`/api/integrations/ifood/orders/${orderId}/cancellation-reasons`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    return { ok: false, status: 0, message: 'Não foi possível carregar os motivos agora.', reasons: [] };
  }

  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: response.status === 401 || response.status === 403
        ? messageFor(response.status, payload)
        : 'Não foi possível carregar os motivos agora.',
      reasons: []
    };
  }

  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.reasons) ? payload.reasons : []);
  const reasons = rows
    .filter((row) => typeof row?.code === 'string' && row.code && typeof row?.description === 'string')
    .map((row) => ({ code: row.code, description: row.description }));
  return { ok: true, reasons };
}

/**
 * Sanitized sync state for iFood orders, keyed by Zelo order id. Any failure
 * resolves to `{}` so the queue keeps working with the commercial status only.
 */
export async function fetchIfoodSyncState(supabase, orderIds, { fetchImpl } = {}) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : [])
    .filter((id) => typeof id === 'string' && UUID_PATTERN.test(id)))]
    .slice(0, MAX_SYNC_IDS);
  if (ids.length === 0) return {};

  const token = await accessToken(supabase);
  if (!token) return {};

  try {
    const response = await resolveFetch(fetchImpl)(`/api/integrations/ifood/orders/sync-state?ids=${ids.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return {};
    const payload = await readJson(response);
    return payload?.orders && typeof payload.orders === 'object' ? payload.orders : {};
  } catch {
    return {};
  }
}
