import { redirect } from '@sveltejs/kit';

const KNOWN_SLUGS = new Set(['mesas', 'pedidos-cozinha']);

export async function load({ params }) {
  if (KNOWN_SLUGS.has(params.slug)) {
    throw redirect(301, `/extensoes#${params.slug}`);
  }
  throw redirect(301, '/extensoes');
}
