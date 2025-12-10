-- Debug: Verificar usuários e perfis
-- Execute no Supabase SQL Editor

-- 1. Ver todos os usuários autenticados
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC;

-- 2. Ver todos os perfis de empresa
SELECT user_id, nome_exibicao, contato, created_at
FROM empresa_perfil
ORDER BY created_at DESC;

-- 3. Ver todas as assinaturas
SELECT user_id, status, current_period_end, stripe_subscription_id, created_at
FROM subscriptions
ORDER BY created_at DESC;

-- 4. Ver usuários SEM perfil (problema comum)
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN empresa_perfil ep ON ep.user_id = u.id
WHERE ep.user_id IS NULL;

-- 5. Ver assinaturas SEM perfil
SELECT s.user_id, s.status, u.email
FROM subscriptions s
JOIN auth.users u ON u.id = s.user_id
LEFT JOIN empresa_perfil ep ON ep.user_id = s.user_id
WHERE ep.user_id IS NULL;
