import { test as cleanup } from '@playwright/test';
import { cleanupTestTenant } from './helpers/test-tenant.js';

cleanup('cleanup dedicated tenant', async () => {
  if (process.env.E2E_DEDICATED_TENANT !== 'true') return;
  await cleanupTestTenant();
});
