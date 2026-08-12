# Sales creation RBAC snapshot — 2026-08-12

## Finding verified before the change

The linked production schema allowed an authenticated sub-user without
`pdv.vender` or `pdv.receber` to create a sale through the browser/offline RPC
`criar_venda_completa(jsonb)`. The owner-scoped `vendas` INSERT policy also
allowed a direct Data API INSERT without those capabilities.

The verification used the dedicated production fixture tenant
`d5625be9-abef-4371-a8e7-e915220aec42` and the Atendente
`6c151acb-db51-4fc0-aa0c-159443de4d96`. Both calls inserted a zero-value test
sale inside a transaction and were rolled back.

## Pre-change definition/grant snapshot

The exact remote definition was captured with:

```sql
select pg_get_functiondef('public.criar_venda_completa(jsonb)'::regprocedure);
```

Capture metadata:

- `SECURITY DEFINER`
- `SET search_path TO 'public'`
- definition MD5: `7fcf693fc31cc339b18c80dfedfa377a`
- the function already rejected `auth.uid() IS NULL`
- the function body and argument contract are not rewritten by this slice

Pre-change ACL:

```text
=X/postgres,postgres=X/postgres,anon=X/postgres,
authenticated=X/postgres,service_role=X/postgres
```

Pre-change policies relevant to creation:

```text
vendas_actor_insert: INSERT authenticated,
  WITH CHECK (get_owner_user_id(auth.uid()) = id_usuario)

vendas_itens_actor_insert: INSERT authenticated,
  WITH CHECK (parent venda belongs to get_owner_user_id(auth.uid()))

vendas_pagamentos_actor_insert: INSERT authenticated,
  WITH CHECK (get_owner_user_id(auth.uid()) = id_usuario)
```

## Consumers and blast radius

- `/app` calls the RPC for online checkout.
- `src/lib/offlineDb.js` calls the same RPC during replay.
- `/app/mesas/[id]` creates a `tipo_pedido = 'mesa'` sale with direct browser
  inserts while closing a comanda.
- `ensure_zelo_order_sale` is service-role/SECURITY DEFINER and keeps its
  existing maintenance bypass.
- Reads, sale cancellation, billing, stock logic, offline payload shape and
  the RPC signature are outside this change.

## Exact forward change

Migration `supabase/migrations/20260813000000_sales_creation_rbac.sql` adds a
`BEFORE INSERT` guard on `vendas`:

- SECURITY DEFINER POS/offline calls require both `pdv.vender` and
  `pdv.receber` for the effective owner;
- direct non-Mesa browser inserts require the same pair;
- direct `tipo_pedido = 'mesa'` inserts require `mesas.fechar`;
- service-role remains bypassed;
- anonymous EXECUTE on `criar_venda_completa` is revoked; authenticated and
  service-role execution remain granted.

The distinction between the RPC and the Mesa close prevents a user with only
`mesas.fechar` from forging a fake Mesa payload through the POS RPC while
preserving the existing close flow.

## Verification matrix

All writes were transactional and rolled back:

| Persona / path | Expected result |
| --- | --- |
| owner RPC | allowed |
| Caixa/Gerente with `pdv.vender` + `pdv.receber` | allowed |
| Atendente without those capabilities, RPC | denied |
| Atendente without those capabilities, direct non-Mesa INSERT | denied |
| sub-user with `mesas.fechar`, direct Mesa INSERT | allowed |
| anon RPC | denied at EXECUTE |
| service-role maintenance path | unchanged |

## Rollback procedure

Do not rewrite this migration. Create a new forward migration that drops the
`vendas_insert_rbac_guard` trigger/function, restores the four pre-change
owner-scoped INSERT policies (`vendas`, `vendas_itens`, `vendas_pagamentos`,
and `vendas_taxas_plataforma`) from a fresh `pg_policies` snapshot, and restores
the pre-change `public/anon` EXECUTE ACL on `criar_venda_completa(jsonb)`. Re-run
the full authorization matrix and confirm no fixture rows persist.
