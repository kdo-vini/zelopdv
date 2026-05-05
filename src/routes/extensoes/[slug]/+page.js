import { error } from '@sveltejs/kit';
import { getExtensaoBySlug } from '$lib/data/extensoes';

// Mantém o padrão das demais marketing pages (SSR on-demand) — Vercel faz edge cache.
// Se um dia quisermos prerender, adicionar `export const prerender = true` + `entries()`
// e corrigir o link /atualizacoes no MarketingFooter, que hoje é 404.

export async function load({ params }) {
  const page = getExtensaoBySlug(params.slug);
  if (!page) throw error(404, 'Extensão não encontrada');
  return { page };
}
