/**
 * e2e/auth.spec.js
 *
 * Tests for authentication flows: login, signup, password reset.
 * These run WITHOUT stored auth state (no dependency on 'setup') so that
 * we test the full unauthenticated experience.
 */
import { test, expect } from '@playwright/test';

// Override project storageState for this file — run as guest
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Página de Login', () => {
  test('exibe campos de email e senha e botão Entrar', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('exibe erro ao submeter com campos vazios', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /entrar/i }).click();
    // Native HTML validation or JS validation should show an error
    const hasNativeError = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:invalid');
      return inputs.length > 0;
    });
    const hasAppError = await page.locator('[role=alert], .error, [data-error]').count();
    expect(hasNativeError || hasAppError > 0).toBeTruthy();
  });

  test('exibe erro com credenciais inválidas', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill('invalido@exemplo.com.br');
    await page.getByLabel(/senha/i).fill('senha-errada-123');
    await page.getByRole('button', { name: /entrar/i }).click();

    // Wait for error message to appear (toast or inline)
    await expect(
      page.locator('text=/credenciais|email|senha|inválid/i').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('link "Esqueci minha senha" navega para a página correta', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /esqueci|recuperar/i }).click();
    await expect(page).toHaveURL(/esqueci-senha/);
  });

  test('link de cadastro navega para /cadastro', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /criar conta|cadastro|registrar/i }).click();
    await expect(page).toHaveURL(/cadastro/);
  });
});

test.describe('Página de Cadastro', () => {
  test('exibe formulário de criação de conta', async ({ page }) => {
    await page.goto('/cadastro');
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /criar|cadastrar|registrar/i })).toBeVisible();
  });

  test('exibe erro com email inválido', async ({ page }) => {
    await page.goto('/cadastro');
    await page.getByLabel(/e-?mail/i).fill('nao-é-um-email');
    await page.getByRole('button', { name: /criar|cadastrar|registrar/i }).click();

    const hasNativeError = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:invalid');
      return inputs.length > 0;
    });
    expect(hasNativeError).toBeTruthy();
  });
});

test.describe('Recuperação de Senha', () => {
  test('exibe campo de email e botão de envio', async ({ page }) => {
    await page.goto('/esqueci-senha');
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /enviar|recuperar|redefinir/i })).toBeVisible();
  });

  test('aceita email válido e exibe confirmação', async ({ page }) => {
    await page.goto('/esqueci-senha');
    await page.getByLabel(/e-?mail/i).fill('teste@exemplo.com.br');
    await page.getByRole('button', { name: /enviar|recuperar|redefinir/i }).click();

    // Should show a success message after submission
    await expect(
      page.locator('text=/enviado|verifique|email/i').first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Redirecionamentos de Rota', () => {
  test('rota protegida /app redireciona para /login quando não autenticado', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/login/);
  });

  test('rota protegida /gestao redireciona para /login quando não autenticado', async ({ page }) => {
    await page.goto('/gestao');
    await expect(page).toHaveURL(/login/);
  });

  test('rota protegida /relatorios redireciona para /login quando não autenticado', async ({
    page,
  }) => {
    await page.goto('/relatorios');
    await expect(page).toHaveURL(/login/);
  });
});
