// PATCH: update a role's name and/or permissions
// DELETE: delete a non-system role (only if no users are assigned)
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

  const roleId = params.id;
  const { data: role } = await supabaseAdmin
    .from('access_roles')
    .select('id, owner_user_id, is_system, name')
    .eq('id', roleId)
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (!role) return json({ error: 'Cargo não encontrado.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const update = { updated_at: new Date().toISOString() };

  if (body.permissions !== undefined) update.permissions = body.permissions;
  if (body.name !== undefined && !role.is_system) {
    const name = body.name.trim();
    if (!name) return json({ error: 'Nome não pode ser vazio.' }, { status: 400 });
    update.name = name;
  }

  const { error } = await supabaseAdmin
    .from('access_roles')
    .update(update)
    .eq('id', roleId)
    .eq('owner_user_id', user.id);

  if (error) return json({ error: error.message }, { status: 500 });

  await logServerAuditAction({
    ownerUserId: user.id,
    operatorUserId: user.id,
    action: 'access.role_updated',
    entityType: 'access_role',
    entityId: roleId,
    details: {
      before: { name: role.name },
      after: {
        name: update.name ?? role.name,
        permissions: update.permissions ?? undefined,
      },
    },
  });

  return json({ success: true });
}

export async function DELETE({ request, params }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  const roleId = params.id;
  const { data: role } = await supabaseAdmin
    .from('access_roles')
    .select('id, owner_user_id, is_system')
    .eq('id', roleId)
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (!role) return json({ error: 'Cargo não encontrado.' }, { status: 404 });
  if (role.is_system) return json({ error: 'Cargos padrão não podem ser excluídos.' }, { status: 400 });

  // Check if any users are assigned to this role
  const { count } = await supabaseAdmin
    .from('access_users')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId)
    .in('status', ['active', 'pending']);

  if (count > 0) return json({ error: 'Cargo em uso. Reatribua os usuários antes de excluir.' }, { status: 409 });

  const { error } = await supabaseAdmin
    .from('access_roles')
    .delete()
    .eq('id', roleId)
    .eq('owner_user_id', user.id);

  if (error) return json({ error: error.message }, { status: 500 });

  await logServerAuditAction({
    ownerUserId: user.id,
    operatorUserId: user.id,
    action: 'access.role_deleted',
    entityType: 'access_role',
    entityId: roleId,
    details: { is_system: role.is_system },
  });

  return json({ success: true });
}
