/**
 * auth.setup.js
 *
 * Playwright "setup" project: logs in once and saves the browser storage state
 * so every subsequent test file starts already authenticated.
 *
 * Required env vars:
 *   E2E_TEST_EMAIL    - e.g. "e2e@zelopdv.com.br"
 *   E2E_TEST_PASSWORD - password for that account
 *
 * The user must have:
 *   - A completed empresa_perfil (nome_exibicao, documento, contato)
 *   - An active subscription row in the `subscriptions` table
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import {
  E2E_ATENDENTE_EMAIL,
  E2E_CAIXA_EMAIL,
  E2E_GERENTE_EMAIL,
  E2E_SUBUSER_PASSWORD,
  seedAccessControlE2EUsers,
} from './helpers/access-control-fixtures.js';

const authFile = path.join(import.meta.dirname, '.auth/user.json');
const caixaAuthFile = path.join(import.meta.dirname, '.auth/caixa.json');
const atendenteAuthFile = path.join(import.meta.dirname, '.auth/atendente.json');
const gerenteAuthFile = path.join(import.meta.dirname, '.auth/gerente.json');

async function loginAndSave(page, email, password, targetFile) {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login/);

  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();

  await page.waitForURL(/\/(app|perfil|assinatura)/, { timeout: 15_000 });
  await page.context().storageState({ path: targetFile });
}

setup('authenticate', async ({ page, browser }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars are required. ' +
        'Create a .env.test file or export them before running.'
    );
  }

  await seedAccessControlE2EUsers(email);

  await loginAndSave(page, email, password, authFile);

  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

  const caixaContext = await browser.newContext({ baseURL });
  const caixaPage = await caixaContext.newPage();
  await loginAndSave(caixaPage, E2E_CAIXA_EMAIL, E2E_SUBUSER_PASSWORD, caixaAuthFile);
  await caixaContext.close();

  const atendenteContext = await browser.newContext({ baseURL });
  const atendentePage = await atendenteContext.newPage();
  await loginAndSave(atendentePage, E2E_ATENDENTE_EMAIL, E2E_SUBUSER_PASSWORD, atendenteAuthFile);
  await atendenteContext.close();

  const gerenteContext = await browser.newContext({ baseURL });
  const gerentePage = await gerenteContext.newPage();
  await loginAndSave(gerentePage, E2E_GERENTE_EMAIL, E2E_SUBUSER_PASSWORD, gerenteAuthFile);
  await gerenteContext.close();
});
