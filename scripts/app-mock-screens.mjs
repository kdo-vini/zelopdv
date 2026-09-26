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
  P(11, 'Coxinha de frango', 3, 7.5), P(12, 'Pão de queijo', 3, 5, { por_unidade: true, eh_item_por_unidade: true }), P(13, 'Esfiha de carne', 3, 6.5, { controlar_estoque: true, estoque_atual: 3 }),
  P(15, 'Brigadeiro', 4, 3.5), P(17, 'Açaí 500ml', 4, 18), P(16, 'Bolo de cenoura (fatia)', 4, 8.9),
];
const tables = {
  subscriptions: [{ id: 's1', user_id: UID, status: 'active', plan_tier: 'pdv', current_period_end: future, has_zelo_menu: !!process.env.ORDERS, has_mesas: !!process.env.MESAS, has_mesas_addon: !!process.env.MESAS, has_acessos: false }],
  empresa_perfil: [{ id: 'e1', user_id: UID, nome_exibicao: 'Padaria Bom Dia', contato: '11999990000', documento: '11222333000181', tabelas_preco_ativo: true, tabela_preco_1_nome: 'Balcão', tabela_preco_2_nome: 'iFood', tabela_preco_3_nome: 'Atacado', onboarding_completed: true, plataformas_pagamento: [] }],
  zelomenu_modifier_groups: [
    { id: 901, id_produto: 17, nome: 'Tamanho', tipo: 'variacao', modo_preco: 'substituir', min_selecoes: 1, max_selecoes: 1, permite_quantidade: false, ativo: true, ordem: 1 },
    { id: 902, id_produto: 17, nome: 'Complementos', tipo: 'adicional', modo_preco: 'somar', min_selecoes: 0, max_selecoes: 3, permite_quantidade: false, ativo: true, ordem: 2 },
  ],
  zelomenu_modifier_options: [
    { id: 911, id_grupo: 901, nome: '300ml', price_delta: 14, ativo: true, ordem: 1 }, { id: 912, id_grupo: 901, nome: '500ml', price_delta: 18, ativo: true, ordem: 2 },
    { id: 921, id_grupo: 902, nome: 'Granola', price_delta: 2, ativo: true, ordem: 1 }, { id: 922, id_grupo: 902, nome: 'Leite condensado', price_delta: 3, ativo: true, ordem: 2 }, { id: 923, id_grupo: 902, nome: 'Banana', price_delta: 0, ativo: true, ordem: 3 },
  ],
  mesas: process.env.MESAS ? Array.from({ length: 12 }, (_, i) => ({ id: `m${i + 1}`, numero: i + 1, id_usuario: UID, ativa: true, mapa_ordem: i, capacidade: [4, 4, 2, 6, 4, 2, 8, 4, 4, 4, 2, 6][i], status: ['livre', 'ocupada', 'ocupada', 'livre', 'fechando', 'livre', 'ocupada', 'livre', 'ocupada', 'livre', 'livre', 'ocupada'][i] })) : [],
  comandas: process.env.MESAS ? [[2, 42], [3, 12], [5, 78], [7, 65], [9, 6], [12, 28]].map(([n, min]) => ({ id: `c${n}`, id_mesa: `m${n}`, id_usuario: UID, status: 'aberta', num_pessoas: 2, aberta_em: new Date(Date.now() - min * 60000).toISOString() })) : [],
  comanda_itens: process.env.MESAS ? [
    { id: 'i1', id_comanda: 'c2', id_usuario: UID, id_produto: 7, nome_produto: 'Guaraná lata 350ml', quantidade: 4, preco_unitario: 6, zelo_order_item_id: 'z1' },
    { id: 'i2', id_comanda: 'c2', id_usuario: UID, id_produto: 11, nome_produto: 'Coxinha de frango', quantidade: 1, preco_unitario: 7.5, observacao: 'Bem passada', zelo_order_item_id: 'z2' },
    { id: 'i3', id_comanda: 'c2', id_usuario: UID, id_produto: 1, nome_produto: 'X-Bacon', quantidade: 2, preco_unitario: 29.9, observacao: 'Um sem cebola' },
    { id: 'i4', id_comanda: 'c2', id_usuario: UID, id_produto: 6, nome_produto: 'Coca-Cola lata 350ml', quantidade: 3, preco_unitario: 6.5 },
  ] : [],
  zelo_orders: process.env.ORDERS ? [
    { id: 'o1048aaaa', source: 'zelomenu', status: 'pending_review', revision: 1, total: 87.4, delivery_fee: 5, created_at: new Date(new Date().setHours(14, 32, 0, 0)).toISOString(), customer: { name: 'Marina S.', phone: '11999990001' }, fulfillment: { mode: 'delivery', address: 'Rua das Acácias, 120 · ap 32', neighborhood: 'Jardim América' }, payment: { method: 'pix' }, observations: 'Tocar o interfone 32.', zelo_order_items: [{ id: 'oi1', product_id: 1, name: 'X-Bacon', unit_price: 29.9, quantity: 2, subtotal: 59.8, position: 1 }, { id: 'oi2', product_id: 6, name: 'Coca-Cola lata 350ml', unit_price: 6.5, quantity: 2, subtotal: 13, position: 2 }, { id: 'oi3', product_id: 15, name: 'Brigadeiro', unit_price: 3.5, quantity: 3, subtotal: 10.5, position: 3 }] },
    { id: 'o1047bbbb', source: 'ifood', status: 'preparing', revision: 2, total: 54.9, delivery_fee: 0, created_at: new Date(new Date().setHours(14, 25, 0, 0)).toISOString(), customer: { name: 'Rafael', deliveryAddress: { streetName: 'Av. Brasil', streetNumber: '900', neighborhood: 'Centro' } }, fulfillment: { mode: 'delivery', ifood: { displayId: '8421', localizer: '8421 3310' } }, payment: { methods: [{ method: 'CREDIT', type: 'ONLINE' }] }, zelo_order_items: [{ id: 'oi4', product_id: 1, name: 'X-Bacon', unit_price: 29.9, quantity: 1, subtotal: 29.9, position: 1 }, { id: 'oi5', product_id: 2, name: 'X-Burger', unit_price: 25, quantity: 1, subtotal: 25, position: 2 }] },
    { id: 'o1046cccc', source: 'zelomenu', status: 'accepted', revision: 1, total: 24.9, delivery_fee: 0, created_at: new Date(new Date().setHours(14, 20, 0, 0)).toISOString(), customer: { name: 'Joana' }, fulfillment: { mode: 'pickup' }, payment: { method: 'cash', change_for: 50 }, zelo_order_items: [{ id: 'oi6', product_id: 2, name: 'X-Burger', unit_price: 24.9, quantity: 1, subtotal: 24.9, position: 1 }] },
    { id: 'o1045dddd', source: 'mesa', status: 'ready', revision: 3, total: 112, delivery_fee: 0, created_at: new Date(new Date().setHours(14, 12, 0, 0)).toISOString(), customer: { name: 'Mesa 04' }, fulfillment: { mode: 'table' }, payment: {}, zelo_order_items: [{ id: 'oi7', product_id: 5, name: 'Beirute de frango', unit_price: 32, quantity: 2, subtotal: 64, position: 1 }, { id: 'oi8', product_id: 8, name: 'Suco de laranja 400ml', unit_price: 12, quantity: 4, subtotal: 48, position: 2 }] },
  ] : [],
  // DASH=1: sales of the open caixa for /gestao (dashboard KPIs, hourly chart, activity feed)
  ...(process.env.DASH ? (() => {
    const at = (h, m) => new Date(new Date().setHours(h, m, 0, 0)).toISOString();
    const vendas = [[9, 12, 42.5, 'pix'], [10, 5, 18, 'dinheiro'], [11, 40, 96.3, 'credito'], [12, 15, 131.8, 'pix'], [12, 50, 64, 'debito'], [13, 22, 29.9, 'fiado'], [14, 8, 87.4, 'pix']]
      .map(([h, m, v, f], i) => ({ id: `v${i + 1}`, numero_venda: 1040 + i, id_caixa: 'c1', valor_total: v, forma_pagamento: f, valor_recebido: v, valor_troco: 0, valor_desconto: 0, taxa_entrega: 0, tipo_pedido: 'balcao', created_at: at(h, m) }));
    return {
      vendas,
      vendas_itens: [{ id_venda: 'v7', quantidade: 2, nome_produto_na_venda: 'X-Bacon', preco_unitario_na_venda: 29.9 }, { id_venda: 'v7', quantidade: 2, nome_produto_na_venda: 'Coca-Cola lata 350ml', preco_unitario_na_venda: 6.5 }],
      caixa_movimentacoes: [{ id: 'm1', id_caixa: 'c1', tipo: 'sangria', valor: 150, motivo: 'Depósito banco', created_at: at(13, 40) }, { id: 'm2', id_caixa: 'c1', tipo: 'suprimento', valor: 50, motivo: 'Troco', created_at: at(8, 5) }],
      vendas_pagamentos: [],
    };
  })() : {}),
  // LISTS=1: people, expenses and fiado entries for the /gestao list screens
  ...(process.env.LISTS ? (() => {
    const day = (d, h = 10) => new Date(new Date(new Date().setDate(d)).setHours(h, 0, 0, 0)).toISOString();
    return {
      pessoas: [['p1', 'Marina Souza', 'cliente', '11999990001', 86.5, 12, 3], ['p2', 'Carlos Lima', 'cliente', '11988882020', 0, null, null], ['p3', 'Beto', 'funcionario', '11977771212', 0, 28, 9], ['p4', 'Joana Reis', 'cliente', '11966663434', 24.9, null, null], ['p5', 'Seu Antônio', 'cliente', '', -10, 5, 1]]
        .map(([id, nome, tipo, contato, saldo_fiado, aniversario_dia, aniversario_mes]) => ({ id, id_usuario: UID, nome, tipo, contato, saldo_fiado, aniversario_dia, aniversario_mes, aniversario_ano: null })),
      expenses: [['e1', 'Pão e frios — Distribuidora Sol', 412.8, 'Fornecedor', 2], ['e2', 'Aluguel', 2400, 'Aluguel', 1], ['e3', 'Conta de luz', 386.45, 'Contas fixas', 1], ['e4', 'Gás', 128, 'Insumos', 1]]
        .map(([id, description, amount, category, d]) => ({ id, user_id: UID, description, amount, category, date: day(d) })),
      fiado_lancamentos: [['f1', 'p1', 'debito_venda', 59.8, 'Venda #1031', 1], ['f2', 'p1', 'pagamento', 20, 'Pix', 1], ['f3', 'p1', 'debito_venda', 46.7, 'Venda #1045', 1], ['f4', 'p4', 'debito_venda', 24.9, 'Venda #1049', 1]]
        .map(([id, id_pessoa, natureza, valor, descricao, d], i) => ({ id, id_pessoa, natureza, valor, descricao, created_at: day(d, 9 + i), id_venda: null, id_caixa: null, id_caixa_movimentacao: null })),
    };
  })() : {}),
  access_users: [], categorias: process.env.EMPTY ? [] : cats, subcategorias: [], produtos: process.env.EMPTY ? [] : prods,
  caixas: process.env.NO_CAIXA ? [] : [{ id: 'c1', numero_caixa: 12, id_usuario: UID, data_abertura: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(), data_fechamento: null, valor_inicial: 200 }],
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
  if (url.pathname === '/rest/v1/rpc/criar_venda_completa') return json({ id: 'v1', numero_venda: 1042 });
  if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
  const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)/);
  if (m) {
    // PostgREST `col=eq.value` filters (enough for single-row lookups like /app/mesas/[id])
    let rows = tables[m[1]] ?? [];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith('eq.') && rows.some((r) => k in r)) rows = rows.filter((r) => String(r[k]) === v.slice(3));
    }
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
  for (const role of ['tab', 'radio', 'button', 'menuitem']) {
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
  else if (kind === 'click') {
    let target = null;
    for (const role of ['tab', 'radio', 'button', 'menuitem']) {
      const loc = page.getByRole(role, { name: new RegExp(arg) }).first();
      if (await loc.count()) { target = loc; break; }
    }
    if (target) await target.click({ timeout: 5000 }).catch((e) => console.log('click fail', arg, e.message));
    else console.log('not found', arg);
  }
  if (kind !== 'wait') await page.waitForTimeout(500);
}
if (process.env.EVAL) console.log('EVAL', JSON.stringify(await page.evaluate(process.env.EVAL)));
await page.screenshot({ path: `${OUT}.png` });
await browser.close();
