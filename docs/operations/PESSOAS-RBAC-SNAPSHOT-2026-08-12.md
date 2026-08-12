# Pessoas RBAC snapshot — 2026-08-12

## Finding re-verified

Production RLS on `public.pessoas` was owner-scoped, but every authenticated
actor whose session resolved to the tenant owner could use the Data API write
policies without the existing `pessoas.gerenciar` role permission. The
`/gestao/pessoas` browser page performs direct insert/update calls, so client
navigation is not an authorization boundary. The existing fiado RPCs already
enforce `pessoas.gerenciar` for person deletion and `fiado.receber` for
receiving/deleting payments; this change does not duplicate or redesign those
ledger paths.

## Production definitions before the change

RLS was enabled. The exact effective write policies were:

```sql
create policy pessoas_insert_own on public.pessoas
  for insert to public
  with check (auth.uid() = id_usuario);

create policy pessoas_actor_update on public.pessoas
  for update to public
  using (get_owner_user_id(auth.uid()) = id_usuario);

create policy pessoas_actor_delete on public.pessoas
  for delete to public
  using (get_owner_user_id(auth.uid()) = id_usuario);
```

The existing owner-scoped SELECT policy remains unchanged because the POS,
mesa, fiado and report consumers need person names and balances during normal
operation. Table grants are unchanged; RLS is the enforcement boundary.

## Consumers and blast radius

| Consumer | Principal | Operations | Expected result |
| --- | --- | --- | --- |
| `/gestao/pessoas` | owner | person CRUD | unchanged |
| `/gestao/pessoas` | active Gerente with `pessoas.gerenciar` | person CRUD | continues to work; insert now stores the owner tenant id |
| `/gestao/pessoas` | other sub-user | reads | unchanged for compatibility; writes denied |
| `/app` and `ModalPagamento` | Caixa/Atendente | SELECT names for fiado selection | unchanged |
| `/app/mesas/[id]` | mesa operators | SELECT names for customer assignment | unchanged |
| `/gestao/fichario` | Gerente/owner with fiado permissions | SELECT and existing fiado RPCs | unchanged; RPC guards remain authoritative |
| `/relatorios` | authenticated browser | SELECT names for report joins | unchanged |
| assistant/intelligence server fetchers | service-role server | owner-scoped SELECT | unchanged |
| cron/admin/service-role | service role | existing operations | unchanged (RLS bypass) |

No current browser or server consumer calls the legacy
`fiado_registrar_pagamento(uuid,numeric)` function; it is not changed here
because removing its historical authenticated execution would be a separate
compatibility decision. Anonymous execution cannot mutate a row because its
body requires `auth.uid() = id_usuario`.

## Forward-only fix

`supabase/migrations/20260812202400_pessoas_role_rbac.sql` replaces only the
three direct table write policies. Owners continue to pass through
`fiado_actor_can`; active sub-users must have
`access_roles.permissions ->> 'pessoas.gerenciar' = 'true'`. Policies now
target `authenticated`, so anonymous sessions receive no write policy.

The browser page now resolves the tenant owner through the existing cached
access context before inserting a person. This is required because the
pre-change page sent a sub-user's auth UUID, which created an orphan row under
the old permissive insert policy; it does not alter owner behavior.

## Rollback (forward-only)

If a legitimate manager flow regresses, apply a new migration restoring the
three exact pre-change definitions above. Do not edit or delete the applied
migration. Rollback intentionally reopens direct sub-user writes and should be
treated as an emergency compatibility action only.

## Verification plan

- anon: SELECT remains empty for tenant data; INSERT/UPDATE/DELETE denied;
- authenticated owner: person insert/update/delete remain available;
- active Gerente with `pessoas.gerenciar`: CRUD succeeds against the owner id;
- active sub-user without the permission: reads remain available, all writes denied;
- active sub-user with only `fiado.receber`: person writes remain denied while
  the existing fiado payment RPC remains separately governed;
- service-role: existing read/write behavior remains unchanged;
- all smoke writes run in a transaction and roll back.

## Post-apply result

Applied with `npx supabase db push --linked` on 2026-08-12. The linked
production matrix passed:

- owner insert/update/delete: pass;
- Gerente with `pessoas.gerenciar`: insert/update/delete pass using the owner
  tenant id;
- sub-user without the permission: insert denied, while owner-scoped SELECT
  remained visible;
- super-admin as a normal authenticated tenant actor: no cross-tenant rows
  visible and no write policy granted;
- anon: SELECT/write blocked;
- service-role: transactional write pass.

All smoke roles and rows were rolled back. The permanent E2E owner account was
not modified by the migration; the local Playwright rerun cleaned its temporary
fixture data successfully but hit the known login URL assertion timeout.
