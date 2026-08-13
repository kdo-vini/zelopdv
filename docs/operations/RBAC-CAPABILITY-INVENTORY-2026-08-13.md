# RBAC capability inventory — 2026-08-13

This is the finite consumer/enforcement inventory used by the architecture-audit
implementation. It inspects current code plus the production schema baseline at
migration `20260813091000`; it is not the required live actor revalidation for
a permission change.

Classification:

- `enforced`: the sensitive operation is checked at the database or server
  boundary.
- `intentional share`: another operational module deliberately needs the data;
  narrowing it would change production behavior.
- `candidate gap`: code/baseline prove a missing boundary, but production must
  still be probed immediately before a forward-only fix.
- `contract drift`: the capability and UI disagree without creating a new
  independent confidentiality boundary.

| Capability | Existing consumers and sensitive operation | Current authority | Classification |
| --- | --- | --- | --- |
| `pdv.acessar` | `/app`; operational sales/payment/movement reads | Cross-module SELECT capability union | Enforced + intentional operational reads |
| `pdv.vender` | `/app`, offline sale RPC; create sale and stock effects | Sale RPC and INSERT policies | Enforced |
| `pdv.receber` | `/app`, Mesa partial payment; write payment | RPC/policies require receive permission | Enforced |
| `pdv.desconto` | `/app`; apply positive discount | Database trigger | Enforced |
| `pdv.cancelar` | `/app` and management cancellation | Sale/child writes and `fiado_estornar_venda(bigint)` require the capability | **Enforced — production validated 2026-08-13** |
| `caixa.abrir` | `/app`; open cash drawer | `caixas` INSERT policy | Enforced |
| `caixa.fechar` | `/gestao/caixa`; close drawer/write closure | UPDATE/INSERT policies | Enforced |
| `caixa.movimentar` | `/app`; cash movement | Movement INSERT policy | Enforced |
| `caixa.ver` | `/gestao/caixa`; payment/movement details | Details are gated; base drawer is needed by PDV, Mesa, orders, ledger and reports | Enforced + intentional base share |
| `produtos.visualizar` | Products, PDV, Mesa, stock, reports and menu preparation | Tenant catalog SELECT is shared | Intentional share |
| `produtos.gerenciar` | Catalog/category/modifier/publication writes | Catalog RLS policies | Enforced |
| `estoque.visualizar` | Stock page plus operational catalog | Tenant catalog SELECT is shared | Intentional share |
| `estoque.ajustar` | Stock adjustment RPCs | Internal RPC capability guard | Enforced |
| `pessoas.visualizar` | People, PDV payment, Mesa, ledger and reports | Granted tenant person columns are shared | Intentional share |
| `pessoas.gerenciar` | Person writes and settled-person delete RPC | RLS and RPC guard | Enforced |
| `fiado.visualizar` | Ledger and linked sale history | Ledger is gated; base balance remains operationally shared | Enforced + intentional base share |
| `fiado.receber` | Register/delete ledger payment | Internal RPC guards | Enforced |
| `despesas.visualizar` | Expenses and reports | SELECT requires view or manage | Enforced |
| `despesas.gerenciar` | Expense writes | RLS policies | Enforced |
| `relatorios.ver` | Reports, Gerente and assistant context | Reports/Gerente are gated; `/api/chat/assistant` reads through service role after owner resolution only | **Candidate gap 2** |
| `relatorios.exportar` | PDF/Excel on reports page | UI ignores the key; a viewer already holds displayed data | Contract drift, not a separate secrecy boundary |
| `perfil.editar` | Profile page | Every subuser is currently denied regardless of this key | Stronger than matrix; inert key |
| `mesas.acessar` | Mesa routes/setup reads | Route checks and Mesa SELECT policies | Enforced |
| `mesas.abrir_comanda` | Open tab/change table state | INSERT policy/trigger | Enforced |
| `mesas.editar_itens` | Item writes, stock RPCs and kitchen bridge | RLS, trigger and RPC/server checks | Enforced |
| `mesas.fechar` | Close tab, guarantee stock and create sale | RLS/RPC/sale policies | Enforced |
| `mesas.cancelar` | Cancel tab and restore stock | RLS/RPC guards | Enforced |
| `pedidos.acessar` | Canonical order queue | Mutations are gated; canonical order SELECT is tenant-only | **Candidate gap 3** |
| `pedidos.cozinha` | Kitchen queue and Mesa kitchen status | Mutations/bridge are gated; same broad SELECT remains | **Candidate gap 3** |
| `pedidos.receber` | Close/deliver order and Mesa payment | Function guards | Enforced for mutations |
| `pedidos.cancelar` | Reject/cancel order | Function guards | Enforced for mutations |

## Bounded candidate gaps and closure

1. **Closed in production.** `fiado_estornar_venda(bigint)` could change a
   person's balance and append a compensating ledger row before the later sale
   DELETE was rejected. The live actor probe reproduced it; migration
   `20260813093000_fiado_estorno_rbac.sql` added the existing `pdv.cancelar`
   guard without changing ACL, tenant scope, calculations or idempotency. Full
   evidence and rollback:
   `docs/operations/FIADO-ESTORNO-RBAC-SNAPSHOT-2026-08-13.md`.
2. `/api/chat/assistant` can assemble sales, expenses, cash, people/ledger and
   intelligence context through service role for any resolved active subuser;
   it also exposes the owner WhatsApp tool. Product intent and the deployed
   endpoint matrix must confirm whether `relatorios.ver` is the boundary. The
   effective minimum is a server-side check before any privileged read/tool.
3. `zelo_orders`, `zelo_order_items` and `zelo_order_events` grant tenant SELECT
   to any active subuser. Browser consumers require `pedidos.acessar` or
   `pedidos.cozinha`; ZeloMenu/ZeloChat service-role consumers must be rechecked
   before replacing those policies.

## Required live probes before each fix

- Snapshot exact policies, ACLs/function definitions and enumerate every
  browser, server, cron and service-role consumer.
- Run owner, unrelated active subuser, authorized subuser, inactive/removed
  subuser, external super-admin, anon and service-role actors, plus relevant
  action-only roles.
- Exercise the real fiado cancellation write dependency; nested item/event
  reads and Realtime for orders; and the deployed assistant before any
  service-role context fetch or WhatsApp tool call.
- Preserve snapshots and rollback SQL. Make each confirmed gap a separate
  forward-only migration/commit and deploy-observe before starting the next.

Shared catalog, base people fields, base drawers, non-PIN operational profile
fields and documented cross-module sales unions stay unchanged unless a
separate finding is reproduced and approved.
