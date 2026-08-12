# Report SELECT RBAC snapshot — 2026-08-12

## Finding verified before the change

The `/relatorios` route already checked `relatorios.ver` in the browser, but
the production `caixa_fechamentos` SELECT policy only checked tenant ownership.
An authenticated Atendente fixture without a role permission therefore read 42
owner closing-history rows directly through the Data API.

The fixture used the production tenant
`d5625be9-abef-4371-a8e7-e915220aec42`; all verification transactions were
rolled back and no rows were created or changed.

## Pre-change policy/grant snapshot

Captured from the linked production schema immediately before this migration:

```text
caixa_fechamentos_actor_select
  SELECT public
  USING (get_owner_user_id(auth.uid()) = id_usuario)

table ACL (anon/authenticated/service_role)
  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
```

Exact capture queries:

```sql
select policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'caixa_fechamentos';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'caixa_fechamentos'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;
```

## Consumers and blast radius

- `src/routes/relatorios/+page.svelte` is the only browser consumer that reads
  `caixa_fechamentos`; it already requires `relatorios.ver` for sub-users.
- `src/lib/server/intelligence/fetchers.js` reads the table with service-role,
  which bypasses RLS and is unchanged.
- `src/routes/gestao/caixa/+page.svelte` inserts closing-history rows; this
  migration does not change INSERT or closing behavior.
- No browser consumer was found for anonymous closing-history reads.
- Shared operational tables (`caixas`, `vendas`, `vendas_pagamentos`, and
  `caixa_movimentacoes`) are intentionally not changed because the PDV,
  dashboard, Mesa, and cash-operation paths read them directly.

## Exact forward change

Migration `supabase/migrations/20260813010000_reports_select_rbac.sql`:

- recreates `caixa_fechamentos_actor_select` for `authenticated` only;
- preserves effective-owner scoping;
- requires `fiado_actor_can('relatorios.ver', id_usuario)`;
- revokes all table privileges from `anon`;
- preserves authenticated/service-role access and the table shape.

The owner bypass in `fiado_actor_can` preserves owner behavior. A permitted
sub-user can still read the report history; an unpermitted sub-user cannot.

## Verification matrix

Expected after the migration:

| Persona/path | Result |
| --- | --- |
| owner | allowed |
| sub-user without `relatorios.ver` | denied / zero rows |
| sub-user with `relatorios.ver` | allowed |
| super-admin without tenant membership | denied / zero rows |
| anon | denied at table privilege |
| service-role | allowed, unchanged |

Every fixture role assignment and query is transactional and rolled back.

## Remaining report scope

Sales, cash-box, payment, Mesa, and customer tables are shared by operational
browser consumers and remain owner-scoped in this slice. A future report-only
API/RPC would be needed to distinguish report reads on those shared tables
without changing legitimate PDV/Mesa behavior; that is intentionally separate.

## Rollback procedure

Do not rewrite this migration. Create a new forward migration that restores the
snapshotted `public` SELECT policy and grants `anon` the pre-change table ACL.
Re-run the complete persona matrix and confirm the temporary fixture is absent.
