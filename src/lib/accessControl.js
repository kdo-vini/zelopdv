// Client-side (isomorphic) helper for the Controle de Acessos add-on.
// Works in the browser; do NOT import from server-only modules.
import { loadEntitlementSnapshot, loadOfflineOperatingContext, clearEntitlementSnapshot } from './offlineEntitlement';
import { isNetworkError } from './netStatus';
import { supabase } from './supabaseClient';

// Module-level cache — cleared whenever auth state changes.
let _cachedContext = undefined; // undefined = not yet loaded; null = unauthenticated

// sessionStorage mirror so the cache survives layout remounts on cross-section
// navigation (e.g. /app ↔ /gestao) without an extra round-trip + flash of
// unauthorized nav items.
const STORAGE_KEY = 'zelo_access_context_v1';

function readFromStorage() {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeToStorage(value) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (value == null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

// Hydrate the in-memory cache from sessionStorage on module load so the very
// first synchronous getAccessContextSync() call returns the cached value.
if (typeof window !== 'undefined') {
  const persisted = readFromStorage();
  if (persisted !== undefined) _cachedContext = persisted;
}

// Reset cache on any auth state change (sign-in, sign-out, token refresh).
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    // TOKEN_REFRESHED fires periodically without changing identity — keep cache.
    if (event === 'TOKEN_REFRESHED') return;
    if (event === 'SIGNED_OUT' || (session?.user?.id && loadOfflineOperatingContext()?.userId !== session.user.id)) clearEntitlementSnapshot();
    _cachedContext = undefined;
    writeToStorage(null);
  });
}

/**
 * Synchronous read of the cached access context. Returns undefined if not yet
 * loaded (callers should fall back to `getAccessContext()`). Used by UI shells
 * that need to decide what to render before the first network round-trip.
 * @returns {{isSubUser: boolean, ownerUserId: string, roleId: string|null, permissions: object|null}|null|undefined}
 */
export function getAccessContextSync() {
  return _cachedContext;
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return loadOfflineOperatingContext();
  }
  if (_cachedContext !== undefined) return _cachedContext;

  try {
    const { data: sessData, error: sessError } = await supabase.auth.getSession();
    if (sessError || !sessData?.session?.user?.id) {
      _cachedContext = null;
      return null;
    }

    const userId = sessData.session.user.id;

    // Check if this user is a sub-user
    const { data: accessUser, error: accessError } = await supabase
      .from('access_users')
      .select('owner_user_id, role_id, status, access_roles(permissions)')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (accessError) {
      if (isNetworkError(accessError)) return loadEntitlementSnapshot(userId);
      _cachedContext = null;
      writeToStorage(null);
      return null;
    }
    if (accessUser?.status && accessUser.status !== 'active') {
      clearEntitlementSnapshot();
      _cachedContext = null;
      writeToStorage(null);
      return null;
    }
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

    writeToStorage(_cachedContext);
    return _cachedContext;
  } catch (err) {
    console.warn('[accessControl] getAccessContext error:', err?.message);
    _cachedContext = null;
    writeToStorage(null);
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
