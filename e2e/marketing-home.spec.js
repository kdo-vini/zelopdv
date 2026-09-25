import { test, expect } from '@playwright/test';

test.describe('Landing pública', () => {
  test('preserva o hero e mostra prova real do produto no primeiro ciclo', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /você vende\. o zelo cuida do resto\./i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /vendeu bem\. mas quanto sobrou\?/i })).toBeVisible();
    await expect(page.getByRole('img', { name: /relatório financeiro do zelo pdv/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /vendeu bem\. mas quanto sobrou\?/i }).getByRole('link', { name: /ver cardápios publicados/i })).toHaveAttribute('href', 'https://menu.zelopdv.com.br/#empresas');
  });

  test('abre a tela real em lightbox e restaura o foco ao fechar', async ({ page }) => {
    await page.goto('/');

    const preview = page.getByRole('button', { name: /ampliar tela de relatório financeiro/i });
    await expect(page.locator('#operational-proof')).toHaveAttribute('data-proof-ready', 'true');
    await preview.click();
    await expect(page.getByRole('dialog', { name: /visualização ampliada/i })).toBeVisible();
    await page.getByRole('button', { name: /fechar imagem/i }).click();
    await expect(preview).toBeFocused();
  });

  test('não expõe email pessoal no rodapé e mantém identificação institucional', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('techne.br@gmail.com')).toHaveCount(0);
    await expect(page.getByText(/CNPJ: 65\.679\.798\/0001-95/)).toBeVisible();
    await expect(page.getByRole('link', { name: /falar no whatsapp/i })).toHaveAttribute('target', '_blank');
  });

  test('anuncia o manifesto PWA no HTML da landing', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
  });

  test('serve os ícones declarados pelo manifesto nos tamanhos exigidos', async ({ page }) => {
    await page.goto('/');

    const manifestResponse = await page.request.get(new URL('/manifest.webmanifest', page.url()).toString());
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    const requiredSizes = new Set(['192x192', '512x512']);
    const foundSizes = new Set();

    for (const icon of manifest.icons) {
      if (!requiredSizes.has(icon.sizes)) continue;

      const iconResponse = await page.request.get(new URL(icon.src, manifestResponse.url()).toString());
      expect(iconResponse.status()).toBe(200);
      const png = Buffer.from(await iconResponse.body());
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(Number(icon.sizes.split('x')[0]));
      expect(png.readUInt32BE(20)).toBe(Number(icon.sizes.split('x')[1]));
      foundSizes.add(icon.sizes);
    }

    expect(foundSizes).toEqual(requiredSizes);
  });

  for (const width of [320, 390, 768, 1024, 1440]) {
    test(`mantém a prova comercial utilizável em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /você vende\. o zelo cuida do resto\./i })).toBeVisible();
      await page.locator('#operational-proof').scrollIntoViewIfNeeded();
      await expect(page.getByRole('heading', { name: /vendeu bem\. mas quanto sobrou\?/i })).toBeVisible();
      const publishedMenus = page.getByRole('region', { name: /vendeu bem\. mas quanto sobrou\?/i }).getByRole('link', { name: /ver cardápios publicados/i });
      await expect(publishedMenus).toBeVisible();
      const ctaBox = await publishedMenus.boundingBox();
      expect(ctaBox?.width).toBeGreaterThanOrEqual(44);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        body: document.documentElement.scrollWidth,
      }));
      expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
  }

  test('respeita redução de movimento na prova', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const transition = await page.locator('#operational-proof .proof-shot img').first().evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(transition).toBe('0s');
  });
});
