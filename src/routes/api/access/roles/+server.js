// GET: list roles for the authenticated owner
// POST: create a new role
// Auth: Bearer token via supabaseAdmin.auth.getUser
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { logServerAuditAction } from '$lib/server/accessControl';
import { isSubscriptionActiveStrict } from '$lib/subscriptionStatus';

async function getAuthUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

export async function GET({ request }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  // Verify owner has the add-on active
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('has_acessos_addon, plan_tier, status, current_period_end, manually_extended_until')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub || !sub.has_acessos_addon || !isSubscriptionActiveStrict(sub)) {
    return json({ error: 'Add-on Controle de Acessos não está ativo.' }, { status: 403 });
  }

  const { data: roles, error } = await supabaseAdmin
    .from('access_roles')
    .select('id, name, permissions, is_system, created_at, updated_at')
    .eq('owner_user_id', user.id)
    .order('is_system', { ascending: false })
    .order('name');

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ roles: roles || [] });
}

export async function POST({ request }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('has_acessos_addon, status, current_period_end, manually_extended_until')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub || !sub.has_acessos_addon || !isSubscriptionActiveStrict(sub)) {
    return json({ error: 'Add-on Controle de Acessos não está ativo.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = (body.name || '').trim();
  const permissions = body.permissions || {};

  if (!name) return json({ error: 'Nome do cargo é obrigatório.' }, { status: 400 });
  if (name.length > 80) return json({ error: 'Nome muito longo (máx 80 caracteres).' }, { status: 400 });

  const { data: role, error } = await supabaseAdmin
    .from('access_roles')
    .insert({ owner_user_id: user.id, name, permissions })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return json({ error: 'Já existe um cargo com esse nome.' }, { status: 409 });
    return json({ error: error.message }, { status: 500 });
  }

  await logServerAuditAction({
    ownerUserId: user.id,
    operatorUserId: user.id,
    action: 'access.role_created',
    entityType: 'access_role',
    entityId: role.id,
    details: {
      name: role.name,
      is_system: role.is_system,
      permissions: role.permissions || {},
    },
  });

  return json({ success: true, role }, { status: 201 });
}
