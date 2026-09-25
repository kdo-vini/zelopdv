import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/** Living reference of the Zelo Design System. Available locally and on Vercel previews, never in production. */
export function load() {
  if (env.VERCEL_ENV === 'production') throw error(404, 'Not found');
  return {};
}
