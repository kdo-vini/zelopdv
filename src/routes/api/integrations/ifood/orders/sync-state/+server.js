import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin.js';
import { getServerAccessContext } from '$lib/server/accessControl.js';
import { createIfoodCommandRepository } from '$lib/server/ifood/commandRepository.js';
import {
  createIfoodSyncStateService,
  normalizeIfoodOrderIds,
} from '$lib/server/ifood/syncStateService.js';

function noStoreJson(body, status) {
  return json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] || null;
}

function getRequestedOrderIds(request) {
  try {
    const url = new URL(request.url, 'http://localhost');
    const rawIds = url.searchParams.get('ids');
    return rawIds === null ? [] : rawIds.split(',');
  } catch {
    return null;
  }
}

async function resolveEmpresaId(ownerUserId) {
  const { data, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('id')
    .eq('user_id', ownerUserId)
    .maybeSingle();
  if (error) throw new Error('company lookup failed');
  return data?.id ?? null;
}

export async function GET({ request }) {
  const orderIds = normalizeIfoodOrderIds(getRequestedOrderIds(request));
  if (!orderIds) return noStoreJson({ error: 'invalid_request' }, 400);
  if (!supabaseAdmin) return noStoreJson({ error: 'unavailable' }, 503);

  const token = getBearerToken(request);
  if (!token) return noStoreJson({ error: 'unauthorized' }, 401);

  let authResult;
  try {
    authResult = await supabaseAdmin.auth.getUser(token);
  } catch {
    return noStoreJson({ error: 'unauthorized' }, 401);
  }
  if (authResult?.error || !authResult?.data?.user) {
    return noStoreJson({ error: 'unauthorized' }, 401);
  }

  let accessContext;
  try {
    accessContext = await getServerAccessContext(authResult.data.user.id);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 503);
  }

  let empresaId;
  try {
    empresaId = await resolveEmpresaId(accessContext?.ownerUserId);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 503);
  }
  // There is intentionally no 404 here: missing/foreign order ids are simply
  // absent from the RPC result. A missing company profile is unavailable state.
  if (!empresaId) return noStoreJson({ error: 'unavailable' }, 503);

  try {
    const repository = createIfoodCommandRepository({ supabase: supabaseAdmin });
    const service = createIfoodSyncStateService({
      repository,
      accessResolver: async () => accessContext,
    });
    const result = await service.getOrderSyncState({
      authResult: authResult.data,
      accessContext,
      empresaId,
      orderIds,
      signal: request.signal,
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}
