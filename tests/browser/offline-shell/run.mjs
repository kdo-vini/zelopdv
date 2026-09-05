// Run after npm run build (client/PWA artifacts suffice if the Windows adapter
// ends at its known symlink limitation): node tests/browser/offline-shell/run.mjs
// Add --checkout to exercise a seeded prepared store through the real payment UI.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, expect } from '@playwright/test';
const root = process.cwd();
const client = resolve(root, '.svelte-kit/output/client');
const shell = resolve(root, '.svelte-kit/output/prerendered/pages/offline-shell.html');
const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/prepare') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Offline preparation harness</title>'); return; }
  const file = url.pathname === '/offline-shell' ? shell : resolve(client, '.' + url.pathname);
  if (file !== shell && !file.startsWith(client + '/')) {
    // Windows uses backslashes in resolved paths.
    if (!file.startsWith(client + '\\')) { res.statusCode = 403; res.end(); return; }
  }
  try { const body = await readFile(file); res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(body); }
  catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }].filter(view => !process.argv.includes('--desktop') || view.width === 1280)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => console.error('browser error:', error.stack));
    // Every external service is blocked, including analytics. No real account.
    await context.route(url => url.origin !== origin, route => route.abort());
    await page.goto(`${origin}/prepare`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      localStorage.setItem('zelo_entitlement_snapshot', JSON.stringify({ userId: '00000000-0000-0000-0000-000000000001', ownerUserId: '00000000-0000-0000-0000-000000000001', isSubUser: false, addons: { has_mesas_addon: true, has_zelo_menu: true }, validatedAt: Date.now() }));
    });
    await page.reload();
    assert(await page.evaluate(() => !!navigator.serviceWorker.controller));
    // Chromium can expose navigator.onLine=true after a service-worker
    // navigation under CDP offline emulation. Keep both signals disconnected.
    await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
    await context.setOffline(true);
    for (const path of ['/app', '/app/pedidos', '/app/mesas', '/gestao/caixa']) {
      const response = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      assert(response.fromServiceWorker(), path + ' document must come from the real worker');
      await page.waitForTimeout(1500);
      assert.equal(new URL(page.url()).pathname, path, `${path} must not redirect away offline`);
      const body = await page.locator('body').innerText();
      assert(!body.includes('Abra a Frente de Caixa para continuar'), 'must render actual route, not neutral fallback UI');
      assert(body.length > 40, `${path} operational screen must render: ${body}`);
      assert(!body.includes('Você está offline. Verifique sua conexão.'), 'operational screens use one discreet connectivity indicator');
      console.log(JSON.stringify({ viewport, path, serviceWorker: true, rendered: true }));
    }
    if (process.argv.includes('--checkout')) {
      await page.evaluate(async () => {
        const owner = '00000000-0000-0000-0000-000000000001';
        const database = await new Promise((resolve, reject) => { const req = indexedDB.open('ZeloPDVDB'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
        const tx = database.transaction(['offline_meta', 'offline_snapshots', 'produtos', 'categorias', 'subcategorias'], 'readwrite');
        const now = Date.now(); const deviceId = 'offline-browser-fixture';
        tx.objectStore('offline_meta').put({ key: 'deviceId', value: deviceId });
        const snapshot = (key, value) => tx.objectStore('offline_snapshots').put({ ownerUserId: owner, key, value, updatedAt: new Date(now).toISOString() });
        snapshot(`bootstrap:${owner}`, { userId: owner, ownerUserId: owner, deviceId, enabled: true, registered: true, isPrimaryDevice: true, isSubUser: false, validatedAt: now, storage: { writable: true }, addons: { has_mesas_addon: true, has_zelo_menu: true } });
        snapshot(`readiness:${owner}`, { catalog: true, cash: true, mesas: true, completedAt: now });
        const caixa = { id: 101, valor_inicial: 0, data_abertura: new Date(now).toISOString(), data_fechamento: null };
        snapshot('caixa.aberto', caixa); snapshot('caixa:101', { caixa, vendas: [], pagamentos: [], taxas: [], movs: [] });
        snapshot('mesas:state', { mesas: [{ id: 1, numero: 1, nome: 'Mesa teste', status: 'livre', ativa: true, capacidade: 4 }], details: {} });
        snapshot('orders:queue', { orders: [], reconciled: [] });
        snapshot('empresa.perfil', { nome_exibicao: 'Loja de teste offline', largura_bobina: '80mm' }); snapshot('pessoas.fiado', []);
        tx.objectStore('categorias').put({ id: 1, nome: 'Lanches', _cacheOwnerUserId: owner });
        tx.objectStore('subcategorias').put({ id: 1, id_categoria: 1, nome: 'Teste', _cacheOwnerUserId: owner });
        tx.objectStore('produtos').put({ id: 1, nome: 'Lanche Offline Fixture', preco: 10, id_categoria: 1, categoria_id: 1, id_subcategoria: 1, ativo: true, controlar_estoque: true, estoque_atual: 10, _cacheOwnerUserId: owner });
        tx.objectStore('produtos').put({ id: 2, nome: 'Montável Offline Fixture', preco: 20, id_categoria: 1, ativo: true, controlar_estoque: false, _cacheOwnerUserId: owner, modifierGroups: [
          { id: 'massa', name: 'Massa', minSelections: 1, maxSelections: 1, pricingMode: 'substituir', options: [{ id: 'penne', name: 'Penne', priceDelta: 20 }] },
          { id: 'extras', name: 'Extras', minSelections: 0, maxSelections: 2, pricingMode: 'somar', options: [{ id: 'bacon', name: 'Bacon', priceDelta: 3 }] }
        ] });
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); database.close();
      });
      await page.goto(origin + '/app');
      if (process.argv.includes('--orders')) {
        const navigate = async (name, path) => {
          if (viewport.width < 768) await page.getByRole('button', { name: 'PDV', exact: true }).click();
          await page.getByRole('link', { name, exact: true }).filter({ visible: true }).click();
          await expect(page).toHaveURL(origin + path);
        };
        await navigate('Pedidos', '/app/pedidos');
        await page.getByRole('button', { name: 'Criar pedido', exact: true }).click();
        const manual = page.getByRole('dialog', { name: 'Criar pedido', exact: true });
        await manual.getByRole('button', { name: /Montável Offline Fixture/ }).click();
        await page.getByRole('button', { name: 'Revise as opções acima' }).waitFor();
        await page.getByRole('radio', { name: /Penne/ }).click();
        await page.getByRole('checkbox', { name: /Bacon/ }).click();
        await page.getByRole('button', { name: /Adicionar à comanda/ }).click();
        await manual.getByLabel('Tipo de pedido').selectOption('delivery');
        await manual.getByLabel('Frete (R$)').fill('7.50');
        await expect(manual.getByLabel('Nome', { exact: true })).toHaveValue('');
        await expect(manual.getByLabel('Telefone')).toHaveValue('');
        await expect(manual.getByLabel('Endereço')).toHaveValue('');
        await expect(manual.getByLabel('Forma de pagamento')).toHaveValue('');
        assert(await manual.getByLabel('Data prevista').inputValue());
        assert(await manual.getByLabel('Horário previsto').inputValue());
        await expect(manual.getByText('Total R$ 30,50', { exact: true })).toBeVisible();
        await page.getByText('Conexão instável. Verifique o estado do salvamento neste aparelho.', { exact: true }).waitFor({ state: 'hidden' });
        const geometry = await manual.evaluate(dialog => {
          const rect = element => { const { top, bottom, height } = element.getBoundingClientRect(); return { top, bottom, height }; };
          return { dialog: rect(dialog), header: rect(dialog.querySelector('header')), scroll: rect(dialog.querySelector('.content-scroll')), footer: rect(dialog.querySelector('footer')), viewport: innerHeight };
        });
        assert(geometry.header.top >= geometry.dialog.top && geometry.header.top >= 0, 'modal heading must remain inside viewport');
        assert(geometry.scroll.top >= geometry.header.bottom - 1, 'scrolling fields must start below heading');
        assert(geometry.scroll.bottom <= geometry.footer.top + 1, 'fields must not overflow the fixed footer');
        assert(geometry.footer.bottom <= geometry.dialog.bottom + 1 && geometry.footer.bottom <= geometry.viewport, 'total and save must remain inside modal viewport');
        console.log(JSON.stringify({ viewport, modalGeometry: geometry }));
        await page.screenshot({ path: `test-results/offline/manual-order-${viewport.width}.png`, fullPage: true });
        await manual.locator('.content-scroll').evaluate(element => { element.scrollTop = 0; });
        await page.screenshot({ path: `test-results/offline/manual-order-top-${viewport.width}.png`, fullPage: true });
        await manual.getByRole('button', { name: 'Criar pedido', exact: true }).click();
        await manual.waitFor({ state: 'hidden' });
        const getOrders = () => page.evaluate(async () => {
          const database = await new Promise(resolve => { const req = indexedDB.open('ZeloPDVDB'); req.onsuccess = () => resolve(req.result); });
          const rows = await new Promise(resolve => { const req = database.transaction('offline_operations').objectStore('offline_operations').getAll(); req.onsuccess = () => resolve(req.result); }); database.close(); return rows.filter(row => row.type === 'order.create');
        });
        const orders = await getOrders();
        assert.equal(orders.length, 1);
        assert.equal(orders[0].status, 'pending');
        assert.equal(Number(orders[0].payload.total), 30.5);
        assert.equal(Number(orders[0].payload.subtotal), 23);
        await page.reload();
        await page.getByRole('button', { name: 'Criar pedido', exact: true }).waitFor();
        assert.equal((await getOrders())[0].operationId, orders[0].operationId);
        await page.locator('.queue-item').first().click();
        await expect(page.getByText('1× Montável Offline Fixture', { exact: true })).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `test-results/offline/orders-${viewport.width}.png`, fullPage: true });
        if (viewport.width < 768) await page.getByRole('button', { name: 'Voltar para fila', exact: true }).click();
        await navigate('Frente de Caixa', '/app');
        console.log(JSON.stringify({ viewport, manualOrder: true, mountedProduct: true, optionalCustomer: true, total: 30.5, durable: true, navigation: true }));
      }
      await page.getByRole('button', { name: /Lanche Offline Fixture/i }).click();
      if (viewport.width < 768) await page.getByRole('button', { name: /Ver Comanda/ }).click();
      await page.getByTestId('btn-cobrar').click();
      await page.getByRole('button', { name: /Dinheiro/ }).click();
      await page.getByLabel('Valor recebido (R$)').fill('10');
      const print = page.getByRole('checkbox', { name: /imprimir/i });
      if (await print.count()) await print.uncheck();
      await page.getByRole('button', { name: /Confirmar R\$/ }).click();
      await page.waitForTimeout(700);
      const operations = await page.evaluate(async () => {
        const database = await new Promise(resolve => { const req = indexedDB.open('ZeloPDVDB'); req.onsuccess = () => resolve(req.result); });
        const rows = await new Promise(resolve => { const req = database.transaction('offline_operations').objectStore('offline_operations').getAll(); req.onsuccess = () => resolve(req.result); }); database.close(); return rows;
      });
      const sales = operations.filter(row => row.type === 'sale.create');
      if (sales.length !== 1) console.log('checkout diagnostic:', (await page.locator('body').innerText()).slice(-2500));
      assert.equal(sales.length, 1, 'checkout must durably record one sale in new outbox');
      assert.equal(sales[0].status, 'pending');
      assert.equal(Number(sales[0].payload.valor_total), 10);
      await page.reload();
      assert.equal(new URL(page.url()).pathname, '/app');
      const retained = await page.evaluate(async () => {
        const database = await new Promise(resolve => { const req = indexedDB.open('ZeloPDVDB'); req.onsuccess = () => resolve(req.result); });
        const rows = await new Promise(resolve => { const req = database.transaction('offline_operations').objectStore('offline_operations').getAll(); req.onsuccess = () => resolve(req.result); }); database.close(); return rows;
      });
      assert.equal(retained.filter(row => row.type === 'sale.create').length, 1);
      assert.equal(retained.find(row => row.type === 'sale.create').operationId, sales[0].operationId);
      console.log(JSON.stringify({ viewport, checkout: true, operationId: sales[0].operationId, durable: true }));
      if (process.argv.includes('--mesas')) {
        await page.goto(origin + '/app/mesas');
        await page.getByRole('button', { name: 'Mesa 1, Livre' }).click();
        await page.getByRole('button', { name: /Lanche Offline Fixture/i }).click();
        if (viewport.width < 768) await page.getByRole('button', { name: /Ver comanda/i }).click();
        await page.getByRole('button', { name: 'Registrar pagamento parcial' }).click();
        const partial = page.getByRole('dialog', { name: /Pagamento parcial/ });
        await partial.getByRole('button', { name: 'Informar valor' }).click();
        await partial.getByRole('spinbutton').fill('5');
        await partial.getByRole('button', { name: 'Cobrar', exact: true }).click();
        await partial.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: /FECHAR MESA/ }).click();
        const closing = page.getByRole('dialog', { name: /Fechar Mesa 1/ });
        await closing.getByRole('button', { name: /Dinheiro/ }).click();
        await closing.getByLabel('Valor recebido', { exact: true }).fill('5');
        await closing.getByRole('button', { name: 'Confirmar pagamento' }).click();
        await page.waitForTimeout(700);
        const commands = await page.evaluate(async () => {
          const database = await new Promise(resolve => { const req = indexedDB.open('ZeloPDVDB'); req.onsuccess = () => resolve(req.result); });
          const rows = await new Promise(resolve => { const req = database.transaction('offline_operations').objectStore('offline_operations').getAll(); req.onsuccess = () => resolve(req.result); }); database.close(); return rows;
        });
        const mesaCommands = commands.filter(row => row.type.startsWith('mesa.')).sort((a,b) => a.sequence-b.sequence);
        assert.deepEqual(mesaCommands.map(row => row.type), ['mesa.open', 'mesa.item.add', 'mesa.payment.add', 'mesa.close']);
        assert(mesaCommands.every(row => row.status === 'pending'));
        assert(mesaCommands[3].dependencies.includes(mesaCommands[2].operationId));
        console.log(JSON.stringify({ viewport, mesa: true, operations: mesaCommands.length, durable: true }));
      }
    }
    if (process.argv.includes('--checkout') && process.argv.includes('--cash')) {
      await page.goto(origin + '/gestao/caixa');
      await page.getByLabel('Valor contado na gaveta').fill(process.argv.includes('--mesas') ? '20' : '10');
      await page.getByRole('button', { name: 'Fechar Caixa', exact: true }).click();
      await page.getByText('Nenhum caixa aberto encontrado para seu usuário.').waitFor();
      await page.goto(origin + '/app');
      const opening = page.getByRole('dialog', { name: 'Abrir Caixa', exact: true });
      await opening.getByLabel('Valor do Troco Inicial (R$)').fill('0');
      await opening.getByRole('button', { name: 'Abrir Caixa', exact: true }).click();
      await opening.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: viewport.width < 768 ? 'Movimentação de Caixa' : 'Movimentação de caixa', exact: true }).click();
      const movement = page.getByRole('dialog', { name: 'Movimentar Caixa', exact: true });
      await movement.getByRole('button', { name: 'Entrada', exact: true }).click();
      await movement.getByLabel('Valor (R$)').fill('5');
      const printMovement = movement.getByRole('checkbox');
      if (await printMovement.count()) await printMovement.uncheck();
      await movement.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await movement.waitFor({ state: 'hidden' });
      await page.goto(origin + '/gestao/caixa');
      await page.getByLabel('Valor contado na gaveta').fill('5');
      await page.getByRole('button', { name: 'Fechar Caixa', exact: true }).click();
      await page.getByText('Nenhum caixa aberto encontrado para seu usuário.').waitFor();
      const cashCommands = await page.evaluate(async () => {
        const database = await new Promise(resolve => { const req = indexedDB.open('ZeloPDVDB'); req.onsuccess = () => resolve(req.result); });
        const rows = await new Promise(resolve => { const req = database.transaction('offline_operations').objectStore('offline_operations').getAll(); req.onsuccess = () => resolve(req.result); }); database.close(); return rows.filter(row => row.type.startsWith('caixa.')).sort((a,b)=>a.sequence-b.sequence);
      });
      assert.deepEqual(cashCommands.map(row=>row.type), ['caixa.close', 'caixa.open', 'caixa.move', 'caixa.close']);
      assert(cashCommands[2].dependencies.includes(cashCommands[1].operationId));
      assert(cashCommands.every(row=>row.status==='pending'));
      console.log(JSON.stringify({ viewport, cash: true, operations: cashCommands.length, durable: true }));
      await page.getByRole('button', { name: /salvos neste aparelho/ }).click();
      await page.getByRole('button', { name: 'Abrir central de pendências' }).click();
      const center = page.getByRole('dialog', { name: 'Operação offline', exact: true });
      await center.waitFor();
      await expect(center.getByRole('heading', { name: 'Arquivo de recuperação' })).toBeVisible();
      await page.screenshot({ path: `test-results/offline/center-${viewport.width}.png`, fullPage: true });
      await center.getByRole('button', { name: 'Fechar central' }).click();
    }
    await context.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
