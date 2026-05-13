import { test, expect } from '@playwright/test';

async function detectAccessControlState(page) {
  const inactiveCta = page.getByRole('link', { name: /ver extensões disponíveis/i });
  const usersTab = page.getByRole('button', { name: /usuários/i });

  const state = await Promise.race([
    inactiveCta.waitFor({ state: 'visible', timeout: 12_000 }).then(() => 'inactive'),
    usersTab.waitFor({ state: 'visible', timeout: 12_000 }).then(() => 'active'),
  ]);

  return { state, inactiveCta, usersTab };
}

test.describe('Controle de Acessos', () => {
  test('carrega a rota e mostra a UI compatível com o estado do add-on', async ({ page }) => {
    await page.goto('/gestao/acessos');
    await expect(page).toHaveURL(/\/gestao\/acessos/);
    await expect(
      page.getByRole('heading', { name: 'Controle de Acessos', exact: true }),
    ).toBeVisible();

    const inactiveHeading = page.getByText(/controle de acessos não está ativo/i);
    const { state, inactiveCta } = await detectAccessControlState(page);

    if (state === 'inactive') {
      await expect(inactiveHeading).toBeVisible();
      await expect(page.getByText(/ative o add-on de controle de acessos/i)).toBeVisible();
      await expect(inactiveCta).toBeVisible();
      return;
    }

    await expect(page.getByRole('button', { name: /cargos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /usuários/i })).toBeVisible();
  });

  test('leva para extensões quando o add-on está inativo', async ({ page }) => {
    await page.goto('/gestao/acessos');

    const { state, inactiveCta, usersTab } = await detectAccessControlState(page);

    if (state === 'inactive') {
      await inactiveCta.click();
      await expect(page).toHaveURL(/\/gestao\/extensoes/);
      return;
    }

    await expect(usersTab).toBeVisible();
    await usersTab.click();
    await expect(
      page.getByRole('button', { name: /convidar usuário/i }),
    ).toBeVisible();
  });
});
