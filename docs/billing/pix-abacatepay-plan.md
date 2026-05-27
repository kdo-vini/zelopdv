# Plano Pix AbacatePay

## Objetivo

Adicionar pagamento via Pix com AbacatePay sem quebrar o fluxo atual do Stripe.

Escopo inicial:

1. gerar cobranca Pix com QR Code e copia-e-cola;
2. salvar cobranca como `pending` no banco;
3. preparar a base para webhook e renovacao automatica;
4. manter Stripe como fluxo principal de cartao.

## Estado atual

- app: SvelteKit + Supabase + Stripe
- source of truth de acesso: tabela `subscriptions`
- billing atual fica em `src/routes/api/billing/*`
- UI principal fica em `src/routes/assinatura/+page.svelte`

## Decisao de arquitetura

- `subscriptions` continua sendo a tabela de entitlement/acesso
- `billing_payments` vira a tabela de cobrancas e tentativas de pagamento
- Stripe e AbacatePay coexistem como providers
- fase 1 de Pix usa cobranca avulsa transparente, nao assinatura recorrente da AbacatePay

## Modelo minimo

### subscriptions

Manter:

- `user_id`
- `status`
- `current_period_end`
- `plan_tier`
- `has_mesas_addon`
- `has_pedidos_addon`
- `has_acessos_addon`
- `payment_provider`
- `billing_type`

### billing_payments

Nova tabela para registrar:

- usuario/titular
- assinatura relacionada
- provider
- metodo
- status
- valor esperado
- valor pago
- ids do provider
- QR Code / brCode
- expiracao
- metadata de rastreio

## Fases

### Fase 1

- migration `billing_payments`
- camada server-side AbacatePay
- endpoint `POST /api/billing/pix/create`
- UI minima em `/assinatura`

### Fase 2

- webhook AbacatePay
- idempotencia de eventos
- ativacao/renovacao automatica
- logs e reconciliacao

### Fase 3

- endpoint de status/polling
- expiracao automatica de pending
- tela mais robusta para pagamentos em andamento

## Implementacao iniciada nesta rodada

- arquivo de plano criado no root
- migration inicial de `billing_payments`
- client server-side da AbacatePay
- endpoint de criacao Pix
- UI inicial para gerar e exibir QR Code

## Pontos abertos

- confirmar em sandbox a validacao final do webhook HMAC
- decidir politica exata de troca Stripe -> Pix no meio de ciclo
- decidir se `subscriptions` deve ganhar `unique(user_id)` apos auditoria de dados
