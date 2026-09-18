// Server-side Supabase client for the admin dashboard.
// Uses the service role key (never expose to the browser). Super-admin
// checks still happen in handlers before any RPC call.
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl =
  env.SUPABASE_URL ||
  env.VITE_PUBLIC_SUPABASE_URL ||
  env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.warn('[admin supabaseAdmin] URL ausente.');
}
if (!supabaseServiceKey) {
  console.warn('[admin supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY ausente.');
}

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;
