/**
 * e2e/onboarding.spec.js
 *
 * Covers the current first-use onboarding model:
 * - the legacy in-PDV tour was intentionally removed;
 * - activation guidance now lives in the setup wizard and first-steps checklist.
 *
 * Authenticated tests use the storage state created by auth.setup.js.
 */
import { test, expect } from '@playwright/test';

test.describe('First-use onboarding model', () => {
  test('does not render the removed legacy PDV tour', async ({ page }) => {
    await page.goto('/app');

    await expect(page.locator('[data-testid="onboarding-tour"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="onboarding-highlight"]')).toHaveCount(0);
  });

  test('does not rely on the old localStorage tour flag', async ({ page }) => {
    await page.goto('/app');
    await page.evaluate(() => localStorage.removeItem('zelo_onboarding_done'));
    await page.reload();

    await expect(page.locator('[data-testid="onboarding-tour"]')).toHaveCount(0);

    const legacyFlag = await page.evaluate(() => localStorage.getItem('zelo_onboarding_done'));
    expect(legacyFlag).toBeNull();
  });

  test('shows a usable POS surface instead of blocking with a second tour', async ({ page }) => {
    await page.goto('/app');

    await expect(page.locator('[data-testid="product-grid"], [data-testid="cart"]').first()).toBeVisible({
      timeout: 12_000,
    });
  });
});

test.describe('Incomplete profile flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('protected /app redirects unauthenticated users to login or profile setup', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/(login|perfil)/);
  });
});
