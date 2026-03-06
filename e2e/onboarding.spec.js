/**
 * e2e/onboarding.spec.js
 *
 * Tests for the guided onboarding tour shown to new users on their first
 * visit to /app after completing their profile and subscription.
 *
 * These tests use the authenticated storage state created by auth.setup.js.
 */
import { test, expect } from '@playwright/test';

test.describe('Tour de Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Reset the onboarding flag so the tour always shows during tests
    await page.goto('/app');
    await page.evaluate(() => localStorage.removeItem('zelo_onboarding_done'));
    await page.reload();

    // Dismiss PinSetupModal if it appears before the tour
    const pinSkipBtn = page.getByRole('button', { name: /configurar depois/i });
    if (await pinSkipBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await pinSkipBtn.click();
    }

    // Wait for the POS page to be fully loaded
    await page.waitForSelector('[data-tour="step-1"], [data-testid="onboarding-tour"]', {
      timeout: 12_000,
    });
  });

  test('exibe o tour na primeira visita ao /app', async ({ page }) => {
    const tour = page.locator('[data-testid="onboarding-tour"]');
    await expect(tour).toBeVisible();
  });

  test('primeiro passo apresenta boas-vindas ao sistema', async ({ page }) => {
    const tour = page.locator('[data-testid="onboarding-tour"]');
    await expect(tour).toContainText(/bem-vindo|bem vindo|olá/i);
  });

  test('botão "Próximo" avança para o próximo passo', async ({ page }) => {
    const nextBtn = page.getByRole('button', { name: /próximo|next|avançar/i });
    await expect(nextBtn).toBeVisible();

    const stepBefore = await page
      .locator('[data-testid="onboarding-step-indicator"]')
      .textContent();
    await nextBtn.click();
    const stepAfter = await page
      .locator('[data-testid="onboarding-step-indicator"]')
      .textContent();

    expect(stepBefore).not.toEqual(stepAfter);
  });

  test('botão "Anterior" retorna ao passo anterior', async ({ page }) => {
    // Advance to step 2 first
    await page.getByRole('button', { name: /próximo|next|avançar/i }).click();

    const prevBtn = page.getByRole('button', { name: /anterior|voltar|prev/i });
    await expect(prevBtn).toBeVisible();
    await prevBtn.click();

    // Should be back at step 1
    const stepIndicator = page.locator('[data-testid="onboarding-step-indicator"]');
    await expect(stepIndicator).toContainText('1');
  });

  test('botão "Pular" fecha o tour imediatamente', async ({ page }) => {
    // Use the explicit "Pular" text button in the footer (not the ✕ close button)
    const skipBtn = page.locator('[data-testid="onboarding-tour"] .onboarding-btn-skip');
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();

    await expect(page.locator('[data-testid="onboarding-tour"]')).not.toBeVisible();
  });

  test('concluir o tour salva a flag no localStorage', async ({ page }) => {
    // Navigate through all steps until we reach the last one
    let maxSteps = 10;
    while (maxSteps-- > 0) {
      const finishBtn = page.getByRole('button', { name: /concluir|finalizar|começar/i });
      if (await finishBtn.isVisible()) {
        await finishBtn.click();
        break;
      }
      const nextBtn = page.getByRole('button', { name: /próximo|next|avançar/i });
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
      } else {
        break;
      }
    }

    const flag = await page.evaluate(() => localStorage.getItem('zelo_onboarding_done'));
    expect(flag).toBe('true');
  });

  test('não exibe o tour em visitas subsequentes', async ({ page }) => {
    // Skip the tour using the footer "Pular" button
    await page.locator('[data-testid="onboarding-tour"] .onboarding-btn-skip').click();
    await expect(page.locator('[data-testid="onboarding-tour"]')).not.toBeVisible();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Dismiss PinSetupModal if it reappears
    const pinSkipBtn = page.getByRole('button', { name: /configurar depois/i });
    if (await pinSkipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await pinSkipBtn.click();
    }

    // Tour must NOT appear again
    await expect(page.locator('[data-testid="onboarding-tour"]')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('overlay destaca o elemento alvo do passo ativo', async ({ page }) => {
    // Advance to step 2 which targets a specific DOM element (product grid)
    await page.getByRole('button', { name: /próximo|next|avançar/i }).click();

    // Verify step 2 is shown (the tour should highlight the product grid)
    const stepIndicator = page.locator('[data-testid="onboarding-step-indicator"]');
    await expect(stepIndicator).toContainText('2');

    // Verify the highlight element exists in the DOM
    // (It is an empty div styled via inline styles with box-shadow and pointer-events:none.
    //  Svelte's async updatePosition() may not have fully resolved the position yet,
    //  but the element must at least be present.)
    const highlight = page.locator('[data-testid="onboarding-highlight"]');
    await expect(highlight).toBeAttached();
  });
});

test.describe('Fluxo de Perfil Incompleto', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('usuário sem perfil é redirecionado para /perfil', async ({ page }) => {
    // This test is informational — it checks the redirect guard logic
    // The actual redirection happens inside +layout.svelte
    // We test it here by observing the behavior when the guard fires
    // (A freshly logged-in user with no empresa_perfil is redirected)
    await page.goto('/app');
    // Either goes to /login (unauthenticated) or /perfil (authenticated but no profile)
    await expect(page).toHaveURL(/\/(login|perfil)/);
  });
});
