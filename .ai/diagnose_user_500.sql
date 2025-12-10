-- Query de diagnóstico para usuário com erro 500
-- Execute no Supabase SQL Editor

-- 1. Identificar o usuário (substitua o email se souber)
SELECT 
  u.id as user_id,
  u.email,
  u.created_at as user_created_at,
  u.email_confirmed_at
FROM auth.users u
WHERE u.email = 'EMAIL_DO_USUARIO_AQUI'  -- Substitua pelo email
-- OU se souber o user_id:
-- WHERE u.id = 'USER_ID_AQUI'
ORDER BY u.created_at DESC;

-- 2. Verificar perfil da empresa
SELECT 
  ep.user_id,
  ep.nome_exibicao,
  ep.contato,
  ep.documento,
  ep.largura_bobina,
  ep.created_at,
  ep.updated_at
FROM empresa_perfil ep
WHERE ep.user_id = 'USER_ID_DA_QUERY_ACIMA';

-- 3. Verificar assinatura
SELECT 
  s.id as subscription_id,
  s.user_id,
  s.status,
  s.current_period_end,
  s.manually_extended_until,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.admin_notes,
  s.created_at,
  s.updated_at,
  s.last_modified_by,
  s.last_modified_at
FROM subscriptions s
WHERE s.user_id = 'USER_ID_DA_QUERY_ACIMA'
ORDER BY s.updated_at DESC;

-- 4. Verificar se há dados incompletos ou NULL
SELECT 
  u.id as user_id,
  u.email,
  ep.nome_exibicao,
  ep.documento,
  ep.largura_bobina,
  s.status as sub_status,
  s.current_period_end,
  CASE 
    WHEN ep.user_id IS NULL THEN 'SEM PERFIL'
    WHEN s.user_id IS NULL THEN 'SEM ASSINATURA'
    WHEN ep.nome_exibicao IS NULL THEN 'NOME FALTANDO'
    WHEN ep.documento IS NULL THEN 'DOCUMENTO FALTANDO'
    WHEN ep.largura_bobina IS NULL THEN 'BOBINA FALTANDO'
    WHEN s.current_period_end IS NULL THEN 'DATA EXPIRAÇÃO FALTANDO'
    ELSE 'OK'
  END as problema
FROM auth.users u
LEFT JOIN empresa_perfil ep ON ep.user_id = u.id
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE u.email = 'EMAIL_DO_USUARIO_AQUI'  -- Substitua
ORDER BY u.created_at DESC;

-- 5. Ver TODOS os usuários com problemas (sem email específico)
SELECT 
  u.id as user_id,
  u.email,
  ep.nome_exibicao,
  s.status as sub_status,
  s.current_period_end,
  CASE 
    WHEN ep.user_id IS NULL THEN '❌ SEM PERFIL'
    WHEN s.user_id IS NULL THEN '❌ SEM ASSINATURA'
    WHEN ep.nome_exibicao IS NULL THEN '⚠️ NOME FALTANDO'
    WHEN ep.documento IS NULL THEN '⚠️ DOCUMENTO FALTANDO'
    WHEN ep.largura_bobina IS NULL THEN '⚠️ BOBINA FALTANDO'
    WHEN s.current_period_end IS NULL THEN '⚠️ DATA EXPIRAÇÃO FALTANDO'
    ELSE '✅ OK'
  END as status_dados
FROM auth.users u
LEFT JOIN empresa_perfil ep ON ep.user_id = u.id
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE u.created_at > now() - interval '30 days'  -- Últimos 30 dias
ORDER BY u.created_at DESC;

-- 6. Corrigir assinatura manual sem current_period_end (se necessário)
-- ATENÇÃO: Só execute depois de identificar o problema!
/*
UPDATE subscriptions
SET 
  current_period_end = now() + interval '30 days',
  updated_at = now()
WHERE user_id = 'USER_ID_AQUI'
  AND current_period_end IS NULL;
*/

-- 7. Criar perfil faltando (se necessário)
-- ATENÇÃO: Só execute depois de identificar o problema!
/*
INSERT INTO empresa_perfil (user_id, nome_exibicao, contato, documento, largura_bobina)
VALUES (
  'USER_ID_AQUI',
  'Nome da Empresa',
  'email@empresa.com',
  '00.000.000/0000-00',
  '80mm'
);
*/
