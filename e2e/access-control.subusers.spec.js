import { test, expect } from '@playwright/test';
import {
  cleanupInviteForOwner,
  cleanupPendingInvitesForOwner,
  setOwnerAddons,
} from './helpers/access-control-fixtures.js';

const ownerEmail = process.env.E2E_TEST_EMAIL;

test.describe.configure({ mode: 'serial' });

test.describe('Controle de Acessos - titular', () => {
  test('titular consegue enviar convite pela gestão de acessos', async ({ page }) => {
    const inviteEmail = 'kdo.vini+convite.e2e@gmail.com';
    await cleanupPendingInvitesForOwner(ownerEmail);
    await cleanupInviteForOwner(ownerEmail, inviteEmail);

    await page.goto('/gestao/acessos');
    await expect(page).toHaveURL(/\/gestao\/acessos/);

    await page.getByRole('button', { name: /usuários/i }).click();
    await page.getByRole('button', { name: /convidar usuário/i }).click();

    await page.locator('#invite-email').fill(inviteEmail);
    await page.locator('#invite-role').selectOption({ label: 'Caixa' });
    const inviteResponse = page.waitForResponse(
      (response) => response.url().includes('/api/access/users') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^convidar$/i }).click();
    expect((await inviteResponse).status()).toBe(201);
  });
});

test.describe('Permissões do cargo Caixa', () => {
  test.use({ storageState: 'e2e/.auth/caixa.json' });

  test('caixa fica restrito às rotas operacionais básicas', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app(?:\?|$)/);

    await page.goto('/app/pedidos');
    await expect(page).toHaveURL(/\/app(?:\?|$)/);

    await page.goto('/relatorios');
    await expect(page).toHaveURL(/\/app(?:\?|$)/);

    await page.goto('/gestao/acessos');
    await expect(page).toHaveURL(/\/gestao(?:\?|$)/);

    await page.goto('/gestao/extensoes');
    await expect(page).toHaveURL(/\/gestao(?:\?|$)/);

    await page.goto('/assinatura');
    await expect(page).toHaveURL(/\/gestao(?:\?|$)/);
  });
});

test.describe('Permissões do cargo Atendente', () => {
  test.use({ storageState: 'e2e/.auth/atendente.json' });

  test('atendente acessa mesas e pedidos, mas não relatórios ou acessos', async ({ page }) => {
    await page.goto('/app/pedidos');
    await expect(page).toHaveURL(/\/app\/pedidos/);
    await expect(page.getByRole('button', { name: /novo pedido|criar pedido/i }).first()).toBeVisible();

    await page.goto('/app/pedidos/cozinha');
    await expect(page).toHaveURL(/\/app\/pedidos\/cozinha/);
    await expect(page.getByRole('heading', { name: /pedidos em preparo/i })).toBeVisible();

    await page.goto('/app/mesas');
    await expect(page).toHaveURL(/\/app\/mesas/);
    await expect(page.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible();

    await page.goto('/relatorios');
    await expect(page).toHaveURL(/\/app(?:\?|$)/);

    await page.goto('/gestao/acessos');
    await expect(page).toHaveURL(/\/gestao(?:\?|$)/);
  });
});

test.describe('Permissões do cargo Gerente', () => {
  test.use({ storageState: 'e2e/.auth/gerente.json' });

  test('gerente acessa gestão operacional, mas não assinatura, extensões ou acessos', async ({ page }) => {
    await page.goto('/gestao/produtos');
    await expect(page).toHaveURL(/\/gestao\/produtos/);

    await page.goto('/gestao/estoque');
    await expect(page).toHaveURL(/\/gestao\/estoque/);

    await page.goto('/gestao/despesas');
    await expect(page).toHaveURL(/\/gestao\/despesas/);

    await page.goto('/relatorios');
    await expect(page).toHaveURL(/\/relatorios/);

    await page.goto('/gestao/acessos');
    await expect(page).toHaveURL(/\/gestao(?:\?|$)/);

    await page.goto('/gestao/extensoes');
    await expect(page).toHaveURL(/\/gestao(?:\?|$)/);

    await page.goto('/assinatura');
    await expect(page).toHaveURL(/\/gestao(?:\?|$)/);
  });
});

test.describe('Add-ons inativos no Controle de Acessos', () => {
  test('esconde grupos de Mesas e Pedidos da matriz quando os módulos estão inativos', async ({ page }) => {
    await setOwnerAddons(ownerEmail, { acessos: true, mesas: false, pedidos: false });

    try {
      await page.goto('/gestao/acessos');
      await expect(page).toHaveURL(/\/gestao\/acessos/);

      await expect(page.getByText(/^Mesas$/)).toHaveCount(0);
      await expect(page.getByText(/Pedidos \/ Cozinha/)).toHaveCount(0);
      await expect(page.getByRole('link', { name: /^Mesas$/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /^Pedidos$/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /^Cozinha$/ })).toHaveCount(0);
    } finally {
      await setOwnerAddons(ownerEmail, { acessos: true, mesas: true, pedidos: true });
    }
  });
});

test.describe('Desligamento do add-on de acessos', () => {
  test('titular continua acessando o app quando o add-on é desligado', async ({ page }) => {
    await setOwnerAddons(ownerEmail, { acessos: false, mesas: true, pedidos: true });

    try {
      await page.goto('/app');
      await expect(page).toHaveURL(/\/app(?:\?|$)/);

      await page.goto('/gestao/acessos');
      await expect(page).toHaveURL(/\/gestao\/acessos/);
      await expect(page.getByText(/controle de acessos não está ativo/i)).toBeVisible();
    } finally {
      await setOwnerAddons(ownerEmail, { acessos: true, mesas: true, pedidos: true });
    }
  });
});

test.describe('Desligamento do add-on de acessos para subusuário', () => {
  test.use({ storageState: 'e2e/.auth/caixa.json' });

  test('subusuário perde acesso quando o add-on é desligado', async ({ page }) => {
    await setOwnerAddons(ownerEmail, { acessos: false, mesas: true, pedidos: true });

    try {
      await page.goto('/app');
      await page.waitForURL((url) => !url.pathname.startsWith('/app'), { timeout: 15_000 });
      expect(page.url()).not.toContain('/app');
    } finally {
      await setOwnerAddons(ownerEmail, { acessos: true, mesas: true, pedidos: true });
    }
  });
});
