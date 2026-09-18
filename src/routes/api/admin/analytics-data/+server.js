import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

/**
 * Admin Analytics Data Endpoint
 * 
 * Problem: The admin dashboard analytics page was showing false positives for quiet/high-risk accounts.
 * Healthy paying tenants with hundreds of sales appeared with sales_30d=0 and effective_last_seen=null.
 * 
 * Root cause: The analytics page was calling admin RPCs directly from the browser using anon key:
 *   - supabase.rpc('admin_get_users_last_seen')
 *   - supabase.rpc('admin_get_sales_counts', { days_ago: 30 })
 *   - supabase.rpc('admin_get_total_sales_value')
 * 
 * These RPCs have SECURITY DEFINER with guards: WHERE (auth.role() = 'service_role' OR is_active_super_admin())
 * When called from browser with anon key (even when logged in as super_admin), the WHERE clause filters
 * everything, returning empty arrays. This caused all profiles to show as sales_30d=0 and last_seen=null.
 * 
 * Solution: Create a server-side endpoint that uses supabaseAdmin (service_role) to call these RPCs.
 * The endpoint still requires super_admin authentication via JWT, but then uses service_role for the RPC calls.
 * 
 * This preserves security (only super_admins can call this endpoint) while ensuring the RPCs return real data.
 */

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function requireSuperAdmin(request, headers) {
  if (!supabaseAdmin) {
    return { errorResponse: json({ error: 'Supabase admin não configurado.' }, { status: 500, headers }) };
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { errorResponse: json({ error: 'Não autorizado.' }, { status: 401, headers }) };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { errorResponse: json({ error: 'Não autorizado.' }, { status: 401, headers }) };

  const { data: admin } = await supabaseAdmin
    .from('super_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!admin) return { errorResponse: json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers }) };
  return { admin };
}

export function OPTIONS({ request }) {
  const headers = corsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !headers['Access-Control-Allow-Origin']) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
}

export async function GET({ request }) {
  const headers = corsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !headers['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers });
  }

  try {
    const auth = await requireSuperAdmin(request, headers);
    if (auth.errorResponse) return auth.errorResponse;

    // Call the admin RPCs using supabaseAdmin (service_role)
    // These RPCs have SECURITY DEFINER and check for service_role OR is_active_super_admin()
    // When called with service_role, they bypass the super_admin check
    const [lastSeenRes, salesRes, revenueRes] = await Promise.all([
      supabaseAdmin.rpc('admin_get_users_last_seen'),
      supabaseAdmin.rpc('admin_get_sales_counts', { days_ago: 30 }),
      supabaseAdmin.rpc('admin_get_total_sales_value'),
    ]);

    if (lastSeenRes.error) {
      console.error('[admin/analytics-data] admin_get_users_last_seen error:', lastSeenRes.error);
      throw new Error(`Failed to get last seen data: ${lastSeenRes.error.message}`);
    }

    if (salesRes.error) {
      console.error('[admin/analytics-data] admin_get_sales_counts error:', salesRes.error);
      throw new Error(`Failed to get sales counts: ${salesRes.error.message}`);
    }

    if (revenueRes.error) {
      console.error('[admin/analytics-data] admin_get_total_sales_value error:', revenueRes.error);
      throw new Error(`Failed to get revenue data: ${revenueRes.error.message}`);
    }

    return json({
      lastSeen: lastSeenRes.data || [],
      sales: salesRes.data || [],
      revenue: revenueRes.data || [],
    }, { headers });
  } catch (error) {
    console.error('[admin/analytics-data] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao buscar dados de analytics.' }, { status: 500, headers });
  }
}
