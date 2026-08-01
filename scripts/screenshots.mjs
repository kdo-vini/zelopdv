import { chromium } from '@playwright/test';

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 667 }
};

const URLS = {
  local: 'http://localhost:5173/',
  prod: 'https://zelopdv.com.br/'
};

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });

  for (const [env, url] of Object.entries(URLS)) {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `/tmp/screenshot-${env}-desktop.png`, fullPage: false });
      await page.screenshot({ path: `/tmp/screenshot-${env}-desktop-full.png`, fullPage: true });
      console.log(`✅ ${env} desktop captured`);
    } catch (e) {
      console.error(`❌ ${env} desktop failed: ${e.message}`);
    }
    await context.close();

    const mobileContext = await browser.newContext({ viewport: VIEWPORTS.mobile });
    const mobilePage = await mobileContext.newPage();
    try {
      await mobilePage.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await mobilePage.waitForTimeout(1500);
      await mobilePage.screenshot({ path: `/tmp/screenshot-${env}-mobile.png`, fullPage: false });
      console.log(`✅ ${env} mobile captured`);
    } catch (e) {
      console.error(`❌ ${env} mobile failed: ${e.message}`);
    }
    await mobileContext.close();
  }

  await browser.close();
  console.log('🎯 All screenshots done');
}

takeScreenshots().catch(console.error);
