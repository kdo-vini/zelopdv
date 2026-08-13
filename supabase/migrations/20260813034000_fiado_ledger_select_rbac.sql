-- The audit ledger is a Fichario-only surface. Keep owner and service-role
-- access, but require the existing fiado.visualizar capability for subusers.
-- The owner branch is preserved by fiado_actor_can and no write path changes.

alter policy fiado_lancamentos_select_owner
  on public.fiado_lancamentos
  using (
    id_usuario = get_owner_user_id(auth.uid())
    and fiado_actor_can('fiado.visualizar', id_usuario)
  );
