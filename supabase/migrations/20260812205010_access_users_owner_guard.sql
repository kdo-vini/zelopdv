-- Tighten the owner policy from the preceding containment migration. A
-- sub-user must not be able to manufacture rows with owner_user_id = auth.uid
-- and thereby pass an owner-scoped WITH CHECK. The existing SECURITY DEFINER
-- helper resolves active sub-users without recursing through this table's RLS.
-- Forward-only migration; do not rewrite 20260812204706.

drop policy if exists access_users_owner on public.access_users;

create policy access_users_owner
  on public.access_users
  for all
  to authenticated
  using (
    (select auth.uid()) = owner_user_id
    and public.get_owner_user_id((select auth.uid())) = (select auth.uid())
  )
  with check (
    (select auth.uid()) = owner_user_id
    and public.get_owner_user_id((select auth.uid())) = (select auth.uid())
  );
