// Supabase client for admin dashboard.
// Uses the public ANON KEY (NOT service-role). RLS is disabled on the tables
// this dashboard reads/writes (subscriptions, empresa_perfil, super_admins),
// and access is gated by the super_admins check (see isSuperAdmin below), not by RLS.
// If you add a new admin table, either disable RLS on it or route the query
// through a server-side handler that uses the real service-role key.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
    import.meta.env.VITE_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
    import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Admin] Supabase credentials missing')
    console.error('Required: VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true
    }
})

// Check if user is a super admin
export async function isSuperAdmin(userId) {
    if (!userId) return false

    const { data, error } = await supabase
        .from('super_admins')
        .select('id, role, permissions, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

    if (error || !data) return false

    return true
}

// Get admin info
export async function getAdminInfo(userId) {
    const { data } = await supabase
        .from('super_admins')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

    return data
}

// Update last login
export async function updateLastLogin(adminId) {
    await supabase
        .from('super_admins')
        .update({ last_login: new Date().toISOString() })
        .eq('id', adminId)
}
