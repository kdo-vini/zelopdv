import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';
const server = await createServer({ configFile: false, root: path.resolve('tests/browser/pizza'),
  resolve: { alias: { $lib: path.resolve('src/lib') } }, plugins: [svelte({ configFile: false })],
  server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await expect(page.getByRole('button', { name: 'Revise as opções acima' })).toBeDisabled();
  await page.getByRole('button', { name: /Grande ·/ }).click();
  await page.getByRole('button', { name: '2 sabores · partes iguais' }).click();
  await page.getByRole('button', { name: /Calabresa/ }).click();
  await expect(page.getByRole('button', { name: 'Revise as opções acima' })).toBeDisabled();
  await page.getByRole('button', { name: /Portuguesa/ }).click();
  await expect(page.getByRole('button', { name: /Frango/ })).toBeDisabled();
  await page.getByRole('radio', { name: /Catupiry/ }).click();
  await page.getByRole('textbox', { name: 'Observação para esta pizza' }).fill('Bem assada');
  await page.getByRole('button', { name: /Adicionar à comanda/ }).click();
  const payload = JSON.parse(await page.locator('output').innerText());
  expect(payload.preco).toBe(68);
  expect(payload.pizza.flavors).toHaveLength(2);
  expect(payload.pizza.flavors.every(f => f.denominator === 2)).toBe(true);
  expect(payload.pizza.notes).toBe('Bem assada');
  expect(payload.modifiers.find(g => g.groupId === '__pizza_notes').selectedOptions[0].optionName).toBe('Bem assada');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar pizza', exact: true }).click();
  await expect(page.getByRole('button', { name: /Salvar montagem/ })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Observação para esta pizza' })).toHaveValue('Bem assada');
  await expect(page.getByRole('radio', { name: /Catupiry/ })).toBeChecked();
  await page.getByRole('button', { name: /Pequena ·/ }).click();
  await expect(page.getByRole('button', { name: 'Revise as opções acima' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Portuguesa/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir pizza' }).click();
  await expect(page.getByRole('button', { name: /Grande ·/ })).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.close();
  }
  console.log('Pizza UI: halves + crust = 68, incomplete blocked, size change, reset and mobile/desktop layout verified.');
} finally { await browser?.close(); await server.close(); }
