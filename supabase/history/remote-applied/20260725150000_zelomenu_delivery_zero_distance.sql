-- A loja também pode entregar no próprio endereço (distância de rota = 0 m).
-- O cache precisa aceitar esse resultado para evitar uma nova chamada ao OSRM.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.zelomenu_delivery_distance_cache'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%distance_m%'
  loop
    execute format(
      'alter table public.zelomenu_delivery_distance_cache drop constraint %I',
      constraint_name
    );
  end loop;
end $$;
alter table public.zelomenu_delivery_distance_cache
  add constraint zelomenu_delivery_distance_cache_distance_m_non_negative
  check (distance_m >= 0);
