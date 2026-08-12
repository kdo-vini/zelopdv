# Mesas payment RBAC snapshot — 2026-08-12

## Finding verified before the change

The linked production schema allowed an authenticated sub-user to insert,
update, or delete partial Mesa payments by supplying the owner's
`id_usuario`. The policies checked tenant ownership only; they did not check
the existing receive capabilities. The same gap existed in the payment-item
allocation ledger.

Production transaction proof used the active Atendente sub-user
`6c151acb-db51-4fc0-aa0c-159443de4d96`, whose role had
`mesas.acessar`, `mesas.abrir_comanda`, and `mesas.editar_itens`, but neither
`pdv.receber` nor `pedidos.receber`. Before the migration, that session
inserted a `0.01` payment into the owner's open comanda. The transaction was
rolled back and no row persisted.

## Pre-change policy and grant snapshot

Policies from `pg_policies` immediately before the migration:

```text
comanda_pagamentos_actor_insert
  INSERT authenticated WITH CHECK (get_owner_user_id(auth.uid()) = id_usuario)
comanda_pagamentos_actor_update
  UPDATE public USING (get_owner_user_id(auth.uid()) = id_usuario)
comanda_pagamentos_actor_delete
  DELETE public USING (get_owner_user_id(auth.uid()) = id_usuario)

comanda_pagamento_itens_insert
  INSERT authenticated WITH CHECK (get_owner_user_id(auth.uid()) = id_usuario)
comanda_pagamento_itens_update
  UPDATE authenticated USING/WITH CHECK (get_owner_user_id(auth.uid()) = id_usuario)
comanda_pagamento_itens_delete
  DELETE authenticated USING (get_owner_user_id(auth.uid()) = id_usuario)
```

RLS was enabled on both tables. Table grants were broad and are intentionally
unchanged by this slice:

| Tables | `anon` / `authenticated` / `service_role` |
| --- | --- |
| `comanda_pagamentos` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |
| `comanda_pagamento_itens` | `authenticated` and `service_role` retain `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |

No data rewrite or cleanup is part of the migration.

## Consumer and blast-radius review

### Browser consumers

- `src/routes/app/mesas/[id]/+page.svelte` inserts a partial payment with the
  resolved owner id, inserts allocation rows when payment is by item, updates
  allocation links during full close, and deletes the temporary rows when a
  partial is removed.
- The same page reads both tables to render the partial-payment ledger.
- Reports and other reviewed browser paths do not write these tables.

The existing browser contract is unchanged: row shape, owner id, allocation
columns, and the cleanup order remain the same. A sub-user now needs Mesa
access plus `pdv.receber` or `pedidos.receber` to perform those writes.

### Server/service-role consumers

- No server route writes these tables in the reviewed code paths.
- `service_role` maintenance and test cleanup remain unchanged and bypass RLS.

## Exact forward change

Migration:

```text
supabase/migrations/20260812230000_mesas_payment_rbac.sql
```

- Partial-payment insert/update/delete requires `mesas.acessar` and either
  existing receive capability (`pdv.receber` or `pedidos.receber`).
- Allocation-ledger insert/update/delete uses the same check.
- SELECT policies, table grants, full comanda closure, sales creation, stock
  RPCs, billing, offline replay, and service-role behavior are unchanged.

The `OR` preserves both existing permission contracts: regular POS cashiers
use `pdv.receber`, while canonical order receivers use `pedidos.receber`.

## Verification matrix

Every fixture mutation is run in a transaction and rolled back:

| Persona / case | Expected result |
| --- | --- |
| owner | partial payment and allocation writes remain available |
| Atendente without receive capability | payment/allocation writes denied |
| temporary sub-user with Mesa + receive capabilities | payment/allocation writes allowed |
| anon | no payment mutation |
| super-admin as ordinary authenticated user | no tenant payment mutation |
| service-role | existing maintenance behavior unchanged |

## Rollback procedure

Do not rewrite the applied migration. Create a new forward migration restoring
the six snapshotted policies, then rerun the authorization matrix. No rows
need to be deleted or rewritten for rollback.
