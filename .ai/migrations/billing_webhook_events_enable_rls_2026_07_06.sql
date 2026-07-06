-- Fecha exposição pública de billing_webhook_events.
--
-- Contexto: advisor do Supabase apontou a tabela no schema public com RLS
-- desligado e grants completos (select/insert/update/delete/truncate) para
-- anon e authenticated — qualquer portador da anon key podia ler e apagar a
-- auditoria de webhooks de billing via Data API.
--
-- O único consumidor no código é o webhook AbacatePay via supabaseAdmin
-- (service role, que ignora RLS e mantém acesso normalmente).

begin;

alter table public.billing_webhook_events enable row level security;

-- Sem policies: default-deny para anon/authenticated. Revogar os grants é
-- cinto e suspensório contra uma policy permissiva criada por engano no futuro.
revoke all on table public.billing_webhook_events from anon, authenticated;

commit;
