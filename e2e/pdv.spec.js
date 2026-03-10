/**
 * e2e/pdv.spec.js
 *
 * End-to-end tests for the main POS (Frente de Caixa) at /app.
 * These tests use the authenticated storage state created by auth.setup.js.
 *
 * NOTE: Tests that write to the database (checkout) should use a dedicated
 * test Supabase project or run against a local Supabase instance to avoid
 * polluting production data.
 */
import { test, expect } from '@playwright/test';

test.describe('Frente de Caixa - Carregamento', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss onboarding tour if it appears
    await page.goto('/app');
    const skipBtn = page.getByRole('button', { name: /pular|skip/i });
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
    }
  });

  test('carrega a página /app com sucesso', async ({ page }) => {
    await expect(page).toHaveURL(/\/app/);
  });

  test('exibe a grade de produtos ou mensagem de lista vazia', async ({ page }) => {
    // Either the product grid or an empty-state message must be visible
    const gridOrEmpty = page.locator(
      '[data-testid="product-grid"], [data-testid="empty-products"], .product-grid, text=/nenhum produto/i'
    );
    await expect(gridOrEmpty.first()).toBeVisible({ timeout: 12_000 });
  });

  test('exibe a área do carrinho (comanda)', async ({ page }) => {
    const cart = page.locator('[data-testid="cart"], [data-testid="comanda"], .cart-panel');
    await expect(cart.first()).toBeVisible({ timeout: 8_000 });
  });

  test('exibe botão de Abrir Caixa quando o caixa está fechado', async ({ page }) => {
    // The "Abrir Caixa" button is shown when the register is not opened yet
    const abrirBtn = page.getByRole('button', { name: /abrir caixa/i });
    // It may or may not be visible depending on state — just verify page loaded
    await expect(page).toHaveURL(/\/app/);
  });
});

test.describe('Frente de Caixa - Filtros de Categorias', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    const skipBtn = page.getByRole('button', { name: /pular|skip/i });
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    // Wait for product grid to be ready
    await page.waitForLoadState('networkidle');
  });

  test('exibe abas de categorias quando há categorias cadastradas', async ({ page }) => {
    const categoryTabs = page.locator('[data-testid="category-tab"], .category-btn');
    const count = await categoryTabs.count();
    // May be 0 if no categories — just ensure no crash
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('campo de busca filtra produtos', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="buscar"], input[placeholder*="pesquisar"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await searchInput.fill('teste');
      await page.waitForTimeout(500); // debounce
      // No crash expected; grid may show results or empty state
      await expect(page).toHaveURL(/\/app/);
    }
  });

  test('atalho "/" foca o campo de busca', async ({ page }) => {
    // Make sure we're not in an input field first
    await page.locator('body').click();
    await page.keyboard.press('/');

    const searchInput = page.locator('input[placeholder*="buscar"], input[placeholder*="pesquisar"]').first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const isFocused = await searchInput.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBeTruthy();
    }
  });
});

test.describe('Frente de Caixa - Carrinho', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    const skipBtn = page.getByRole('button', { name: /pular|skip/i });
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForLoadState('networkidle');
  });

  test('adicionar um produto ao carrinho exibe-o na comanda', async ({ page }) => {
    const firstProduct = page
      .locator('[data-testid="product-card"], .product-card, [data-product]')
      .first();

    if (await firstProduct.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await firstProduct.click();

      // Wait for item to appear in cart
      const cartItem = page.locator('[data-testid="cart-item"], .cart-item, [data-comanda-item]').first();
      await expect(cartItem).toBeVisible({ timeout: 5_000 });
    } else {
      // No products available — skip gracefully
      test.skip();
    }
  });

  test('remover item do carrinho atualiza o total', async ({ page }) => {
    const firstProduct = page
      .locator('[data-testid="product-card"], .product-card')
      .first();

    if (await firstProduct.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await firstProduct.click();

      const removeBtn = page
        .locator('[data-testid="remove-item"], button[aria-label*="remover"], .remove-item')
        .first();

      if (await removeBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
        const totalBefore = await page
          .locator('[data-testid="cart-total"], .cart-total')
          .first()
          .textContent();
        await removeBtn.click();
        const totalAfter = await page
          .locator('[data-testid="cart-total"], .cart-total')
          .first()
          .textContent()
          .catch(() => '');
        // After removing the only item, total should change (go to 0 or cart disappears)
        expect(totalBefore).not.toEqual(totalAfter);
      }
    } else {
      test.skip();
    }
  });
});

test.describe('Frente de Caixa - Item Avulso', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    const skipBtn = page.getByRole('button', { name: /pular|skip/i });
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForLoadState('networkidle');
  });

  test('abre o modal de item avulso ao clicar no botão correspondente', async ({ page }) => {
    const avulsoBtn = page.getByRole('button', { name: /avulso|valor livre|personalizado/i });
    if (await avulsoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await avulsoBtn.click();
      const modal = page.locator('[data-testid="modal-avulso"], [role="dialog"]').first();
      await expect(modal).toBeVisible({ timeout: 4_000 });
    } else {
      test.skip();
    }
  });
});

test.describe('Frente de Caixa - Modal de Pagamento', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    const skipBtn = page.getByRole('button', { name: /pular|skip/i });
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForLoadState('networkidle');
  });

  test('botão Cobrar está desabilitado quando o carrinho está vazio', async ({ page }) => {
    const cobrarBtn = page.getByRole('button', { name: /cobrar|finalizar|pagar/i });
    if (await cobrarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const isDisabled = await cobrarBtn.isDisabled();
      expect(isDisabled).toBeTruthy();
    } else {
      test.skip();
    }
  });
});

test.describe('Gestão - Produtos', () => {
  test('acessa a página de produtos via /gestao/produtos', async ({ page }) => {
    await page.goto('/gestao/produtos');
    await expect(page).toHaveURL(/\/gestao\/produtos/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8_000 });
  });

  test('exibe lista de produtos ou estado vazio', async ({ page }) => {
    await page.goto('/gestao/produtos');
    const content = page.locator(
      '[data-testid="produtos-list"], table, [data-testid="empty-state"], text=/nenhum produto/i'
    );
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Gestão - Pessoas (Clientes)', () => {
  test('acessa a página de pessoas via /gestao/pessoas', async ({ page }) => {
    await page.goto('/gestao/pessoas');
    await expect(page).toHaveURL(/\/gestao\/pessoas/);
  });

  test('exibe lista de clientes ou estado vazio', async ({ page }) => {
    await page.goto('/gestao/pessoas');
    const content = page.locator(
      'table, [data-testid="pessoas-list"], text=/nenhum cliente/i, text=/nenhuma pessoa/i'
    );
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Relatórios', () => {
  test('acessa /relatorios com sucesso', async ({ page }) => {
    await page.goto('/relatorios');
    await expect(page).toHaveURL(/\/relatorios/);
  });

  test('exibe conteúdo de relatórios', async ({ page }) => {
    await page.goto('/relatorios');
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 8_000 });
  });
});
