-- Fase 4.2 (armadilha 2): admin_get_users_without_profile passa a detectar
-- ausência de PERFIL OPERACIONAL, não ausência de linha em empresa_perfil.
--
-- Contexto: a outra metade da Fase 4.2 faz o wizard salvar a cada passo. No
-- instante em que o passo 1 grava o nome, quem parar no passo 2 passa a ter
-- uma linha em empresa_perfil (nome preenchido, contato vazio) e, com o
-- critério antigo (`p.user_id IS NULL`), some do radar do nudge de resgate.
-- As duas metades sobem juntas: ver docs/projects/onboarding-dois-passos.md,
-- seção "Três armadilhas" #2.
--
-- Critério novo: linha ausente OU nome_exibicao vazio OU contato vazio —
-- espelha `operationalProfileOk` em src/lib/profileUtils.js (presença, não
-- validade).
--
-- Mesma assinatura, mesmo RETURNS TABLE, mesmos filtros de idade/email/
-- access_users do baseline (supabase/baselines/20260813091000/schema.sql:385)
-- e da migration p0 (supabase/migrations/20260812150000_p0_security_containment.sql:177-179).
-- CREATE OR REPLACE preserva grants existentes; esta migration reafirma os
-- grants explicitamente, de forma idempotente.

create or replace function public.admin_get_users_without_profile(min_age_hours integer default 2)
returns table(user_id uuid, email text, created_at timestamptz)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  SELECT u.id, u.email, u.created_at
  FROM auth.users u
  LEFT JOIN public.empresa_perfil p ON p.user_id = u.id
  WHERE (
      p.user_id IS NULL
      OR coalesce(trim(p.nome_exibicao), '') = ''
      OR coalesce(trim(p.contato), '') = ''
    )
    AND u.created_at < now() - (min_age_hours || ' hours')::interval
    AND u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.access_users au
      WHERE au.auth_user_id = u.id
         OR lower(au.email) = lower(u.email)
    )
  ORDER BY u.created_at DESC;
$$;

revoke execute on function public.admin_get_users_without_profile(integer)
  from public, anon, authenticated;
grant execute on function public.admin_get_users_without_profile(integer) to service_role;
