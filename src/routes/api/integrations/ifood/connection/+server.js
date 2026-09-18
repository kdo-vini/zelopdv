import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin.js';
import { getServerAccessContext } from '$lib/server/accessControl.js';
import { createHttpIfoodAdapter } from '$lib/server/ifood/adapters/httpIfoodAdapter.js';
import {
  createIfoodConnectionRepository,
  createIfoodConnectionService
} from '$lib/server/ifood/connectionService.js';

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
    .select('id, nome_exibicao, razao_social')
    .eq('user_id', ownerUserId)
    .maybeSingle();
  if (error) throw new Error('company lookup failed');
  return {
    id: data?.id ?? null,
    // The only signal `discoverMerchants` has to tell "this authorized
    // merchant is mine" from "some other Zelo tenant's" -- the centralized
    // iFood app returns every merchant across every tenant, so without this
    // the discovery list would leak other businesses' store names (see
    // connectionService.js's `discoverMerchants`).
    businessNames: [data?.nome_exibicao, data?.razao_social].filter(
      (value) => typeof value === 'string' && value.trim().length > 0
    )
  };
}

async function resolveSubscription(ownerUserId) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('status, plan_tier, current_period_end, manually_extended_until')
    .eq('user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('subscription lookup failed');
  return data ?? null;
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

  let empresaProfile;
  let subscription;
  try {
    [empresaProfile, subscription] = await Promise.all([
      resolveEmpresaId(accessContext?.ownerUserId),
      resolveSubscription(accessContext?.ownerUserId)
    ]);
  } catch {
    return { error: noStoreJson({ error: 'unavailable' }, 503) };
  }
  if (!empresaProfile.id) return { error: noStoreJson({ error: 'unavailable' }, 503) };

  return {
    authResult: authResult.data,
    accessContext,
    empresaId: empresaProfile.id,
    businessNames: empresaProfile.businessNames,
    subscription
  };
}

function createService() {
  if (!env.IFOOD_CLIENT_ID || !env.IFOOD_CLIENT_SECRET) return null;
  const repository = createIfoodConnectionRepository({ supabase: supabaseAdmin });
  const adapter = createHttpIfoodAdapter({
    clientId: env.IFOOD_CLIENT_ID,
    clientSecret: env.IFOOD_CLIENT_SECRET
  });
  return createIfoodConnectionService({
    repository,
    adapter,
    stateSecret: env.IFOOD_CLIENT_SECRET,
    // The exact merchant-authorization navigation path inside iFood's own
    // Partner Portal is not publicly documented (see
    // docs/integrations/ifood/CONTRACT_SNAPSHOT.md, "Conexão de lojista em
    // produção"). Overridable by env so ops can drop in the confirmed deep
    // link/copy once discovered, with no code change or redeploy of logic.
    ...(env.IFOOD_PARTNER_PORTAL_URL ? { partnerPortalUrl: env.IFOOD_PARTNER_PORTAL_URL } : {})
  });
}

/** Sanitized snapshot of the tenant's own connection — never a secret. */
export async function GET({ request }) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  const service = createService();
  if (!service) return noStoreJson({ error: 'unavailable' }, 503);

  try {
    const result = await service.getStatus({
      authResult: auth.authResult,
      accessContext: auth.accessContext,
      subscription: auth.subscription,
      empresaId: auth.empresaId,
      businessNames: auth.businessNames,
      signal: request.signal
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}

/** Starts (or restarts) a connection: creates the `pending` row up front. */
export async function POST({ request }) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'invalid_payload' }, 400);
  }

  const service = createService();
  if (!service) return noStoreJson({ error: 'unavailable' }, 503);

  try {
    const result = await service.startConnection({
      authResult: auth.authResult,
      accessContext: auth.accessContext,
      subscription: auth.subscription,
      empresaId: auth.empresaId,
      body,
      signal: request.signal
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}

/**
 * Two independent PATCH shapes, dispatched by body:
 * - `{ action: 'pause' | 'resume' | 'disconnect' }` — never accepted with active orders present.
 * - `{ printOwner: 'zelo' | 'external' }` — who prints; never gated by active orders.
 */
export async function PATCH({ request }) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'invalid_payload' }, 400);
  }

  const service = createService();
  if (!service) return noStoreJson({ error: 'unavailable' }, 503);

  const handler = typeof body?.printOwner === 'string' && body?.action === undefined
    ? service.updatePrintOwner
    : service.updateConnectionStatus;

  try {
    const result = await handler({
      authResult: auth.authResult,
      accessContext: auth.accessContext,
      subscription: auth.subscription,
      empresaId: auth.empresaId,
      body,
      signal: request.signal
    });
    return noStoreJson(result.body, result.status);
  } catch {
    return noStoreJson({ error: 'unavailable' }, 500);
  }
}
