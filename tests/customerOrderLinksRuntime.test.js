import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const databaseConfigured = Boolean(
  process.env.ZELOPDV_DISPOSABLE_DB_URL === 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
);

describe('customer order links runtime verification', () => {
  it.skipIf(!databaseConfigured)(
    'runs transactional order, tenant, FK, fiado, snapshot, and grant probes',
    () => {
      const databaseUrl = process.env.ZELOPDV_DISPOSABLE_DB_URL;
      expect(() => execFileSync(
        'psql',
        [
          databaseUrl,
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '--file',
          resolve('supabase/verification/customer_order_links_authz.sql'),
        ],
        { stdio: 'inherit', timeout: 60_000 },
      )).not.toThrow();
    },
  );
});
