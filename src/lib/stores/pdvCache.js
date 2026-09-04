// Cache store for PDV data (products, categories, subcategories)
// Prevents redundant fetches when navigating between pages
import { writable, get } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { buildModifierGroups, mergeModifierLinkedProducts } from '$lib/zelomenuModifiers';

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

    const assertSameUser = (userId) => {
        if (get({ subscribe }).userId !== userId) throw new Error('Conta alterada durante o carregamento do catálogo.');
    };

    return {
        subscribe,

        // Get cached data or fetch if stale
        async getCategorias(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.categorias.loadedAt)) {
                return state.categorias.data;
            }

            const { data, error } = await supabase
                .from('categorias')
                .select('*')
                .order('ordem', { ascending: true });

            assertSameUser(state.userId);
            if (error) throw error;
            if (data) {
                update(s => ({ ...s, categorias: { data, loadedAt: Date.now() } }));
                return data;
            }
            throw new Error('Resposta inválida ao carregar categorias.');
        },

        async getSubcategorias(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.subcategorias.loadedAt)) {
                return state.subcategorias.data;
            }

            const { data, error } = await supabase
                .from('subcategorias')
                .select('*')
                .order('ordem', { ascending: true });

            assertSameUser(state.userId);
            if (error) throw error;
            if (data) {
                update(s => ({ ...s, subcategorias: { data, loadedAt: Date.now() } }));
                return data;
            }
            throw new Error('Resposta inválida ao carregar subcategorias.');
        },

        async getProdutos(forceRefresh = false) {
            const state = get({ subscribe });
            if (!forceRefresh && isCacheValid(state.produtos.loadedAt)) {
                return state.produtos.data;
            }

            const { data, error } = await supabase
                .from('produtos')
                .select('*, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
                .eq('ocultar_no_pdv', false)
                .order('nome', { ascending: true });

            assertSameUser(state.userId);
            if (error) throw error;
            if (data) {
                const enriched = await attachModifierGroups(data);
                assertSameUser(state.userId);
                update(s => ({ ...s, produtos: { data: enriched, loadedAt: Date.now() } }));
                return enriched;
            }
            throw new Error('Resposta inválida ao carregar produtos.');
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

async function attachModifierGroups(products) {
    const productIds = (products || []).map((product) => product.id).filter((id) => id != null);
    if (!productIds.length) return products || [];

    const groupsRes = await supabase
        .from('zelomenu_modifier_groups')
        .select('id, id_produto, nome, tipo, modo_preco, min_selecoes, max_selecoes, permite_quantidade, maximo_por_opcao, ativo, ordem')
        .in('id_produto', productIds)
        .order('ordem', { ascending: true });
    if (groupsRes.error) throw groupsRes.error;

    const rawGroups = groupsRes.data || [];
    if (!rawGroups.length) {
        return (products || []).map((product) => ({ ...product, modifierGroups: [] }));
    }

    const groupIds = rawGroups.map((group) => group.id);
    const optionsRes = await supabase
        .from('zelomenu_modifier_options')
        .select('id, id_grupo, nome, price_delta, ativo, ordem')
        .in('id_grupo', groupIds)
        .order('ordem', { ascending: true });
    if (optionsRes.error) throw optionsRes.error;

    const options = optionsRes.data || [];
    const optionIds = options.map((option) => option.id);
    let links = [];
    if (optionIds.length) {
        const linksRes = await supabase
            .from('zelomenu_modifier_option_products')
            .select('id_opcao, id_produto, price_override')
            .in('id_opcao', optionIds);
        if (linksRes.error) throw linksRes.error;
        links = linksRes.data || [];
    }

    const visibleProductIds = new Set((products || []).map((product) => Number(product.id)));
    const missingLinkedProductIds = [...new Set(
        links
            .map((link) => Number(link.id_produto))
            .filter((id) => id && !visibleProductIds.has(id)),
    )];
    let linkedProducts = [];
    if (missingLinkedProductIds.length) {
        const linkedProductsRes = await supabase
            .from('produtos')
            .select('id, nome, preco, controlar_estoque, estoque_atual, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
            .in('id', missingLinkedProductIds);
        if (linkedProductsRes.error) throw linkedProductsRes.error;
        linkedProducts = linkedProductsRes.data || [];
    }

    const groupsByProductId = new Map();
    for (const group of buildModifierGroups({
        groups: rawGroups,
        options,
        links,
        products: mergeModifierLinkedProducts(products, linkedProducts),
    })) {
        const current = groupsByProductId.get(group.productId) || [];
        current.push(group);
        groupsByProductId.set(group.productId, current);
    }

    return (products || []).map((product) => ({
        ...product,
        modifierGroups: groupsByProductId.get(product.id) || []
    }));
}

export const pdvCache = createPdvCache();
