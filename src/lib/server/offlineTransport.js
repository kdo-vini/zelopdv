import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import ws from 'ws';

// Request-scoped authenticated client: never run offline writes as service_role.
export function offlineClient(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  const url = env.SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY || env.VITE_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Offline server configuration unavailable');
  return createClient(url, key, { global: {headers: { Authorization: authorization }},
    auth: {persistSession: false, autoRefreshToken: false}, realtime: {transport: ws} });
}

export const offlineResponseHeaders = { 'cache-control': 'no-store' };
