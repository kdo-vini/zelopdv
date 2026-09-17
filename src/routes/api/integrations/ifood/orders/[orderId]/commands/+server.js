import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin.js';
import { getServerAccessContext } from '$lib/server/accessControl.js';
import { createIfoodCommandRepository } from '$lib/server/ifood/commandRepository.js';
import { createIfoodCommandService } from '$lib/server/ifood/commandService.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStoreJson(body, status) {
  return json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] || null;
}

function validUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
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

/** Enqueues an intent only; the provider action is worker-owned. */
export async function POST({ request, params }) {
  if (!validUuid(params?.orderId)) {
    return noStoreJson({ error: 'invalid_order_id' }, 400);
  }
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

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'invalid_payload' }, 400);
  }

  let empresaId;
  try {
    empresaId = await resolveEmpresaId(accessContext?.ownerUserId);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 503);
  }
  if (!empresaId) return noStoreJson({ error: 'order_not_found' }, 404);

  try {
    const repository = createIfoodCommandRepository({ supabase: supabaseAdmin });
    const service = createIfoodCommandService({
      repository,
      // The route resolved this context after authenticating the token. The
      // service still owns the permission decision, while avoiding a second
      // privileged lookup for the same request.
      accessResolver: async () => accessContext
    });
    const result = await service.enqueueCommand({
      authResult: authResult.data,
      accessContext,
      empresaId,
      orderId: params.orderId,
      body,
      signal: request.signal
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}
