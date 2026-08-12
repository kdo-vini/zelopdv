import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813020000_catalog_extensions_rbac.sql'),
  'utf8',
);

describe('catalog extension RBAC migration', () => {
  it('enforces produtos.gerenciar on every catalog-extension write policy', () => {
    expect(migration.match(/fiado_actor_can\('produtos\.gerenciar'/g)?.length).toBeGreaterThanOrEqual(12);
    expect(migration).toContain('zelomenu_modifier_groups_actor_insert');
    expect(migration).toContain('zelomenu_modifier_options_actor_insert');
    expect(migration).toContain('zelomenu_modifier_option_products_actor_insert');
    expect(migration).toContain('zelomenu_product_publications_actor_insert');
  });

  it('keeps parent ownership checks and authenticated write targeting', () => {
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('from public.produtos p');
    expect(migration).toContain('from public.zelomenu_modifier_groups g');
    expect(migration).toContain('from public.zelomenu_modifier_options o');
  });

  it('does not replace the read or service-role contract', () => {
    expect(migration).not.toContain('actor_select');
    expect(migration).not.toContain('revoke');
    expect(migration).not.toContain('service_role');
  });
});
