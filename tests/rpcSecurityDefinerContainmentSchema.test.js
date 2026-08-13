import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813033000_rpc_security_definer_containment.sql'),
  'utf8',
);

describe('SECURITY DEFINER RPC containment', () => {
  it('removes public client execution only from server-only RPCs', () => {
    expect(migration).toContain(
      'revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;',
    );
    expect(migration).toContain(
      'revoke all on function public.saldo_caixa(bigint) from public, anon, authenticated;',
    );
    expect(migration).toContain(
      'revoke all on function public.add_empresa_membro_por_email(integer, text, text) from public, anon;',
    );
    expect(migration).toContain(
      'grant execute on function public.add_empresa_membro_por_email(integer, text, text) to authenticated, service_role;',
    );
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/drop\s+function/i);
    expect(migration).not.toMatch(/revoke\s+all\s+on\s+table/i);
  });
});
