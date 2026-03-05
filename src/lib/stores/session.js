import { writable } from 'svelte/store';

/** Sessão Supabase Auth atual — null quando não autenticado */
export const sessionStore = writable(null);

/** Nome de exibição da empresa logada — null enquanto carrega */
export const companyNameStore = writable(null);
