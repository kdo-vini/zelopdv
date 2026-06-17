# Billing

> Fonte operacional para assinatura, trial, checkout, Pix, portal e ajustes manuais.
> Contexto maior: [[CLAUDE]] · estado atual: [[CURRENT]]

## Fonte de verdade

- Entitlement/acesso: tabela `subscriptions`.
- Tentativas e histórico de cobrança Pix: tabela `billing_payments`.
- Idempotência de webhook:
  - Stripe: `webhook_events_processed`
  - AbacatePay: `billing_webhook_events` + `webhook_events_processed`

## Catálogo atual

Canônico em [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:7).

- Plano `pdv`: R$ 59/mês
- Plano `chat`: R$ 97/mês
- Plano `bundle`: R$ 147/mês
- Add-ons `mesas`, `pedidos`, `acessos`: R$ 30/mês cada

Regra prática:

- Mude preço, nome ou compatibilidade em `pricing.js`.
- Stripe line items e parse de webhook dependem de `buildStripeLineItems` e `parseStripeSubscriptionItems` em [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:132).

## Fluxos

### Trial

- Endpoint: [src/routes/api/billing/start-trial/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/start-trial/+server.js:191)
- Cria `subscriptions.status='trialing'` quando ainda não existe assinatura.
- Expiração automática: [src/routes/api/cron/expire-trials/+server.js](/home/vinicius/code/zelopdv/src/routes/api/cron/expire-trials/+server.js:1) roda diariamente antes do onboarding e muda trials locais vencidos para `subscriptions.status='trial_expired'`.
- `past_due` fica reservado para falha de cobrança / atraso de pagamento, normalmente vindo de provider webhook ou ajuste manual. Trial grátis encerrado sem cobrança não deve virar `past_due`.
- Também aciona:
  - referral progress
  - email day 0
  - WhatsApp de boas-vindas via ZeloChat interno

### Stripe cartão

- Entrada: [src/routes/api/billing/create-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-subscription/+server.js:20)
- Este endpoint:
  - autentica owner
  - valida plano/add-ons
  - exige perfil com `documento`
  - cria/resolve customer Stripe
  - abre Checkout Session
  - pré-grava `subscriptions` como `incomplete` ou preserva estado atual se o cliente ainda está ativo/trialing

- Webhook: [src/routes/api/billing/webhook/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/webhook/+server.js:150)
- Eventos tratados no código:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

### Portal do cliente Stripe

- Endpoint: [src/routes/api/billing/create-portal-session/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-portal-session/+server.js:9)
- Objetivo: abrir Billing Portal do Stripe para owner autenticado.
- Validação manual concluída: o schema real de produção não tem `stripe_customer_id`; o contrato vivo é `provider_customer_id`. O endpoint foi alinhado para esse contrato nesta sessão.

### Pix transparente / AbacatePay

- Criação: [src/routes/api/billing/pix/create/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/pix/create/+server.js:51)
- Requisitos:
  - owner autenticado
  - perfil com `nome_exibicao`, `documento` e `contato`
  - CPF/CNPJ e telefone normalizados/validados
- Persistência:
  - grava `billing_payments.status='pending'`
  - guarda `br_code`, `qr_code_base64`, vencimento e seleção de plano/add-ons

- Sincronização:
  - webhook em [src/routes/api/webhooks/abacatepay/+server.js](/home/vinicius/code/zelopdv/src/routes/api/webhooks/abacatepay/+server.js:53)
  - motor de ativação em [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:178)
  - polling/status em [src/routes/api/billing/pix/status/[paymentId]/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/pix/status/[paymentId]/+server.js:1)

## Endpoint matrix

