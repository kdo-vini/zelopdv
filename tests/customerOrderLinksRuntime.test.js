import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const databaseConfigured = Boolean(
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
);

describe('customer order links runtime verification', () => {
  it.skipIf(!databaseConfigured)(
    'runs transactional order, tenant, FK, fiado, snapshot, and grant probes',
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
          resolve('supabase/verification/customer_order_links_authz.sql'),
        ],
        { stdio: 'inherit', timeout: 60_000 },
      )).not.toThrow();
    },
  );
});
