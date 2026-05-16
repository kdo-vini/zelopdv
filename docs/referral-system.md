# Sistema de Indicação ZeloPDV/ZeloChat

## Arquitetura Encontrada

- App principal: SvelteKit em `src/routes`, com áreas públicas, auth, perfil, assinatura e gestão.
- Admin: app separado em `admin-dashboard`, usando Supabase com sessão de super admin.
- Autenticação: Supabase Auth via `src/lib/supabaseClient.js`; service role apenas no servidor em `src/lib/server/supabaseAdmin.js`.
- Empresa/tenant: o produto usa `empresa_perfil.user_id` como identificador da empresa dona da conta. Subusuários apontam para o dono em `access_users.owner_user_id`.
- Perfil da empresa: `src/routes/perfil/+page.svelte` e `src/lib/profileUtils.js`, persistindo em `empresa_perfil`.
- Billing: `subscriptions`, endpoints em `src/routes/api/billing/*`, Stripe em `src/lib/server/stripe.js`; webhook em `src/routes/api/billing/webhook/+server.js`.
- Rotas públicas: landing principal, `/cadastro`, `/login`, `/para-*`, `/blog`, `/precificacao`, `/extensoes`; agora também `/indica/[codigo]`.
- Dashboard cliente: `/gestao` com layout em `src/routes/gestao/+layout.svelte` e sidebar em `src/lib/components/GestaoSidebar.svelte`.
- Migrations/schema: o repositório versiona SQL em `.ai/migrations`. Não há `supabase/migrations` local.
- RLS: policies existentes usam `get_owner_user_id(auth.uid())` para permitir dono e subusuário ativo sem vazar dados de outros tenants.

## Decisões do MVP

- `empresa_id` no escopo de referral significa `auth.users.id` do dono da empresa, seguindo o padrão real do produto.
- O código de indicação fica em `empresa_perfil.referral_code`, único e estável.
- A geração do código acontece server-side por `ensureReferralCodeForEmpresa`, a partir do nome da empresa, sem espaços/acentos, com sufixo numérico em duplicatas.
- O tracking público usa cookie e localStorage para preservar atribuição até login/cadastro/trial.
- A recompensa não é aplicada automaticamente. Ela fica registrada em `referral_rewards` e precisa de ação humana no admin.
- O webhook de pagamento não foi alterado nesta fase.

## Tabelas e Migration

Migration criada:

- `.ai/migrations/referral_system_2026_05_16.sql`

Alteração:

- `empresa_perfil.referral_code text`
- índice único parcial em `empresa_perfil(referral_code)`

Novas tabelas:

- `referrals`
  - rastreia clique, cadastro, trial, tentativa de pagamento, confirmação manual, aplicação e rejeição;
  - índices em `referral_code`, `referrer_empresa_id`, `referred_empresa_id`, `status`, `created_at`.
- `referral_rewards`
  - registra crédito interno ou dias de add-on;
  - status `pending`, `approved`, `applied`, `cancelled`;
  - sem recompensa sacável.
- `referral_trigger_events`
  - infraestrutura leve para gatilhos futuros: primeiro fechamento de caixa, 30 vendas, 7 dias de uso e uso do ZeloChat/IA.

RLS:

- Empresas autenticadas veem apenas referrals em que participam e rewards da própria empresa.
- Super admins ativos podem visualizar pelo admin dashboard.
- Inserts/updates sensíveis ficam para rotas server-side com service role.

## Endpoints Criados

- `GET /api/referrals/code`
  - autenticado;
  - garante código da empresa e retorna código/link.
- `POST /api/referrals/claim`
  - autenticado;
  - vincula indicação ao usuário logado usando cookie, localStorage enviado pelo cliente ou `user_metadata.referral_code`.
- `POST /api/admin/referrals/confirm-payment-manual`
  - super admin;
  - chama `confirmReferralPaymentManually(referralId, adminUserId, notes)`;
  - marca referral como `paid_manual_confirmed` e cria/atualiza reward `approved`.
