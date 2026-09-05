// Cache store for PDV data (products, categories, subcategories)
// Prevents redundant fetches when navigating between pages
import { writable, get } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { buildModifierGroups, mergeModifierLinkedProducts } from '$lib/zelomenuModifiers';

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;
const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;

async function readPages(createQuery, assertCurrentUser) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        assertCurrentUser();
        const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1);
        assertCurrentUser();
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Resposta inválida ao carregar catálogo.');
        rows.push(...data);
        if (data.length < PAGE_SIZE) return rows;
    }
}

async function readIdBatches(ids, createQuery, assertCurrentUser) {
    const uniqueIds = [...new Set(ids)];
    const rows = [];
    for (let from = 0; from < uniqueIds.length; from += ID_BATCH_SIZE) {
        const batch = uniqueIds.slice(from, from + ID_BATCH_SIZE);
        rows.push(...await readPages(() => createQuery(batch), assertCurrentUser));
    }
    return rows;
}

// Store structure
const createPdvCache = () => {
    let userGeneration = 0;
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

    const guardCurrentUser = (userId) => {
        if (!userId) throw new Error('Identifique a conta antes de carregar o catálogo.');
        const generation = userGeneration;
        return () => {
            if (get({ subscribe }).userId !== userId || userGeneration !== generation) {
                throw new Error('Conta alterada durante o carregamento do catálogo.');
            }
        };
    };

    return {
        subscribe,

        // Get cached data or fetch if stale
        async getCategorias(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.categorias.loadedAt)) {
                return state.categorias.data;
            }

            const assertCurrentUser = guardCurrentUser(state.userId);
            const data = await readPages(() => supabase
                .from('categorias')
                .select('*')
                .eq('id_usuario', state.userId)
                .order('ordem', { ascending: true })
                .order('id', { ascending: true }), assertCurrentUser);
            assertCurrentUser();
            update(s => ({ ...s, categorias: { data, loadedAt: Date.now() } }));
            return data;
        },

        async getSubcategorias(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.subcategorias.loadedAt)) {
                return state.subcategorias.data;
            }

            const assertCurrentUser = guardCurrentUser(state.userId);
            const data = await readPages(() => supabase
                .from('subcategorias')
                .select('*')
                .eq('id_usuario', state.userId)
                .order('ordem', { ascending: true })
                .order('id', { ascending: true }), assertCurrentUser);
            assertCurrentUser();
            update(s => ({ ...s, subcategorias: { data, loadedAt: Date.now() } }));
            return data;
        },

        async getProdutos(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.produtos.loadedAt)) {
                return state.produtos.data;
            }

            const assertCurrentUser = guardCurrentUser(state.userId);
            const data = await readPages(() => supabase
                .from('produtos')
                .select('*, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
                .eq('id_usuario', state.userId)
                .eq('ocultar_no_pdv', false)
                .order('nome', { ascending: true })
                .order('id', { ascending: true }), assertCurrentUser);
            const enriched = await attachModifierGroups(data, state.userId, assertCurrentUser);
            assertCurrentUser();
            update(s => ({ ...s, produtos: { data: enriched, loadedAt: Date.now() } }));
            return enriched;
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
            userGeneration++;
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
            if (state.userId !== userId) userGeneration++;
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

async function attachModifierGroups(products, userId, assertCurrentUser) {
    const productIds = (products || []).map((product) => product.id).filter((id) => id != null);
    if (!productIds.length) return products || [];

    const rawGroups = await readIdBatches(productIds, (batch) => supabase
        .from('zelomenu_modifier_groups')
        .select('id, id_produto, nome, tipo, modo_preco, min_selecoes, max_selecoes, permite_quantidade, maximo_por_opcao, minimo_total_quantidade, maximo_total_quantidade, ativo, ordem')
        .eq('id_usuario', userId)
        .in('id_produto', batch)
        .order('ordem', { ascending: true })
        .order('id', { ascending: true }), assertCurrentUser);
    const pizzaStockIds = (products || []).flatMap((product) => (product.pizza_config?.sizes || []).map((size) => size.stockProductId)).filter(Boolean);
    if (!rawGroups.length && !pizzaStockIds.length) {
        return (products || []).map((product) => ({ ...product, modifierGroups: [] }));
    }

    const groupIds = rawGroups.map((group) => group.id);
    const options = await readIdBatches(groupIds, (batch) => supabase
        .from('zelomenu_modifier_options')
        .select('id, id_grupo, nome, price_delta, ativo, ordem')
        .eq('id_usuario', userId)
        .in('id_grupo', batch)
        .order('ordem', { ascending: true })
        .order('id', { ascending: true }), assertCurrentUser);
    const optionIds = options.map((option) => option.id);
    let links = [];
    if (optionIds.length) {
        links = await readIdBatches(optionIds, (batch) => supabase
            .from('zelomenu_modifier_option_products')
            .select('id_opcao, id_produto, price_override')
            .eq('id_usuario', userId)
            .in('id_opcao', batch)
            .order('id_opcao', { ascending: true }), assertCurrentUser);
    }

    const visibleProductIds = new Set((products || []).map((product) => Number(product.id)));
    const missingLinkedProductIds = [...new Set(
        [...links.map((link) => Number(link.id_produto)), ...pizzaStockIds]
            .filter((id) => id && !visibleProductIds.has(id)),
    )];
    let linkedProducts = [];
    if (missingLinkedProductIds.length) {
        linkedProducts = await readIdBatches(missingLinkedProductIds, (batch) => supabase
            .from('produtos')
            .select('id, nome, preco, controlar_estoque, estoque_atual, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
            .eq('id_usuario', userId)
            .in('id', batch)
            .order('id', { ascending: true }), assertCurrentUser);
    }

    const allProducts = mergeModifierLinkedProducts(products, linkedProducts);
    const groupsByProductId = new Map();
    for (const group of buildModifierGroups({
        groups: rawGroups,
        options,
        links,
        products: allProducts,
    })) {
        const current = groupsByProductId.get(group.productId) || [];
        current.push(group);
        groupsByProductId.set(group.productId, current);
    }

    return (products || []).map((product) => ({
        ...product,
        modifierGroups: groupsByProductId.get(product.id) || [],
        ...(product.tipo_produto === 'pizza' ? { pizzaStockProducts: allProducts.filter((candidate) => (product.pizza_config?.sizes || []).some((size) => size.stockProductId === candidate.id) || links.some((link) => Number(link.id_produto) === candidate.id)) } : {})
    }));
}

export const pdvCache = createPdvCache();
