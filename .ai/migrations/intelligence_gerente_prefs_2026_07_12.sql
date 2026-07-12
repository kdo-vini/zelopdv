-- Preferências de apresentação e entrega do Zelinho Gerente.
-- `muted_types` não muda o engine: só filtra briefing e digest.
alter table public.empresa_perfil
  add column if not exists gerente_prefs jsonb not null default '{"whatsapp":{"enabled":false,"hora":"07"},"muted_types":[]}'::jsonb,
  add column if not exists gerente_whatsapp_last_sent_date date;

alter table public.empresa_perfil
  drop constraint if exists empresa_perfil_gerente_prefs_object_check;

alter table public.empresa_perfil
  add constraint empresa_perfil_gerente_prefs_object_check
  check (jsonb_typeof(gerente_prefs) = 'object');

comment on column public.empresa_perfil.gerente_prefs is
  'Zelinho Gerente: opt-in WhatsApp, hora BRT (HH) e tipos de sinais silenciados na apresentacao.';
comment on column public.empresa_perfil.gerente_whatsapp_last_sent_date is
  'Data America/Sao_Paulo do último digest WhatsApp confirmado; garante idempotência diária.';

notify pgrst, 'reload schema';
