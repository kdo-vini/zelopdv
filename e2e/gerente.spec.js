import { test, expect } from '@playwright/test';

test.describe('Zelinho Gerente', () => {
  test('opens the briefing and weekly report', async ({ page }) => {
    await page.goto('/gestao/gerente');
    await expect(page).toHaveURL(/\/gestao\/gerente/);

    await expect(page.getByRole('heading', { name: 'Zelinho Gerente' })).toBeVisible();
    await page.getByRole('link', { name: /relatório semanal/i }).click();
    await expect(page).toHaveURL(/\/gestao\/gerente\/semana/);
  });
});
