import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin.js';
import { createIfoodAdminRepository } from '$lib/server/ifoodAdminRepository.js';
import { createIfoodOperationsService } from '$lib/server/ifoodOperations.js';

function noStoreJson(body, status = 200) {
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

async function requireSuperAdmin(authResult) {
  const userId = authResult?.user?.id ?? authResult?.data?.user?.id;
  if (!userId || !supabaseAdmin) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } };
  }
  const { data: admin, error } = await supabaseAdmin
    .from('super_admins')
    .select('id, email, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !admin) {
    return { ok: false, status: 403, body: { error: 'forbidden' } };
  }
  return { ok: true, admin };
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
  return { authResult: authResult.data };
}

function createService() {
  const repository = createIfoodAdminRepository({ supabase: supabaseAdmin });
  return createIfoodOperationsService({ repository, requireSuperAdmin });
}

/** Cross-tenant health overview without PII payloads. */
export async function GET({ request, url }) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  try {
    const service = createService();
    const connectionId = url.searchParams.get('connectionId');
    if (connectionId) {
      const result = await service.listReplayable({
        authResult: auth.authResult,
        connectionId
      });
      return noStoreJson(result.body, result.status);
    }
    const result = await service.listConnections({ authResult: auth.authResult });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}
