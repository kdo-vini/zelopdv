// Admin activity logger
import { supabase } from './supabaseAdmin'

/**
 * Log admin action to database
 * @param {Object} params
 * @param {string} params.adminId - Admin UUID
 * @param {string} params.action - Action name (e.g., 'extend_subscription')
 * @param {string} params.targetUserId - Target user UUID (optional)
 * @param {Object} params.details - Additional details (optional)
 */
export async function logAdminAction({ adminId, action, targetUserId = null, details = {} }) {
    try {
        // Get admin email
        const { data: admin } = await supabase
            .from('super_admins')
            .select('email')
            .eq('id', adminId)
            .single()

        // Get target email if provided
        let targetEmail = null
        if (targetUserId) {
            const { data: user } = await supabase.auth.admin.getUserById(targetUserId)
            targetEmail = user?.email
        }

        // Insert log
        const { error } = await supabase
            .from('admin_activity_logs')
            .insert({
                admin_id: adminId,
                admin_email: admin?.email,
                action,
                target_user_id: targetUserId,
                target_email: targetEmail,
                details,
                created_at: new Date().toISOString()
            })

        if (error) {
            console.error('[Logger] Failed to log action:', error)
        }
    } catch (err) {
        console.error('[Logger] Error:', err)
    }
}

/**
 * Get recent admin activity logs
 * @param {number} limit - Number of logs to fetch
 */
export async function getRecentLogs(limit = 50) {
    const { data, error } = await supabase
        .from('admin_activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('[Logger] Failed to fetch logs:', error)
        return []
    }

    return data || []
}

/**
 * Get logs for specific admin
 */
export async function getLogsByAdmin(adminId, limit = 50) {
    const { data, error } = await supabase
        .from('admin_activity_logs')
        .select('*')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false })
        .limit(limit)

    return data || []
}
