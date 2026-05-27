import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '$env/dynamic/private';

const supabaseUrl =
  env.SUPABASE_URL ||
  env.VITE_PUBLIC_SUPABASE_URL ||
  env.PUBLIC_SUPABASE_URL;

const supabaseAnonKey =
  env.PUBLIC_SUPABASE_ANON_KEY ||
  env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.warn('[supabaseAuth] URL ausente. Configure SUPABASE_URL/PUBLIC_SUPABASE_URL.');
}
if (!supabaseAnonKey) {
  console.warn('[supabaseAuth] ANON key ausente. Configure PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabaseAuth = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: ws,
      },
    })
  : null;
