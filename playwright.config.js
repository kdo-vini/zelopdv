import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Zelo PDV.
 * Tests run against the local dev server (or a staging URL via E2E_BASE_URL).
 *
 * Required environment variables for tests that hit Supabase:
 *   E2E_BASE_URL          - App base URL (default: http://localhost:5173)
 *   E2E_TEST_EMAIL        - Test user email (must exist in Supabase with active sub)
 *   E2E_TEST_PASSWORD     - Test user password
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
  },

  projects: [
    // Setup project: creates authenticated storage state so tests don't re-login each time
    {
      name: 'setup',
      testMatch: /.*\.setup\.js/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Start the dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
