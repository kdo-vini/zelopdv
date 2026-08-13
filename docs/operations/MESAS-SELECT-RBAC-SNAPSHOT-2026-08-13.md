# Mesas SELECT RBAC snapshot — 2026-08-13

## Finding independently verified before the change

The SELECT policies for the private Mesas tables checked only the effective
owner. An active subuser without `mesas.acessar` could therefore read the
tenant's tables, comandas, comanda items, partial payments and payment
allocations through the Data API.

The permanent production subuser
`3f9060ca-446c-4299-a8c4-256aa195ed80` is active under owner
`5efac306-25b4-4858-b94c-50fb42699a52`, with role `auxiliar gestão` and no
`mesas.acessar`. A transactional probe inserted one synthetic row in each
table and observed `1/1/1/1/1` rows for that subuser. The owner and
service-role also saw the rows, while a super-admin outside the tenant saw
zero. The transaction rolled back and left no fixture.

## Exact pre-change snapshot

All five tables had RLS enabled and `force_row_level_security=false`.

```text
mesas:
  postgres=arwdDxtm/postgres
  anon=arwdDxtm/postgres
  authenticated=arwdDxtm/postgres
  service_role=arwdDxtm/postgres
comandas:
  postgres=arwdDxtm/postgres
  anon=arwdDxtm/postgres
  authenticated=arwdDxtm/postgres
  service_role=arwdDxtm/postgres
comanda_itens:
  postgres=arwdDxtm/postgres
  anon=arwdDxtm/postgres
  authenticated=arwdDxtm/postgres
  service_role=arwdDxtm/postgres
comanda_pagamentos:
  postgres=arwdDxtm/postgres
  anon=arwdDxtm/postgres
  authenticated=arwdDxtm/postgres
  service_role=arwdDxtm/postgres
comanda_pagamento_itens:
  postgres=arwdDxtm/postgres
  authenticated=arwdDxtm/postgres
  service_role=arwdDxtm/postgres
```

The SELECT policies before the migration were owner-only, except that
`comanda_pagamentos_actor_select` targeted `{public}`:

```text
mesas_actor_select: get_owner_user_id(auth.uid()) = id_usuario
comandas_actor_select: get_owner_user_id(auth.uid()) = id_usuario
comanda_itens_actor_select: parent comanda owner check only
comanda_pagamentos_actor_select: {public}, get_owner_user_id(auth.uid()) = id_usuario
comanda_pagamento_itens_select: get_owner_user_id(auth.uid()) = id_usuario
```

## Consumers and blast radius

### Browser

- `/app/mesas` reads `mesas` and open `comandas`; it is gated by the existing
  `mesas.acessar` capability.
- `/app/mesas/[id]` reads the mesa, comanda, items, partial payments and
  allocations; its subuser guard already requires `mesas.acessar`.
- `/gestao/mesas` reads and mutates the mesa registry. Its navigation gate is
  `mesas.acessar`; the new SELECT policy is the server-side authority for
  direct route/API access.
- `/relatorios` reads only closed `comandas` summaries and uses the existing
  `relatorios.ver` gate. That capability remains an alternate read path for
  `comandas` only.

### Server, admin and cron

`src/routes/api/mesas/cozinha/+server.js` reads `comandas`, `mesas` and
`comanda_itens` with `supabaseAdmin` after checking the server-side access
context. No admin or cron browser consumer was found for these tables.

### Intentional blast radius

- Owner: unchanged; `fiado_actor_can` preserves the owner bypass.
- Subuser with `mesas.acessar`: unchanged for all five tables.
- Subuser with `relatorios.ver` but without `mesas.acessar`: retains only the
  closed-comanda summary used by `/relatorios`; private Mesas operations stay
  hidden.
- Subuser without either capability: loses only these five Data API reads.
- Super-admin outside the tenant: remains at zero rows through RLS; admin
  handlers continue using service-role where needed.
- Service-role: unchanged and bypasses RLS.
- Anon: no repository consumer exists; table grants are revoked and the
  `comanda_pagamentos` policy is no longer public.

## Forward-only change

`supabase/migrations/20260813050000_mesas_select_rbac.sql`:

- revokes the unused anonymous table grants;
- requires `mesas.acessar` for `mesas`, `comanda_itens`, partial payments and
  allocations;
- requires `mesas.acessar` or `relatorios.ver` for `comandas`;
- changes the partial-payment SELECT policy to `authenticated`.

No table, column, data, RPC contract or service-role path is changed.

## Post-apply matrix (confirmed in production)

The post-apply transactional probe returned the following counts for the one
synthetic row in each table. The fixture and temporary role changes ended in
`ROLLBACK`:

| Principal | mesas | comandas | comanda_itens | pagamentos | alocações |
| --- | ---: | ---: | ---: | ---: | ---: |
| owner | 1 | 1 | 1 | 1 | 1 |
| subuser without `mesas.acessar`/`relatorios.ver` | 0 | 0 | 0 | 0 | 0 |
| subuser with `mesas.acessar` | 1 | 1 | 1 | 1 | 1 |
| subuser with `relatorios.ver` only | 0 | 1 | 0 | 0 | 0 |
| super-admin outside tenant | 0 | 0 | 0 | 0 | 0 |
| service-role | 1 | 1 | 1 | 1 | 1 |

After the migration, `anon` had no SELECT table grant on any of the five
tables, and `comanda_pagamentos_actor_select` targeted `{authenticated}`.

## Rollback

Only by an explicitly approved new forward-only migration. Restore the exact
owner-only SELECT policies and the previous anonymous grants captured above;
do not rewrite `20260813050000_mesas_select_rbac.sql` or alter production rows.
