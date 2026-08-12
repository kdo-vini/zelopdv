# ZeloMenu catalog extensions RBAC snapshot — 2026-08-12

## Finding verified before the change

The ZeloMenu catalog extension tables were owner-scoped but did not consult
the existing `produtos.gerenciar` capability. An authenticated sub-user could
update existing modifier groups, options, option-to-product links and product
publication rows directly through the Data API.

The production smoke used tenant
`39192d38-507c-443c-b075-85998abde740` and temporary access mappings for the
existing authenticated fixtures. Each update affected one row inside a
transaction and was rolled back; no catalog data or access row persisted.

## Pre-change policy/grant snapshot

The relevant pre-change policies all had owner scoping but no capability:

```text
zelomenu_modifier_groups_actor_insert/update/delete
  authenticated; owner scope + product/group ownership checks on insert/update

zelomenu_modifier_options_actor_insert/update/delete
  authenticated; owner scope + parent group ownership checks on insert/update

zelomenu_modifier_option_products_actor_insert/update/delete
  authenticated; owner scope + option/product ownership checks on insert/update

zelomenu_product_publications_actor_insert/update/delete
  authenticated; owner scope + product ownership checks on insert/update
```

All four tables had `SELECT, INSERT, UPDATE, DELETE` for `authenticated` and
`service_role`; no `anon` table grant was present. SELECT policies were
owner-scoped and are unchanged by this slice.

Exact capture queries:

```sql
select policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'zelomenu_modifier_groups',
    'zelomenu_modifier_options',
    'zelomenu_modifier_option_products',
    'zelomenu_product_publications'
  )
order by tablename, cmd, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'zelomenu_modifier_groups',
    'zelomenu_modifier_options',
    'zelomenu_modifier_option_products',
    'zelomenu_product_publications'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```

## Consumers and blast radius

- `src/lib/components/modals/ModalModificadores.svelte` is the browser CRUD
  consumer for groups, options and option-product links, opened from Gestão →
  Produtos.
- `src/lib/zelomenuPublications.js` is the browser publish/unpublish consumer
  for `zelomenu_product_publications`, also from Gestão → Produtos.
- `src/lib/stores/pdvCache.js` reads all four tables for the POS. Its SELECT
  behavior remains owner-scoped so Caixa/Atendente can price configured items.
- Public menu/server paths and E2E fixture cleanup use service-role and remain
  unchanged.
- No billing, sales, offline replay, Mesa, or large UI file changes are part of
  this migration.

## Exact forward change

Migration `supabase/migrations/20260813020000_catalog_extensions_rbac.sql`
recreates only the write policies for the four tables:

- INSERT/UPDATE/DELETE require effective-owner scope and
  `fiado_actor_can('produtos.gerenciar', id_usuario)`;
- existing parent product/group/option ownership checks remain in place;
- SELECT policies, table grants, row shapes and service-role bypass remain
  unchanged.

Owners continue to pass the canonical capability helper. A sub-user with
`produtos.gerenciar` retains the existing product-management flow; a role
without it is denied at RLS even if it forges the owner ID in the payload.

## Verification matrix

| Persona/path | Expected result |
| --- | --- |
| owner | allowed |
| sub-user without `produtos.gerenciar` | denied |
| sub-user with `produtos.gerenciar` | allowed |
| super-admin without tenant membership | denied |
| anon | denied by existing table grant/RLS boundary |
| service-role | allowed, unchanged |
| POS cache SELECT | allowed, unchanged |

Every temporary mapping and update is transactional and rolled back.

## Rollback procedure

Do not rewrite this migration. Create a new forward migration restoring the
snapshotted owner-only write policies for the four tables. Re-run the full
persona matrix and verify the temporary fixture has no rows.
