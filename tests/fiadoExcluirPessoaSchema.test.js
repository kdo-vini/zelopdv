import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('.ai/migrations/fiado_excluir_pessoa_quitada_2026_07_30.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('fiado person deletion migration', () => {
  it('centralizes deletion in an authenticated owner-scoped RPC', () => {
    expect(migration).toContain('create or replace function public.fiado_excluir_pessoa(p_id_pessoa uuid)');
    expect(migration).toContain("public.fiado_actor_can('pessoas.gerenciar', v_owner)");
    expect(migration).toContain('and id_usuario = v_owner');
    expect(migration).toContain('grant execute on function public.fiado_excluir_pessoa(uuid) to authenticated, service_role');
  });

  it('blocks non-zero balances and removes dependent links transactionally', () => {
    expect(migration).toContain("coalesce(v_pessoa.saldo_fiado, 0) <> 0");
    expect(migration).toContain('set id_cliente = null,');
    expect(migration).toContain('delete from public.fiado_lancamentos');
    expect(migration).toContain('delete from public.pessoas');
  });
});
