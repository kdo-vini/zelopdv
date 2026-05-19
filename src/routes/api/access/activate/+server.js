// POST /api/access/activate
// Called by the invited sub-user right after they finish setting their password
// (in /redefinir-senha) or on any future login that detects a still-pending row.
//
// Reads the user metadata that inviteSubUser stamped onto auth.users
// ({ owner_user_id, access_role_id }), finds the matching access_users row by
// (owner_user_id, email) and activates it: sets auth_user_id + status='active'.
//
// Idempotent — running it twice is safe.
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { logServerAuditAction } from '$lib/server/accessControl';

async function getAuthUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

export async function POST({ request }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  const ownerUserId = user.user_metadata?.owner_user_id;
  const roleIdFromMetadata = user.user_metadata?.access_role_id || null;

  if (!ownerUserId) {
    // Not an invited sub-user — nothing to activate. Treat as no-op so the
    // caller can run this unconditionally after password setup.
    return json({ activated: false, reason: 'not_invited' });
  }

  const email = (user.email || '').toLowerCase();
  if (!email) {
    return json({ activated: false, reason: 'missing_email' }, { status: 400 });
  }

  // Find the pending access_users row for this (owner, email)
  const { data: row, error: lookupError } = await supabaseAdmin
    .from('access_users')
    .select('id, status, role_id, auth_user_id')
    .eq('owner_user_id', ownerUserId)
    .eq('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('[access.activate] lookup error:', lookupError.message);
    return json({ error: 'Erro ao localizar convite.' }, { status: 500 });
  }

  if (!row) {
    return json({ activated: false, reason: 'no_pending_invite' });
  }

  if (row.status === 'removed' || row.status === 'blocked') {
    return json({ activated: false, reason: `status_${row.status}` }, { status: 403 });
  }

  // Already linked to this user with active status → no-op
  if (row.auth_user_id === user.id && row.status === 'active') {
    return json({ activated: true, alreadyActive: true });
  }

  const update = {
    auth_user_id: user.id,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  // If the row somehow has no role yet, fall back to the role stored in metadata.
  if (!row.role_id && roleIdFromMetadata) {
    update.role_id = roleIdFromMetadata;
  }

  const { error: updateError } = await supabaseAdmin
    .from('access_users')
    .update(update)
    .eq('id', row.id);

  if (updateError) {
    console.error('[access.activate] update error:', updateError.message);
    return json({ error: 'Erro ao ativar acesso.' }, { status: 500 });
  }

  await logServerAuditAction({
    ownerUserId,
    operatorUserId: user.id,
    action: 'access.user_activated',
    entityType: 'access_user',
    entityId: row.id,
    details: { email, role_id: row.role_id || roleIdFromMetadata },
  });

  return json({ activated: true });
}
