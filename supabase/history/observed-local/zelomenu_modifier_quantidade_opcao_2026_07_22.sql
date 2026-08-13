-- ZeloMenu: quantidade por opção dentro de grupo de complemento (2x bacon).
-- Spec: zelomenu/docs/superpowers/specs/2026-07-22-modifier-quantidade-opcao-design.md
-- Independente da migration de produto vinculado (colunas diferentes na
-- mesma tabela) — pode ser aplicada em qualquer ordem relativa a ela.

alter table public.zelomenu_modifier_groups
  add column if not exists permite_quantidade boolean not null default false;

alter table public.zelomenu_modifier_groups
  add column if not exists maximo_por_opcao integer;

alter table public.zelomenu_modifier_groups
  drop constraint if exists zelomenu_modifier_groups_maximo_por_opcao_check;
alter table public.zelomenu_modifier_groups
  add constraint zelomenu_modifier_groups_maximo_por_opcao_check
    check (maximo_por_opcao is null or maximo_por_opcao >= 1);

alter table public.zelomenu_modifier_groups
  drop constraint if exists zelomenu_modifier_groups_permite_quantidade_check;
alter table public.zelomenu_modifier_groups
  add constraint zelomenu_modifier_groups_permite_quantidade_check
    check (not permite_quantidade or max_selecoes is null or max_selecoes <> 1);

comment on column public.zelomenu_modifier_groups.permite_quantidade is
  'Quando true, cada opcao do grupo pode ser selecionada com quantidade > 1 (ex.: 2x bacon). Só válido para grupos multi-select (max_selecoes <> 1).';
comment on column public.zelomenu_modifier_groups.maximo_por_opcao is
  'Limite opcional de quantidade por opção individual quando permite_quantidade = true. Null = sem limite.';
