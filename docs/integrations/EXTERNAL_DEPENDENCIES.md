# External Dependencies

> Mapa operacional de integracoes externas do ZeloPDV.
> Use esta doc para incidentes, onboarding rapido e avaliacao de blast radius.

## Supabase

**Papel**

- Auth do produto
- Postgres principal
- Storage/realtime
- Base de todas as queries do app e do admin

**Codigo-chave**

- `src/lib/server/supabaseAdmin.js`
- `src/lib/server/supabaseAuth.js`
- `src/lib/supabaseClient.js`

**Quando cai**

- login/signup/reset quebra
- guards e carregamento inicial falham
- PDV online quebra; offline cobre apenas a venda ja montada no browser
- admin dashboard perde acesso

**Validacoes manuais uteis**

- autenticar owner
- abrir `/app`
- rodar uma venda simples
- validar um endpoint `api` que use `supabaseAdmin`

## Stripe

**Papel**

- checkout recorrente no cartao
- billing portal
- cancelamento e troca de plano
- webhook de estado da assinatura

**Codigo-chave**

- `src/lib/server/stripe.js`
- `src/routes/api/billing/create-subscription/+server.js`
- `src/routes/api/billing/create-portal-session/+server.js`
- `src/routes/api/billing/webhook/+server.js`

**Quando cai**

- checkout por cartao para
- portal pode parar
- webhooks atrasam sincronizacao de `subscriptions`

**Drifts conhecidos**

- historicamente o portal usava `stripe_customer_id`, mas a produção real usa `provider_customer_id`; o endpoint foi corrigido nesta sessão

## AbacatePay

**Papel**

- criacao de cobranca Pix
- polling de status
- webhook de confirmacao

**Codigo-chave**

- `src/lib/server/abacatePay.js`
- `src/lib/server/billingPix.js`
- `src/routes/api/billing/pix/create/+server.js`
- `src/routes/api/webhooks/abacatepay/+server.js`

**Quando cai**

- Pix novo nao pode ser criado
- confirmacoes podem atrasar
- assinatura pode ficar pendente ate polling ou webhook voltar

**Pontos de atencao**

- depende de `ABACATEPAY_WEBHOOK_SECRET`
- a assinatura falha fechada quando `ABACATEPAY_PUBLIC_KEY` não está configurada; não há fallback
  hardcoded no runtime atual

## Resend

**Papel**

- email transacional
- onboarding day 0
- convites/fluxos operacionais por email

**Codigo-chave**

- `src/lib/server/email.js`
- `src/routes/api/cron/onboarding-emails/+server.js`

**Quando cai**

- trial continua podendo nascer
- onboarding e comunicacao degradam
- convites e notificacoes podem ficar sem entrega

## ZeloChat interno

**Papel**

- envio de WhatsApp no onboarding
- dependencia externa de delecao final de conta, segundo as migrations

**Codigo-chave**

- `src/lib/server/whatsapp.js`
- `src/routes/api/billing/start-trial/+server.js`
- `.ai/migrations/account_deletion_grace_2026_05_31.sql`

**Quando cai**

- onboarding via WhatsApp degrada
- possivel impacto no purge final de conta agendada, se o sweeper externo morar la

## OpenAI

**Papel**

- suporte/chat interno

**Codigo-chave**

- `src/routes/api/chat/support/+server.js`
- `src/routes/api/chat/openai/+server.js`

**Quando cai**

- suporte automatizado para
- produto principal continua operando

**Drift conhecido**

- prompt de suporte ainda descreve add-on Acessos com preco antigo

## Meta CAPI e Google Ads

**Papel**

- atribuicao/marketing

**Codigo-chave**

- `src/lib/server/metaCapi.js`
- `src/lib/googleAds.js`

**Quando cai**

- produto nao para
- atribuicao de marketing degrada

## PostHog

**Papel**

- heatmaps e autocapture anonimo nas paginas externas/publicas
- diagnostico de scroll, clique e friccao em landing pages, cadastro e contato

**Codigo-chave**

- `src/lib/posthogClient.js`
- `src/routes/+layout.svelte`

**Escopo de captura**

- permitido: `/`, `/para-*`, `/vs-*`, `/blog/*`, `/cadastro`, `/login`, `/contato`, `/precificacao`, `/extensoes`, `/comparativos`, `/zelo-impressao`, `/pascoa`, `/termos`, `/privacidade`, `/indica/*`
- bloqueado: `/app`, `/gestao`, `/relatorios`, `/perfil`, `/assinatura`, `/ferramentas`, `/auth/callback`
- session recording fica desabilitado no client; o objetivo inicial e heatmap/autocapture, nao replay de telas internas

**Quando cai**

- produto nao para
- heatmaps e analise comportamental de marketing degradam

## Vercel cron

**Papel**

- onboarding emails
- nudge de cadastro incompleto

**Codigo-chave**

- `vercel.json`
- `src/routes/api/cron/onboarding-emails/+server.js`
- `src/routes/api/cron/nudge-incomplete-registration/+server.js`

**Quando cai**

- automacoes de ativacao param
- receita nao quebra imediatamente, mas onboarding degrada

## Admin dashboard

**Papel**

- operacao manual de billing
- auditoria/admin interno

**Codigo-chave**

- `admin-dashboard/`
- `src/routes/api/admin/*`

**Quando cai**

- suporte e billing manual ficam limitados
- produto do cliente final segue rodando

**Ponto de atencao**

- o dashboard usa anon key no browser e presume algumas tabelas administrativas acessiveis por design

## Variaveis de ambiente que merecem checklist

- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_ANON_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`
- AbacatePay: `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET`, `ABACATEPAY_PUBLIC_KEY`, `ABACATEPAY_BASE_URL`
- Resend: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- App: `PUBLIC_APP_URL`
- PostHog: `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST` (opcional; default `https://us.i.posthog.com`), `PUBLIC_POSTHOG_UI_HOST` (opcional)
- Cron: `CRON_SECRET`
- ZeloChat: `ZELOCHAT_INTERNAL_API_KEY`, `ZELOCHAT_INTERNAL_SEND_URL`, `ZELOCHAT_API_BASE_URL`
- Zelinho Gerente: `GERENTE_AGENT_ENABLED` (opcional, `false` desliga), `GERENTE_AGENT_MODEL` (opcional, padrão `gpt-4.1-mini`), `GERENTE_CHANNEL_INTERNAL_KEY` (obrigatória para o canal WhatsApp), `GERENTE_WHATSAPP_NUMBER` (número exibido ao dono para pareamento)

Nota: o ZeloChat chama o ZeloPDV em `/api/gerente/channel`, então a dependência entre os dois repos agora é bidirecional (ZeloPDV chama ZeloChat para enviar mensagens de onboarding; ZeloChat chama ZeloPDV para o canal do Zelinho Gerente).

## Ordem de triagem em incidente

1. Confirmar se a falha e de auth/dados (Supabase), cobranca (Stripe/AbacatePay) ou comunicacao (Resend/ZeloChat).
2. Ver se existe fallback local/assincrono:
   - venda offline para PDV
   - polling de Pix
   - retry humano no admin
3. Conferir [[CURRENT]] e [[CODE_REVIEW]] para drifts ja conhecidos.
4. Se a falha virar outage real, registrar em [[INCIDENTS]].
