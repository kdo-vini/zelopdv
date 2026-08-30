import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const databaseConfigured = Boolean(
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
);

describe('runtime verification of WhatsApp confirmation tokens', () => {
  it.skipIf(!databaseConfigured)(
    'probes issuance replacement, binding, expiration, retry, and service-role ACL transactionally',
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
          resolve('supabase/verification/whatsapp_confirmation_tokens_runtime.sql'),
        ],
        { stdio: 'inherit', timeout: 60_000 },
      )).not.toThrow();
    },
  );
});
