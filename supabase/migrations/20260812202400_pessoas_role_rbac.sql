-- Pessoas RBAC containment: keep owner-scoped reads for POS/fiado consumers,
-- but require the existing pessoas.gerenciar permission for browser writes.
-- Forward-only migration. Rollback is documented in the companion snapshot.

drop policy if exists "pessoas_actor_delete" on public.pessoas;
drop policy if exists "pessoas_actor_update" on public.pessoas;
drop policy if exists "pessoas_insert_own" on public.pessoas;

create policy "pessoas_actor_insert"
  on public.pessoas
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
  );

create policy "pessoas_actor_update"
  on public.pessoas
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
  );

create policy "pessoas_actor_delete"
  on public.pessoas
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
  );
