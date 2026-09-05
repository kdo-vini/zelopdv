# ZeloPDV

> Leitura rápida antes de qualquer tarefa: [[CURRENT]]
> Hub do vault: [[HOME]]

## Ordem de leitura recomendada

1. [[CURRENT]] — foco da sessão, estado validado mais recente
2. [[ZeloPDV.memory]] — fatos confirmados que ajudam continuidade
3. [[BILLING]] — se tocar assinatura, cobrança, trial, checkout ou Pix
4. [[CODE_REVIEW]] — riscos abertos e pontos frágeis do código
5. [[TRADEOFFS]] — tradeoffs aceitos e dívida técnica conhecida (o que deixamos na mesa de propósito)
6. [[FIXES_PROGRESS]] / [[INCIDENTS]] — trilha operacional
7. [[DESIGN_PATTERNS]] — **obrigatório antes de qualquer mudança de UI** (tela, componente, cabeçalho, botão, navegação)

## Arquitetura real

### Aplicações

- App principal: `src/` em SvelteKit 2 + Svelte 5 + Vite 6.
- Dashboard admin separado: `admin-dashboard/` em SvelteKit 2 + Svelte 5.57.0 + Vite 6.4.3.
- Deploys Vercel: `zelopdv` e `zelopdv-admin` usam `@sveltejs/adapter-vercel` explícito com runtime `nodejs24.x`, respectivamente em [svelte.config.js](/home/vinicius/code/zelopdv/svelte.config.js:1) e `admin-dashboard/svelte.config.js`.
- Cron jobs Vercel: `0 9 * * *` para onboarding emails e `0 10 * * *` para nudge de cadastro em [vercel.json](/home/vinicius/code/zelopdv/vercel.json:1).

### Mapa do repositório

| Área | Caminho | Papel |
| --- | --- | --- |
| App principal | `src/` | produto do cliente final |
| Rotas server-side | `src/routes/api/` | billing, auth, referrals, cron, chat |
| Lógica de domínio | `src/lib/` | guards, finance, offline, integrations |
| Admin interno | `admin-dashboard/` | operação manual e auditoria |
| Testes unitários | `tests/` | Vitest |
| Testes E2E | `e2e/` | Playwright |
| Documentação | `docs/` | toda a doc do repo: operacional (`CURRENT`, `BILLING`, `CODE_REVIEW`, `TRADEOFFS`, `FIXES_PROGRESS`, `INCIDENTS`, `ZeloPDV.memory`) + profunda (setup, offline, módulos, trackers) |
| Vault | `pdvObsidian/` | hub Obsidian; espelha `docs/` via symlinks |

### Superfícies do produto

- Público/marketing: `/`, `/para-*`, `/blog`, `/precificacao`, `/extensoes`, `/vs-planilha`, `/zelo-impressao`.
- Auth e billing: `/cadastro`, `/login`, `/esqueci-senha`, `/redefinir-senha`, `/assinatura`.
- Operação PDV: `/app` (frente de caixa), `/app/pedidos`, `/app/pedidos/cozinha`, `/app/mesas`.
- Gestão: `/gestao/*`, `/relatorios`, `/perfil`.
- Admin interno: app separado em `admin-dashboard/`.

## Serviços e dependências

- Supabase: auth, Postgres, storage, realtime. Cliente service-role em [src/lib/server/supabaseAdmin.js](/home/vinicius/code/zelopdv/src/lib/server/supabaseAdmin.js:1).
- Stripe: cartão recorrente, portal, troca de plano, webhooks em [src/lib/server/stripe.js](/home/vinicius/code/zelopdv/src/lib/server/stripe.js:1) e `src/routes/api/billing/*`.
- AbacatePay: Pix transparente em [src/lib/server/abacatePay.js](/home/vinicius/code/zelopdv/src/lib/server/abacatePay.js:1) e [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:1).
- Resend: emails transacionais em [src/lib/server/email.js](/home/vinicius/code/zelopdv/src/lib/server/email.js:1).
- OpenAI: chat interno/suporte em `src/routes/api/chat/*`.
- ZeloChat: envio interno de WhatsApp para onboarding em [src/lib/server/whatsapp.js](/home/vinicius/code/zelopdv/src/lib/server/whatsapp.js:1).
- Meta CAPI e Google Ads: rastreamento server/client em `src/lib/server/metaCapi.js` e `src/lib/googleAds.js`.
- Dexie/IndexedDB: fila offline e cache local em [src/lib/offlineDb.js](/home/vinicius/code/zelopdv/src/lib/offlineDb.js:1).

