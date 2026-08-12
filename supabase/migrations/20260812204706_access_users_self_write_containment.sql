-- access_users write containment: owners retain CRUD over their tenant rows;
-- active sub-users retain only the self-scoped SELECT needed by the browser
-- access context/guards. All invite, activation, role and removal mutations
-- already use server-side supabaseAdmin and therefore remain unchanged.
-- Forward-only migration. The pre-change policy/grant snapshot and rollback
-- SQL are documented in docs/operations/ACCESS-USERS-RBAC-SNAPSHOT-2026-08-12.md.

drop policy if exists access_users_owner_or_self on public.access_users;
drop policy if exists access_users_owner on public.access_users;
drop policy if exists access_users_self_select on public.access_users;

create policy access_users_owner
  on public.access_users
  for all
  to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy access_users_self_select
  on public.access_users
  for select
  to authenticated
  using ((select auth.uid()) = auth_user_id);
