-- Fecha exposição pública das tabelas do bot antigo de captação de leads.
--
-- Contexto: advisor do Supabase apontou 6 tabelas em public com RLS desligado
-- e grants completos para anon/authenticated. Dono confirmou que pertencem a
-- um bot de outreach desativado, sem consumidor ativo. Dados preservados
-- (leads=72, lead_events=1865, outreach_messages=4, demais vazias em
-- 2026-07-06); acesso segue possível via service role.

begin;

alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.approvals enable row level security;
alter table public.agent_runs enable row level security;
alter table public.suppression_list enable row level security;

revoke all on table
  public.leads,
  public.lead_events,
  public.outreach_messages,
  public.approvals,
  public.agent_runs,
  public.suppression_list
from anon, authenticated;

commit;
