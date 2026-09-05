import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const buildVersion =
  process.env.PUBLIC_APP_VERSION ||
  process.env.VITE_PUBLIC_APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  `${pkg.version}-${Date.now()}`;

// Supabase hostname for runtime caching strategy
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.VITE_PUBLIC_SUPABASE_URL ?? '';
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : '';

export default defineConfig({
  define: {
    __ZELO_BUILD_VERSION__: JSON.stringify(buildVersion)
  },
  test: {
    // Several legacy guard suites share module-level Supabase mocks. Running
    // files concurrently makes those mocks race and creates false timeouts.
    fileParallelism: false,
    include: ['tests/**/*.test.js'],
    exclude: [
      'node_modules/**',
      'e2e/**',
      '.claude/**',
      'admin-dashboard/**',
      'playwright-report/**',
      'test-results/**'
    ]
  },
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'prompt',
      manifest: {
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        name: 'Zelo PDV',
        short_name: 'ZeloPDV',
        description: 'Sistema de Ponto de Venda ágil e resiliente',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        navigateFallback: '/offline-shell',
        navigateFallbackAllowlist: [/^\/app(?:\/|$|\?)/, /^\/gestao\/caixa(?:\/|$|\?)/],
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        importScripts: ['/pwa-cache-cleanup.js'],
        runtimeCaching: [
          // Authenticated data uses the explicitly owner-scoped IndexedDB cache.
          // Only public images belong in an origin-wide service-worker cache.
          ...(supabaseHostname ? [{
            urlPattern: new RegExp(`^https://${supabaseHostname.replaceAll('.', '\\.')}/storage/v1/object/public/`),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-public-images-v2',
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }] : [])
        ]
      }
    })
  ]
});
