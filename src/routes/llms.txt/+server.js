import { buildLlmsTxt } from '$lib/seo/llmsContent';

// Gerado a partir dos data modules do produto (pricing.js, blog/posts.js,
// data/segmentLandingPages.js, data/competitorComparisons.js,
// data/extensoes.js) — nunca editar preço/escopo diretamente aqui.
export const prerender = true;

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=0, s-maxage=3600'
    }
  });
}
