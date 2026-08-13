-- Keep the Zelinho financial intelligence behind the existing reports capability.
-- Owners and service-role keep their current behavior; authorized subusers use
-- the same relatorios.ver decision already enforced for caixa_fechamentos.

alter policy business_signals_select_owner
  on public.business_signals
  using (
    user_id = get_owner_user_id(auth.uid())
    and fiado_actor_can('relatorios.ver', user_id)
  );

alter policy business_signals_update_read
  on public.business_signals
  using (
    user_id = get_owner_user_id(auth.uid())
    and fiado_actor_can('relatorios.ver', user_id)
  )
  with check (
    user_id = get_owner_user_id(auth.uid())
    and fiado_actor_can('relatorios.ver', user_id)
  );

alter policy business_snapshots_select_owner
  on public.business_daily_snapshots
  using (
    user_id = get_owner_user_id(auth.uid())
    and fiado_actor_can('relatorios.ver', user_id)
  );
