import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(resolve('src/routes/+layout.svelte'), 'utf8');

function extractFunctionBody(source, startMarker) {
  const start = source.indexOf(startMarker);
  expect(start, `expected to find "${startMarker}" in +layout.svelte`).toBeGreaterThan(-1);
  const end = source.indexOf('\n    };', start);
  expect(end, `expected to find the end of "${startMarker}" in +layout.svelte`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('root layout navigation guard (maybeNavigate)', () => {
  it('does not capture a stale onMount-scoped `path` const that shadows the reactive $: path', () => {
    // This exact declaration used to shadow `$: path = $page.url.pathname` for the
    // whole lifetime of onMount, so every check inside maybeNavigate decided off the
    // URL at mount time instead of the URL at decision time (stale after client-side
    // goto() navigations, e.g. the /cadastro <-> /login ping-pong seen in prod).
    expect(layoutSource).not.toContain('const path = window.location.pathname;');
  });

  it('reads window.location.pathname fresh at the top of every maybeNavigate call', () => {
    const body = extractFunctionBody(layoutSource, 'const maybeNavigate = async () => {');
    expect(body).toMatch(/const currentPath = window\.location\.pathname;/);
  });

  it('has every branch inside maybeNavigate decide off currentPath, not the old outer path', () => {
    const body = extractFunctionBody(layoutSource, 'const maybeNavigate = async () => {');
    // Bare `path` used in a comparison/method call (as opposed to `currentPath`,
    // `publicPaths`, `isPublicPath`, `subscriptionRequiredPrefixes`, etc.) is the
    // signature of the stale-variable bug regressing.
    expect(body).not.toMatch(/(?<!current)\bpath\s*(?:!==|===|\.startsWith)/);
    expect(body).not.toMatch(/isPublicPath\(path\)/);
    expect(body).not.toMatch(/matchesProtectedPrefix\(path,/);
    expect(body.match(/isPublicPath\(currentPath\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('lets /cadastro finish its own setSession -> goto(/perfil?msg=complete) instead of racing it', () => {
    const body = extractFunctionBody(layoutSource, 'const maybeNavigate = async () => {');
    // Without this, a fresh signup on /cadastro (session just created, profile still
    // incomplete) got a competing `window.location.href` full reload from the layout
    // while /cadastro's own `goto('/perfil?msg=complete')` was in flight, sometimes
    // mounting the onboarding wizard twice.
    expect(body).toMatch(/if \(currentPath === '\/cadastro'\) return;/);
  });

  it('keeps the top-level reactive path binding used by the template intact', () => {
    expect(layoutSource).toMatch(/\$:\s*path = \$page\.url\.pathname;/);
  });
});

describe('admin PIN removal is complete', () => {
  const removedFiles = [
    'src/lib/adminPinPrompt.js',
    'src/lib/components/AdminLock.svelte',
    'src/lib/components/PinSetupModal.svelte',
    'src/lib/stores/adminStore.js',
    'src/routes/api/auth/admin-pin/+server.js',
    'src/routes/api/auth/pin-reset-otp/+server.js',
  ];

  it.each(removedFiles)('%s no longer exists', (relativePath) => {
    expect(existsSync(resolve(relativePath))).toBe(false);
  });

  it('leaves no PIN admin references in src or tests (empresaPerfilPinSelectSchema.test.js is exempt: DB column history)', () => {
    const pattern = /admin-pin|adminUnlocked|AdminLock|PinSetupModal|pin-reset-otp|adminStore/;
    const candidateFiles = [
      'src/routes/perfil/+page.svelte',
      'src/routes/+layout.svelte',
      'src/routes/relatorios/+page.svelte',
      'src/routes/gestao/despesas/+page.svelte',
      'src/hooks.server.js',
    ];
    for (const file of candidateFiles) {
      const source = readFileSync(resolve(file), 'utf8');
      expect(source, `${file} should not reference removed PIN admin code`).not.toMatch(pattern);
    }
  });
});
