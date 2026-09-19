import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bridgeName = '20260911110000_zelomenu_canonical_modifier_components.sql';
const pauseName = '20260911113654_zelomenu_canonical_pause.sql';
const bridge = readFileSync(resolve('supabase/migrations', bridgeName), 'utf8')
  .replace(/\r\n/g, '\n')
  .toLowerCase();
const pause = readFileSync(resolve('supabase/migrations', pauseName), 'utf8')
  .replace(/\r\n/g, '\n')
  .toLowerCase();

describe('ZeloMenu canonical modifier-component replay bridge', () => {
  it('restores the prerequisite contract before canonical pause', () => {
    expect(bridge).toContain(
      'create table if not exists public.zelomenu_modifier_components'
    );
    expect(bridge).toMatch(
      /alter table public\.zelomenu_modifier_option_products[\s\S]+alter column id_produto drop not null/
    );
    expect(bridge).toContain(
      'add column if not exists id_componente uuid'
    );
    expect(bridge).toContain(
      'references public.zelomenu_modifier_components(id)'
    );
    expect(pause).toContain('public.zelomenu_modifier_components');
    expect(bridgeName.localeCompare(pauseName)).toBeLessThan(0);
  });

  it('preserves legacy prices while enforcing one canonical destination', () => {
    expect(bridge).toContain('price_override = matches.price_delta');
    expect(bridge).toContain('price_override = option_row.price_delta');
    expect(bridge).toContain(
      'check (num_nonnulls(id_produto, id_componente) = 1) not valid'
    );
    expect(bridge).toContain(
      'validate constraint zelomenu_modifier_option_products_exact_destination'
    );
  });

  it('guards replay-sensitive objects and data writes', () => {
    expect(bridge).toContain('create table if not exists');
    expect(bridge).toContain('add column if not exists id_componente');
    expect(bridge).toContain('on conflict (id_opcao) do nothing');
    expect(bridge).toContain('on conflict (id_usuario, nome_chave) do nothing');
    expect(bridge).toContain('drop policy if exists');
    expect(bridge).toContain('if not exists (');
  });
});
