import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

// Supabase hostname for runtime caching strategy
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.VITE_PUBLIC_SUPABASE_URL ?? '';
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : '';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      manifest: {
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
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        runtimeCaching: [
          // Supabase REST API — NetworkFirst: fresh data when online, cached data offline
          ...(supabaseHostname ? [{
            urlPattern: ({ url }) =>
              url.hostname === supabaseHostname &&
              (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 5 * 60 // 5 minutes
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }] : []),
          // Supabase Storage (logos, images) — StaleWhileRevalidate: fast load, updates in background
          ...(supabaseHostname ? [{
            urlPattern: ({ url }) =>
              url.hostname === supabaseHostname &&
              url.pathname.startsWith('/storage/v1/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage',
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
