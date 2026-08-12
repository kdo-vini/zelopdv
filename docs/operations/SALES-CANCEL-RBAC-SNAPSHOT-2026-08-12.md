# Sales cancellation RBAC snapshot — 2026-08-12

## Finding verified before the change

Production policies allowed any browser-authenticated sub-user inside the
owner tenant to mutate financial sale rows. Before this migration:

- `vendas_actor_delete` and `vendas_actor_update` used only
  `get_owner_user_id(auth.uid()) = id_usuario`;
- `vendas_itens_actor_update/delete` allowed owner-scoped item mutation;
- `vendas_pagamentos_actor_update/delete` allowed owner-scoped payment
  mutation;
- `vendas_taxas_actor_delete` allowed owner-scoped platform-fee deletion.

The `pdv.cancelar` permission already exists in the access-role matrix, but it
was enforced only by UI code. `/gestao` exposes a direct hard-delete action and
the Data API allowed the same operation without that capability.

The pre-apply table grants were broad and are intentionally unchanged in this
slice; RLS is the effective authorization boundary:

| Tables | `anon` / `authenticated` / `service_role` |
| --- | --- |
| `vendas`, `vendas_itens`, `vendas_pagamentos`, `vendas_taxas_plataforma` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |

## Consumer review and blast radius

### Browser consumers found

- `src/routes/gestao/+page.svelte` directly deletes a sale after calling
  `revertFiadoDebtForVenda`. This remains available to owners and sub-users
  with `pdv.cancelar`.
- `src/routes/app/mesas/[id]/+page.svelte` directly deletes the parent sale
  only when inserting sale items fails. This is a compatibility rollback for a
  just-created, still-empty sale.
- No browser consumer directly updates/deletes `vendas_itens`,
  `vendas_pagamentos`, or `vendas_taxas_plataforma`; their writes are inserts,
  reads, or cascades from the parent sale.

### Server/service-role consumers

- `criar_venda_completa` and the offline replay create sales; their insert
  behavior is intentionally unchanged.
- `supabaseAdmin`/SECURITY DEFINER ledger and account-maintenance paths bypass
  these browser policies and remain unchanged.
- Intelligence, reports, cash and fiado screens read sale rows; SELECT
  policies are unchanged.

## Exact forward change

Migration:

```text
supabase/migrations/20260812210856_sales_cancel_rbac.sql
```

The follow-up migration `20260812211428_sales_cancel_helper_grant_fix.sql`
explicitly revokes the project-default `anon` EXECUTE ACL from the helper;
authenticated execution remains because the helper is called by authenticated
RLS policies.

- Destructive or post-creation mutation policies now target `authenticated`
  and require `fiado_actor_can('pdv.cancelar', id_usuario)`.
- `vendas_actor_delete` calls the restricted helper
  `vendas_actor_can_delete(bigint)`. Besides `pdv.cancelar`, it allows only a
  sale created by the current operator within 15 minutes that has no item,
  payment, or platform-fee child row. This preserves the Mesas failure
  rollback without creating a route to delete a completed sale.
- Sale INSERT, all SELECT policies, service-role behavior, billing, offline
  replay and the sales schema remain unchanged. INSERT policies for sales,
  items and payments are deliberately retained for sale creation and payment
  receipt; `pdv.receber` is a separate future slice and is not inferred from
  this cancellation finding.

## Verification matrix

All test fixtures must be created inside transactions and rolled back:

| Persona / case | Expected result |
| --- | --- |
| owner | delete/update sale and child rows remain available |
| sub-user without `pdv.cancelar` | completed sale and child mutation denied/no rows affected |
| sub-user with `pdv.cancelar` | completed sale mutation succeeds |
| sub-user rollback exception | own recent empty sale can be deleted; populated/old sale cannot |
| anon | no sale mutation |
| super-admin as ordinary authenticated | no new sale mutation path |
| service-role | existing maintenance behavior unchanged |

## Production verification performed

The linked database reported `Remote database is up to date` after both
forward-only migrations. The helper definition is `SECURITY DEFINER` with a
fixed `search_path`; its ACL is `authenticated` + `service_role` only, with
`anon` execution revoked.

Transactional authorization checks were run against the linked project and
rolled back after each case:

- owner: sale and child update/delete allowed;
- sub-user without `pdv.cancelar`: completed sale, payment and fee mutation
  denied;
- sub-user with temporary `pdv.cancelar`: sale, payment and fee mutation
  allowed;
- sub-user: own recent empty sale deletion allowed for the Mesa rollback;
  populated or older empty sale deletion denied;
- anonymous role: helper invocation and sale mutation denied;
- super-admin authenticated as a normal user: sale mutation denied;
- service-role: existing sale maintenance deletion allowed;
- sub-user without the capability can still insert a new sale, preserving the
  existing sale-creation path.

No fixture rows or temporary roles remained after the checks.

## Rollback procedure

Do not rewrite this applied migration. Create a new forward migration that
drops `vendas_actor_can_delete`, restores the snapshotted owner-scoped policies
for all affected tables, and revokes the helper execute grant. Re-run the full
matrix before any production rollback is deployed.
