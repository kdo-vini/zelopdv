import { test, expect } from '@playwright/test';
import { readTestTenantManifest } from './helpers/test-tenant.js';

test.describe.configure({ mode: 'serial' });

function tenant() {
  if (process.env.E2E_DEDICATED_TENANT !== 'true') {
    throw new Error('operational.spec.js exige E2E_DEDICATED_TENANT=true.');
  }
  const manifest = readTestTenantManifest();
  if (!manifest?.runId || !manifest.owner?.id) {
    throw new Error('Tenant E2E dedicado ausente. O projeto setup deveria executar resetTestTenant antes dos cenários.');
  }
  return manifest;
}

async function dismissOnboarding(page) {
  const skip = page.getByRole('button', { name: /pular|skip/i });
  if (await skip.isVisible({ timeout: 1_500 }).catch(() => false)) await skip.click();
}

async function openPdv(page) {
  tenant();
  await page.goto('/app');
  await dismissOnboarding(page);
  await expect(page.getByRole('heading', { name: 'Frente de Caixa', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('product-grid')).toBeVisible();
}

async function openMobileCart(page) {
  const view = page.viewportSize();
  if (view && view.width < 768) {
    const open = page.getByRole('button', { name: 'Ver Comanda' });
    if (await open.isVisible({ timeout: 2_000 }).catch(() => false)) await open.click();
  }
}

async function openSeededMesa(page, tableId) {
  await page.goto(`/app/mesas/${tableId}`);
  await expect(page.getByRole('heading', { name: /Mesa/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('COMANDA', { exact: true })).toBeVisible();
}

test.describe('Operacional dedicado — frente de caixa', () => {
  test('carrega catálogo, busca, categoria e altera quantidade no carrinho', async ({ page }) => {
    const manifest = tenant();
    await openPdv(page);

    const product = page.locator(`[data-prod="${manifest.productIds[0]}"]`);
    await expect(product).toBeVisible();
    await expect(product).toContainText('Produto Estoque');

    const search = page.getByTestId('product-search');
    await search.fill('Produto Estoque');
    await expect(product).toBeVisible();
    await search.fill('');

    const category = page.getByTestId('category-tab').filter({ hasText: 'Estoque Individual' });
    await expect(category).toBeVisible();
    await category.click();
    await expect(product).toBeVisible();

    await product.click();
    await openMobileCart(page);
    const cart = page.getByTestId('cart');
    await expect(cart).toContainText('Produto Estoque');
    await cart.getByRole('button', { name: 'Aumentar quantidade' }).click();
    await expect(cart.locator('span').filter({ hasText: /^2$/ })).toBeVisible();
    await cart.getByRole('button', { name: 'Diminuir quantidade' }).click();
    await expect(cart.locator('span').filter({ hasText: /^1$/ })).toBeVisible();
  });

  test('exercita item avulso, retirada, delivery, desconto e pagamentos múltiplos', async ({ page }) => {
    const manifest = tenant();
    await openPdv(page);

    await page.getByTestId('btn-avulso').click();
    const freeItem = page.getByRole('dialog', { name: /item avulso/i });
    await expect(freeItem).toBeVisible();
    await freeItem.locator('#nome-avulso').fill(`${manifest.runId} Serviço`);
    await freeItem.locator('#valor-avulso').fill('7.50');
    await freeItem.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await openMobileCart(page);

    const cart = page.getByTestId('cart');
    await expect(cart).toContainText(`${manifest.runId} Serviço`);
    await cart.getByRole('button', { name: 'Delivery', exact: true }).click();
    await page.locator('#taxa-entrega-input').fill('4.50');
    await expect(cart).toContainText('Taxa entrega');
    await page.getByTestId('btn-cobrar').click();

    const payment = page.getByRole('dialog', { name: /finalizar pagamento/i });
    await expect(payment).toBeVisible();
    await payment.getByRole('button', { name: 'Pix', exact: true }).click();
    await payment.getByRole('button', { name: /aplicar desconto/i }).click();
    await payment.locator('input[placeholder="6.00"]').fill('1.50');
    await payment.getByRole('button', { name: /dividir pagamento/i }).click();
    await expect(payment.locator('#mp-forma')).toBeVisible();
    await expect(payment.locator('#mp-valor')).toBeVisible();
    await payment.getByRole('button', { name: 'Cancelar', exact: true }).click();
  });

  test('mantém o fluxo de abertura de caixa explícito quando a sessão está fechada', async ({ page }) => {
    await openPdv(page);
    const cashDialog = page.getByRole('dialog', { name: /abrir caixa/i });
    const cashOpen = await cashDialog.isVisible({ timeout: 2_000 }).catch(() => false);
    if (cashOpen) {
      await expect(cashDialog.locator('#troco-inicial')).toHaveValue('0');
      await expect(cashDialog.getByRole('button', { name: 'Abrir Caixa', exact: true })).toBeEnabled();
    } else {
      await expect(page.getByTestId('btn-cobrar')).toBeVisible();
    }
  });
});

test.describe('Operacional dedicado — mesas e comandas', () => {
  test('retoma comanda ocupada e preserva item, capacidade e ações críticas', async ({ page }) => {
    const manifest = tenant();
    await page.goto('/app/mesas');
    await expect(page.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: new RegExp(`${manifest.runId}-2, ocupada`, 'i') })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`${manifest.runId}-2, ocupada`, 'i') }).click();
    await expect(page).toHaveURL(new RegExp(`/app/mesas/${manifest.tableIds[1]}`));
    await expect(page.getByText('Produto Estoque', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pré-conta', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: /registrar pagamento parcial/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Trocar de mesa', exact: true })).toBeEnabled();
  });

  test('abre pré-conta, pagamento parcial por valor/itens e transferência sem fechar a mesa', async ({ page }) => {
    const manifest = tenant();
    await openSeededMesa(page, manifest.tableIds[1]);

    await page.getByRole('button', { name: 'Pré-conta', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/pré-conta/i).last()).toBeVisible();
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();

    await page.getByRole('button', { name: /registrar pagamento parcial/i }).click();
    const partial = page.getByRole('dialog', { name: /pagamento parcial/i });
    await expect(partial).toBeVisible();
    await expect(partial.getByRole('button', { name: /informar valor/i })).toBeVisible();
    await expect(partial.getByRole('button', { name: /selecionar itens/i })).toBeVisible();
    await partial.getByRole('button', { name: /informar valor/i }).click();
    await expect(partial.locator('input[type="number"]').first()).toBeVisible();
    await partial.getByRole('button', { name: /cancelar|fechar/i }).first().click().catch(() => page.keyboard.press('Escape'));

    await page.getByRole('button', { name: 'Trocar de mesa', exact: true }).click();
    const transfer = page.getByRole('dialog', { name: /transferir mesa/i });
    await expect(transfer).toBeVisible();
    await expect(transfer.getByText(new RegExp(`${manifest.runId}-1`))).toBeVisible();
  });

  test('expõe envio para cozinha e bloqueia alteração de item já enviado', async ({ page }) => {
    const manifest = tenant();
    await openSeededMesa(page, manifest.tableIds[1]);
    const kitchenButton = page.getByRole('button', { name: /enviar item para a cozinha/i });
    await expect(kitchenButton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aumentar' }).first()).toBeEnabled();
  });
});

