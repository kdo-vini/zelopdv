-- ZeloMenu — recomendações de checkout (cross-sell). Curadoria manual global.
-- Espelha o padrão de zelomenu_featured_* na mesma tabela empresa_perfil.
alter table public.empresa_perfil
  add column if not exists zelomenu_recommendations_enabled boolean not null default false,
  add column if not exists zelomenu_recommendation_product_ids jsonb not null default '[]'::jsonb;
comment on column public.empresa_perfil.zelomenu_recommendations_enabled is
  'ZeloMenu: liga o carrossel "Peça também" no checkout público.';
comment on column public.empresa_perfil.zelomenu_recommendation_product_ids is
  'ZeloMenu: IDs de produtos curados sugeridos no checkout. Curadoria manual global.';
