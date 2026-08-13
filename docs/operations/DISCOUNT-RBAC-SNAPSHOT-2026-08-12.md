# POS discount RBAC snapshot — 2026-08-12

## Finding verified before the change

The browser hides the discount control when a sub-user lacks
`pdv.desconto`, but the database did not enforce that capability. In the
production schema, a temporary authenticated mapping with
`pdv.vender=true`, `pdv.receber=true` and no `pdv.desconto` inserted one
positive-discount row into `public.vendas` inside a transaction; the result was
`discounted sale insert accepted`. The transaction was rolled back.

## Pre-change snapshot

The existing `public.vendas_insert_rbac_guard()` enforced the POS pair
`pdv.vender` + `pdv.receber` (and the separate `mesas.fechar` direct path), but
did not inspect `new.valor_desconto`. Its existing trigger was:

```text
vendas_insert_rbac_guard
BEFORE INSERT ON public.vendas
EXECUTE FUNCTION public.vendas_insert_rbac_guard()
```

The guard function retained the normal ACL (`EXECUTE` was visible to the
database roles because triggers execute through the table boundary). The
exact definition was captured with:

```sql
select pg_get_functiondef(
  'public.vendas_insert_rbac_guard()'::regprocedure
);
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.vendas'::regclass
  and tgname = 'vendas_insert_rbac_guard';
```

## Consumers and blast radius

- `src/routes/app/+page.svelte` is the browser POS checkout and passes the
  discount fields into `criar_venda_completa(jsonb)` through `saleOps`.
- `src/lib/finance/saleOps.js` is also used by offline replay; an authorized
  role with `pdv.desconto` keeps that contract unchanged.
- Mesa closing inserts `tipo_pedido='mesa'` directly as `authenticated` and is
  already protected by `mesas.fechar`; that path remains allowed without
  `pdv.desconto`.
- `service_role` integrations and maintenance retain their existing bypass.
- No billing, Pix, webhook, catalog, or UI file is changed.

## Exact forward change

Migration `supabase/migrations/20260813030000_discount_rbac.sql` adds a
narrow `BEFORE INSERT OR UPDATE OF valor_desconto` trigger. Positive discounts
require `fiado_actor_can('pdv.desconto', effective_owner)` for authenticated
POS/RPC paths. Zero discounts are unchanged. Direct Mesa close remains
authorized by `mesas.fechar`; a `SECURITY DEFINER` RPC cannot forge
`tipo_pedido='mesa'` to skip the capability because it runs as `postgres`.

The forward-only follow-up
`supabase/migrations/20260813031000_discount_rbac_update_hardening.sql` keeps
the Mesa exception only for direct INSERTs. UPDATE always requires
`pdv.desconto`, preventing a combined `tipo_pedido` plus discount mutation from
creating a new exception on an existing sale.

## Verification matrix

| Persona/path | Expected result |
| --- | --- |
| owner | allowed |
| sub-user with `pdv.vender` + `pdv.receber`, no `pdv.desconto` | denied for positive discount |
| sub-user with `pdv.desconto` | allowed |
| sub-user without discount, zero discount | allowed as before |
| direct Mesa close with `mesas.fechar` | allowed without `pdv.desconto` |
| super-admin without tenant membership | denied |
| anon | denied by existing authenticated grant/RLS boundary |
| service-role | allowed, unchanged |

The post-apply smoke also returned RLS denial for an active super-admin with no
tenant membership and `permission denied` for anon. All temporary access
mappings and sale attempts were transactional and rolled back.

## Rollback procedure

Do not rewrite this migration. Create a new forward migration that drops
`vendas_discount_rbac_guard`, restores the snapshotted trigger set, and
revokes/grants the helper ACL as needed. Re-run the full persona matrix and
confirm that no temporary access row or sale remains.
