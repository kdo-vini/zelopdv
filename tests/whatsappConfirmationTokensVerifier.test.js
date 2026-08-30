import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const verifier = readFileSync(
  resolve('supabase/verification/whatsapp_confirmation_tokens_runtime.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const concurrencyProbePath = resolve('scripts/verify-whatsapp-confirmation-concurrency.mjs');
const concurrencyProbe = existsSync(concurrencyProbePath)
  ? readFileSync(concurrencyProbePath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';

describe('verificador transacional dos tokens de confirmação WhatsApp', () => {
  it('concede acesso à fixture temporária antes de mudar para service_role', () => {
    const fixtureEnd = verifier.indexOf(') on commit drop;');
    const grant = verifier.indexOf(
      'grant select, insert, update, delete on table whatsapp_confirmation_fixture to service_role;',
    );
    const serviceRole = verifier.indexOf('set local role service_role;');

    expect(fixtureEnd).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(fixtureEnd);
    expect(grant).toBeLessThan(serviceRole);
  });

  it('monta sessões A/B e confirma ambas com a mesma chave fornecida pelo caller', () => {
    expect(verifier).toContain('session_b_id uuid not null');
    expect(verifier).toContain('second_confirmation_hash text not null');
    expect(verifier).toContain('second_confirmation_token_id uuid');
    expect(verifier).toContain("f.second_confirmation_hash, f.empresa_id, f.second_source_ref, 1, 'shared-caller-key', null");
    expect(verifier).toContain("raise exception 'same caller key resolved the order of another whatsapp session';");
  });

  it('oferece probe executável de duas conexões para a corrida emissão×confirmação', () => {
    expect(concurrencyProbe).toContain('promise.all([');
    expect(concurrencyProbe).toContain('confirm_whatsapp_zelo_order');
    expect(concurrencyProbe).toContain('issue_whatsapp_zelo_confirmation_token');
    expect(concurrencyProbe).toContain('two independent psql connections');
  });
});
