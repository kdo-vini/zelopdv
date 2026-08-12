-- Preserve owner access while enforcing the existing role catalogue for
-- sub-users. Historical owner-only policies are snapshotted in
-- docs/operations/EXPENSES-RBAC-SNAPSHOT-2026-08-12.md.
drop policy if exists expenses_actor_select on public.expenses;
drop policy if exists expenses_actor_insert on public.expenses;
drop policy if exists expenses_actor_update on public.expenses;
drop policy if exists expenses_actor_delete on public.expenses;

create policy expenses_actor_select
  on public.expenses
  for select
  to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = user_id
    and (
      (select auth.uid()) = user_id
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = expenses.user_id
          and au.status = 'active'
          and (
            ar.permissions @> '{"despesas.visualizar": true}'::jsonb
            or ar.permissions @> '{"despesas.gerenciar": true}'::jsonb
          )
      )
    )
  );

create policy expenses_actor_insert
  on public.expenses
  for insert
  to authenticated
  with check (
    public.get_owner_user_id((select auth.uid())) = user_id
    and (
      (select auth.uid()) = user_id
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = expenses.user_id
          and au.status = 'active'
          and ar.permissions @> '{"despesas.gerenciar": true}'::jsonb
      )
    )
  );

create policy expenses_actor_update
  on public.expenses
  for update
  to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = user_id
    and (
      (select auth.uid()) = user_id
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = expenses.user_id
          and au.status = 'active'
          and ar.permissions @> '{"despesas.gerenciar": true}'::jsonb
      )
    )
  )
  with check (
    public.get_owner_user_id((select auth.uid())) = user_id
    and (
      (select auth.uid()) = user_id
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = expenses.user_id
          and au.status = 'active'
          and ar.permissions @> '{"despesas.gerenciar": true}'::jsonb
      )
    )
  );

create policy expenses_actor_delete
  on public.expenses
  for delete
  to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = user_id
    and (
      (select auth.uid()) = user_id
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = expenses.user_id
          and au.status = 'active'
          and ar.permissions @> '{"despesas.gerenciar": true}'::jsonb
      )
    )
  );
