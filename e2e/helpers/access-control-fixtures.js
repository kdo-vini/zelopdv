import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUBUSER_PASSWORD = process.env.E2E_SUBUSER_PASSWORD || 'E2E-Access-123!';

export const E2E_CAIXA_EMAIL =
  process.env.E2E_CAIXA_EMAIL || 'e2e.acessos.caixa@zelopdv.test';
export const E2E_ATENDENTE_EMAIL =
  process.env.E2E_ATENDENTE_EMAIL || 'e2e.acessos.atendente@zelopdv.test';
export const E2E_GERENTE_EMAIL =
  process.env.E2E_GERENTE_EMAIL || 'e2e.acessos.gerente@zelopdv.test';
export const E2E_SUBUSER_PASSWORD = DEFAULT_SUBUSER_PASSWORD;

const DEFAULT_ROLES = [
  {
    name: 'Caixa',
    is_system: true,
    permissions: {
      'pdv.acessar': true,
      'pdv.vender': true,
      'pdv.receber': true,
      'caixa.abrir': true,
      'caixa.fechar': true,
      'caixa.movimentar': true,
      'caixa.ver': true,
    },
  },
  {
    name: 'Atendente',
    is_system: true,
    permissions: {
      'pdv.acessar': true,
      'mesas.acessar': true,
      'mesas.abrir_comanda': true,
      'mesas.editar_itens': true,
      'pedidos.acessar': true,
      'pedidos.criar': true,
      'pedidos.cozinha': true,
    },
  },
  {
    name: 'Gerente',
    is_system: true,
    permissions: {
      'pdv.acessar': true,
      'pdv.vender': true,
      'pdv.receber': true,
      'pdv.desconto': true,
      'caixa.abrir': true,
      'caixa.fechar': true,
      'caixa.movimentar': true,
      'caixa.ver': true,
      'produtos.visualizar': true,
      'produtos.gerenciar': true,
      'estoque.visualizar': true,
      'estoque.ajustar': true,
      'pessoas.visualizar': true,
      'pessoas.gerenciar': true,
      'fiado.visualizar': true,
      'fiado.receber': true,
      'despesas.visualizar': true,
      'despesas.gerenciar': true,
      'relatorios.ver': true,
      'relatorios.exportar': true,
      'perfil.editar': true,
    },
  },
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function readPrivateEnv() {
  const rootDir = process.cwd();
  return {
    ...parseEnvFile(path.join(rootDir, '.env')),
    ...process.env,
  };
}

function getAdminClient() {
  const env = readPrivateEnv();
  const supabaseUrl = env.SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para o setup E2E.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listAuthUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  return data?.users || [];
}

async function ensureAuthUser(admin, email, password) {
  const users = await listAuthUsers(admin);
  const existing = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function resolveOwnerUser(admin, ownerEmail) {
  const users = await listAuthUsers(admin);
  const owner = users.find((user) => user.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (!owner) {
    throw new Error(`Usuário titular E2E não encontrado para ${ownerEmail}.`);
  }
  return owner;
}

async function ensureOwnerSubscription(admin, ownerUserId) {
  const { data: subscription, error } = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!subscription?.id) {
    throw new Error('Assinatura do titular E2E não encontrada.');
  }

  const { error: updateError } = await admin
    .from('subscriptions')
    .update({
      has_acessos_addon: true,
      has_zelo_menu: true,
      has_mesas_addon: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  if (updateError) throw updateError;
}

async function updateOwnerSubscriptionAddons(admin, ownerUserId, addons) {
  const { data: subscription, error } = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!subscription?.id) {
    throw new Error('Assinatura do titular E2E não encontrada.');
  }

  const patch = {
    updated_at: new Date().toISOString(),
  };

  if (addons.acessos !== undefined) patch.has_acessos_addon = Boolean(addons.acessos);
  if (addons.mesas !== undefined) patch.has_mesas_addon = Boolean(addons.mesas);
  if (addons.zeloMenu !== undefined) patch.has_zelo_menu = Boolean(addons.zeloMenu);

  const { error: updateError } = await admin
    .from('subscriptions')
    .update(patch)
    .eq('id', subscription.id);

  if (updateError) throw updateError;
}

async function ensureOwnerRoles(admin, ownerUserId) {
  const rows = DEFAULT_ROLES.map((role) => ({
    owner_user_id: ownerUserId,
    name: role.name,
    is_system: role.is_system,
    permissions: role.permissions,
  }));

  const { error } = await admin
    .from('access_roles')
    .upsert(rows, { onConflict: 'owner_user_id,name' });

  if (error) throw error;

  const { data: roles, error: rolesError } = await admin
    .from('access_roles')
    .select('id, name')
    .eq('owner_user_id', ownerUserId)
    .in('name', DEFAULT_ROLES.map((role) => role.name));

  if (rolesError) throw rolesError;
  return Object.fromEntries((roles || []).map((role) => [role.name, role.id]));
}

async function ensureAccessSettings(admin, ownerUserId) {
  const { error } = await admin
    .from('access_settings')
    .upsert(
      {
        owner_user_id: ownerUserId,
        pin_enabled: true,
        max_subusers: 5,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_user_id' },
    );

  if (error) throw error;
}

async function ensureAccessUser(admin, { ownerUserId, authUserId, email, roleId }) {
  const { error } = await admin
    .from('access_users')
    .upsert(
      {
        owner_user_id: ownerUserId,
        auth_user_id: authUserId,
        email,
        role_id: roleId,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_user_id,email' },
    );

  if (error) throw error;
}

export async function seedAccessControlE2EUsers(ownerEmail) {
  const admin = getAdminClient();
  const owner = await resolveOwnerUser(admin, ownerEmail);

  await ensureOwnerSubscription(admin, owner.id);
  await ensureAccessSettings(admin, owner.id);
  const roleIds = await ensureOwnerRoles(admin, owner.id);

  const caixaUser = await ensureAuthUser(admin, E2E_CAIXA_EMAIL, E2E_SUBUSER_PASSWORD);
  const atendenteUser = await ensureAuthUser(admin, E2E_ATENDENTE_EMAIL, E2E_SUBUSER_PASSWORD);
  const gerenteUser = await ensureAuthUser(admin, E2E_GERENTE_EMAIL, E2E_SUBUSER_PASSWORD);

  await ensureAccessUser(admin, {
    ownerUserId: owner.id,
    authUserId: caixaUser.id,
    email: E2E_CAIXA_EMAIL,
    roleId: roleIds.Caixa,
  });

  await ensureAccessUser(admin, {
    ownerUserId: owner.id,
    authUserId: atendenteUser.id,
    email: E2E_ATENDENTE_EMAIL,
    roleId: roleIds.Atendente,
  });

  await ensureAccessUser(admin, {
    ownerUserId: owner.id,
    authUserId: gerenteUser.id,
    email: E2E_GERENTE_EMAIL,
    roleId: roleIds.Gerente,
  });

  return {
    ownerUserId: owner.id,
    roleIds,
    users: {
      caixa: { email: E2E_CAIXA_EMAIL, password: E2E_SUBUSER_PASSWORD },
      atendente: { email: E2E_ATENDENTE_EMAIL, password: E2E_SUBUSER_PASSWORD },
      gerente: { email: E2E_GERENTE_EMAIL, password: E2E_SUBUSER_PASSWORD },
    },
  };
}

export async function cleanupInviteForOwner(ownerEmail, inviteEmail) {
  const admin = getAdminClient();
  const owner = await resolveOwnerUser(admin, ownerEmail);

  const { error } = await admin
    .from('access_users')
    .delete()
    .eq('owner_user_id', owner.id)
    .eq('email', inviteEmail);

  if (error) throw error;
}

export async function cleanupPendingInvitesForOwner(ownerEmail) {
  const admin = getAdminClient();
  const owner = await resolveOwnerUser(admin, ownerEmail);

  const { error } = await admin
    .from('access_users')
    .delete()
    .eq('owner_user_id', owner.id)
    .eq('status', 'pending');

  if (error) throw error;
}

export async function setOwnerAddons(ownerEmail, addons) {
  const admin = getAdminClient();
  const owner = await resolveOwnerUser(admin, ownerEmail);
  await updateOwnerSubscriptionAddons(admin, owner.id, addons);
}
