-- Atribuição de aquisição: responde "de onde veio esse cliente".
--
-- Antes desta coluna, só o canal de indicação era rastreável ponta a ponta (tabelas
-- `referrals`/`referral_rewards`). Todo o resto (Google Ads, Meta, orgânico, páginas de
-- comparativo, link de contato) sumia: nada de utm_source, gclid, fbclid ou referrer era
-- gravado no cadastro. O parâmetro `?origem=` existia em links de /contato mas nenhum
-- código lia o valor.
--
-- Gravada em dois pontos, de propósito:
-- - auth.users.raw_user_meta_data->'acquisition' no signup
--   (src/routes/api/auth/signup/+server.js). Cobre quem cria conta e nunca termina o
--   onboarding, que é justamente o público do cron de nudge.
-- - empresa_perfil.origem_aquisicao no fim do wizard
--   (src/lib/components/OnboardingWizard.svelte). É o que dá pra cruzar com
--   `subscriptions` por user_id para saber a origem de quem realmente paga.
--
-- First touch: o cliente grava a origem da PRIMEIRA visita e não sobrescreve depois
-- (src/lib/attribution/client.js). Quem chega por anúncio, some e volta pelo domínio
-- direto continua atribuído ao anúncio.
--
-- Minimização: guarda utm_*, click ids, `origem`, host+caminho do referrer, caminho de
-- entrada e timestamp. A query string do referrer é descartada no cliente porque pode
-- conter termo de busca ou token de terceiros. Nenhum campo identifica a pessoa
-- sozinho; o vínculo com o usuário existe só pela linha do perfil.
--
-- Nullable: perfis criados antes desta migration ficam null. Não há backfill possível,
-- a origem desses clientes não foi registrada em lugar nenhum.

begin;

alter table public.empresa_perfil
  add column if not exists origem_aquisicao jsonb;

comment on column public.empresa_perfil.origem_aquisicao is
  'Atribuição first-touch da conta: utm_source/medium/campaign/content/term, gclid, fbclid, ttclid, msclkid, origem, referrer (host+caminho), landing (caminho) e captured_at. Gravada no fim do onboarding a partir do localStorage do navegador. Null = perfil anterior a 2026-07-27 ou navegador sem storage.';

-- Consultas de canal filtram por perfis COM origem; índice parcial evita varrer as
-- linhas antigas, que são todas null e nunca interessam nesse recorte.
create index if not exists empresa_perfil_origem_aquisicao_idx
  on public.empresa_perfil using gin (origem_aquisicao)
  where origem_aquisicao is not null;

commit;
