import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin.js';
import { getServerAccessContext } from '$lib/server/accessControl.js';
import { createIfoodProductMappingRepository } from '$lib/server/ifood/productMappingRepository.js';
import { createIfoodProductMappingService } from '$lib/server/ifood/productMappingService.js';

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

async function resolveEmpresaId(ownerUserId) {
  const { data, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('id')
    .eq('user_id', ownerUserId)
    .maybeSingle();
  if (error) throw new Error('company lookup failed');
  return data?.id ?? null;
}

async function authenticate(request) {
  if (!supabaseAdmin) return { error: noStoreJson({ error: 'unavailable' }, 503) };

  const token = getBearerToken(request);
  if (!token) return { error: noStoreJson({ error: 'unauthorized' }, 401) };

  let authResult;
  try {
    authResult = await supabaseAdmin.auth.getUser(token);
  } catch {
    return { error: noStoreJson({ error: 'unauthorized' }, 401) };
  }
  if (authResult?.error || !authResult?.data?.user) {
    return { error: noStoreJson({ error: 'unauthorized' }, 401) };
  }

  let accessContext;
  try {
    accessContext = await getServerAccessContext(authResult.data.user.id);
  } catch {
    return { error: noStoreJson({ error: 'unavailable' }, 503) };
  }

  let empresaId;
  try {
    empresaId = await resolveEmpresaId(accessContext?.ownerUserId);
  } catch {
    return { error: noStoreJson({ error: 'unavailable' }, 503) };
  }
  if (!empresaId) return { error: noStoreJson({ error: 'connection_not_found' }, 404) };

  return { authResult: authResult.data, accessContext, empresaId };
}

function createService(accessContext) {
  const repository = createIfoodProductMappingRepository({ supabase: supabaseAdmin });
  return createIfoodProductMappingService({
    repository,
    accessResolver: async () => accessContext
  });
}

/** Suggest exact externalCode matches and similar-name candidates (read-only for names). */
export async function GET({ request, url }) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  try {
    const service = createService(auth.accessContext);
    const result = await service.suggest({
      authResult: auth.authResult,
      accessContext: auth.accessContext,
      empresaId: auth.empresaId,
      query: {
        merchantId: url.searchParams.get('merchantId'),
        externalItemId: url.searchParams.get('externalItemId'),
        externalCode: url.searchParams.get('externalCode'),
        name: url.searchParams.get('name')
      },
      signal: request.signal
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}

/** Confirm or disable a manual product mapping within the tenant. */
export async function POST({ request }) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'invalid_payload' }, 400);
  }

  try {
    const service = createService(auth.accessContext);
    const result = await service.confirm({
      authResult: auth.authResult,
      accessContext: auth.accessContext,
      empresaId: auth.empresaId,
      body,
      signal: request.signal
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}
