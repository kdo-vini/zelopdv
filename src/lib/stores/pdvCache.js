// Cache store for PDV data (products, categories, subcategories)
// Prevents redundant fetches when navigating between pages
import { writable, get } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Store structure
const createPdvCache = () => {
    const { subscribe, set, update } = writable({
        produtos: { data: [], loadedAt: null },
        categorias: { data: [], loadedAt: null },
        subcategorias: { data: [], loadedAt: null },
        userId: null // Track which user the cache belongs to
    });

    const isCacheValid = (loadedAt) => {
        if (!loadedAt) return false;
        return (Date.now() - loadedAt) < CACHE_TTL;
    };

    return {
        subscribe,

        // Get cached data or fetch if stale
        async getCategorias(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.categorias.loadedAt) && state.categorias.data.length > 0) {
                return state.categorias.data;
            }

            const { data, error } = await supabase
                .from('categorias')
                .select('*')
                .order('ordem', { ascending: true });

            if (!error && data) {
                update(s => ({ ...s, categorias: { data, loadedAt: Date.now() } }));
                return data;
            }
            return state.categorias.data; // Return stale data on error
        },

        async getSubcategorias(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.subcategorias.loadedAt) && state.subcategorias.data.length > 0) {
                return state.subcategorias.data;
            }

            const { data, error } = await supabase
                .from('subcategorias')
                .select('*')
                .order('ordem', { ascending: true });

            if (!error && data) {
                update(s => ({ ...s, subcategorias: { data, loadedAt: Date.now() } }));
                return data;
            }
            return state.subcategorias.data;
        },

        async getProdutos(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.produtos.loadedAt) && state.produtos.data.length > 0) {
                return state.produtos.data;
            }

            const { data, error } = await supabase
                .from('produtos')
                .select('*')
                .eq('ocultar_no_pdv', false)
                .order('nome', { ascending: true });

            if (!error && data) {
                update(s => ({ ...s, produtos: { data, loadedAt: Date.now() } }));
                return data;
            }
            return state.produtos.data;
        },

        // Invalidate cache (call after CRUD operations)
        invalidateProdutos() {
            update(s => ({ ...s, produtos: { ...s.produtos, loadedAt: null } }));
        },
        invalidateCategorias() {
            update(s => ({ ...s, categorias: { ...s.categorias, loadedAt: null } }));
        },
        invalidateSubcategorias() {
            update(s => ({ ...s, subcategorias: { ...s.subcategorias, loadedAt: null } }));
        },
        invalidateAll() {
            set({
                produtos: { data: [], loadedAt: null },
                categorias: { data: [], loadedAt: null },
                subcategorias: { data: [], loadedAt: null },
                userId: null
            });
        },

        // Set user ID (invalidates if different user logs in)
        setUserId(userId) {
            const state = get({ subscribe });
            if (state.userId && state.userId !== userId) {
                // Different user, clear cache
                set({
                    produtos: { data: [], loadedAt: null },
                    categorias: { data: [], loadedAt: null },
                    subcategorias: { data: [], loadedAt: null },
                    userId
                });
            } else if (!state.userId) {
                update(s => ({ ...s, userId }));
            }
        }
    };
};

export const pdvCache = createPdvCache();
