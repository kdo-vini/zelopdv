-- Editorial/paid placement is intentionally separate from product highlights.
alter table public.empresa_perfil
  add column if not exists zelomenu_sponsored_enabled boolean not null default false;
comment on column public.empresa_perfil.zelomenu_sponsored_enabled is
  'ZeloMenu: empresa patrocinada; aparece primeiro na descoberta quando habilitada.';
