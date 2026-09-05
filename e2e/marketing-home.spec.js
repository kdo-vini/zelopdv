import { test, expect } from '@playwright/test';

test.describe('Landing pública', () => {
  test('preserva o hero e mostra prova real do produto no primeiro ciclo', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /sua lanchonete vendeu bem/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /veja o que realmente sobrou no fim do dia/i })).toBeVisible();
    await expect(page.getByRole('img', { name: /relatório financeiro do zelo pdv/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /veja o que realmente sobrou no fim do dia/i }).getByRole('link', { name: /ver cardápios publicados/i })).toHaveAttribute('href', 'https://menu.zelopdv.com.br/#empresas');
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

  for (const width of [320, 390, 768, 1024, 1440]) {
    test(`mantém a prova comercial utilizável em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /sua lanchonete vendeu bem/i })).toBeVisible();
      await page.locator('#operational-proof').scrollIntoViewIfNeeded();
      await expect(page.getByRole('heading', { name: /veja o que realmente sobrou/i })).toBeVisible();
      const publishedMenus = page.getByRole('region', { name: /veja o que realmente sobrou/i }).getByRole('link', { name: /ver cardápios publicados/i });
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
