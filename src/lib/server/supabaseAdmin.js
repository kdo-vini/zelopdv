// Server-side Supabase client with service role key (bypasses RLS)
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl =
    env.SUPABASE_URL ||
    env.VITE_PUBLIC_SUPABASE_URL ||
    env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    console.warn('[supabaseAdmin] URL ausente. Configure SUPABASE_URL no ambiente do servidor.');
}
if (!supabaseServiceKey) {
    console.warn('[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY ausente. Configure na hospedagem (nunca exponha no frontend).');
}

// Create admin client with service role key (bypasses RLS)
// Will be null during build if env var not set
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;