Docs mais específicas:

- `docs/integrations/EXTERNAL_DEPENDENCIES.md` — mapa operacional de integrações e falhas
- `docs/data/SCHEMA_RLS.md` — tenancy, RLS e trust boundaries
- `docs/modules/ACESSOS.md` / `docs/modules/MESAS.md` — contratos operacionais dos add-ons

### Ambientes e variáveis sensíveis

Principais envs usados no código:

- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_ANON_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`
- AbacatePay: `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET`, `ABACATEPAY_PUBLIC_KEY`, `ABACATEPAY_BASE_URL`
- Resend: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- App/public URLs: `PUBLIC_APP_URL`
- Cron: `CRON_SECRET`
- ZeloChat interno: `ZELOCHAT_INTERNAL_API_KEY`, `ZELOCHAT_INTERNAL_SEND_URL` ou `ZELOCHAT_API_BASE_URL`

## Banco de dados

### Convenção observada

- O ledger preserva 59 versões remotas congeladas e migrations forward
  posteriores em `supabase/migrations/`; em 2026-09-04 são 38 forward.
  `npm run verify:migrations` confirma o inventário; nunca editar arquivo aplicado.
- `supabase/baselines/20260813091000/` é o baseline executável atual, fora do
  stream normal, e `supabase/history/` contém referências não executáveis.
- `.ai/migrations/` permanece como acervo legado classificado; não é a fonte
  canônica para migrations novas.
- O estado real continua sendo verificado contra o banco vinculado, mas o
  bootstrap descartável agora prova equivalência de schema, grants e policies.

### Tabelas centrais confirmadas no código

- `empresa_perfil`: perfil da empresa, flags de onboarding, referral, dados de impressão e agendamento de deleção.
- `subscriptions`: source of truth de entitlement/acesso.
- `billing_payments`: tentativas de cobrança Pix / AbacatePay.
- `webhook_events_processed` e `billing_webhook_events`: idempotência e auditoria de webhooks.
- `access_users`, `access_roles`, `access_settings`: subusuários, cargos e permissões.
- `referrals`, `referral_rewards`, `referral_trigger_events`: indicação.
- `vendas`, `vendas_itens`, `vendas_pagamentos`, `vendas_taxas_plataforma`, `caixas`, `pessoas`, `mesas`, `comandas*`: núcleo operacional do PDV.
- `email_onboarding_logs`, `onboarding_communication_events`, `registration_nudges`: automação de onboarding.
- `super_admins`, `admin_activity_logs`: admin interno.

### Tenancy e enforcement observados

- O tenant real do produto continua ancorado no owner da empresa.
- Para subusuários, o RLS principal usa `get_owner_user_id(auth.uid())` para escopar dados da empresa dona.
- Isso nao significa RBAC fino no servidor: as permissoes por papel vivem em JSON e sao checadas majoritariamente no cliente.
- `supabaseAdmin` contorna RLS e so deve aparecer em handlers server-side; `supabase`/anon key dependem integralmente das policies do banco.

## Fluxos críticos

| Fluxo | Ponto de entrada | Invariantes |
| --- | --- | --- |
| Guarda de sessão/assinatura | [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:81) | `ensureActiveSubscription` e os checks de add-on definem quem entra em `/app`, `/gestao`, `/relatorios` e módulos extras. |
| Checkout Stripe | [src/routes/api/billing/create-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-subscription/+server.js:20) | Pré-grava `subscriptions`; o webhook Stripe é quem fecha o estado final. |
| Webhook Stripe | [src/routes/api/billing/webhook/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/webhook/+server.js:150) | Idempotência em `webhook_events_processed`; atualiza plan/add-ons/status/período. |
| Pix AbacatePay | [src/routes/api/billing/pix/create/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/pix/create/+server.js:51) | Exige perfil completo, cria `billing_payments` pending e depende do webhook/status para ativar assinatura. |
| Webhook AbacatePay | [src/routes/api/webhooks/abacatepay/+server.js](/home/vinicius/code/zelopdv/src/routes/api/webhooks/abacatepay/+server.js:53) | Rejeita segredo/query inválidos, valida assinatura, sincroniza pagamento e pode ativar `subscriptions`. |
| Venda online/offline | [src/lib/finance/saleOps.js](/home/vinicius/code/zelopdv/src/lib/finance/saleOps.js:113) + [src/lib/offlineDb.js](/home/vinicius/code/zelopdv/src/lib/offlineDb.js:191) | `buildVendaPayload` precisa casar com a RPC `criar_venda_completa`; replay offline usa `client_sale_id` para idempotência. |
| Subusuários / add-on Acessos | [src/lib/server/accessControl.js](/home/vinicius/code/zelopdv/src/lib/server/accessControl.js:106) | Subusuário herda assinatura do titular; billing continua restrito ao owner. |
| Deleção de conta | [src/routes/api/account/delete/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/delete/+server.js:15) | App só agenda a deleção; purge final depende de sweeper externo citado na migration. |
| Onboarding e nudge | [src/routes/api/billing/start-trial/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/start-trial/+server.js:191), [src/routes/api/cron/onboarding-emails/+server.js](/home/vinicius/code/zelopdv/src/routes/api/cron/onboarding-emails/+server.js:46), [src/routes/api/cron/nudge-incomplete-registration/+server.js](/home/vinicius/code/zelopdv/src/routes/api/cron/nudge-incomplete-registration/+server.js:34) | Trial dispara email/WhatsApp/referral progress; crons dependem de `CRON_SECRET`, Resend e service role. |

## Hotspots de manutenção

Arquivos que concentram risco de regressão e custo alto de edição:

- `src/routes/app/mesas/[id]/+page.svelte`
- `src/routes/relatorios/+page.svelte`
- `src/routes/gestao/produtos/+page.svelte`
- `src/routes/assinatura/+page.svelte`
- `src/routes/perfil/+page.svelte`
- `src/routes/app/+page.svelte`
- `src/lib/components/modals/ModalPagamento.svelte`
- `admin-dashboard/src/routes/subscriptions/+page.svelte`

Regra prática: antes de editar qualquer um deles, leia o doc correspondente em `[[CLAUDE]]`, `[[BILLING]]`, `[[CURRENT]]` e, quando aplicável, `[[CODE_REVIEW]]`.

Superficies que pedem leitura complementar antes de mexer:

- `docs/data/SCHEMA_RLS.md` para tudo que toca owner/subusuario, RLS, `supabaseAdmin` ou `empresa_perfil`
- `docs/modules/ACESSOS.md` para convites, papeis, permissao e offline com operador
- `docs/modules/MESAS.md` para comandas, recebimento e conversao em venda

## Funções críticas e risco de quebra

| Função / módulo | Local | Por que é sensível |
| --- | --- | --- |
| `ensureActiveSubscription` | [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:81) | Gate primário de acesso. Qualquer mudança errada bloqueia operador ou libera uso sem assinatura. |
| `isSubscriptionActiveStrict` | [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:52) | Define expiração real, inclusive extensões manuais. |
| `buildVendaPayload` | [src/lib/finance/saleOps.js](/home/vinicius/code/zelopdv/src/lib/finance/saleOps.js:113) | Contrato entre UI, replay offline e RPC do banco. |
| `syncVendasPendentes` | [src/lib/offlineDb.js](/home/vinicius/code/zelopdv/src/lib/offlineDb.js:191) | Reenvia vendas offline; bug aqui duplica venda ou perde estoque/fiado. |
| `POST /api/billing/create-subscription` | [src/routes/api/billing/create-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-subscription/+server.js:20) | Cria checkout, preserva acesso atual e avança referral. |
| `POST /api/billing/webhook` | [src/routes/api/billing/webhook/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/webhook/+server.js:150) | Fonte final do estado Stripe. |
| `syncPixPaymentWithRemote` | [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:178) | Ativa assinatura a partir de pagamento Pix confirmado. |
| `getServerAccessContext` / `inviteSubUser` | [src/lib/server/accessControl.js](/home/vinicius/code/zelopdv/src/lib/server/accessControl.js:106) / [src/lib/server/accessControl.js](/home/vinicius/code/zelopdv/src/lib/server/accessControl.js:190) | Titular/subusuário e trilha de permissões. |

## Testes e sinais de saúde

- `npm test` — suíte Vitest do app principal
- `npm run check` — `svelte-check`
- `npm run build` — build do app principal
- `cd admin-dashboard && npm run check`
- `cd admin-dashboard && npm run build`
- `npm run test:e2e` — Playwright

Estado validado mais recente está em [[CURRENT]].

## Billing

- Catálogo canônico de planos e add-ons: [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:7).
- O plano e os add-ons usados por Stripe devem sair de `pricing.js`; não replique price IDs em múltiplos lugares.
- Ver detalhes operacionais em [[BILLING]].

## Deploy e operação

- `zelopdv` e `zelopdv-admin` usam Vercel Node `24.x`; os dois `svelte.config.js` declaram `@sveltejs/adapter-vercel` com runtime `nodejs24.x`.
- URLs públicas inferidas do código: `https://zelopdv.com.br`, `https://admin.zelopdv.com.br`, `https://chat.zelopdv.com.br`.
- `hooks.server.js` aplica rate limit em `/api/*` e CORS específico para `/api/admin/*` em [src/hooks.server.js](/home/vinicius/code/zelopdv/src/hooks.server.js:1).
- O admin dashboard conversa direto com Supabase via anon key; ver risco em [[CODE_REVIEW]].

