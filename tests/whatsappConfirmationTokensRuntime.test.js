import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const disposableConcurrencyOptIn = process.env.ZELOPDV_RUN_WHATSAPP_CONFIRMATION_CONCURRENCY === '1'
  && Boolean(process.env.ZELOPDV_DISPOSABLE_DB_URL);

describe('runtime verification of WhatsApp confirmation tokens', () => {
  it.skipIf(!disposableConcurrencyOptIn)(
    'probes issuance replacement, binding, expiration, retry, and service-role ACL transactionally',
    () => {
      // The probe itself runs the behavioral SQL through its fail-closed,
      // per-process psql timeout wrapper before opening the concurrent calls.
      expect(() => execFileSync(
        process.execPath,
        [resolve('scripts/verify-whatsapp-confirmation-concurrency.mjs')],
        { stdio: 'inherit', timeout: 60_000 },
      )).not.toThrow();
    },
  );
});
