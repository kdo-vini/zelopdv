import { json } from '@sveltejs/kit';
import { APP_VERSION } from '$lib/version';

export const prerender = false;

export function GET() {
  return json(
    {
      version: APP_VERSION,
      checkedAt: new Date().toISOString()
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      }
    }
  );
}
