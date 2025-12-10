// Supabase client for admin dashboard
// Uses ANON KEY - RLS is disabled on admin tables for simplicity
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Admin] Supabase credentials missing')
    console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

// Create admin client
// Note: RLS is disabled on subscriptions, empresa_perfil, and super_admins
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
