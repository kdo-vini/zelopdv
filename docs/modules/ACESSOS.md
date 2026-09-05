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

- Enforcement incremental das extensoes ZeloMenu: `supabase/migrations/20260813020000_catalog_extensions_rbac.sql`
- Enforcement incremental de desconto POS: `supabase/migrations/20260813030000_discount_rbac.sql`
- Enforcement incremental de leitura do ledger de fiado:
  `supabase/migrations/20260813034000_fiado_ledger_select_rbac.sql`
- Integridade tenant-scoped do log de auditoria:
  `supabase/migrations/20260813041000_access_audit_logs_tenant_guard.sql`
- Enforcement incremental de leitura de Mesas:
  `supabase/migrations/20260813050000_mesas_select_rbac.sql`
- Containment do PIN administrativo no perfil:
  `supabase/migrations/20260813060000_empresa_perfil_pin_select_containment.sql`
- Enforcement de leitura das taxas de plataforma:
  `supabase/migrations/20260813070000_vendas_taxas_select_rbac.sql`
- Enforcement de leitura de pagamentos/movimentações:
  `supabase/migrations/20260813080000_sales_payment_cash_read_rbac.sql`
- Enforcement de leitura do histórico de vendas:
  `supabase/migrations/20260813090000_sales_history_read_rbac.sql`
- Otimização forward-only da mesma autorização:
  `supabase/migrations/20260813091000_sales_history_read_rbac_performance.sql`

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
- Enforcement incremental de caixa:
  `supabase/migrations/20260812214518_caixa_role_rbac.sql`
- Enforcement incremental de pagamentos parciais de Mesas:
  `supabase/migrations/20260812230000_mesas_payment_rbac.sql`
- Ajuste de estoque por permissão própria: `supabase/migrations/20260812200550_catalog_stock_adjustment_rpc.sql`

## Modelo real

- O owner continua sendo a ancora da empresa.
- O subusuario tem conta propria no Supabase Auth.
- A operação como subusuário usa a assinatura do owner. Há contas históricas
  que também têm assinatura própria; a remoção de um vínculo não pode apagar
  essa titularidade independente.
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
- `/api/chat/assistant` usa `getServerAccessContext` e exige
  `relatorios.ver === true` de subusuários antes de carregar contexto financeiro
  com service-role; owner mantém bypass. O rail visual continua global e o
  endpoint devolve 403 para papéis sem a capability.
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
   catálogo base as mutações exigem `produtos.gerenciar`; as leituras privadas
   de Mesas exigem `mesas.acessar` (o resumo de comandas do relatório aceita
   `relatorios.ver`)
3. UI decide o que mostrar com base no JSON de permissoes
4. em acoes auditadas, `operator_user_id` e registrado

Pessoas mantém o mesmo owner scope para leituras operacionais, mas writes
diretos de subusuários exigem `pessoas.gerenciar` no RLS. Isso cobre a tela de
cadastro sem bloquear a seleção de clientes no PDV, Mesas e Fichário.

### Registrar venda e repetir uma intenção

`criar_venda_completa` resolve `id_usuario` pelo titular e grava o ator autenticado
da RPC em `vendas.id_operador`. Valores de identidade no payload não substituem
essa verificação. `pdv.vender` e `pdv.receber` são conferidos antes do replay;
lock por titular/client_sale_id permite que operadores reutilizem uma intenção
sem repetir venda, estoque ou fiado. Operador inativo conhecido não vira titular
pelo fallback do helper; quem tem assinatura própria preserva sua própria loja.
Migration aplicada: `20260905003227_sale_owner_operator_context.sql`.

### Remover um acesso

`DELETE /api/access/users/[id]` verifica o owner do vínculo e consulta a existência
de qualquer assinatura própria do operador, com limite de uma linha, antes de
excluir algo. Falha nessa consulta preserva vínculo e conta Auth. Histórico
cancelado/expirado também impede excluir a conta do titular independente.
Depois da verificação, remove o vínculo; somente um subusuário sem assinatura
própria é elegível para a cascata Auth existente. Convite ainda sem Auth remove
apenas o vínculo. O audit registra o resultado da cascata; não é uma transação
única entre PostgREST e Auth. Vínculos já apagados não são reconstruídos para
correlacionar vendas históricas.

## Offline

- Dexie v5 guarda `ownerUserId` e `operatorUserId`
- A fila preserva o operador capturado localmente; a RPC autoriza e registra
  o ator autenticado que efetivamente faz o replay, sem confiar nessa identidade
  declarada pelo payload.
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

O caminho de criação de vendas foi endurecido em
`20260813000000_sales_creation_rbac.sql`: POS/offline exige
`pdv.vender` + `pdv.receber`, enquanto o fechamento direto de Mesa exige
`mesas.fechar`. Leituras de vendas e o fluxo de ownership da RPC continuam
separados para uma revisão própria.

O histórico de fechamentos de caixa foi endurecido em
`20260813010000_reports_select_rbac.sql`: SELECT de `caixa_fechamentos` exige
`relatorios.ver` para subusuários. Tabelas compartilhadas por PDV, Mesas e
operação de caixa permanecem fora desta fatia para preservar seus consumidores.

O Zelinho Gerente segue a mesma capability: a migration
`20260813043000_gerente_reports_rbac.sql` exige `relatorios.ver` no SELECT e no
update de `read_at` de `business_signals` e no SELECT de
`business_daily_snapshots`. O item de navegação também é ocultado para
subusuários sem essa permissão; owner e service-role mantêm o bypass existente.

## Quando atualizar esta doc

- nova permissao
- nova superficie acessivel por subusuario
- mudanca em RLS owner-scoped
- mudanca no fluxo de convite/ativacao
- mudanca no comportamento offline com operador
