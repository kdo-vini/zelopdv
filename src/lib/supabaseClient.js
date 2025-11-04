// Arquivo: src/lib/supabaseClient.js
// Descrição: Cliente Supabase centralizado para ser usado em todo o app.

import { createClient } from '@supabase/supabase-js';

// Variáveis definidas no .env com prefixo PUBLIC_ (SvelteKit) ou VITE_PUBLIC_ (fallback)
const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Cria o cliente do Supabase de forma segura para evitar erros 500 no SSR
 * quando as variáveis de ambiente ainda não estão configuradas.
 */
let client = null;
try {
	if (hasSupabaseConfig) {
		console.info('[AuthDebug] Creating Supabase client', { hasSupabaseConfig });
		client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
				// Garante uso de localStorage no cliente; evita SSR
				storage: typeof window !== 'undefined' ? window.localStorage : undefined,
			},
		});
		console.info('[AuthDebug] Supabase client created');
	} else {
		console.warn('[Supabase] Variáveis ausentes. Defina PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY (ou VITE_PUBLIC_*) no .env');
	}
} catch (e) {
	console.error('[Supabase] Falha ao criar cliente:', e?.message || e);
	client = null;
}

export const supabase = client;
