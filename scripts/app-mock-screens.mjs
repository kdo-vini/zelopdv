#!/usr/bin/env node
/**
 * Screenshots the real /app (or any authenticated route) with Supabase mocked at the network layer —
 * fake session, active subscription, complete profile, small catalog and an open caixa.
 * Dev server must run with the mock project URL:
 *   VITE_PUBLIC_SUPABASE_URL=https://mockproj.supabase.co VITE_PUBLIC_SUPABASE_ANON_KEY=anon npx vite dev --port 5175
 * Then:
 *   BASE=http://localhost:5175 OUT=/tmp/app ADD="X-Bacon,X-Burger" KEYS=F9 VP=390x844 OPEN_CART=1 node scripts/app-mock-screens.mjs
 * Env: ROUTE (default /app), QS (default ?tema=novo; "" for legacy), ADD (tabs/radios/buttons to click by accessible name,
 * in order), KEYS (keys to press after), OPEN_CART, VP (WxH), OUT (png path without extension), CHROMIUM_PATH,
 * STEPS (after the rest: comma list of `key:<Key>`, `click:<accessible name>`, `wait:<ms>`), MOTION=1 (real motion),
 * NO_CAIXA=1 (no open caixa), EMPTY=1 (empty catalog).
 * docs/DESIGN_SYSTEM.md → Verificação.
 */
import { chromium } from '@playwright/test';
const BASE = process.env.BASE || 'http://localhost:5174';
const [W, H] = (process.env.VP || '1440x900').split('x').map(Number);
const OUT = process.env.OUT || 'app';
const QS = process.env.QS ?? '?tema=novo';
const ADD = (process.env.ADD || '').split(',').filter(Boolean); // product names to click
const OPEN_CART = !!process.env.OPEN_CART;
const UID = '11111111-1111-4111-8111-111111111111';
const future = new Date(Date.now() + 30 * 864e5).toISOString();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', email: 'ana@padaria.com' })}.sig`;
const user = { id: UID, email: 'ana@padaria.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', expires_in: 86400, expires_at: exp, token_type: 'bearer', user };
const cats = [{ id: 1, nome: 'Lanches', ordem: 1 }, { id: 2, nome: 'Bebidas', ordem: 2 }, { id: 3, nome: 'Salgados', ordem: 3 }, { id: 4, nome: 'Doces', ordem: 4 }];
const P = (id, nome, id_categoria, preco, extra = {}) => ({ id, nome, id_categoria, preco, preco_2: preco + 2, preco_3: preco - 1, ativo: true, id_usuario: UID, controlar_estoque: false, estoque_atual: null, por_unidade: false, tipo_produto: 'simples', ...extra });
const prods = [
  P(1, 'X-Bacon', 1, 29.9), P(2, 'X-Burger', 1, 24.9), P(3, 'X-Salada', 1, 26.9), P(4, 'Misto quente', 1, 12), P(5, 'Beirute de frango', 1, 32),
  P(6, 'Coca-Cola lata 350ml', 2, 6.5), P(7, 'Guaraná lata 350ml', 2, 6), P(8, 'Suco de laranja 400ml', 2, 9.9),
  P(11, 'Coxinha de frango', 3, 7.5), P(12, 'Pão de queijo', 3, 5, { por_unidade: false }), P(13, 'Esfiha de carne', 3, 6.5, { controlar_estoque: true, estoque_atual: 3 }),
  P(15, 'Brigadeiro', 4, 3.5), P(16, 'Bolo de cenoura (fatia)', 4, 8.9),
];
const tables = {
  subscriptions: [{ id: 's1', user_id: UID, status: 'active', plan_tier: 'pdv', current_period_end: future, has_zelo_menu: false, has_mesas: false, has_acessos: false }],
  empresa_perfil: [{ id: 'e1', user_id: UID, nome_exibicao: 'Padaria Bom Dia', contato: '11999990000', documento: '11222333000181', tabelas_preco_ativo: true, tabela_preco_1_nome: 'Balcão', tabela_preco_2_nome: 'iFood', tabela_preco_3_nome: 'Atacado', onboarding_completed: true, plataformas_pagamento: [] }],
  access_users: [], categorias: process.env.EMPTY ? [] : cats, subcategorias: [], produtos: process.env.EMPTY ? [] : prods,
  caixas: process.env.NO_CAIXA ? [] : [{ id: 'c1', numero_caixa: 12, id_usuario: UID, data_abertura: new Date().toISOString(), data_fechamento: null, valor_inicial: 200 }],
};
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'pt-BR', reducedMotion: process.env.MOTION ? 'no-preference' : 'reduce' });
await ctx.addInitScript(([s]) => { try { localStorage.setItem('sb-mockproj-auth-token', s); localStorage.setItem('zelo_onboarding_done', '1'); } catch {} }, [JSON.stringify(session)]);
await ctx.route('https://mockproj.supabase.co/**', async (route) => {
  const req = route.request(); const url = new URL(req.url());
  const json = (body, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.pathname.startsWith('/auth/v1/user')) return json(user);
  if (url.pathname.startsWith('/auth/v1/token')) return json(session);
  if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
  const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)/);
  if (m) {
    const rows = tables[m[1]] ?? [];
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const headers = { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` };
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', ...headers } });
    if (single) return rows.length ? json(rows[0], headers) : route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) });
    return json(rows, headers);
  }
  return json({});
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}${process.env.ROUTE || '/app'}${QS}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('url', page.url());
for (const name of ADD) {
  let done = false;
  for (const role of ['tab', 'radio', 'button']) {
    const loc = page.getByRole(role, { name: new RegExp(name) }).first();
    if (await loc.count()) { await loc.click({ timeout: 5000 }).catch((e) => console.log('click fail', name, e.message)); done = true; break; }
  }
  if (!done) console.log('not found', name);
  await page.waitForTimeout(300);
}
const KEYS = (process.env.KEYS || '').split(',').filter(Boolean);
for (const k of KEYS) { await page.keyboard.press(k); await page.waitForTimeout(700); }
if (OPEN_CART) { await page.getByRole('button', { name: /Ver comanda/ }).click().catch((e) => console.log('open cart fail', e.message)); await page.waitForTimeout(500); }
for (const step of (process.env.STEPS || '').split(',').filter(Boolean)) {
  const [kind, ...rest] = step.split(':'); const arg = rest.join(':');
  if (kind === 'key') await page.keyboard.press(arg);
  else if (kind === 'wait') await page.waitForTimeout(Number(arg));
  else if (kind === 'click') await page.getByRole('button', { name: new RegExp(arg) }).first().click({ timeout: 5000 }).catch((e) => console.log('click fail', arg, e.message));
  if (kind !== 'wait') await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}.png` });
await browser.close();
