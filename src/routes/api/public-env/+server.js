import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// Exposes public Supabase config for static pages (perfil.html) safely.
export function GET() {
  // Prefer PUBLIC_ (SvelteKit) and fall back to VITE_PUBLIC_ (legacy Vite prefix)
  const supabaseUrl =
    publicEnv.PUBLIC_SUPABASE_URL ||
    privateEnv.PUBLIC_SUPABASE_URL ||
    privateEnv.VITE_PUBLIC_SUPABASE_URL ||
    '';

  const supabaseAnonKey =
    publicEnv.PUBLIC_SUPABASE_ANON_KEY ||
    privateEnv.PUBLIC_SUPABASE_ANON_KEY ||
    privateEnv.VITE_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  return json({ supabaseUrl, supabaseAnonKey });
}
