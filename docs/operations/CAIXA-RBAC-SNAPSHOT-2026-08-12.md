# Cash-box RBAC snapshot — 2026-08-12

## Finding verified before the change

The linked production schema used owner-scoped policies for cash-box writes,
but did not consult the existing role capabilities:

- `caixas_actor_update` allowed any authenticated sub-user in the owner
  tenant to update a cash box, including closing fields;
- `caixas_actor_delete` allowed any authenticated sub-user in the owner
  tenant to delete a cash box;
- `caixa_movs_actor_insert` allowed an authenticated sub-user to insert a
  sangria/suprimento for an owner cash box when the row used the owner
  `id_usuario`, without `caixa.movimentar`;
- `usuario_gerencia_seus_caixas_insert` only allowed `auth.uid() = id_usuario`,
  so a permitted sub-user could not open the owner's box through the existing
  `ownerUserId` client contract;
- `insert_own_fechamentos` was owner-only and did not express
  `caixa.fechar` for the permitted sub-user close path.

The existing `caixa.abrir`, `caixa.fechar`, and `caixa.movimentar` capabilities
are present in the role matrix and are already used by the PDV UI. This is a
server-side containment finding, not a UI redesign.

## Pre-change policy and grant snapshot

Policies from `pg_policies` immediately before the migration:

```text
caixas_actor_delete
  DELETE public USING (get_owner_user_id(auth.uid()) = id_usuario)
caixas_actor_update
  UPDATE public USING (get_owner_user_id(auth.uid()) = id_usuario)
usuario_gerencia_seus_caixas_insert
  INSERT public WITH CHECK (auth.uid() = id_usuario)
caixa_movs_actor_insert
  INSERT public WITH CHECK (
    id_usuario = get_owner_user_id(auth.uid())
    and exists(open cash box owned by that id_usuario)
  )
insert_own_fechamentos
  INSERT public WITH CHECK (auth.uid() = id_usuario)
```

RLS was enabled on `caixas`, `caixa_movimentacoes`, and
`caixa_fechamentos`. Table grants were broad and unchanged by this slice:

| Tables | `anon` / `authenticated` / `service_role` |
| --- | --- |
| `caixas`, `caixa_movimentacoes`, `caixa_fechamentos` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |

The production snapshot contained 658 cash boxes (16 open) and zero rows whose
`id_usuario` matched a known sub-user instead of that sub-user's owner. No
cleanup or data rewrite is part of this migration.

## Consumer review and blast radius

### Browser consumers

- `src/lib/finance/caixaOps.js` inserts `caixas` with `id_usuario` equal to the
  resolved owner and `id_operador` equal to the current operator.
- `src/routes/gestao/caixa/+page.svelte` updates the selected owner cash box
  when closing it and inserts `caixa_fechamentos` with the owner id.
- `src/routes/app/+page.svelte` and `ModalMovCaixa.svelte` insert cash
  movements. The active inline PDV path already sends the owner id; the small
  modal component currently sends the authenticated id, which is owner-owned
  for its existing successful path. This migration does not alter that
  component's API or persisted row shape.
- Reports, dashboard, Mesas, pedidos, and intelligence only read these tables
  from the browser/server paths reviewed here.

### Server/service-role consumers

- Assistant and intelligence fetchers read owner-scoped cash data with
  `supabaseAdmin`.
- `service_role` maintenance paths bypass RLS and remain unchanged.

The change therefore affects only authenticated Data API mutations. Owner
behavior remains available through the helper's owner bypass. A sub-user must
now hold the matching capability and still target the owner tenant row.

## Exact forward change

Migration:

```text
supabase/migrations/20260812214518_caixa_role_rbac.sql
```

- `caixa.abrir` is required to insert an owner-owned cash box.
- `caixa.fechar` is required to update an owner-owned cash box.
- Cash-box delete remains owner-only; no browser sub-user consumer was found.
- `caixa.movimentar` is required to insert movements into an open owner box.
- `caixa.fechar` is required to insert closing-history rows.
- All read policies, table grants, service-role behavior, billing, offline
  replay, and the sales schema remain unchanged.

## Verification matrix

Every fixture mutation is run in a transaction and rolled back:

| Persona / case | Expected result |
| --- | --- |
| owner | insert/update cash box, movement and closing history remain available |
| sub-user without `caixa.*` capability | cash-box update/delete and movement insert denied |
| sub-user with `caixa.abrir` | owner-owned cash-box insert allowed |
| sub-user with `caixa.fechar` | owner-owned cash-box update and history insert allowed |
| sub-user with `caixa.movimentar` | movement insert into open owner box allowed |
| anon | no cash-box mutation |
| super-admin as ordinary authenticated user | no tenant cash-box mutation |
| service-role | existing maintenance behavior unchanged |

## Production verification performed

The linked database reported the migration applied successfully and the
post-apply policy definitions matched the forward SQL. Transactional checks
were rolled back after every case:

- before the change, the no-capability sub-user updated cash box `410` and
  inserted a movement; both operations were observable inside the transaction;
- after the change, the owner retained cash-box insert/update, movement and
  closing-history writes;
- after the change, the same sub-user's update/delete returned zero rows and
  movement insert failed with the expected RLS denial;
- a temporary role containing all three cash-box capabilities could insert an
  owner-owned box, update box `410`, insert a movement, and insert closing
  history;
- anonymous and super-admin authenticated sessions had no mutation rows;
- a service-role client inserted and updated a temporary closed cash box, then
  deleted it in cleanup;
- the original sub-user role was restored and no temporary role, box, or
  movement fixture remained.

## Rollback procedure

Do not rewrite the applied migration. Create a new forward migration restoring
the five snapshotted owner-scoped policies and re-run the full authorization
matrix. No rows need to be deleted or rewritten for rollback.