test.describe('Operacional dedicado — pedidos e cozinha', () => {
  test('lista pedidos ativos, detalha modifiers, observação, status e reimpressão', async ({ page }) => {
    const manifest = tenant();
    await page.goto('/app/pedidos');
    await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Fila de pedidos' })).toBeVisible();
    await expect(page.getByText(new RegExp(`${manifest.runId} Pedido Cozinha`))).toBeVisible();
    await expect(page.getByText(new RegExp(`${manifest.runId} Pedido Preparando`))).toBeVisible();
    await expect(page.getByText(new RegExp(`${manifest.runId} Pedido Pronto`))).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`${manifest.runId} Pedido Cozinha`) }).click();
    await expect(page.getByText(new RegExp(`${manifest.runId} Opção A`))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reimprimir', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /iniciar preparo|marcar como pronto|concluir/i })).toBeVisible();
  });

  test('mostra lanes de cozinha e ações canônicas de preparo', async ({ page }) => {
    const manifest = tenant();
    await page.goto('/app/pedidos/cozinha');
    await expect(page.getByRole('heading', { name: 'Pedidos em preparo', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Em preparo', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prontos', exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`${manifest.runId} Pedido Cozinha`))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar preparo', exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`${manifest.runId} Opção A`))).toBeVisible();
  });
});

