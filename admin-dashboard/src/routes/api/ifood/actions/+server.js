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

/** Kill switches and same-identity replay — never accepts arbitrary payloads. */
export async function POST({ request }) {
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

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'invalid_payload' }, 400);
  }

  try {
    const repository = createIfoodAdminRepository({ supabase: supabaseAdmin });
    const service = createIfoodOperationsService({ repository, requireSuperAdmin });
    const result = await service.runAction({
      authResult: authResult.data,
      body
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}
