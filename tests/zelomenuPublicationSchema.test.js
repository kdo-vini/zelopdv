import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Normaliza CRLF→LF: em checkout Windows com core.autocrlf o arquivo vem com
// \r\n e as asserções multilinha (\n literal) falhariam só por line ending.
const migration = readFileSync(
  resolve('.ai/migrations/zelomenu_publication_schema_2026_06_23.sql'),
  'utf8',
)
  .replace(/\r\n/g, '\n')
  .toLowerCase();

describe('ZeloMenu publication schema migration', () => {
  const tables = [
    'zelomenu_product_publications',
    'zelomenu_modifier_groups',
    'zelomenu_modifier_options',
  ];

  it('creates the PDV-owned ZeloMenu publication tables', () => {
    for (const table of tables) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('keeps online publication separate from PDV product visibility', () => {
    expect(migration).toContain('visivel_online boolean not null default false');
    expect(migration).toContain('pausado_manualmente boolean not null default false');
    expect(migration).not.toContain('ocultar_no_pdv boolean');
    expect(migration).not.toContain('ocultar_no_pdv,');
  });

  it('scopes authenticated writes by owner and base product ownership', () => {
    expect(migration).toContain('get_owner_user_id(auth.uid()) = id_usuario');
    expect(migration).toContain('from public.produtos p');
    expect(migration).toContain('and p.id_usuario = zelomenu_product_publications.id_usuario');
    expect(migration).toContain('and p.id_usuario = zelomenu_modifier_groups.id_usuario');
    expect(migration).toContain('from public.zelomenu_modifier_groups g');
    expect(migration).toContain('and g.id_usuario = zelomenu_modifier_options.id_usuario');
  });

  it('requires explicit authenticated grants and keeps anon out of editor tables', () => {
    for (const table of tables) {
      expect(migration).toContain(`revoke all on public.${table} from anon, authenticated, service_role`);
      expect(migration).toContain(
        `grant select, insert, update, delete\n  on public.${table}\n  to authenticated, service_role`,
      );
    }
  });

  it('models modifiers with bounded selections and additive prices only', () => {
    expect(migration).toContain("check (tipo in ('adicional', 'variacao'))");
    expect(migration).toContain('max_selecoes >= greatest(min_selecoes, 1)');
    expect(migration).toContain('price_delta numeric(10, 2) not null default 0');
    expect(migration).toContain('check (price_delta >= 0)');
  });
});
