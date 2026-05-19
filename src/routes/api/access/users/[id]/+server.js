// PATCH: update user status or role
// DELETE: soft-delete (status = 'removed')
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { logServerAuditAction } from '$lib/server/accessControl';

async function getAuthUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

export async function PATCH({ request, params }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  const { data: subUser } = await supabaseAdmin
    .from('access_users')
    .select('id, owner_user_id, status, email, role_id')
    .eq('id', params.id)
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (!subUser) return json({ error: 'Usuário não encontrado.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const update = { updated_at: new Date().toISOString() };

  const VALID_STATUSES = ['active', 'blocked', 'pending'];
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return json({ error: 'Status inválido.' }, { status: 400 });
    update.status = body.status;
  }
  if (body.role_id !== undefined) update.role_id = body.role_id;

  const { error } = await supabaseAdmin
    .from('access_users')
    .update(update)
    .eq('id', params.id)
    .eq('owner_user_id', user.id);

  if (error) return json({ error: error.message }, { status: 500 });

  await logServerAuditAction({
    ownerUserId: user.id,
    operatorUserId: user.id,
    action: 'access.user_updated',
    entityType: 'access_user',
    entityId: params.id,
    details: {
      email: subUser.email,
      before: { status: subUser.status, role_id: subUser.role_id },
      after: {
        status: update.status ?? subUser.status,
        role_id: update.role_id ?? subUser.role_id,
      },
    },
  });

  return json({ success: true });
}

export async function DELETE({ request, params }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  const { data: subUser } = await supabaseAdmin
    .from('access_users')
    .select('id, email, status, role_id, auth_user_id')
    .eq('id', params.id)
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (!subUser) return json({ error: 'Usuário não encontrado.' }, { status: 404 });

  // Hard-delete the access_users row so the email can be re-invited cleanly
  // (respects the UNIQUE (owner_user_id, email) constraint).
  const { error: deleteError } = await supabaseAdmin
    .from('access_users')
    .delete()
    .eq('id', params.id)
    .eq('owner_user_id', user.id);

  if (deleteError) return json({ error: deleteError.message }, { status: 500 });

  // Cascade to auth.users only if the sub-user accepted the invite AND does not
  // hold their own ZeloPDV subscription (i.e. they are not also an owner of a
  // separate account). Otherwise we would delete a legit titular account.
  let authDeleted = false;
  let authSkippedReason = null;
  if (subUser.auth_user_id) {
    const { data: ownSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', subUser.auth_user_id)
      .maybeSingle();

    if (ownSubscription) {
      authSkippedReason = 'has_own_subscription';
    } else {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(subUser.auth_user_id);
      if (authErr) {
        console.warn('[access.users.DELETE] auth cascade error:', authErr.message);
        authSkippedReason = 'auth_delete_failed';
      } else {
        authDeleted = true;
      }
    }
  }

  await logServerAuditAction({
    ownerUserId: user.id,
    operatorUserId: user.id,
    action: 'access.user_removed',
    entityType: 'access_user',
    entityId: params.id,
    details: {
      email: subUser.email,
      previous_status: subUser.status,
      role_id: subUser.role_id,
      auth_user_id: subUser.auth_user_id,
      auth_deleted: authDeleted,
      auth_skipped_reason: authSkippedReason,
    },
  });

  return json({ success: true, auth_deleted: authDeleted });
}
