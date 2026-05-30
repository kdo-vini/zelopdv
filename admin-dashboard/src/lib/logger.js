// Admin activity logger
import { supabase } from './supabaseClient'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5173' : 'https://www.zelopdv.com.br'

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
}

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
        const token = await getAccessToken()
        if (!token) {
            console.error('[Logger] No active session to authenticate admin log request')
            return
        }

        const response = await fetch(`${API_BASE}/api/admin/activity-logs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                adminId,
                action,
                targetUserId,
                details,
            }),
        })

        if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            console.error('[Logger] Failed to log action:', body.error || response.statusText)
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
    try {
        const token = await getAccessToken()
        if (!token) return []

        const response = await fetch(`${API_BASE}/api/admin/activity-logs?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        })

        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
            console.error('[Logger] Failed to fetch logs:', body.error || response.statusText)
            return []
        }

        return body.logs || []
    } catch (err) {
        console.error('[Logger] Failed to fetch logs:', err)
        return []
    }
}

/**
 * Get logs for specific admin
 */
export async function getLogsByAdmin(adminId, limit = 50) {
    try {
        const token = await getAccessToken()
        if (!token) return []

        const response = await fetch(`${API_BASE}/api/admin/activity-logs?adminId=${encodeURIComponent(adminId)}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        })

        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
            console.error('[Logger] Failed to fetch admin logs:', body.error || response.statusText)
            return []
        }

        return body.logs || []
    } catch (err) {
        console.error('[Logger] Failed to fetch admin logs:', err)
        return []
    }
}
