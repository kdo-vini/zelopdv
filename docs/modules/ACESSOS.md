# Acessos

> Fonte viva do add-on Controle de Acessos.
> Tracker historico por sprint: `docs/projects/PROJETO_ACESSOS.md`.

## O que o modulo faz hoje

- Convite de subusuarios por email
- Cargos com matriz de permissoes em JSON
- Ate 5 subusuarios por padrao
- Contexto owner/subusuario para operar em nome da empresa dona
- Audit log de acoes relevantes
- Suporte a offline de venda com `ownerUserId` e `operatorUserId`

## Fontes de codigo

- Cliente: `src/lib/accessControl.js`
- Servidor: `src/lib/server/accessControl.js`
- Ativacao de convite: `src/routes/api/access/activate/+server.js`
- Guardas: `src/lib/guards.js`
- RLS base owner-scoped: `.ai/migrations/rls_subuser_access.sql`
- Enforcement incremental de Despesas: `supabase/migrations/20260812193009_expenses_role_rbac.sql`
- Enforcement incremental de catálogo: `supabase/migrations/20260812195032_products_role_rbac.sql`
- Enforcement incremental de cancelamento de vendas:
  `supabase/migrations/20260812210856_sales_cancel_rbac.sql`
- Correção de ACL do helper de cancelamento:
  `supabase/migrations/20260812211428_sales_cancel_helper_grant_fix.sql`
- Ajuste de estoque por permissão própria: `supabase/migrations/20260812200550_catalog_stock_adjustment_rpc.sql`

## Modelo real

- O owner continua sendo a ancora da empresa.
- O subusuario tem conta propria no Supabase Auth.
- O subusuario nao tem assinatura propria.
- Billing e extensoes continuam exclusivas do owner.
- O subusuario herda o acesso final do owner via `subscriptions`.

## Como o contexto e resolvido

### No cliente

- `getAccessContext()` consulta `access_users` e `access_roles(permissions)`.
- O resultado e cacheado em memoria e `sessionStorage`.
- `hasPermission()` le o JSON de permissoes no browser.

### No servidor

- `getServerAccessContext(userId)` resolve `isSubUser`, `ownerUserId`, `roleId` e `permissions`.
- `resolveOwnerUserId(userId)` devolve o owner efetivo.
- Convites e seeds de cargo padrao usam `supabaseAdmin`.

## O que e forte e o que nao e

### Forte hoje

- tenant scoping por empresa dona via `get_owner_user_id(auth.uid())`
- `access_users` separa CRUD do titular de self-SELECT do subusuario; o
  vinculo nao pode ser promovido, removido ou relinkado pelo Data API do
  proprio subusuario
- bloqueio de billing owner-facing para subusuario
- trilha de contexto owner/operator no fluxo de venda e audit log

### Nao forte hoje

- permissao fina por papel nao e enforced uniformemente no servidor
- varias telas dependem de esconder rota/acao no cliente
- `AdminLock` agora valida o PIN no servidor, mas continua sendo complementar ao permissionamento por cargo

## Fluxos operacionais

### Convidar subusuario

1. owner autentica
2. `inviteSubUser()` valida limite, unicidade e se o email ja e owner
3. cria ou reativa linha `access_users`
4. envia email de convite

### Ativar convite

1. usuario define senha / autentica
2. endpoint de ativacao vincula `auth_user_id`
3. status vira `active`

### Usar o produto como subusuario

1. guarda resolve o owner efetivo
2. RLS entrega dados da empresa dona; em Despesas, as policies exigem a permissão do cargo, e no
   catálogo base as mutações exigem `produtos.gerenciar`
3. UI decide o que mostrar com base no JSON de permissoes
4. em acoes auditadas, `operator_user_id` e registrado

Pessoas mantém o mesmo owner scope para leituras operacionais, mas writes
diretos de subusuários exigem `pessoas.gerenciar` no RLS. Isso cobre a tela de
cadastro sem bloquear a seleção de clientes no PDV, Mesas e Fichário.

## Offline

- Dexie v4 guarda `ownerUserId` e `operatorUserId`
- `syncVendasPendentes()` injeta `operador_id` no replay quando necessario
- cobertura offline continua focada em venda do PDV, nao em gestao ampla

## Superficies sensiveis

- `src/routes/gestao/despesas/+page.svelte`
- `src/routes/relatorios/+page.svelte`
- `src/routes/app/+page.svelte`
- `src/lib/components/AdminLock.svelte`

Motivo:

- parte do modelo atual mistura owner-scoping, PIN e gating de UI

## Invariantes

- subusuario ativo opera sempre em nome do owner
- subusuario nao compra plano, nao abre portal Stripe e nao gerencia extensoes
- `subscriptions` do owner continua sendo a referencia final de acesso
- cargos padrao seeded: `Caixa`, `Atendente`, `Gerente`

## Limites e riscos confirmados

- RBAC de enforcement nao e uniforme rota por rota
- enforcement de papel continua incompleto fora das superficies ja migradas
- paginas sensiveis ainda podem depender de lock/client gating para UX, sem substituir RLS/API
- qualquer mudanca em `guards.js`, RLS ou `accessControl` pode quebrar acesso em cascata

## Quando atualizar esta doc

- nova permissao
- nova superficie acessivel por subusuario
- mudanca em RLS owner-scoped
- mudanca no fluxo de convite/ativacao
- mudanca no comportamento offline com operador
