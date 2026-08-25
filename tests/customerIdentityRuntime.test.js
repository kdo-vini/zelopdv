import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const databaseConfigured = Boolean(
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
);

describe('customer identity runtime verification', () => {
  it.skipIf(!databaseConfigured)(
    'runs authorization, isolation, and independent-session probes on a validation database',
    () => {
      const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
      expect(() => execFileSync(
        'psql',
        [
          databaseUrl,
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '--file',
          resolve('supabase/verification/customer_identity_authz.sql'),
        ],
        { stdio: 'inherit', timeout: 60_000 },
      )).not.toThrow();
      expect(() => execFileSync(
        process.execPath,
        [resolve('scripts/verify-customer-identity-concurrency.mjs')],
        { stdio: 'inherit', timeout: 60_000 },
      )).not.toThrow();
    },
  );
});