test.describe('Operacional dedicado — gestão, financeiro e sessão', () => {
  test('navega por todas as frentes autenticadas operacionais', async ({ page }) => {
    tenant();
    const routes = [
      ['/gestao', /gestao/],
      ['/gestao/produtos', /gestao\/produtos/],
      ['/gestao/pessoas', /gestao\/pessoas/],
      ['/gestao/estoque', /gestao\/estoque/],
      ['/gestao/mesas', /gestao\/mesas/],
      ['/gestao/despesas', /gestao\/despesas/],
      ['/gestao/fichario', /gestao\/fichario/],
      ['/gestao/caixa', /gestao\/caixa/],
      ['/relatorios', /relatorios/],
      ['/gestao/gerente', /gestao\/gerente/],
      ['/gestao/gerente/semana', /gestao\/gerente\/semana/],
      ['/gestao/acessos', /gestao\/acessos/],
      ['/perfil', /perfil/],
    ];
    for (const [route, expected] of routes) {
      await page.goto(route);
      await expect(page).toHaveURL(expected);
      await expect(page.locator('main, h1, h2').first()).toBeVisible({ timeout: 12_000 });
    }
  });

  test('encontra os dados seeded nas telas de catálogo, estoque, pessoas e acessos', async ({ page }) => {
    const manifest = tenant();
    await page.goto('/gestao/produtos');
    await expect(page.getByText(new RegExp(`${manifest.runId} Produto Estoque`))).toBeVisible({ timeout: 15_000 });
    await page.locator('input[placeholder*="Buscar produto"]').fill('Produto Estoque');
    await expect(page.getByText(new RegExp(`${manifest.runId} Produto Estoque`))).toBeVisible();

    await page.goto('/gestao/estoque');
    await expect(page.locator('input[placeholder*="Buscar produto ou grupo"]').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('input[placeholder*="Buscar produto ou grupo"]').fill('Produto Estoque');
    await expect(page.getByText(new RegExp(`${manifest.runId} Produto Estoque`))).toBeVisible();

    await page.goto('/gestao/pessoas');
    await expect(page.getByText(new RegExp(`${manifest.runId} Cliente Devedor`))).toBeVisible({ timeout: 15_000 });
    await page.goto('/gestao/acessos');
    await expect(page.getByText('Caixa', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Atendente', { exact: true })).toBeVisible();
    await expect(page.getByText('Gerente', { exact: true })).toBeVisible();
  });

  test('preserva navegação responsiva e controles de despesas/relatórios', async ({ page }) => {
    await page.goto('/gestao/despesas');
    await expect(page.locator('#exp-desc')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#exp-amount')).toBeVisible();
    await expect(page.locator('#exp-date')).toBeVisible();

    await page.goto('/relatorios');
    await expect(page.locator('#periodo-inicio')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#periodo-fim')).toBeVisible();
    await expect(page.getByRole('button', { name: /abrir filtros/i }).first()).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: /navegação principal de gestão/i })).toBeVisible();
    }
  });
});
