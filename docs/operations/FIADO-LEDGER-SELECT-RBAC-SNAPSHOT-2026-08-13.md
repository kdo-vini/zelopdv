# Fiado ledger SELECT RBAC snapshot — 2026-08-13

## Finding independently verified

Production revalidation confirmed that the `fiado_lancamentos` ledger was
readable by any active authenticated subuser of the tenant, regardless of the
existing `fiado.visualizar` capability. The permanent E2E Atendente
(`6c151acb-db51-4fc0-aa0c-159443de4d96`) has no `fiado.visualizar`, yet a
transactional Data API-equivalent query returned all 13 ledger rows belonging
to the owner `d5625be9-abef-4371-a8e7-e915220aec42`.

The same production probes confirmed:

- the owner sees the 13 owner ledger rows;
- the E2E Gerente with `fiado.visualizar` sees the same 13 rows;
- the E2E Caixa and Atendente without `fiado.visualizar` both saw the 13 rows
  before this migration;
- `fiado_actor_can('fiado.visualizar', owner_id)` returns true for the owner
  and Gerente, false for Caixa and Atendente.

This is a real RBAC bypass, not merely a hidden navigation item.

## Exact pre-change production snapshot

Relation ACL and RLS:

```text
public.fiado_lancamentos
  relrowsecurity=true
  relforcerowsecurity=false
  ACL={postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
```

Policy before the change:

```text
fiado_lancamentos_select_owner | PERMISSIVE | {authenticated} | SELECT
USING (id_usuario = get_owner_user_id(auth.uid()))
```

There were no browser INSERT/UPDATE/DELETE privileges or policies. The ledger
is written by triggers and trusted SECURITY DEFINER/service-role flows.

## Consumers and blast radius

### Browser-side consumer

`src/routes/gestao/fichario/+page.svelte:177` reads the selected person's
ledger directly through Supabase. The route is linked with the existing
`fiado.visualizar` capability in `src/lib/navigation/appNavigation.js`; this
change makes the database enforce the same boundary for direct URL/Data API
access. The page's existing payment RPC remains available to operators with
`fiado.receber`; its write/settlement contract is not changed.

### Server-side/service-role consumers

The ledger triggers, `fiado_registrar_pagamento_v2`, `fiado_estornar_venda`,
`fiado_excluir_pagamento`, account deletion, and intelligence/admin paths use
trusted SECURITY DEFINER or service-role execution. They are not blocked by an
authenticated SELECT policy and no function definition is changed.

### Intentionally preserved operational reads

`pessoas.saldo_fiado` remains readable to the existing owner-scoped PDV/Mesas/
Pessoas flows. This migration only protects the detailed audit ledger, which is
the Fichario surface governed by `fiado.visualizar`.

## Minimal forward change

`supabase/migrations/20260813034000_fiado_ledger_select_rbac.sql` alters only
the existing SELECT policy:

```sql
USING (
  id_usuario = get_owner_user_id(auth.uid())
  AND fiado_actor_can('fiado.visualizar', id_usuario)
)
```

`fiado_actor_can` preserves owner access and checks the existing active role
JSON for subusers. No grants, table structure, ledger rows, triggers, RPC
definitions, billing, sales, offline, or UI files change.

## Verification matrix

After apply, execute transactional probes as:

| Principal | Expected ledger SELECT |
| --- | --- |
| anon | denied/no rows |
| owner | 13 rows visible |
| subuser without `fiado.visualizar` (Caixa, Atendente) | denied/no rows |
| subuser with `fiado.visualizar` (Gerente) | 13 rows visible |
| active super-admin without tenant membership | no tenant rows |
| service role | all 525 rows visible (RLS bypass preserved) |

No probe creates or changes data. The rollback path is a policy-only restore.

## Post-apply verification

Migration `20260813034000` was applied to the linked production project.

- Final policy is exactly the owner scope plus
  `fiado_actor_can('fiado.visualizar', id_usuario)`; relation RLS and ACL are
  unchanged.
- Owner and Gerente each saw 13 owner ledger rows.
- Atendente and Caixa each saw zero ledger rows while retaining visibility of
  the three owner `pessoas` rows used by operational selection.
- The active super-admin saw zero tenant rows because it has no membership in
  the E2E owner's tenant.
- Anon was denied at the table privilege boundary (`42501`).
- Service role saw all 525 ledger rows, confirming trusted administrative
  access remains intact.
- The existing `fiado_registrar_pagamento_v2` RPC remained executable for
  authenticated/service-role roles. Transactional probes for owner and
  Gerente returned a payment result and rolled back; Atendente remained denied
  by its existing `fiado.receber` guard. No ledger or balance changes persisted.

## Rollback procedure

```sql
alter policy fiado_lancamentos_select_owner
  on public.fiado_lancamentos
  using (id_usuario = get_owner_user_id(auth.uid()));
```

This restores the exact pre-change policy definition without modifying ledger
rows or grants.