- `POST /api/admin/referrals/apply-reward-manual`
  - super admin;
  - marca reward como `applied` e referral como `reward_applied`.
- `POST /api/admin/referrals/manual-action`
  - super admin;
  - executa ações guiadas no admin: avançar etapa, rejeitar com motivo, reabrir indicação e manter reward coerente para auditoria.

## Telas Criadas

- `/indica/[codigo]`
  - landing pública simples para convite.
- `/gestao/indicacoes`
  - tela “Minhas indicações” da empresa.
- `admin-dashboard/src/routes/referrals/+page.svelte`
  - lista indicações e permite ações guiadas de auditoria: avançar etapa, rejeitar, reabrir, aprovar pagamento e aplicar recompensa.
- Item “Indicações” na sidebar do app e do admin.

## Regras Implementadas

- Código único e legível por empresa.
- Link público rastreável.
- Bloqueio de autoindicação por:
  - mesma empresa;
  - mesmo e-mail;
- Casos com mesmo telefone ou mesmo CPF/CNPJ não são mais rejeitados automaticamente no onboarding do MVP. Eles podem ser revisados manualmente no admin.
- Recompensa só é aprovada por ação manual após confirmação humana.
- Limite de 5 recompensas aprovadas/aplicadas por empresa por mês.
- Recompensa padrão: R$30 de crédito interno.
- Benefício do indicado fica apenas documentado/visível no convite como condição especial configurada pelo time ZeloPDV.

## Como Aprovar Recompensa

1. Acesse `admin.zelopdv` e abra “Indicações”.
2. Confirme fora do sistema se o indicado realmente pagou.
3. Escolha a ação guiada “Confirmar pagamento e aprovar recompensa”.
4. O sistema marca a indicação como `paid_manual_confirmed` e cria reward `approved`.
5. Depois de aplicar o crédito/add-on manualmente na operação, use a ação “Marcar recompensa como aplicada”.

## Auditoria Manual no Admin

- O painel admin expõe ações guiadas em cada linha em vez de um seletor livre de status.
- Ações disponíveis conforme o contexto:
  - marcar como cadastro;
  - marcar como teste iniciado;
  - marcar como pendente de pagamento;
  - confirmar pagamento e aprovar recompensa;
  - marcar recompensa como aplicada;
  - rejeitar com motivo;
  - reabrir para cadastro, teste iniciado ou pendente de pagamento.
- Quando uma indicação é reaberta ou rejeitada depois de já ter reward `approved` ou `applied`, a reward é cancelada automaticamente para manter a trilha auditável coerente.

## Por Que Manual no MVP

O produto ainda tem poucos usuários e o risco operacional de automatizar crédito em assinatura, invoice ou cupom Stripe é maior que o ganho neste momento. O MVP registra tudo com trilha auditável e deixa a decisão financeira nas mãos do fundador/time Zelo.

## Caminho Futuro Para Automação

O ponto de entrada futuro é a função:

- `confirmReferralPaymentManually(referralId, adminUserId, notes)`

Quando a automação for segura, o webhook de pagamento pode:

1. identificar a `subscription.user_id` paga;
2. buscar referral ativa por `referred_empresa_id`;
3. validar bloqueios e limite mensal;
4. chamar uma variante automática isolada da função atual;
5. somente então aplicar crédito/cupom/add-on conforme regra de billing.

Não foi feito agora:

- desconto automático;
- cupom Stripe;
- alteração em invoices;
- crédito aplicado sem confirmação humana.

## Fase 2

- Ranking de indicações.
- Cartão digital com imagem.
- Campanhas mensais.
- QR code.
- Programa de embaixadores.
- Assinatura obrigatória em mensagens de WhatsApp.
- Descontos automáticos complexos.
- Automação via webhook após validação operacional.
