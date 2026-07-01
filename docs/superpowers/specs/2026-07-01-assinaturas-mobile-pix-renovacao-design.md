# Design — Assinaturas mobile-first + PIX de renovação (admin)

> Data: 2026-07-01
> Área: `admin-dashboard/src/routes/subscriptions/+page.svelte` + novo endpoint no app principal
> Contexto: [[CLAUDE]] · [[BILLING]] · [[CODE_REVIEW]] · [[DESIGN_PATTERNS]]

## Problema

1. A tela de Assinaturas do admin tem paridade ruim no mobile: o card mobile só expõe
   Prorrogar / Cancelar / Reativar, enquanto o desktop tem dropdown de status, +7D Trial,
   editar plano/addons, valor, dots de entitlement e datas. O operador acessa
   principalmente pelo celular.
2. Não existe forma de o admin gerar um PIX de renovação para uma conta específica. Hoje o
   PIX só é gerado pelo próprio owner (`POST /api/billing/pix/create`). O admin quer gerar o
   PIX correspondente ao **plano atual** da conta, entregá-lo ao cliente, e a assinatura
   renovar automaticamente quando pago — eliminando o processo manual de extensão.

## Fato que fundamenta a solução

A ativação de assinatura por PIX (`syncPixPaymentWithRemote` → `activateSubscriptionFromPayment`
em `src/lib/server/billingPix.js`) lê **tudo do registro `billing_payments`** (`payment.user_id`,
`payment.plan_tier`, addons). Não depende de quem criou o pagamento. Logo, um `billing_payments`
inserido por um admin com `kind='subscription_renewal'` e o plano correto será ativado
automaticamente pelo webhook AbacatePay existente, sem nenhum código de ativação novo.

## Escopo

### A. Paridade mobile do card de assinatura

Reconstruir o bloco `<div class="md:hidden ...">` como layout principal mobile-first,
reaproveitando as funções que o desktop já usa (sem lógica nova, só superfície). O card passa a ter:

- Plano + addons + valor/mês, tocável → `openPlanModal(sub)` (editar plano/addons).
- Dropdown de status (`active/trialing/trial_expired/past_due/canceled`) → `handleUpdateStatus`.
- Botão **+7D Trial** condicional (`sub.status === 'trialing' || isExpired`) → `handleExtendTrialOnly(sub, 7)`.
- **Renovar/Prorrogar** → `openExtendModal(sub)`; **Cancelar** → `handleCancelSubscription`; **Reativar** → `handleReactivateSubscription`.
- Botão novo **Gerar PIX de renovação** (feature B).

Fora do escopo do card mobile (decisão explícita): dots PDV×Chat e data de criação.

Os modais `showExtendModal` e `showPlanModal` já são responsivos (`max-w-md`, full-screen em telas
pequenas) e funcionam no mobile sem alteração.

### B. Endpoint novo — `POST /api/admin/billing/pix/create` (app principal)

Segue o padrão dos demais admin endpoints em `src/routes/api/admin/billing/*`:

- CORS com `ALLOWED_ORIGINS` (admin.zelopdv.com.br + localhost:5174) e handler `OPTIONS`.
- Auth: `supabaseAdmin.auth.getUser(token)` → checagem `super_admins` com `is_active=true`.

Fluxo:

1. Recebe `{ subscriptionId }`.
2. Carrega a `subscription` alvo → deriva `plan_tier` + `has_*_addon` atuais.
3. Carrega `empresa_perfil` (nome_exibicao, documento, contato) do `user_id` da sub + email via `supabaseAdmin.auth.admin.getUserById`.
4. Valida perfil completo com as mesmas regras do fluxo owner (`normalizeBrazilianTaxId` + `isValidBrazilianTaxId`, `normalizeBrazilianPhone`). Se faltar dado, retorna 400 com mensagem indicando **o que** falta (código `profile_incomplete` + campo).
5. Reaproveita/cancela PIX pendente do usuário (mesma lógica de `pix/create`: se pendente ainda válido e mesma seleção, reusa; senão cancela/expira).
6. Cria cobrança AbacatePay (`createTransparentPixCharge`) e insere `billing_payments` com
   `kind='subscription_renewal'`, `metadata.source='admin_renewal_pix'`, `adminId` no metadata.
7. **Não ativa** nada — ativação ocorre no pagamento via webhook existente.
8. Loga via `logAdminAction` (do lado do client) e/ou grava metadata do admin.

