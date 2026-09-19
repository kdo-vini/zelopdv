import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const prerender = false;
export const ssr = false;

export function load() {
  if (!dev) throw error(404, 'Not found');
  return {};
}
