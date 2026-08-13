# Snapshot — vendas_taxas_plataforma SELECT RBAC (2026-08-13)

## Finding revalidated before the change

`vendas_taxas_plataforma` contains platform commissions and net-revenue inputs.
Its SELECT policy was owner-scoped only. The permanent subuser fixture has
neither `caixa.ver` nor `relatorios.ver`, yet a transactionally inserted probe
row was visible to that subuser through the Data API (`subuser_rows = 1`). The
transaction rolled back and no production row was retained.

## Exact pre-change ACL and policies

`pg_class.relacl`:

```text
{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

Policies from the production snapshot:

- `vendas_taxas_actor_select` — `public`, `SELECT`,
  `get_owner_user_id(auth.uid()) = id_usuario`.
- `vendas_taxas_plataforma_insert_own` — `authenticated`, `INSERT`, tied to
  the parent sale owner and `pdv.vender` + `pdv.receber`.
- `vendas_taxas_actor_delete` — `authenticated`, `DELETE`,
  `fiado_actor_can('pdv.cancelar', id_usuario)`.

## Consumers and blast radius

- Browser `/relatorios/+page.svelte` reads the table while its route already
  requires `relatorios.ver` for subusers.
- Browser `/gestao/caixa/+page.svelte` reads fees for the current cash box; the
  navigation entry requires `caixa.ver`. The new table policy is authoritative
  even for a direct URL.
- `src/lib/server/intelligence/fetchers.js` reads through the server database
  client/service-role and is unchanged.
- No anonymous or public storefront consumer was found.

The forward-only migration
`20260813070000_vendas_taxas_select_rbac.sql`:

1. revokes SELECT from `anon`;
2. changes only the existing SELECT policy to `authenticated` and requires
   `caixa.ver` or `relatorios.ver` in addition to the existing owner scope;
3. leaves INSERT, DELETE, all other sales tables, owner behavior, and
   `service_role` unchanged.

This preserves the two legitimate consumers and blocks the confirmed
subuser-without-capability path. The broader `vendas`/`vendas_pagamentos`
read model is intentionally a separate RBAC slice because those tables also
serve the POS and fiado flows.

## Post-apply authorization matrix

The matrix uses a synthetic fee row in a transaction and rolls it back:

| Actor | Fee row visible | Expected behavior |
| --- | ---: | --- |
| Owner | 1 | retains fee/report behavior |
| Subuser without `caixa.ver`/`relatorios.ver` | 0 | denied |
| Subuser with `caixa.ver` | 1 | `/gestao/caixa` behavior retained |
| Subuser with `relatorios.ver` | 1 | `/relatorios` behavior retained |
| Super-admin outside tenant | 0 | tenant scope retained |
| Anonymous | no table SELECT | denied |
| `service_role` | 1 | unchanged server path |

Observed after applying the migration:

```text
anon SELECT=false; authenticated SELECT=true; service_role SELECT=true
owner row=1; no-capability subuser row=0; caixa.ver subuser row=1;
relatorios.ver subuser row=1; super-admin outside tenant row=0;
service-role row=1; probe rows persisted=0; temporary probe roles=0
```

An explicit post-apply policy query showed `vendas_taxas_actor_select` targeted
`authenticated` and required the owner scope plus either capability. Parent
sales rows and fee writes were not changed.

## Rollback procedure

Do not rewrite the applied migration. If a legitimate consumer is discovered,
create a new forward migration after review:

```sql
grant select on table public.vendas_taxas_plataforma to anon;

alter policy vendas_taxas_actor_select
  on public.vendas_taxas_plataforma
  to public
  using (get_owner_user_id(auth.uid()) = id_usuario);
```

This restores the pre-change SELECT grant and predicate without changing any
write policy or sales data.
