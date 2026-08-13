-- ZeloMenu public directory cover, managed alongside the store settings.
alter table public.empresa_perfil
  add column if not exists zelomenu_cover_url text,
  add column if not exists zelomenu_description text;
comment on column public.empresa_perfil.zelomenu_cover_url is
  'ZeloMenu: imagem de capa usada no card público da empresa.';
comment on column public.empresa_perfil.zelomenu_description is
  'ZeloMenu: descrição curta definida pela loja e exibida no card público da empresa.';
