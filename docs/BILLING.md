# Billing

> Fonte operacional para assinatura, trial, checkout, Pix, portal e ajustes manuais.
> Contexto maior: [[CLAUDE]] · estado atual: [[CURRENT]]

## Fonte de verdade

Editor admin (2026-09-04): `update-user-subscription` recebe subscriptionId,
valida owner e altera uma linha com confirmação/CAS de updated_at; cliente
legado sem ID seleciona a mais recentemente atualizada. Status active/trialing
exige prazo futuro (current_period_end ou manually_extended_until); mudar
status não renova cobrança nem concede um mês implicitamente. A reativação
de vencidas no painel abre a Renovação Manual existente. Cancelamento limpa
extensão manual e cancel_at_period_end. Nenhum histórico financeiro é editado.

- Entitlement/acesso: tabela `subscriptions`.
- Tentativas e histórico de cobrança Pix: tabela `billing_payments`.
- Idempotência de webhook:
  - Stripe: `webhook_events_processed`
  - AbacatePay: `billing_webhook_events` + `webhook_events_processed`

## Catálogo atual

Canônico em [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:7).

- Plano `pdv`: R$ 59/mês
- Plano `chat`: R$ 149/mês
- Plano `bundle`: R$ 198/mês
- Add-ons `mesas` e `acessos`: R$ 30/mês cada; `menu` (ZeloMenu): R$ 40/mês
- O add-on `pedidos` (Pedidos + Cozinha) foi aposentado em 2026-07-28 e saiu do catálogo; a capacidade vive no ZeloMenu
- As colunas legadas `subscriptions.has_pedidos_addon` e `billing_payments.has_pedidos_addon` foram removidas na fase 2 em 2026-07-28. O histórico financeiro legado dessa flag não foi preservado por decisão do dono do produto; os demais registros e campos de `billing_payments` permanecem.
- A assinatura `d5625be9` foi reconciliada em 2026-07-28: Acessos sem evidência contratual foi removido, bundle + Mesas ficou em R$228/mês, e a alteração foi auditada sem estorno ou alteração do histórico de pagamentos.

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
- Stripe só grava `webhook_events_processed` depois dos efeitos locais; falhas
  de update retornam 500 para que o provedor tente novamente.

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
  - motor de ativação em [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:133)
  - polling/status em [src/routes/api/billing/pix/status/[paymentId]/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/pix/status/[paymentId]/+server.js:1)
- Confirmação paga usa a RPC service-role-only `settle_pix_payment`, que trava
  a cobrança e grava pagamento + renovação da assinatura no mesmo commit.
- Eventos AbacatePay em `received` ou `failed` são reabertos em retries; se a
  linha local ainda não existir, o webhook retorna 500 em vez de confirmar
  `ignored`.

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
- A verificação Pix falha fechada quando `ABACATEPAY_PUBLIC_KEY` não está configurada; não há fallback de chave embutida em runtime.
- `POST /api/account/reactivate` só limpa `deletion_*` depois que o Stripe aceita a retomada (ou confirma que a assinatura já não existe); falhas transitórias retornam erro e preservam a agenda para retry.
- `subscriptions` preserva histórico terminal, mas o schema agora garante no máximo uma linha viva por titular (`active`, `trialing`, `past_due` ou `incomplete`) pelo índice parcial `subscriptions_one_live_row_per_user`.
- O contrato de perfil exigido diverge entre Stripe checkout e Pix/guards: checkout exige `documento`, enquanto Pix e guards exigem perfil validado completo — [src/routes/api/billing/create-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-subscription/+server.js:65), [src/routes/api/billing/pix/create/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/pix/create/+server.js:100), [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:147)

## Operação manual que depende de validação humana

- Rewards de indicação continuam com confirmação/aplicação manual.
- Extensão e sincronização de assinatura no admin exigem super admin ativo.
- Reativação de conta após agendamento de deleção limpa `deletion_scheduled_at` e tenta reverter `cancel_at_period_end` no Stripe.

## Pendente de validação

- Não há doc neste repo sobre o processo externo que executa o purge final após `deletion_scheduled_at`. O banco real não possui job `pg_cron` local para isso.
- Falta validar em produção se todos os webhooks estão gravando `billing_webhook_events` e `webhook_events_processed` como esperado.

## Pix: reserva e reconciliação da criação (2026-09-04)

**Código local em validação; aplicar a migration `20260905001053_pix_creation_reservation.sql`
antes de publicar os consumidores.** A reserva usa a tabela `billing_payments`
existente e não altera valores, preços, RLS nem a regra de liquidação da assinatura.

O app e o admin chamam `reserve_pix_payment` sob lock transacional por titular.
A linha e o snapshot de plano/add-ons/valor são gravados antes do POST AbacatePay;
`externalId = pix_<payment UUID>` e `metadata.paymentId/userId` identificam essa
tentativa. Apenas a chamada que recebe `action=create` pode enviar o POST.
Cobrança pronta com a mesma seleção é reutilizada. Outra seleção enquanto o Pix
ainda pode ser pago retorna conflito; não se marca uma cobrança como cancelada
apenas localmente. Expiração pelo relógio exige consulta ao provedor antes de
liberar outra tentativa; uma liquidação tardia é devolvida ao solicitante.

`creation_state` distingue `dispatching`, `unknown`, `ready` e `not_sent`.
O deadline HTTP de 15 segundos cobre headers e corpo. Falha de configuração
local comprovadamente anterior ao envio libera a reserva como `not_sent`.
Falhas após chamar fetch, resposta incompleta e falha ao persistir a resposta
mantêm o resultado incerto, inclusive HTTP de erro: não existe retry de POST.
Não há promessa de idempotência do provedor; a garantia depende da reserva local.

Recuperação operacional: repetir a ação de gerar Pix no app/admin ou consultar
`GET /api/billing/pix/status/<paymentId>` executa apenas consulta para uma reserva
incerta. `GET /v2/transparents/list?externalId=...&limit=2` procura a cobrança;
zero resultados preserva a reserva (consistência eventual não prova ausência),
mais de um resultado/página exige suporte, e um resultado só é vinculado se
externalId ou metadata de payment+owner coincidirem e o valor for exato. Campos
de identidade presentes mas divergentes são recusados novamente no SQL.
Webhook assinado que chega antes da vinculação também pode iniciar essa
reconciliação. Com ID já conhecido, usa-se o GET de consulta por ID.

Um resultado incerto retorna HTTP409 `PIX_OUTCOME_UNKNOWN`, `paymentId` e
`retrySafe:false`. A mesma tentativa pode ser consultada novamente, sem POST.
Reserva incerta não é apagada nem liberada automaticamente por idade. Se o
provedor nunca tornar a cobrança consultável, o suporte deve confirmar seu
resultado com o provedor; não há botão que ignore essa proteção.
`complete_pix_creation` preserva `status/paid_at`; a liquidação continua na
RPC `settle_pix_payment`. Resposta PENDING tardia usa CAS e não regride pagamento
confirmado. Analytics usa `waitUntil` e falha isoladamente após o sucesso do Pix.

Validação: `node scripts/verify-pix-creation.mjs` cria PostgreSQL17 descartável
sem rede externa, com duas sessões concorrentes, unknown durável, recuperação,
identidade/valor, replay de liquidação, resposta tardia, falha local e ACL.
Testes HTTP usam mocks/servidor localhost; nenhuma cobrança real foi criada.
Contrato do provedor conferido no navegador do usuário:
[criação](https://docs.abacatepay.com/pages/transparents/create) e
[listagem por externalId](https://docs.abacatepay.com/pages/transparents/list).
