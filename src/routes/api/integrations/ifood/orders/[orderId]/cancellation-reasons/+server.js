import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin.js';
import { getServerAccessContext } from '$lib/server/accessControl.js';
import { createHttpIfoodAdapter } from '$lib/server/ifood/adapters/httpIfoodAdapter.js';
import { createIfoodCommandRepository } from '$lib/server/ifood/commandRepository.js';
import { canUseIfoodIntent } from '$lib/server/ifood/commandService.js';
import { createIfoodCancellationReasonsService } from '$lib/server/ifood/cancellationReasonsService.js';

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

/** Reads provider cancellation reasons without exposing provider payload. */
export async function GET({ request, params }) {
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
  if (!canUseIfoodIntent(accessContext, 'cancel')) {
    return noStoreJson({ error: 'forbidden' }, 403);
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
    const ref = await repository.getOrderRef({
      empresaId,
      zeloOrderId: params.orderId,
      signal: request.signal
    });
    if (!ref) return noStoreJson({ error: 'order_not_found' }, 404);

    if (String(ref.connectionStatus ?? ref.connection_status ?? '').toLowerCase() !== 'active') {
      return noStoreJson({ error: 'connection_unavailable' }, 409);
    }
    if (!env?.IFOOD_CLIENT_ID || !env?.IFOOD_CLIENT_SECRET) {
      return noStoreJson({ error: 'unavailable' }, 503);
    }

    const adapter = createHttpIfoodAdapter({
      clientId: env.IFOOD_CLIENT_ID,
      clientSecret: env.IFOOD_CLIENT_SECRET
    });
    const service = createIfoodCancellationReasonsService({ repository, adapter });
    const result = await service.getCancellationReasons({
      empresaId,
      zeloOrderId: params.orderId,
      signal: request.signal,
      ref
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 503);
  }
}
