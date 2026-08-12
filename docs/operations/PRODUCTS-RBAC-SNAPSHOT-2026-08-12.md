# Catalog RBAC snapshot — 2026-08-12

## Finding re-verified

The production schema had owner-scoped RLS on `produtos`, `categorias`, and
`subcategorias`, but the write policies did not consult the active sub-user's
role. A bearer of any active sub-user session could therefore call the Data
API directly and update/delete an existing catalog row in the owner's tenant.
The browser page at `src/routes/gestao/produtos/+page.svelte` has no server-side
authorization boundary; navigation visibility is not a security control.

The finding is confirmed for catalog mutations. It is not extended to reads:
the POS needs catalog reads for ordinary Caixa/Atendente operation, and those
reads remain owner-scoped exactly as before.

## Production definition before the change

All three tables had RLS enabled and grants for `anon`, `authenticated`, and
`service_role`. The effective policies were:

```sql
-- produtos
create policy usuario_gerencia_seus_produtos_insert on public.produtos
  for insert with check (auth.uid() = id_usuario);
create policy produtos_actor_update on public.produtos
  for update using (get_owner_user_id(auth.uid()) = id_usuario);
create policy produtos_actor_delete on public.produtos
  for delete using (get_owner_user_id(auth.uid()) = id_usuario);

-- categorias
create policy usuario_gerencia_suas_categorias_insert on public.categorias
  for insert with check (auth.uid() = id_usuario);
create policy categorias_actor_update on public.categorias
  for update using (get_owner_user_id(auth.uid()) = id_usuario);
create policy categorias_actor_delete on public.categorias
  for delete using (get_owner_user_id(auth.uid()) = id_usuario);

-- subcategorias
create policy subcats_insert_own on public.subcategorias
  for insert with check (auth.uid() = id_usuario);
create policy subcategorias_actor_update on public.subcategorias
  for update using (get_owner_user_id(auth.uid()) = id_usuario);
create policy subcategorias_actor_delete on public.subcategorias
  for delete using (get_owner_user_id(auth.uid()) = id_usuario);
```

The actual definitions also had the existing owner-scoped SELECT policies;
those are intentionally not changed.

## Consumers and blast radius

| Consumer | Principal | Operations | Expected result |
| --- | --- | --- | --- |
| `/gestao/produtos` | owner | catalog CRUD | unchanged |
| `/gestao/produtos` | active Gerente (`produtos.gerenciar`) | catalog CRUD | continues to work; insert is now enabled for the role |
| `/gestao/produtos` | Caixa/Atendente without the key | catalog reads | unchanged; writes are denied |
| `/gestao/estoque` | active sub-user with `estoque.ajustar` | stock-only updates | uses dedicated RPCs; names/prices remain protected |
| `/app` POS | Caixa/Atendente | catalog SELECT | unchanged |
| ZeloMenu modifier/publication components | owner/service-role, related tables | no writes to these three base tables in the browser | unchanged |
| service-role jobs/admin | service role | all operations | unchanged (RLS bypass) |

The stock-management page was an additional browser consumer. Its two stock
mutations are moved to the dedicated server-checked RPCs in
`20260812200550_catalog_stock_adjustment_rpc.sql`; all catalog reads and other
application contracts remain unchanged. No billing, offline replay, sales, or
delivery contract is changed.

## Forward-only fix

`supabase/migrations/20260812195032_products_role_rbac.sql` replaces only the
write policies. Owners retain their existing bypass. Active sub-users must have
`access_roles.permissions @> {"produtos.gerenciar": true}`. Policies are
restricted to `authenticated`; no client role receives a new grant.

`supabase/migrations/20260812200550_catalog_stock_adjustment_rpc.sql` keeps the
separate `estoque.ajustar` capability through two RPCs that can change only the
stock columns and are callable by `authenticated`/`service_role` (never anon).

## Rollback (forward-only)

If a production regression is observed, apply a new migration that restores
the exact definitions in the pre-change block above. Do not rewrite or delete
the applied migration. The rollback would restore owner-scoped writes for all
active sub-users, so it must be treated as an emergency compatibility action.

## Verification plan

- anon: SELECT remains limited by the existing public-category contract; all
  catalog writes remain denied.
- authenticated owner: SELECT/INSERT/UPDATE/DELETE remain available.
- authenticated Caixa/Atendente: SELECT remains available; writes are denied.
- authenticated Gerente: SELECT/INSERT/UPDATE/DELETE are available.
- authenticated stock-only role: dedicated stock RPCs work; general catalog
  writes remain denied.
- service-role: row counts and write privileges remain unchanged.
- smoke writes use a transaction and rollback; no production rows persist.

## Post-apply result

Applied with `npx supabase db push --linked` on 2026-08-12. The linked
production matrix passed:

- owner CRUD on all three tables: pass;
- Caixa with an empty role: catalog reads pass, inserts/updates denied;
- Gerente with `produtos.gerenciar`: catalog CRUD pass;
- anon: no product rows and writes denied;
- service-role: existing rows visible and transactional write pass.

The temporary roles and all smoke rows were rolled back. The dedicated E2E
tenant still has its active fixture users with `role_id` unset; no production
fixture data was changed by this migration.

The follow-up stock compatibility migration
`20260812200550_catalog_stock_adjustment_rpc.sql` was then applied. Its
transactional matrix passed: owner and service-role calls succeed; a temporary
stock-only role can update only the two stock RPCs; the same role cannot update
product definitions; a role without `estoque.ajustar` and anon cannot execute
the RPCs. The stock smoke roles and rows were also rolled back.
