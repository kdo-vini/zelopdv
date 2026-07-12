import { test, expect } from '@playwright/test';

test.describe('Zelinho Gerente', () => {
  test('opens the pilot briefing and weekly report', async ({ page }) => {
    await page.goto('/gestao/gerente');
    await expect(page).toHaveURL(/\/gestao\/gerente/);

    const unavailable = page.getByText(/ainda não está disponível/i);
    if (await unavailable.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'The E2E account is not enabled as a Zelinho Gerente pilot.');
    }

    await expect(page.getByRole('heading', { name: 'Zelinho Gerente' })).toBeVisible();
    await page.getByRole('link', { name: /relatório semanal/i }).click();
    await expect(page).toHaveURL(/\/gestao\/gerente\/semana/);
  });
});
