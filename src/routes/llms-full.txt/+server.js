import { buildLlmsFullTxt } from '$lib/seo/llmsContent';

// Conteúdo completo (FAQs, comparativos e texto integral dos posts do blog),
// gerado a partir dos data modules do produto. Ver src/lib/seo/llmsContent.js.
export const prerender = true;

export function GET() {
  return new Response(buildLlmsFullTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=0, s-maxage=3600'
    }
  });
}
