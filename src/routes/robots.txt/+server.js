import { buildRobotsTxt } from '$lib/seo/robots';

// Substitui o static/robots.txt: gerado a partir de DISALLOWED_PATHS e
// AI_CRAWLERS em src/lib/seo/robots.js, com Sitemap derivado de SITE_URL.
export const prerender = true;

export function GET() {
  return new Response(buildRobotsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=0, s-maxage=3600'
    }
  });
}