Refatoração: extrair a lógica compartilhada (montar charge + montar/inserir `billing_payments`)
para uma função em `src/lib/server/billingPix.js` (ex.: `createRenewalPixCharge({ userId, planTier, addons, perfil, email, actor })`)
para que o endpoint owner (`/api/billing/pix/create`) e o admin não dupliquem código. O endpoint
owner é refatorado para consumir essa função (comportamento inalterado).

### C. Entrega por WhatsApp

Após inserir o `billing_payments`, o endpoint chama `sendWhatsAppTextDetailed(telefone, mensagem)`
(`src/lib/server/whatsapp.js`) com o copia-e-cola PIX e o valor formatado. A resposta do endpoint
inclui `whatsappSent: boolean` e `whatsappError?: string`.

O modal do admin (novo, em `subscriptions/+page.svelte`) mostra:

- Valor da cobrança e plano.
- Status do envio WhatsApp (enviado / falhou + motivo).
- Copia-e-cola PIX como **fallback** (para reenviar manualmente).
- Botão opcional "Reenviar WhatsApp".

### D. Regras e avisos

- Botão "Gerar PIX de renovação" visível para **qualquer conta** (ativa, expirada, trial, cancelada).
  Se o perfil estiver incompleto, o clique abre o modal exibindo o que falta (não esconde o botão).
- Para subs com `payment_provider === 'stripe'`, o modal exibe aviso discreto: a conta é cartão
  recorrente e o PIX vira cobrança avulsa que fará `payment_provider` virar `abacatepay` ao pagar.
- Mantém a invariante de billing: uma assinatura efetiva canônica por `user_id`
  (`order(updated_at desc).limit(1)`).

## Componentes e responsabilidades

| Unidade | Local | Responsabilidade |
| --- | --- | --- |
| `createRenewalPixCharge()` | `src/lib/server/billingPix.js` | Validar perfil, criar charge AbacatePay, inserir/reusar `billing_payments`. Compartilhada owner+admin. |
| `POST /api/admin/billing/pix/create` | `src/routes/api/admin/billing/pix/create/+server.js` | Auth super admin, derivar plano da sub, chamar `createRenewalPixCharge`, disparar WhatsApp, responder. |
| `POST /api/billing/pix/create` | (existente, refatorado) | Passa a consumir `createRenewalPixCharge`; comportamento inalterado. |
| Card mobile + modal PIX | `admin-dashboard/src/routes/subscriptions/+page.svelte` | Superfície mobile-first + UI de geração/entrega do PIX. |

## Fluxo de dados (PIX renovação)

```
Admin clica "Gerar PIX" (card/linha)
  → POST /api/admin/billing/pix/create { subscriptionId }
     → auth super_admin
     → deriva plan_tier+addons da subscription
     → valida empresa_perfil
     → createRenewalPixCharge() → AbacatePay + insert billing_payments(kind=subscription_renewal)
     → sendWhatsAppTextDetailed(telefone, copia-e-cola)
     → responde { brCode, qrCodeBase64, amountCents, whatsappSent, whatsappError }
  → modal mostra valor + status envio + copia-e-cola fallback

Cliente paga PIX
  → webhook AbacatePay (/api/webhooks/abacatepay)
     → syncPixPaymentWithRemote → activateSubscriptionFromPayment
     → subscriptions.status='active', current_period_end += 1 mês
```

## Tratamento de erros

- AbacatePay não configurado → 500 com mensagem clara.
- Perfil incompleto → 400 `{ code: 'profile_incomplete', missing: [...] }`.
- Falha ao inserir `billing_payments` → 500, não dispara WhatsApp.
- Falha no WhatsApp → não falha a criação do PIX; retorna `whatsappSent:false` + erro; admin usa fallback copia-e-cola.
- subscription não encontrada → 404.

## Testes

- `npm run check` (app principal) e `cd admin-dashboard && npm run check`.
- Vitest para `createRenewalPixCharge`: perfil incompleto (cada campo), seleção de plano derivada
  correta, reaproveitamento de pendente válido, cancelamento de pendente divergente.
- Verificação manual: gerar PIX numa conta de teste e confirmar ativação via webhook (staging).

## Fora de escopo (YAGNI)

- Geração de PIX em lote para várias contas.
- Escolha de plano diferente do atual na renovação (sempre usa o plano atual).
- Reenvio por e-mail (só WhatsApp + copia-e-cola nesta iteração).
