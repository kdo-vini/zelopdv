const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const dir = path.join(__dirname, 'static', 'images', 'screenshots');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('https://zelopdv.com.br/login');

    // Login
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', 'kdo.vini@gmail.com');
    await page.fill('input[type="password"]', '@Vi070903');
    // Need to be careful with submit button selector. Let's just press Enter.
    await page.press('input[type="password"]', 'Enter');

    console.log('Logging in...');
    await page.waitForURL('**/app**', { timeout: 15000 }).catch(() => console.log('Timeout waiting for URL'));
    await page.waitForTimeout(5000); // Wait for full render and animations
    console.log('On Dashboard / Sales screen');

    // Dashboard / Sales
    await page.screenshot({ path: path.join(dir, 'dashboard-desktop.webp') });
    await page.screenshot({ path: path.join(dir, 'sales-screen.webp') });

    // Financeiro (Relatorios)
    console.log('Going to Relatorios...');
    await page.goto('https://zelopdv.com.br/relatorios');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(dir, 'financial-screen.webp') });

    // Fiado (Fichario)
    console.log('Going to Fichario...');
    await page.goto('https://zelopdv.com.br/admin/fichario');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(dir, 'customers-screen.webp') });

    await browser.close();
    console.log('Screenshots captured successfully.');
})();
