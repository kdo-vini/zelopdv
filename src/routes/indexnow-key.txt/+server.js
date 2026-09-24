import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// NÃO prerenderizado: precisa ler a env var em runtime. O IndexNow protocol
// exige que essa chave fique acessível em /<key>.txt na raiz do domínio,
// respondendo com o próprio valor da chave em texto puro.
export const prerender = false;

export function GET() {
  const key = env.INDEXNOW_KEY;
  if (!key) {
    throw error(404, 'INDEXNOW_KEY not configured');
  }

  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
