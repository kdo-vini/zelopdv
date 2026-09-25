import { describe, expect, it } from 'vitest';
import {
  APP_SURFACE_PREFIXES,
  LIVE_SURFACES,
  applySurfaceToDocument,
  currentSurface,
  zeloSurface,
  htmlClassForSurface,
  previewFromCookie,
  previewFromQuery,
  resolveSurface,
  surfaceForPath,
} from '../src/lib/theme/surface.js';

describe('surfaceForPath', () => {
  it.each([
    '/app', '/app/mesas/12', '/app/pedidos/cozinha', '/gestao', '/gestao/produtos',
    '/relatorios', '/perfil', '/perfil.html', '/assinatura', '/assinatura/sucesso',
    '/ferramentas', '/ferramentas/precificacao', '/ferramentas/cardapio', '/offline-shell',
  ])('%s is internal (app)', (path) => {
    expect(surfaceForPath(path)).toBe('app');
  });

  it.each([
    '/', '/para-padaria', '/vs-planilha', '/vs-bling', '/blog', '/blog/post-x', '/precificacao',
    '/extensoes', '/comparativos', '/zelo-impressao', '/sobre', '/contato', '/termos',
    '/privacidade', '/landing', '/pascoa', '/login', '/cadastro', '/esqueci-senha',
    '/redefinir-senha', '/auth/callback', '/indica/ABC123', '/dev/design-system',
  ])('%s is customer-facing (brand)', (path) => {
    expect(surfaceForPath(path)).toBe('brand');
  });

  it('does not treat lookalike prefixes as internal', () => {
    expect(surfaceForPath('/application')).toBe('brand');
    expect(surfaceForPath('/gestaorama')).toBe('brand');
    expect(surfaceForPath('/apps')).toBe('brand');
  });

  it('keeps the app prefixes aligned with the sidebar layout prefixes', () => {
    expect(APP_SURFACE_PREFIXES).toEqual(expect.arrayContaining(['/gestao', '/app', '/relatorios', '/perfil', '/assinatura', '/ferramentas']));
  });
});

describe('resolveSurface', () => {
  it('renders legacy everywhere while no surface is live and there is no preview', () => {
    expect(LIVE_SURFACES).toEqual({ brand: false, app: false });
    expect(resolveSurface({ pathname: '/app' })).toBe('legacy');
    expect(resolveSurface({ pathname: '/' })).toBe('legacy');
  });

  it('renders the real surface with the preview flag', () => {
    expect(resolveSurface({ pathname: '/app', preview: true })).toBe('app');
    expect(resolveSurface({ pathname: '/login', preview: true })).toBe('brand');
  });

  it('turns on one surface at a time as phases go live', () => {
    const live = { brand: true, app: false };
    expect(resolveSurface({ pathname: '/', live })).toBe('brand');
    expect(resolveSurface({ pathname: '/gestao', live })).toBe('legacy');
    expect(resolveSurface({ pathname: '/gestao', live, preview: true })).toBe('app');
  });
});

describe('preview flag parsing', () => {
  it.each([['novo', 'on'], ['NOVO', 'on'], ['v2', 'on'], ['atual', 'off'], ['legado', 'off'], ['', null], [null, null], ['x', null]])(
    '?tema=%s → %s', (value, expected) => {
      expect(previewFromQuery(value)).toBe(expected);
    },
  );

  it('only the exact cookie value enables the preview', () => {
    expect(previewFromCookie('v2')).toBe(true);
    expect(previewFromCookie('1')).toBe(false);
    expect(previewFromCookie(undefined)).toBe(false);
  });
});

describe('html class and client sync', () => {
  it('keeps `dark` on dark surfaces only', () => {
    expect(htmlClassForSurface('legacy')).toBe('dark');
    expect(htmlClassForSurface('brand')).toBe('dark');
    expect(htmlClassForSurface('app')).toBe('');
  });

  function fakeDocument(cookie) {
    const classes = new Set(['dark']);
    return {
      cookie,
      documentElement: {
        dataset: { surface: 'legacy' },
        classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), has: (n) => classes.has(n) },
      },
    };
  }

  it('applies the preview surface on client navigation', () => {
    const doc = fakeDocument('foo=1; zelo_ui=v2');
    applySurfaceToDocument(doc, '/gestao/caixa');
    expect(doc.documentElement.dataset.surface).toBe('app');
    expect(doc.documentElement.classList.has('dark')).toBe(false);
    applySurfaceToDocument(doc, '/blog');
    expect(doc.documentElement.dataset.surface).toBe('brand');
    expect(doc.documentElement.classList.has('dark')).toBe(true);
  });

  it('publishes the surface to the stores that switch layouts', () => {
    let surface; let zelo;
    const stopA = currentSurface.subscribe((v) => (surface = v));
    const stopB = zeloSurface.subscribe((v) => (zelo = v));
    applySurfaceToDocument(fakeDocument('zelo_ui=v2'), '/app');
    expect(surface).toBe('app');
    expect(zelo).toBe(true);
    applySurfaceToDocument(fakeDocument(''), '/app');
    expect(surface).toBe('legacy');
    expect(zelo).toBe(false);
    stopA(); stopB();
  });

  it('stays legacy without the cookie', () => {
    const doc = fakeDocument('foo=1');
    applySurfaceToDocument(doc, '/app');
    expect(doc.documentElement.dataset.surface).toBe('legacy');
    expect(doc.documentElement.classList.has('dark')).toBe(true);
  });
});
