// GET: list sub-users for the owner
// POST: invite a new sub-user
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { inviteSubUser, ensureDefaultRoles, logServerAuditAction } from '$lib/server/accessControl';
import { isSubscriptionActiveStrict } from '$lib/subscriptionStatus';

async function getAuthUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

async function verifyAddonActive(userId) {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('has_acessos_addon, status, current_period_end, manually_extended_until')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data && data.has_acessos_addon && isSubscriptionActiveStrict(data);
}

export async function GET({ request }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });
  if (!(await verifyAddonActive(user.id))) return json({ error: 'Add-on não ativo.' }, { status: 403 });

  const [{ data: users }, { data: sub }] = await Promise.all([
    supabaseAdmin
      .from('access_users')
      .select('id, email, status, role_id, created_at, updated_at, access_roles(name)')
      .eq('owner_user_id', user.id)
      .neq('status', 'removed')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('subscriptions')
      .select('has_mesas_addon, has_zelo_menu, plan_tier')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return json({
    users: (users || []).map(u => ({ ...u, role_name: u.access_roles?.name || null })),
    // `zeloMenu` espelha o gate de ordering_review de guards.js: chat/bundle
    // incluem ZeloMenu por política (D-014); pdv puro precisa da flag.
    addons: {
      mesas: !!sub?.has_mesas_addon,
      zeloMenu: sub?.plan_tier === 'chat' || sub?.plan_tier === 'bundle'
        || (sub?.plan_tier === 'pdv' && !!sub?.has_zelo_menu),
    },
  });
}

export async function POST({ request }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });
  if (!(await verifyAddonActive(user.id))) return json({ error: 'Add-on não ativo.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const roleId = body.role_id || null;

  if (!email) return json({ error: 'E-mail é obrigatório.' }, { status: 400 });

  // Ensure default roles exist first
  await ensureDefaultRoles(user.id);

  try {
    const result = await inviteSubUser(user.id, email, roleId);
    await logServerAuditAction({
      ownerUserId: user.id,
      operatorUserId: user.id,
      action: 'access.user_invited',
      entityType: 'access_user',
      entityId: result.accessUserId,
      details: { email, role_id: roleId },
    });
    return json(result, { status: 201 });
  } catch (err) {
    return json({ error: typeof err === 'string' ? err : err.message }, { status: 400 });
  }
}
