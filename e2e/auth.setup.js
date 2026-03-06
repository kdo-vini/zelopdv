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

const authFile = path.join(import.meta.dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars are required. ' +
      'Create a .env.test file or export them before running.'
    );
  }

  await page.goto('/login');
  await expect(page).toHaveURL(/\/login/);

  // Wait for form fields to be ready
  const emailField = page.getByLabel(/^e-?mail$/i);
  const passwordField = page.getByLabel(/^senha$/i);
  await expect(emailField).toBeVisible({ timeout: 8_000 });

  await emailField.fill(email);
  await passwordField.fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  // After login the app redirects to /app (active subscription) or /perfil (incomplete profile)
  await page.waitForURL(/\/(app|perfil|assinatura)/, { timeout: 30_000 });

  await page.context().storageState({ path: authFile });
});
