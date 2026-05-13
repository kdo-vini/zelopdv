// Server-side helper for the Controle de Acessos add-on.
// Runs in SvelteKit +server.js files only. Uses supabaseAdmin (service role).
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabaseAdmin';
import { isEmailConfigured, sendEmail } from './email';
import { emailAccessControlInvite } from './emailTemplates';

const DEFAULT_APP_URL = 'https://zelopdv.com.br';

function getInviteRedirectUrl() {
  const rawOrigin = env.PUBLIC_APP_URL || env.VITE_PUBLIC_APP_URL || DEFAULT_APP_URL;
  const trimmed = String(rawOrigin || '').trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL('/redefinir-senha', withProtocol).toString();
  } catch {
    return `${DEFAULT_APP_URL}/redefinir-senha`;
  }
}

async function cleanupPendingInvite(accessUserId, invitedAuthUserId = null) {
  await supabaseAdmin.from('access_users').delete().eq('id', accessUserId);

  if (!invitedAuthUserId) return;

  const { error } = await supabaseAdmin.auth.admin.deleteUser(invitedAuthUserId);
  if (error) {
    console.warn('[accessControl] cleanup invited auth user error:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Default system roles provisioned for every new owner
// ---------------------------------------------------------------------------
const DEFAULT_ROLES = [
  {
    name: 'Caixa',
    is_system: true,
    permissions: {
      'pdv.acessar': true, 'pdv.vender': true, 'pdv.receber': true,
      'caixa.abrir': true, 'caixa.fechar': true, 'caixa.movimentar': true, 'caixa.ver': true,
    },
  },
  {
    name: 'Atendente',
    is_system: true,
    permissions: {
      'pdv.acessar': true,
      'mesas.acessar': true, 'mesas.abrir_comanda': true, 'mesas.editar_itens': true,
      'pedidos.acessar': true, 'pedidos.criar': true, 'pedidos.cozinha': true,
    },
  },
  {
    name: 'Gerente',
    is_system: true,
    permissions: {
      'pdv.acessar': true, 'pdv.vender': true, 'pdv.receber': true, 'pdv.desconto': true,
      'caixa.abrir': true, 'caixa.fechar': true, 'caixa.movimentar': true, 'caixa.ver': true,
      'produtos.visualizar': true, 'produtos.gerenciar': true,
      'estoque.visualizar': true, 'estoque.ajustar': true,
      'pessoas.visualizar': true, 'pessoas.gerenciar': true,
      'fiado.visualizar': true, 'fiado.receber': true,
      'despesas.visualizar': true, 'despesas.gerenciar': true,
      'relatorios.ver': true, 'relatorios.exportar': true,
      'perfil.editar': true,
    },
  },
];

// ---------------------------------------------------------------------------
// resolveOwnerUserId
// ---------------------------------------------------------------------------

/**
 * Resolves the owner_user_id for any user (owner or sub-user).
 * If user is in access_users with status='active', returns their owner's user_id.
 * Otherwise returns the userId itself (they are an owner).
 * @param {string} userId
 * @returns {Promise<string>} ownerUserId
 */
export async function resolveOwnerUserId(userId) {
  if (!userId) throw new Error('userId is required');

  const { data } = await supabaseAdmin
    .from('access_users')
    .select('owner_user_id')
    .eq('auth_user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return data?.owner_user_id ?? userId;
}

// ---------------------------------------------------------------------------
// getServerAccessContext
// ---------------------------------------------------------------------------

/**
 * Returns the full access context for a user: { isSubUser, ownerUserId, roleId, permissions }.
 * For owners: isSubUser=false, ownerUserId=userId, roleId=null, permissions=null.
 * For sub-users: fetches their role and permissions from access_roles.
 * @param {string} userId
 * @returns {Promise<{isSubUser: boolean, ownerUserId: string, roleId: string|null, permissions: object|null}>}
 */
export async function getServerAccessContext(userId) {
  if (!userId) throw new Error('userId is required');

  const { data: accessUser } = await supabaseAdmin
    .from('access_users')
    .select('owner_user_id, role_id')
    .eq('auth_user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!accessUser) {
    // This user is an owner
    return {
      isSubUser: false,
      ownerUserId: userId,
      roleId: null,
      permissions: null,
    };
  }

  // Sub-user: fetch role permissions
  let permissions = {};
  if (accessUser.role_id) {
    const { data: role } = await supabaseAdmin
      .from('access_roles')
      .select('permissions')
      .eq('id', accessUser.role_id)
      .maybeSingle();
    if (role?.permissions) {
      permissions = role.permissions;
    }
  }

  return {
    isSubUser: true,
    ownerUserId: accessUser.owner_user_id,
    roleId: accessUser.role_id,
    permissions,
  };
}

// ---------------------------------------------------------------------------
// ensureDefaultRoles
// ---------------------------------------------------------------------------

/**
 * Creates the 3 default system roles (Caixa, Atendente, Gerente) for a new owner
 * if they don't already exist. Safe to call multiple times (idempotent).
 * @param {string} ownerUserId
 */
export async function ensureDefaultRoles(ownerUserId) {
  if (!ownerUserId) throw new Error('ownerUserId is required');

  const rows = DEFAULT_ROLES.map((role) => ({
    owner_user_id: ownerUserId,
    name: role.name,
    is_system: role.is_system,
    permissions: role.permissions,
  }));

  const { error } = await supabaseAdmin
    .from('access_roles')
    .upsert(rows, { onConflict: 'owner_user_id,name', ignoreDuplicates: true });

  if (error) {
    console.error('[accessControl] ensureDefaultRoles error:', error.message);
    throw new Error('Erro ao criar perfis padrão.');
  }
}

// ---------------------------------------------------------------------------
// inviteSubUser
// ---------------------------------------------------------------------------

/**
 * Invites a sub-user by email under an owner.
 * Validates limits, uniqueness, and that the email is not already an owner account.
 * Creates a pending row in access_users and sends a branded invite email.
 * @param {string} ownerUserId
 * @param {string} email
 * @param {string} roleId
 * @returns {Promise<{success: true, accessUserId: string}>}
 * @throws {string} Human-readable error message on validation failure
 */
export async function inviteSubUser(ownerUserId, email, roleId) {
  if (!ownerUserId) throw 'ownerUserId is required';
  if (!email) throw 'E-mail é obrigatório.';
  if (!roleId) throw 'Perfil (role) é obrigatório.';

  // 1) Resolve max sub-user limit from access_settings (default 5)
  let maxSubusers = 5;
  const { data: settings } = await supabaseAdmin
    .from('access_settings')
    .select('max_subusers')
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  if (settings?.max_subusers != null) {
    maxSubusers = settings.max_subusers;
  }

  // 2) Count active + pending sub-users for this owner
  const { count, error: countError } = await supabaseAdmin
    .from('access_users')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .in('status', ['active', 'pending']);

  if (countError) {
    console.error('[accessControl] inviteSubUser count error:', countError.message);
    throw 'Erro ao verificar limite de subusuários.';
  }

  if ((count ?? 0) >= maxSubusers) {
    throw 'Limite de subusuários atingido.';
  }

  // 3) Check if this email is already invited or active under this owner (any status except 'removed')
  const { data: existingInvite } = await supabaseAdmin
    .from('access_users')
    .select('id')
    .eq('owner_user_id', ownerUserId)
    .eq('email', email)
    .neq('status', 'removed')
    .maybeSingle();

  if (existingInvite) {
    throw 'E-mail já convidado ou cadastrado nesta empresa.';
  }

  // 4) Check if the email already belongs to an owner (has their own subscription)
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (!authError && authUsers?.users) {
    const existingAuthUser = authUsers.users.find((u) => u.email === email);
    if (existingAuthUser) {
      // Check if they have their own subscription (i.e. they are an owner)
      const { data: ownerSub } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('user_id', existingAuthUser.id)
        .maybeSingle();
      if (ownerSub) {
        throw 'Este e-mail já possui uma conta ZeloPDV como titular.';
      }
    }
  }

  // 5) Insert pending access_users row
  const { data: newRow, error: insertError } = await supabaseAdmin
    .from('access_users')
    .insert({
      owner_user_id: ownerUserId,
      email,
      role_id: roleId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !newRow) {
    console.error('[accessControl] inviteSubUser insert error:', insertError?.message);
    throw 'Erro ao criar convite. Tente novamente.';
  }

  const [{ data: companyProfile }, { data: roleProfile }] = await Promise.all([
    supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, razao_social')
      .eq('user_id', ownerUserId)
      .maybeSingle(),
    supabaseAdmin
      .from('access_roles')
      .select('name')
      .eq('id', roleId)
      .eq('owner_user_id', ownerUserId)
      .maybeSingle(),
  ]);

  const companyName = companyProfile?.nome_exibicao || companyProfile?.razao_social || 'sua empresa';
  const roleName = roleProfile?.name || null;
  const redirectTo = getInviteRedirectUrl();

  // 6) Generate a secure invite link and send the branded email ourselves
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo,
      data: {
        owner_user_id: ownerUserId,
        access_role_id: roleId,
        company_name: companyName,
        role_name: roleName,
      },
    },
  });

  const inviteUrl = inviteData?.properties?.action_link;
  const invitedAuthUserId = inviteData?.user?.id ?? null;

  if (inviteError || !inviteUrl) {
    console.error('[accessControl] generateLink invite error:', inviteError?.message || 'missing action_link');
    await cleanupPendingInvite(newRow.id, invitedAuthUserId);
    throw 'Erro ao enviar convite por e-mail. Tente novamente.';
  }

  if (!isEmailConfigured()) {
    console.error('[accessControl] invite email config missing.');
    await cleanupPendingInvite(newRow.id, invitedAuthUserId);
    throw 'Erro ao enviar convite por e-mail. Tente novamente.';
  }

  const { subject, html } = emailAccessControlInvite({
    companyName,
    roleName,
    inviteUrl,
  });

  const sent = await sendEmail({ to: email, subject, html });
  if (!sent) {
    console.error('[accessControl] send invite email failed.');
    await cleanupPendingInvite(newRow.id, invitedAuthUserId);
    throw 'Erro ao enviar convite por e-mail. Tente novamente.';
  }

  return { success: true, accessUserId: newRow.id };
}

// ---------------------------------------------------------------------------
// audit helpers
// ---------------------------------------------------------------------------

/**
 * Writes an audit log entry on the server side using service role.
 * Safe best-effort helper for +server routes.
 * @param {{ ownerUserId: string, operatorUserId: string, action: string, entityType?: string, entityId?: string|null, details?: object }} opts
 */
export async function logServerAuditAction({ ownerUserId, operatorUserId, action, entityType, entityId, details = {} }) {
  if (!ownerUserId || !operatorUserId || !action) return;

  const { error } = await supabaseAdmin
    .from('access_audit_logs')
    .insert({
      owner_user_id: ownerUserId,
      operator_user_id: operatorUserId,
      action,
      entity_type: entityType || null,
      entity_id: entityId ? String(entityId) : null,
      details,
    });

  if (error) {
    console.warn('[accessControl] logServerAuditAction error:', error.message);
  }
}

/**
 * Logs a sub-user login once per short time window to avoid duplicate inserts
 * when the auth callback and the login page both trigger the audit.
 * @param {string} userId
 * @param {object} details
 */
export async function logSubUserLogin(userId, details = {}) {
  if (!userId) return { logged: false, reason: 'missing-user' };

  const ctx = await getServerAccessContext(userId);
  if (!ctx?.isSubUser) {
    return { logged: false, reason: 'not-sub-user' };
  }

  const { data: lastLog } = await supabaseAdmin
    .from('access_audit_logs')
    .select('id, created_at')
    .eq('owner_user_id', ctx.ownerUserId)
    .eq('operator_user_id', userId)
    .eq('action', 'auth.login')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastLog?.created_at) {
    const diffMs = Date.now() - new Date(lastLog.created_at).getTime();
    if (diffMs < 60_000) {
      return { logged: false, reason: 'deduped' };
    }
  }

  await logServerAuditAction({
    ownerUserId: ctx.ownerUserId,
    operatorUserId: userId,
    action: 'auth.login',
    entityType: 'session',
    details,
  });

  return { logged: true };
}
