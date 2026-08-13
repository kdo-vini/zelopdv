-- ZeloMenu: sugestão de cross-sell contextual por categoria (mapa
-- categoria -> produtos sugeridos), na mesma linha de perfil que já guarda
-- zelomenu_recommendation_product_ids (recomendação de carrinho existente).
-- Spec: zelomenu/docs/superpowers/specs/2026-07-22-cross-sell-categoria-design.md

alter table public.empresa_perfil
  add column if not exists zelomenu_category_suggestions jsonb not null default '{}'::jsonb;

comment on column public.empresa_perfil.zelomenu_category_suggestions is
  'Record<nome_da_categoria, number[]> - ate 3 ids de produto sugeridos por categoria, mostrados no card de produto (ProductAddModal). Chaveado por nome de categoria, mesmo padrão de zelomenu_category_order.';
