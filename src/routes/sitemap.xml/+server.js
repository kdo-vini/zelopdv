import { segmentPages } from '$lib/data/segmentLandingPages';
import { competitorComparisons } from '$lib/data/competitorComparisons';
import { publishedPosts } from '$lib/blog/posts';

// Sitemap dinâmico: monta as URLs a partir dos data files, então páginas novas
// (segmentos, comparativos, posts) entram automaticamente sem edição manual.
export const prerender = true;

const BASE = 'https://zelopdv.com.br';

// Rotas estáticas de marketing/auth. Páginas de produto logado ficam de fora
// (estão em Disallow no robots.txt).
const staticRoutes = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/cadastro', changefreq: 'monthly', priority: '0.8' },
  { path: '/login', changefreq: 'monthly', priority: '0.5' },
  { path: '/precificacao', changefreq: 'monthly', priority: '0.8' },
  { path: '/extensoes', changefreq: 'monthly', priority: '0.8' },
  { path: '/comparativos', changefreq: 'monthly', priority: '0.8' },
  { path: '/vs-planilha', changefreq: 'monthly', priority: '0.8' },
  { path: '/contato', changefreq: 'monthly', priority: '0.8' },
  { path: '/blog', changefreq: 'weekly', priority: '0.7' }
];

function urlEntry({ loc, changefreq, priority, lastmod }) {
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>'
  ]
    .filter(Boolean)
    .join('\n');
}

export function GET() {
  const entries = [];

  for (const route of staticRoutes) {
    entries.push(urlEntry({ loc: `${BASE}${route.path}`, changefreq: route.changefreq, priority: route.priority }));
  }

  // Landing pages por segmento (/para-*)
  for (const page of Object.values(segmentPages)) {
    entries.push(urlEntry({ loc: `${BASE}/${page.slug}`, changefreq: 'monthly', priority: '0.8' }));
  }

  // Páginas comparativas (/vs-*)
  for (const comparison of Object.values(competitorComparisons)) {
    entries.push(urlEntry({ loc: `${BASE}/${comparison.slug}`, changefreq: 'monthly', priority: '0.8' }));
  }

  // Posts do blog
  for (const post of publishedPosts) {
    entries.push(
      urlEntry({
        loc: `${BASE}/blog/${post.slug}`,
        lastmod: post.publishedAt,
        changefreq: 'monthly',
        priority: '0.7'
      })
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'max-age=0, s-maxage=3600'
    }
  });
}
