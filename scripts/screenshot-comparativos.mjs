import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

await page.goto('http://localhost:5173/comparativos', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/screenshot-comparativos-desktop.png', fullPage: false });
await page.screenshot({ path: '/tmp/screenshot-comparativos-full.png', fullPage: true });

await browser.close();
console.log('Done');