| Fluxo | Endpoint | Auth | Notas |
| --- | --- | --- | --- |
| Iniciar trial | `POST /api/billing/start-trial` | owner | dispara onboarding e referral progress |
| Expirar trials locais | `GET /api/cron/expire-trials` | `CRON_SECRET` | muda `trialing` vencido sem provider para `trial_expired` |
| Criar checkout Stripe | `POST /api/billing/create-subscription` | owner | cartão only |
| Portal Stripe | `POST /api/billing/create-portal-session` | owner | usa `provider_customer_id` |
| Cancelar assinatura | `POST /api/billing/cancel-subscription` | owner | `cancel_at_period_end=true` |
| Trocar plano | `POST /api/billing/change-plan` | owner | Stripe only |
| Toggle add-on | `POST /api/billing/toggle-addon` | owner | Stripe only; trial sem provedor atualiza só DB |
| Criar Pix | `POST /api/billing/pix/create` | owner | exige perfil completo |
| Status Pix | `GET /api/billing/pix/status/[paymentId]` | owner | pode sincronizar remoto sob demanda |
| Webhook Stripe | `POST /api/billing/webhook` | provedor | idempotência em `webhook_events_processed` |
| Webhook AbacatePay | `POST /api/webhooks/abacatepay?webhookSecret=...` | provedor | query secret + header HMAC |
| Extensão manual | `POST /api/admin/billing/extend-subscription` | super admin | muda expiry efetivo |
| Sync manual de plano | `POST /api/admin/billing/sync-plan` | super admin | correção operacional |
| Reclassificação manual | `POST /api/admin/billing/reclassify-manual` | super admin | ajuste operacional |

## Mudanças em assinatura ativa

- Troca de plano Stripe: [src/routes/api/billing/change-plan/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/change-plan/+server.js:16)
- Liga/desliga add-on Stripe: [src/routes/api/billing/toggle-addon/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/toggle-addon/+server.js:14)
- Extensão manual via admin: [src/routes/api/admin/billing/extend-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/admin/billing/extend-subscription/+server.js:50)
- Sync manual de plano via admin: `src/routes/api/admin/billing/sync-plan/+server.js`
- Reclassificação manual via admin: `src/routes/api/admin/billing/reclassify-manual/+server.js`

## Endpoints legados / compatibilidade

- [src/routes/api/billing/create-checkout-session/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-checkout-session/+server.js:1) retorna `410 Gone`. Clientes devem usar `create-subscription`.

## Invariantes

- `subscriptions` é a referência final de acesso.
- Status canônicos no app: `active`, `trialing`, `trial_expired`, `past_due`, `canceled`, `incomplete`.
- Subusuários não gerenciam billing; endpoints de billing owner-facing bloqueiam `accessContext.isSubUser`.
- O checkout Stripe preserva acesso atual até o webhook confirmar.
- O Pix só ativa assinatura quando `syncPixPaymentWithRemote` confirma valor pago suficiente.
- `pricing.js` é o catálogo canônico de planos, add-ons e Stripe price IDs.
- O código assume, na prática, uma assinatura efetiva canônica por `user_id`; quase todos os fluxos leem `order(updated_at desc).limit(1)`.

## Riscos e drifts

- A validação do webhook AbacatePay usa `ABACATEPAY_WEBHOOK_SECRET` na query e assinatura HMAC em header.
- Há fallback para `DEFAULT_ABACATEPAY_PUBLIC_KEY` em [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:122); confirmar manualmente se isso é intencional.
- `POST /api/account/reactivate` limpa `deletion_*` mesmo quando a retomada do Stripe falha; isso deixa espaco para drift entre estado local e estado do provedor — [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:28)
- O contrato de perfil exigido diverge entre Stripe checkout e Pix/guards: checkout exige `documento`, enquanto Pix e guards exigem perfil validado completo — [src/routes/api/billing/create-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-subscription/+server.js:65), [src/routes/api/billing/pix/create/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/pix/create/+server.js:100), [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:147)

## Operação manual que depende de validação humana

- Rewards de indicação continuam com confirmação/aplicação manual.
- Extensão e sincronização de assinatura no admin exigem super admin ativo.
- Reativação de conta após agendamento de deleção limpa `deletion_scheduled_at` e tenta reverter `cancel_at_period_end` no Stripe.

## Pendente de validação

- Não há doc neste repo sobre o processo externo que executa o purge final após `deletion_scheduled_at`. O banco real não possui job `pg_cron` local para isso.
- Falta validar em produção se todos os webhooks estão gravando `billing_webhook_events` e `webhook_events_processed` como esperado.