## Convenções de documentação

- Toda a documentação vive em `docs/` (operacional + profunda) e é espelhada no vault `pdvObsidian/` via symlinks. Não criar `.md` operacionais novos na raiz.
- A raiz guarda apenas os pontos de entrada: `README.md`, `CLAUDE.md` e `AGENTS.md`.
- Quando um arquivo em `docs/` não for mais fonte viva, marque isso explicitamente no topo e aponte para a doc canônica atual.
- Após mudanças relevantes:
  - atualizar [[CURRENT]] se o estado mudou
  - atualizar [[FIXES_PROGRESS]] se um risco andou
  - atualizar [[INCIDENTS]] se houve falha real
  - atualizar [[ZeloPDV.memory]] só com fatos estáveis

## Convenções relevantes

- Antes de qualquer mudança de UI (tela, componente, cabeçalho, botão, navegação), consultar [[DESIGN_PATTERNS]] e reutilizar o padrão existente em vez de inventar.
- Não hardcode hex em componentes; usar variáveis de tema.
- JSON-LD em Svelte deve usar `{@html}`.
- Para mudanças profundas: atualizar [[CURRENT]], [[FIXES_PROGRESS]], [[ZeloPDV.memory]] e, se aplicável, [[INCIDENTS]].
- Testes principais:
  - `npm test`
  - `npm run test:e2e`
  - `npm run check`

## Não confirmado / pendente de validação

- O deploy e o domínio do `admin-dashboard/` são inferidos por CORS e strings, não por config versionada no repo.
- O banco real tem `public.delete_account(...)`, mas não há `pg_cron` local chamando a função para contas agendadas; a execução final continua dependendo de um processo externo.
- Baseline e ledger versionados são a referência de bootstrap; mudanças posteriores exigem leitura do stream forward e comparação com o banco vinculado. `.ai/migrations/` é acervo histórico.
- AbacatePay exige `ABACATEPAY_PUBLIC_KEY` no runtime; o fallback hardcoded antigo não existe. Não restaurá-lo a partir de documentos históricos.
- O modelo de permissao do add-on Acessos mistura RLS owner-scoped e gating de UI; nao assumir RBAC forte sem validar rota por rota.
