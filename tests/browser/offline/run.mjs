// Isolated browser storage probe. Does not certify the app UI, auth, SW or SQL.
import { createServer } from 'vite';
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';

const server = await createServer({
  configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5197, strictPort: true },
  plugins: [{ name: 'offline-audit-harness', configureServer(s) {
    s.middlewares.use('/__offline-audit', (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Isolated offline storage audit</title><script type="module">import * as offline from "/src/lib/offlineDb.js"; window.offline = offline;</script>');
    });
  } }],
});
await server.listen();
const browser = await chromium.launch();
try {
  for (const [name, options] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['mobile-emulated', devices['Pixel 5']]]) {
    const context = await browser.newContext(options);
    // No connection to Supabase or other external host is allowed.
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5197/__offline-audit');
    await page.waitForFunction(() => !!window.offline);
    await context.setOffline(true);
    const saved = await page.evaluate(async () => {
      const m = window.offline;
      await m.atualizarCacheProdutos([{ id: 1, nome: 'Produto teste', preco: 10 }], 'audit-owner');
      await m.salvarVendaOffline({ ownerUserId: 'audit-owner', operatorUserId: 'audit-operator', payload: {
        client_sale_id: 'audit-sale', valor_total: 10, forma_pagamento: 'dinheiro',
        itens: [{ id_produto: 1, quantidade: 1, preco_unitario_na_venda: 10 }],
      } });
      await m.db.close();
      await m.db.open();
      return { online: navigator.onLine, count: await m.contarVendasPendentes('audit-owner'), catalog: (await m.buscarProdutosLocal('', 'audit-owner')).length };
    });
    assert.deepEqual(saved, { online: false, count: 1, catalog: 1 });
    await context.setOffline(false);
    await page.reload();
    await page.waitForFunction(() => !!window.offline);
    const replay = await page.evaluate(async () => {
      const m = window.offline;
      const before = await m.contarVendasPendentes('audit-owner');
      const committed = new Set();
      let attempts = 0;
      // Simulated server commit with lost response, then acknowledgement.
      const rpc = async (_name, { p_payload }) => {
        committed.add(p_payload.client_sale_id);
        return ++attempts === 1 ? { error: new TypeError('Failed to fetch') } : { data: { id: 1 } };
      };
      await m.syncVendasPendentes({ rpc }, { ownerUserId: 'audit-owner' });
      const retained = await m.contarVendasPendentes('audit-owner');
      await m.syncVendasPendentes({ rpc }, { ownerUserId: 'audit-owner' });
      return { before, retained, after: await m.contarVendasPendentes('audit-owner'), uniqueKeys: committed.size, attempts };
    });
    assert.deepEqual(replay, { before: 1, retained: 1, after: 0, uniqueKeys: 1, attempts: 2 });
    console.log(JSON.stringify({ name, saved, replay, passed: true }));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
