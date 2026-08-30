import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/20260830195410_whatsapp_confirmation_token_idempotent_issue.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const compactMigration = migration.replace(/\s+/g, ' ');
const verifier = readFileSync(
  resolve('supabase/verification/whatsapp_confirmation_tokens_runtime.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const concurrencyProbe = readFileSync(
  resolve('scripts/verify-whatsapp-confirmation-concurrency.mjs'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('emissão idempotente de token de confirmação WhatsApp', () => {
  it('retorna o token vivo existente antes de invalidar a sessão e trata colisão sem unique_violation crua', () => {
    expect(migration).toContain('create or replace function public.issue_whatsapp_zelo_confirmation_token(');
    const tokenLookup = migration.indexOf('where token_hash = lower(p_token_hash)');
    const invalidate = migration.indexOf('set invalidated_at = now()');

    expect(tokenLookup).toBeGreaterThan(-1);
    expect(invalidate).toBeGreaterThan(tokenLookup);
    expect(compactMigration).toContain('v_token.empresa_id = p_empresa_id');
    expect(compactMigration).toContain('v_token.session_id = s.id');
    expect(compactMigration).toContain('v_token.source_ref = p_source_ref');
    expect(compactMigration).toContain('v_token.revision = p_expected_revision');
    expect(compactMigration).toContain('v_token.consumed_at is null and v_token.invalidated_at is null and v_token.expires_at > now()');
    expect(migration).toContain("message = 'confirmation_token_hash_reuse_conflict'");
    expect(migration).toContain("message = 'confirmation_token_reissue_requires_new_revision'");
    expect(migration).toContain('exception when unique_violation then');
  });

  it('exerce no verificador SQL o replay vivo, a recusa de hash invalidado/expirado e a corrida de emissões iguais', () => {
    expect(verifier).toContain('same-hash issuance was not idempotent');
    expect(verifier).toContain('invalidated token hash was resurrected');
    expect(verifier).toContain('expired token hash was resurrected');
    expect(concurrencyProbe).toContain('duplicate issuance 1');
    expect(concurrencyProbe).toContain('duplicate issuance 2');
    expect(concurrencyProbe).toContain('same-hash concurrent issuance returned different tokens');
  });
});
