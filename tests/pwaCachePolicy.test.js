import { afterEach, expect, it, vi } from 'vitest';
const { capture } = vi.hoisted(() => ({ capture: vi.fn(() => ({})) }));
vi.mock('@vite-pwa/sveltekit', () => ({ SvelteKitPWA: capture }));
vi.mock('@sveltejs/kit/vite', () => ({ sveltekit: () => ({}) }));
afterEach(() => vi.unstubAllEnvs());

it('never serves authenticated API or private storage requests from a shared cache', async () => {
  vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  await import('../vite.config.js');
  const rules = capture.mock.calls[0][0].workbox.runtimeCaching;
  for (const path of ['/rest/v1/produtos', '/auth/v1/user', '/storage/v1/object/authenticated/private/file.png']) {
    const url = new URL(`https://project.supabase.co${path}`);
    const matches = rules.some(({ urlPattern }) => urlPattern instanceof RegExp ? urlPattern.test(url.href) : urlPattern({ url }));
    expect(matches, path).toBe(false);
  }
  expect(rules.some(({ urlPattern }) => urlPattern instanceof RegExp && urlPattern.test('https://project.supabase.co/storage/v1/object/public/logos/logo.png'))).toBe(true);
});
