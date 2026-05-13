// Client-side (isomorphic) helper for the Controle de Acessos add-on.
// Works in the browser; do NOT import from server-only modules.
import { supabase } from './supabaseClient';

// Module-level cache — cleared whenever auth state changes.
let _cachedContext = undefined; // undefined = not yet loaded; null = unauthenticated

// Reset cache on any auth state change (sign-in, sign-out, token refresh).
if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    _cachedContext = undefined;
  });
}

/**
 * Resolves the current user's access context.
 * Returns { isSubUser, ownerUserId, roleId, permissions } or null if unauthenticated.
 * - For owners: isSubUser=false, ownerUserId=userId, roleId=null, permissions=null.
 * - For sub-users: isSubUser=true, permissions is the jsonb object from access_roles.
 * Result is cached until auth state changes.
 * @returns {Promise<{isSubUser: boolean, ownerUserId: string, roleId: string|null, permissions: object|null}|null>}
 */
export async function getAccessContext() {
  if (_cachedContext !== undefined) return _cachedContext;

  try {
    const { data: sessData, error: sessError } = await supabase.auth.getSession();
    if (sessError || !sessData?.session?.user?.id) {
      _cachedContext = null;
      return null;
    }

    const userId = sessData.session.user.id;

    // Check if this user is a sub-user
    const { data: accessUser } = await supabase
      .from('access_users')
      .select('owner_user_id, role_id, access_roles(permissions)')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (accessUser) {
      _cachedContext = {
        isSubUser: true,
        ownerUserId: accessUser.owner_user_id,
        roleId: accessUser.role_id,
        permissions: accessUser.access_roles?.permissions || {},
      };
    } else {
      // Owner: has all permissions
      _cachedContext = {
        isSubUser: false,
        ownerUserId: userId,
        roleId: null,
        permissions: null,
      };
    }

    return _cachedContext;
  } catch (err) {
    console.warn('[accessControl] getAccessContext error:', err?.message);
    _cachedContext = null;
    return null;
  }
}

/**
 * Checks if the current user has a specific permission key.
 * Permission keys follow the pattern: 'pdv.acessar', 'caixa.abrir', 'relatorios.ver', etc.
 * Owners always return true (they have all permissions).
 * Sub-users must have the key explicitly set to true in their role's permissions object.
 * @param {string} permKey
 * @returns {Promise<boolean>}
 */
export async function hasPermission(permKey) {
  const context = await getAccessContext();
  if (!context) return false;
  // Owners have all permissions
  if (!context.isSubUser) return true;
  // Sub-users: check explicit permission
  return context.permissions?.[permKey] === true;
}

/**
 * Returns whether the current user is a sub-user (not an owner).
 * @returns {Promise<boolean>}
 */
export async function isSubUser() {
  const context = await getAccessContext();
  if (!context) return false;
  return context.isSubUser === true;
}

/**
 * Writes an audit log entry. Only meaningful when sub-users are active.
 * Fire-and-forget — does not throw; logs errors to console only.
 * @param {{ ownerUserId: string, action: string, entityType?: string, entityId?: string|null, details?: object }} opts
 */
export async function logAuditAction({ ownerUserId, action, entityType, entityId, details = {} }) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await supabase.from('access_audit_logs').insert({
      owner_user_id: ownerUserId,
      operator_user_id: session.user.id,
      action,
      entity_type: entityType || null,
      entity_id: entityId ? String(entityId) : null,
      details,
    });
  } catch (e) {
    console.warn('[audit]', action, e?.message);
  }
}
