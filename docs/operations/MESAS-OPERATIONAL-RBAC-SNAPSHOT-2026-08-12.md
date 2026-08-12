# Mesas operational RBAC snapshot — 2026-08-12

## Finding verified before the change

The linked production schema allowed an authenticated sub-user to mutate
owner-scoped operational rows without the Mesa operation permission that was
already present in the access-role matrix.

The active Atendente
`6c151acb-db51-4fc0-aa0c-159443de4d96` belongs to owner
`d5625be9-abef-4371-a8e7-e915220aec42` and has:

- `mesas.acessar`
- `mesas.abrir_comanda`
- `mesas.editar_itens`

It does not have `mesas.fechar` or `mesas.cancelar`.

Before the migration, a rolled-back production transaction showed that this
session could:

- update an owner comanda from `aberta` to `fechada`;
- set an owner mesa status to `livre`;
- update an owner `comanda_itens` quantity.

The existing stock RPCs were also inspected. They were `SECURITY INVOKER`,
granted to authenticated users, but compared `auth.uid()` directly with the
owner column. An Atendente call therefore failed with `Comanda aberta nao
encontrada`, despite the UI granting item-edit access. This was included in
the same bounded rollout through the complementary migration
`20260812234500_mesas_operational_rpc_rbac.sql`.

## Pre-change policy and grant snapshot

`pg_policies` immediately before this migration:

```text
mesas_actor
  ALL public USING (get_owner_user_id(auth.uid()) = id_usuario)

comandas_actor
  ALL public USING (get_owner_user_id(auth.uid()) = id_usuario)

comanda_itens_actor
  ALL public USING (EXISTS (SELECT 1 FROM comandas c
    WHERE c.id = comanda_itens.id_comanda
      AND c.id_usuario = get_owner_user_id(auth.uid())))
```

The payment policies already constrained their mutations in the preceding
slice and are not rewritten here.

Table grants were broad and remain unchanged:

| Table | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `mesas` | full table DML | full table DML | full table DML |
| `comandas` | full table DML | full table DML | full table DML |
| `comanda_itens` | full table DML | full table DML | full table DML |

RLS and the new trigger guards are the effective authorization boundary. No
rows, role definitions, or grants are rewritten.

## Consumer and blast-radius review

### Browser consumers

- `/app/mesas/+page.svelte` reads owner mesas/comandas, inserts a comanda with
  `mesas.abrir_comanda`, then marks the mesa occupied.
- `/app/mesas/[id]/+page.svelte` reads the same rows, edits comanda metadata,
  uses the existing item/stock RPCs, marks `fechando`/`livre`, closes or
  cancels the comanda, and transfers an open comanda between mesas.
- `/gestao/mesas/+page.svelte` manages the physical mesa catalog. Owner
  behavior remains unchanged; the existing sub-user route is still subject to
  owner scope and the `mesas.acessar` policy.
- `/relatorios/+page.svelte` reads comandas only.

### Server/service-role consumers

- `/api/mesas/cozinha` uses `supabaseAdmin` and is not affected by browser RLS.
- Service-role maintenance and security-definer paths retain their existing
  bypass. The migrations do not modify billing, sales creation, offline
  replay, or the kitchen API.

## Exact forward change

Migration:

```text
supabase/migrations/20260812233000_mesas_operational_rbac.sql
```

- `comandas` INSERT requires `mesas.abrir_comanda`.
- `comanda_itens` INSERT/UPDATE/DELETE requires `mesas.editar_itens`.
- `comandas` DELETE requires `mesas.cancelar`.
- Mesa/comanda updates remain owner-scoped and are guarded by triggers:
  - `mesas.fechar` is required for `fechando`/`fechada`, financial close fields,
    and releasing a mesa after a close;
  - `mesas.cancelar` is required for cancellation/release;
  - `mesas.abrir_comanda` is required for occupying a mesa;
  - `mesas.editar_itens` is required for comanda operational fields and mesa
    transfer.
- SELECT policies are authenticated owner-scoped; service-role behavior and
  table grants stay unchanged.
- The three browser-consumed stock RPCs now resolve the effective owner and
  enforce the corresponding capability before writes. Their signatures and
  argument contracts are unchanged; anonymous EXECUTE remains revoked.

Owners continue to bypass capability checks through `fiado_actor_can`. The
Atendente can still read and edit item/operational data allowed by its existing
permissions, but cannot forge a financial close or cancel/release operation.

## Verification matrix

All fixture mutations are transactional and rolled back:

| Persona / case | Expected result |
| --- | --- |
| owner | reads and all existing Mesa operations remain available |
| Atendente (`acessar` + `abrir` + `editar`, no `fechar`/`cancelar`) | read, open, item edit allowed; close/cancel/release denied |
| sub-user with `mesas.fechar` | close-state and financial fields allowed |
| sub-user with `mesas.cancelar` | cancellation/release allowed |
| sub-user without `mesas.editar_itens` | item mutations denied |
| anon | no operational row access/mutation |
| super-admin as ordinary authenticated user | no tenant row access without membership |
| service-role | existing maintenance behavior unchanged |

The RPC-specific smoke additionally confirmed Atendente item editing,
sub-user close/cancel with temporary capabilities, owner compatibility,
anonymous EXECUTE denial, and service-role stock execution. All changes were
rolled back after each matrix run.

## Rollback procedure

Do not rewrite the applied migration. Create a new forward migration that:

1. restores the three snapshotted `ALL public` policies;
2. drops the two trigger guards;
3. restores the original invoker definitions and ACLs of the three RPCs;
4. reruns the full authorization matrix.

No rows or grants need to be restored.
