-- Preference owned by the ZeloMenu admin: when enabled, public orders that
-- passed checkout validation are accepted into production automatically.
-- Defaults to the existing safe behavior: manual review.
alter table public.empresa_perfil
  add column if not exists zelomenu_auto_accept_orders boolean not null default false;
comment on column public.empresa_perfil.zelomenu_auto_accept_orders is
  'ZeloMenu: aceita automaticamente pedidos online públicos após validação do checkout; Pix pendente continua aguardando pagamento.';
