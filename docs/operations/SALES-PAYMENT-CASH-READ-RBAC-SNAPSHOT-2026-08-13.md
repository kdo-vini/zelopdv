# Snapshot — leituras de pagamentos de venda e movimentações de caixa (2026-08-13)

## Finding revalidated before the change

As tabelas `vendas_pagamentos` e `caixa_movimentacoes` tinham SELECT
owner-scoped apenas. Um subusuário temporariamente colocado em um cargo com
somente `pedidos.acessar` conseguiu ler um pagamento sintético e as duas
movimentações existentes do owner pela Data API. A transação foi revertida e
nenhuma linha de teste permaneceu.

## Exact pre-change ACL and policy snapshot

`pg_class.relacl`:

```text
vendas_pagamentos={postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
caixa_movimentacoes={postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

Relevant policies before the migration:

- `vendas_pagamentos_actor_select` — `public`, `SELECT`,
  `get_owner_user_id(auth.uid()) = id_usuario`.
- `caixa_movs_actor_select` — `public`, `SELECT`,
  `get_owner_user_id(auth.uid()) = id_usuario`.
- All INSERT/UPDATE/DELETE policies on both tables were left unchanged.

## Consumers and blast radius

Browser consumers were classified before changing the policy:

- `/app` uses payment rows and cash movements to calculate the current cash
  balance. Its canonical navigation capability is `pdv.acessar`; payment
  reads also accept the existing `pdv.receber` capability.
- `/app/mesas/[id]` uses payment rows during the Mesa close flow and already
  requires `mesas.acessar`.
- `/gestao/caixa` uses both tables and its navigation requires `caixa.ver`;
  the policy is the direct-URL/API authority as well.
- `/relatorios` uses both tables behind `relatorios.ver`.
- `/gestao` dashboard uses sales/payment/movement summaries; operational POS
  and cash capabilities remain accepted. No server/cron path is changed.
- Service-side intelligence and maintenance use service-role and are
  unaffected. No anonymous or public storefront consumer was found.

The forward-only migration
`20260813080000_sales_payment_cash_read_rbac.sql`:

1. revokes anonymous SELECT on both tables;
2. changes only SELECT policies to `authenticated`;
3. preserves owner bypass, the existing write policies, service-role, and the
   parent `vendas`/`vendas_itens` read model.

`vendas` and `vendas_itens` are intentionally excluded from this slice because
the Fichário, Dashboard, POS and Mesa-close consumers need a separate,
broader capability design.

## Post-apply authorization matrix

Every row below was checked against synthetic payment/movement rows and
temporary role permissions inside a transaction, then rolled back:

| Actor/capability | Payment rows | Movement rows |
| --- | ---: | ---: |
| Owner | 1 | 1 |
| Subuser with only `pedidos.acessar` | 0 | 0 |
| Subuser with `pdv.acessar` | 1 | 1 |
| Subuser with `pdv.receber` | 1 | 0 |
| Subuser with `mesas.acessar` | 1 | 0 |
| Subuser with `caixa.ver` | 1 | 1 |
| Subuser with `caixa.movimentar` | 0 | 1 |
| Subuser with `relatorios.ver` | 1 | 1 |
| Super-admin outside tenant | 0 | 0 |
| Anonymous | no table SELECT | no table SELECT |
| `service_role` | 1 | 1 |

Post-apply policy inspection confirmed both policies target
`{authenticated}`, and the synthetic rows/temporary roles count returned zero
after rollback.

## Rollback procedure

Do not rewrite the applied migration. If a legitimate capability is discovered
to be missing, create a new forward migration after review. The exact
pre-change rollback is:

```sql
grant select on table public.vendas_pagamentos, public.caixa_movimentacoes
  to anon, authenticated;

alter policy vendas_pagamentos_actor_select
  on public.vendas_pagamentos
  to public
  using (get_owner_user_id(auth.uid()) = id_usuario);

alter policy caixa_movs_actor_select
  on public.caixa_movimentacoes
  to public
  using (get_owner_user_id(auth.uid()) = id_usuario);
```

No data rewrite is required.
