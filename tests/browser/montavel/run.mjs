import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';

const root = path.resolve('tests/browser/montavel');
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { $lib: path.resolve('src/lib') } },
  plugins: [svelte({ configFile: false })],
  server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } }
});

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://127.0.0.1:${port}`);

  await expect(page.getByRole('button', { name: 'Revise as opções acima' })).toBeDisabled();
  await expect(page.getByText('R$ 20,00', { exact: true })).toBeVisible();
  await expect(page.getByText('R$ 25,00', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: /Penne/ }).click();
  await page.getByRole('checkbox', { name: /Bacon/ }).click();
  await expect(page.locator('.option-row.selected')).toHaveCount(2);
  const plus = page.getByRole('button', { name: 'Aumentar', exact: true }).first();
  await expect(plus).toBeVisible();
  await plus.click();
  await expect(page.locator('.stepper span').filter({ hasText: '2' })).toBeVisible();
  await plus.click();
  await expect(plus).toBeDisabled();
  await page.getByRole('checkbox', { name: /Queijo/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ovo/ })).toBeDisabled();
  await expect(page.getByText(/Você já escolheu o máximo/)).toBeVisible();
  await page.getByRole('checkbox', { name: /Queijo/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ovo/ })).toBeEnabled();

  await page.getByRole('checkbox', { name: /Queijo/ }).click();
  await page.getByRole('button', { name: /Adicionar à comanda/ }).click();
  const payload = JSON.parse(await page.locator('output').innerText());
  expect(payload.preco).toBe(31);
  expect(payload.modifiers.find((group) => group.groupId === 'extras').selectedOptions)
    .toEqual([{ optionId: 'bacon', optionName: 'Bacon', priceDelta: 3, quantity: 3 }, { optionId: 'queijo', optionName: 'Queijo', priceDelta: 2, quantity: 1 }]);

  await page.getByRole('button', { name: 'Fechar', exact: true }).evaluate((button) => button.click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir montagem' }).click();
  await expect(page.locator('.option-row.selected')).toHaveCount(0);
  await expect(page.locator('.stepper')).toHaveCount(0);

  await expect(page.getByText('Limpar escolha')).toHaveCount(0);
  await page.getByRole('radio', { name: /Penne/ }).click();
  await page.getByRole('radio', { name: /Tomate/ }).click();
  await expect(page.getByRole('button', { name: 'Limpar escolha' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar escolha' }).click();
  await expect(page.getByRole('radio', { name: /Tomate/ })).not.toBeChecked();

  await page.getByRole('button', { name: 'Fechar', exact: true }).evaluate((button) => button.click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar grupo sem opções' }).click();
  await expect(page.getByText('Sem opções disponíveis neste grupo. Revise o cadastro ou o estoque.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revise as opções acima' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktop.goto(`http://127.0.0.1:${port}`);
  await expect(desktop.getByRole('dialog')).toBeVisible();
  expect(await desktop.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await desktop.close();
  console.log('Montagem: interação, limites, snapshot, reset e layout conferidos');
} finally {
  await browser?.close();
  await server.close();
}
