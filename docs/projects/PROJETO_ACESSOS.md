# PROJETO_ACESSOS — Add-on Controle de Acessos (Sprint Tracker)

> **Princípio**: este arquivo é **handoff stateful**. Qualquer agente (Codex, Claude, outra IA, outra conta) deve poder continuar do zero só lendo este arquivo. Atualizar a cada commit/tarefa.

---

## 1. Contexto geral

**Objetivo**: criar a extensão paga **Controle de Acessos**, permitindo que o dono/admin da empresa crie subusuários por e-mail, organize esses usuários em cargos e defina permissões por checkboxes.

**Pricing definitivo**:
- Plano base ZeloPDV: **R$ 59/mês**
- Add-on Controle de Acessos: **+R$ 30/mês**
- Total ZeloPDV + Controle de Acessos: **R$ 89/mês**
- Limite padrão MVP: **até 5 subusuários**
- Empresas maiores: opção personalizada futura, fora do MVP

**Stack**: SvelteKit 5 + Supabase Auth/Postgres/RLS + Stripe.

**Modelo de empresa escolhido**:
- A empresa continua ancorada no **`user_id` do dono**.
- Subusuários têm conta própria no Supabase Auth, mas **não têm empresa própria, perfil próprio ou assinatura própria**.
- Subusuário sempre opera em nome do `owner_user_id`.

**Decisão central**: não usar o modelo antigo de `/gestao/empresas` como base do MVP. A implementação deve ser compatível com o padrão atual do app, onde tabelas operacionais usam `id_usuario = dono.user_id`.

---

## 2. Status atual do projeto

- **Sprint atual**: 5 — QA, segurança e beta
- **Última tarefa concluída**: Sprint 5 — revisão de billing/Stripe e revisão de dados financeiros concluídas com correções server-side e testes novos — 2026-05-13
- **Próxima tarefa**: Sprint 5 — beta controlado com cliente real
- **Bloqueios ativos**:
  - Nenhum bloqueio técnico local para Playwright/Vitest/build.
  - Pendências restantes são de cobertura da Sprint 5, não de infraestrutura.

---

## 3. Escopo MVP — checklist

### Sprint 0 — Plano e auditoria
- [✅] Brainstorm do modelo do add-on
- [✅] Definição do preço: +R$ 30/mês
- [✅] Definição do limite padrão: até 5 subusuários
- [✅] Definição da âncora de empresa: `owner_user_id = user_id do dono`
- [✅] Definição de cargos padrão: Caixa, Atendente, Gerente
- [✅] Definição de página: `/gestao/acessos`
- [✅] Definição de módulos condicionais: Mesas e Pedidos/Cozinha só aparecem se add-on respectivo estiver ativo
- [✅] Criação do `PROJETO_ACESSOS.md`

### Sprint 1 — Billing, schema e contexto
- [✅] Criar Stripe Price recorrente para `zelo_addon_acessos_monthly_v1` → `price_1TWMi0LUJWyE4PkYQl4rBlQs`
- [✅] Adicionar `acessos` em `src/lib/pricing.js`
- [✅] Adicionar `subscriptions.has_acessos_addon BOOLEAN DEFAULT false`
- [✅] Atualizar `create-subscription` para aceitar `addons.acessos`
- [✅] Atualizar `toggle-addon` para ligar/desligar `acessos`
- [✅] Atualizar `change-plan` para preservar/remover add-ons de forma consistente
- [✅] Atualizar webhook Stripe para sincronizar `has_acessos_addon`
- [✅] Criar `.ai/migrations/access_control_module.sql`
- [✅] Criar helper central de contexto de acesso (`src/lib/accessControl.js` + `src/lib/server/accessControl.js`)
- [✅] Atualizar guards para aceitar subusuário quando dono tem assinatura ativa + add-on ativo
- [☐] `npm run test`
- [✅] `npm run build`

### Sprint 2 — UI de cargos e subusuários
- [✅] Criar rota `/gestao/acessos`
- [✅] Adicionar item "Acessos" no sidebar somente para dono com add-on ativo
- [✅] Criar UI de cargos com matriz de checkboxes
- [✅] Criar cargos padrão ao ativar ou ao primeiro acesso: Caixa, Atendente, Gerente (seeded no primeiro convite via `ensureDefaultRoles`)
- [✅] Criar listagem de subusuários
- [✅] Criar fluxo de convite por e-mail
- [✅] Bloquear criação se e-mail já existir no Zelo
- [✅] Aplicar limite de 5 subusuários ativos/pendentes
- [✅] Esconder permissões Mesas se `has_mesas_addon = false`
- [✅] Esconder permissões Pedidos/Cozinha se `has_pedidos_addon = false`
- [✅] Preservar permissões salvas de módulos inativos
- [☐] `npm run test`
- [✅] `npm run build`

### Sprint 3 — Enforcement no app inteiro
- [✅] Aplicar contexto `ownerUserId` em `/app` (PDV, caixa, empresa_perfil)
- [✅] Aplicar permissões no PDV: vender, receber, desconto, cancelamento (canVender, canReceber, canDesconto, canCancelar)
- [✅] Aplicar permissões em caixa: abrir, movimentar (canAbrirCaixa, canMovimentarCaixa)
- [✅] Aplicar contexto `ownerUserId` em produtos/estoque, despesas, pedidos
- [✅] Bloquear Assinatura e Extensões para qualquer subusuário (redirect /gestao)
- [✅] Adaptar sidebar: esconder Extensões e trial banner para subusuários; detectar `isSubUserMode`
- [✅] RLS migration aplicada em produção: 26 tabelas atualizadas com `get_owner_user_id(auth.uid())`
- [✅] `criar_venda_completa` RPC atualizada: vendas de subusuários vão para empresa do dono
- [✅] Subscriptions SELECT policy para subusuários (sidebar addons)
- [☐] `npm run test`
- [✅] `npm run build`

### Sprint 4 — Auditoria, operador e offline
- [✅] Adicionar `id_operador` em vendas
- [✅] Adicionar `id_operador` em caixa/movimentações/fechamentos
- [✅] Adicionar `id_operador` em despesas
- [✅] Adicionar `id_operador` em pedidos
- [✅] Adicionar `id_operador` em comandas/ações de mesa
- [✅] Registrar audit log para login de subusuário
- [✅] Registrar audit log para venda/cancelamento
- [✅] Registrar audit log para abertura/fechamento/movimentação de caixa
- [✅] Registrar audit log para despesa
- [✅] Registrar audit log para fiado
- [✅] Registrar audit log para ajuste de estoque
- [✅] Registrar audit log para alterações de cargos, usuários e permissões
- [✅] Adaptar fila offline para salvar `ownerUserId` e `id_operador`
- [✅] Adaptar replay offline para sincronizar venda no contexto da empresa dona
- [✅] `npm run test`
- [✅] `npm run build`

### Sprint 5 — QA, segurança e beta
- [✅] Testes unitários de pricing do add-on `acessos`
- [✅] Testes unitários de guard dono vs subusuário
- [✅] Testes unitários de bloqueio quando assinatura/add-on do dono está inativo
- [✅] Testes unitários de cargos padrão
- [✅] Testes unitários de limite de 5 subusuários
- [✅] Testes unitários de rejeição de e-mail já cadastrado
- [✅] E2E: dono ativa add-on e cria subusuário por convite
- [✅] E2E: Caixa vende e fecha caixa, mas não acessa relatórios/acessos
- [✅] E2E: Atendente lança pedido/mesa sem receber
- [✅] E2E: Gerente acessa gestão operacional, mas não assinatura/acessos
- [✅] E2E: módulos Mesas/Pedidos somem da matriz quando inativos
- [✅] E2E: desligar add-on bloqueia subusuários e mantém dono acessando
- [✅] Revisão obrigatória de RLS
- [✅] Revisão obrigatória de billing/Stripe
- [✅] Revisão obrigatória de dados financeiros
- [☐] Beta controlado com cliente real

---

## 4. Escopo V2/V3 (fora do MVP, registrado pra evitar scope creep)

- Mais de 5 subusuários com cobrança personalizada
- Multiempresa real para um mesmo login participar de várias empresas
- Permissão para gerente administrar acessos
- Justificativa obrigatória em ações críticas
- Aprovação em duas etapas para cancelamento/exclusão de venda
- Relatório avançado por operador
- Jornada completa de RH/turnos/comissões
- Configuração granular de PIN por cargo/ação
- Convites com expiração customizada e reenvio automático

---

## 5. Modelo de permissões MVP

### Permissões base

| Grupo | Permissões |
|---|---|
| PDV | acessar, vender, receber, aplicar desconto, cancelar venda |
| Caixa | abrir caixa, fechar caixa, movimentar caixa, ver caixa atual |
| Produtos/estoque | visualizar produtos, gerenciar produtos, visualizar estoque, ajustar estoque |
| Pessoas/fiado | visualizar pessoas, gerenciar pessoas, visualizar fiado, receber fiado |
| Financeiro | visualizar despesas, gerenciar despesas, ver relatórios, exportar relatórios |
| Perfil | editar dados operacionais da empresa |

### Permissões Mesas

Só aparecem na UI se `subscriptions.has_mesas_addon = true`.

| Grupo | Permissões |
|---|---|
| Mesas | acessar mesas, cadastrar mesas, abrir comanda, editar itens, fechar/receber mesa, cancelar/liberar mesa |

### Permissões Pedidos + Cozinha

Só aparecem na UI se `subscriptions.has_pedidos_addon = true`.

| Grupo | Permissões |
|---|---|
| Pedidos/Cozinha | acessar pedidos, criar/editar pedidos, painel de cozinha, receber pedido no caixa, cancelar pedido |

### Sempre exclusivo do dono

- Assinatura
- Ativar/desativar extensões
- Configuração de acessos
- PIN/segurança

---

## 6. Cargos padrão MVP

### Caixa

Pode:
- Acessar PDV
- Vender
- Receber pagamento
- Abrir caixa
- Fechar caixa
- Movimentar caixa
- Ver caixa atual

Não pode:
- Ver relatórios amplos
- Gerenciar produtos
- Gerenciar despesas
- Gerenciar acessos
- Alterar assinatura/extensões/PIN

### Atendente

Pode:
- Lançar pedidos
- Usar mesas/comandas se Mesas estiver ativo
- Enviar itens para cozinha se Pedidos/Cozinha estiver ativo

Não pode:
- Receber pagamento
- Fechar caixa
- Ver financeiro
- Gerenciar produtos/despesas/acessos

### Gerente

Pode:
- Gerenciar operação
- Gerenciar produtos
- Gerenciar estoque
- Gerenciar pessoas/fiado
- Gerenciar despesas
- Ver relatórios
- Editar dados operacionais do Perfil

Não pode:
- Acessar Assinatura
- Ativar/desativar Extensões
- Criar/editar cargos e usuários
- Alterar PIN/segurança

---

## 7. Schema SQL planejado

Arquivo planejado: `.ai/migrations/access_control_module.sql`

| Tabela/coluna | Propósito | Status |
|---|---|---|
| `subscriptions.has_acessos_addon` | Flag de cobrança/acesso ao add-on | planejado |
| `access_roles` | Cargos por empresa dona | planejado |
| `access_users` | Subusuários vinculados ao dono | planejado |
| `access_settings` | Configurações do módulo por dono | planejado |
| `access_audit_logs` | Log de ações sensíveis | planejado |
| `vendas.id_operador` | Quem executou a venda | planejado |
| `caixas.id_operador` ou equivalente | Quem abriu/fechou caixa | planejado |
| `caixa_movimentacoes.id_operador` | Quem fez sangria/suprimento | planejado |
| `expenses.id_operador` | Quem lançou/alterou despesa | planejado |
| `pedidos.id_operador` | Quem criou/alterou pedido | planejado |
| `comandas.id_operador` | Quem abriu/fechou/alterou comanda | planejado |

### Campos mínimos planejados

`access_roles`:
- `id uuid primary key`
- `owner_user_id uuid not null references auth.users(id)`
- `name text not null`
- `permissions jsonb not null default '{}'::jsonb`
- `is_system boolean not null default false`
- `created_at timestamptz`
- `updated_at timestamptz`

`access_users`:
- `id uuid primary key`
- `owner_user_id uuid not null references auth.users(id)`
- `auth_user_id uuid references auth.users(id)`
- `email text not null`
- `role_id uuid references access_roles(id)`
- `status text check ('pending','active','blocked','removed')`
- `created_at timestamptz`
- `updated_at timestamptz`

`access_settings`:
- `owner_user_id uuid primary key references auth.users(id)`
- `pin_enabled boolean not null default true`
- `max_subusers integer not null default 5`
- `created_at timestamptz`
- `updated_at timestamptz`

`access_audit_logs`:
- `id uuid primary key`
- `owner_user_id uuid not null references auth.users(id)`
- `operator_user_id uuid references auth.users(id)`
- `action text not null`
- `entity_type text`
- `entity_id text`
- `details jsonb not null default '{}'::jsonb`
- `created_at timestamptz`

---

## 8. Mapa de arquivos planejado

| Arquivo | Propósito | Status |
|---|---|---|
| `PROJETO_ACESSOS.md` | Este doc de auditoria/handoff | criado |
| `.ai/migrations/access_control_module.sql` | Schema do add-on | planejado |
| `src/lib/pricing.js` | Catálogo de planos/add-ons | planejado |
| `src/lib/guards.js` | Guards de assinatura/add-ons/subusuário | planejado |
| `src/lib/accessControl.js` | Helper cliente de contexto e permissões | planejado |
| `src/lib/server/accessControl.js` | Helper server/admin de convite e contexto | planejado |
| `src/routes/gestao/acessos/+page.svelte` | UI de cargos, usuários e checkboxes | planejado |
| `src/routes/api/access/users/+server.js` | Criar/listar subusuários | planejado |
| `src/routes/api/access/users/[id]/+server.js` | Editar/bloquear/remover subusuário | planejado |
| `src/routes/api/access/roles/+server.js` | Criar/editar cargos e permissões | planejado |
| `src/routes/api/billing/create-subscription/+server.js` | Aceitar add-on acessos | planejado |
| `src/routes/api/billing/toggle-addon/+server.js` | Toggle add-on acessos | planejado |
| `src/routes/api/billing/webhook/+server.js` | Sync Stripe → DB | planejado |
| `src/routes/assinatura/+page.svelte` | UI de compra/ativação do add-on | planejado |
| `src/routes/perfil/+page.svelte` | Toggle `pin_enabled` e restrições por dono | planejado |
| `src/lib/components/GestaoSidebar.svelte` | Menu filtrado por permissão | planejado |
| `src/lib/offlineDb.js` | Offline com `ownerUserId` e `id_operador` | planejado |

---

## 9. Decisões técnicas (log)

### 2026-05-12 — Add-on pago, não feature nativa
- **Decisão**: Controle de Acessos será add-on de **+R$ 30/mês**.
- **Rationale**: recurso grande, sensível e com valor claro para empresas com equipe.

### 2026-05-12 — Limite padrão de 5 subusuários
- **Decisão**: o MVP permite até **5 subusuários** por empresa.
- **Rationale**: combina com o público do Zelo: pequenas empresas. Planos maiores ficam para negociação futura.

### 2026-05-12 — Empresa ancorada no `user_id` do dono
- **Decisão**: usar `owner_user_id = user_id do dono` como tenant.
- **Alternativa considerada**: migrar para `empresa_perfil.id` ou `empresas.id`.
- **Rationale**: o app atual usa `id_usuario` em quase todas as tabelas operacionais. Trocar a âncora agora aumentaria muito o risco e o escopo.

### 2026-05-12 — Subusuário é conta Auth própria, mas sem assinatura/perfil
- **Decisão**: subusuário entra com Supabase Auth, mas não cria `empresa_perfil` nem `subscriptions`.
- **Rationale**: login próprio permite rastrear operador e bloquear individualmente, sem virar multiempresa no MVP.

### 2026-05-12 — E-mail já cadastrado é bloqueado
- **Decisão**: ao criar subusuário, se o e-mail já existir no Zelo, mostrar alerta e impedir.
- **Rationale**: evita misturar conta dona/cliente com subconta operacional.

### 2026-05-12 — Página em `/gestao/acessos`
- **Decisão**: configurar acessos em nova rota de gestão.
- **Rationale**: é função administrativa recorrente e precisa ficar fácil de achar, mas exclusiva do dono.

### 2026-05-12 — Mesas/Pedidos condicionais na matriz
- **Decisão**: permissões de Mesas e Pedidos/Cozinha só aparecem se os add-ons estiverem ativos.
- **Rationale**: reduz confusão. Permissões salvas são preservadas para reativação futura.

### 2026-05-12 — Audit log automático, sem justificativa obrigatória
- **Decisão**: registrar ações sensíveis automaticamente no MVP, sem pedir motivo.
- **Rationale**: preserva velocidade no balcão e ainda permite auditoria básica.

### 2026-05-12 — PIN vira configuração
- **Decisão**: adicionar toggle de PIN nas configurações do módulo/perfil.
- **Rationale**: empresas com controle por usuário podem preferir desligar o PIN; quem gosta da trava rápida pode manter.

---

## 10. Gotchas / riscos conhecidos

1. **RLS é o maior risco do projeto**  
   Se policies só usarem `auth.uid() = id_usuario`, subusuário não verá dados da empresa. Toda policy relevante precisa aceitar subusuário ativo via `owner_user_id`.

2. **`ensureActiveSubscription` hoje consulta assinatura do usuário logado**  
   Para subusuário, isso deve mudar: verificar assinatura do dono, não do subusuário.

3. **`empresa_perfil` é do dono**  
   Subusuário não deve ser redirecionado para completar Perfil nem criar perfil próprio.

4. **Offline precisa carregar contexto correto**  
   Venda offline feita por subusuário deve persistir `ownerUserId` e `id_operador`, senão sincroniza na empresa errada ou perde rastreio.

5. **Billing deve ser sincronizado em todos os pontos**  
   `pricing.js`, checkout, toggle, change-plan, webhook, assinatura e admin-dashboard precisam entender `has_acessos_addon`.

6. **Convite por e-mail com Supabase Admin precisa de cuidado**  
   Não criar usuário se e-mail já existir. Não vazar dados de outras contas. Evitar subusuário órfão sem `access_users`.

7. **Dono nunca pode perder acesso**  
   Nenhuma role/permissão deve bloquear o dono da própria conta.

8. **Gerente não administra acessos no MVP**  
   Mesmo com cargo "Gerente", `/gestao/acessos` é exclusivo do dono.

9. **Módulo desativado bloqueia subusuários**  
   Ao desligar `has_acessos_addon`, preservar cargos e vínculos, mas impedir login/acesso de subusuários.

10. **A rota antiga `/gestao/empresas` existe**  
    Não usar como base sem revisão completa. Ela parece isolada do restante do app.

---

## 11. Changelog detalhado

### [2026-05-12] Sprint 0 — Documento de auditoria

**Files**:
- `PROJETO_ACESSOS.md` (novo)

**Feito**:
- Registrado escopo MVP.
- Registradas decisões do brainstorm.
- Criado checklist por sprint.
- Registrados riscos/gotchas antes de começar implementação.

**Verification**:
- Documento criado manualmente.
- Nenhum código executável alterado nesta etapa.

**Commit**: pendente

---

### [2026-05-12] Sprint 1 — Billing, schema e contexto

**Files**:
- `src/lib/pricing.js` (atualizado: add-on `acessos` + `allowsAcessos` em pdv/bundle)
- `src/routes/api/billing/toggle-addon/+server.js` (atualizado: suporte a `acessos`)
- `src/routes/api/billing/create-subscription/+server.js` (atualizado: suporte a `acessos`)
- `src/routes/api/billing/change-plan/+server.js` (atualizado: remove `acessos` quando incompatível)
- `src/routes/api/billing/webhook/+server.js` (atualizado: sync `has_acessos_addon`)
- `.ai/migrations/access_control_module.sql` (novo: schema completo do módulo)
- `src/lib/guards.js` (atualizado: `hasAcessosAddon` + subusuário em `ensureActiveSubscription`)
- `src/lib/accessControl.js` (novo: helper cliente — `getAccessContext`, `hasPermission`, `isSubUser`)
- `src/lib/server/accessControl.js` (novo: helper server — `resolveOwnerUserId`, `getServerAccessContext`, `ensureDefaultRoles`, `inviteSubUser`)

**Stripe**:
- Produto criado: `prod_UVNSzeu0k2EFVz` (Controle de Acessos - Addon)
- Price criado: `price_1TWMi0LUJWyE4PkYQl4rBlQs` (R$ 30/mês, recorrente, BRL)

**Supabase**:
- Migração `access_control_module` aplicada em produção (us-east-2)
- Tabelas criadas: `access_roles`, `access_users`, `access_settings`, `access_audit_logs`
- Coluna adicionada: `subscriptions.has_acessos_addon`
- Função criada: `get_owner_user_id(uuid)`

**Verification**:
- `npm run build` passou sem erros. ✓

**Commit**: pendente

---

### [2026-05-12] Sprint 2 — UI de cargos e subusuários

**Files**:
- `src/lib/components/GestaoSidebar.svelte` (atualizado: item "Acessos" com `requiresAddon: 'acessos'`, `acessosAddonActive` flag)
- `src/routes/api/access/roles/+server.js` (novo: GET + POST de cargos)
- `src/routes/api/access/roles/[id]/+server.js` (novo: PATCH + DELETE de cargo)
- `src/routes/api/access/users/+server.js` (novo: GET + POST de subusuários)
- `src/routes/api/access/users/[id]/+server.js` (novo: PATCH + DELETE de subusuário)
- `src/routes/gestao/acessos/+page.svelte` (novo: UI completa — aba Cargos + aba Usuários)
- `src/routes/gestao/extensoes/+page.svelte` (atualizado: card de Controle de Acessos)

**Feito**:
- Sidebar exibe "Acessos" apenas para dono com add-on ativo (sub-usuários sem subscription própria = invisível naturalmente)
- API routes protegidas com Bearer token + validação de `has_acessos_addon`
- Matriz de permissões com 8 grupos (2 condicionais: Mesas/Pedidos)
- Debounce de 800ms para salvar permissões
- Cargos padrão (Caixa, Atendente, Gerente) criados no primeiro convite via `ensureDefaultRoles`
- Fluxo completo de convite por e-mail via `inviteSubUser`
- Limite de 5 subusuários verificado no servidor
- Bloqueio de e-mail já cadastrado como titular

**Verification**:
- `npm run build` passou sem erros. ✓

**Commit**: pendente

---

### [2026-05-12] Sprint 4 — Parcial 1 (operador, auditoria e offline contextualizado)

**Files**:
- `src/lib/offlineDb.js` (atualizado: Dexie v4 + `ownerUserId`/`operatorUserId` na fila offline)
- `src/routes/app/+page.svelte` (atualizado: sync offline contextualizado + persistência de operador na venda offline)
- `src/routes/app/pedidos/+page.svelte` (atualizado: `id_operador` no fechamento + audit log em cancelamento/fechamento)
- `src/routes/app/pedidos/novo/+page.svelte` (atualizado: `id_operador` no insert + audit log de criação)
- `src/routes/app/pedidos/[id]/editar/+page.svelte` (atualizado: `id_operador` no update + audit log de edição)
- `src/routes/app/pedidos/cozinha/+page.svelte` (atualizado: contexto do dono + `id_operador` ao marcar pronto + audit log)
- `src/routes/gestao/despesas/+page.svelte` (atualizado: `id_operador` no insert + audit log de CRUD)
- `src/routes/gestao/fichario/+page.svelte` (atualizado: contexto do dono + `id_operador` em movimentação de caixa + audit log)
- `src/routes/gestao/estoque/+page.svelte` (atualizado: contexto do dono + audit log de ajuste)
- `PROJETO_ACESSOS.md` (atualizado: checklist/status/handoff)

**Feito**:
- Fila offline de vendas agora persiste contexto do dono e do operador.
- Replay offline agora ignora registros de outra empresa/contexto e reaproveita `operador_id` no payload da RPC.
- Fluxos de pedidos de balcão e cozinha passaram a gravar `id_operador` em `pedidos`.
- Despesas passaram a gravar `id_operador` no insert e registrar auditoria em criação/edição/remoção.
- Fichário passou a operar no contexto `ownerUserId` e registrar auditoria de pagamento de fiado.
- Ajustes manuais de estoque agora registram auditoria quando executados por subusuário.

**Ainda pendente nesta sprint**:
- Cobrir `mesas`/`comandas` com `ownerUserId`, `id_operador` e audit log.
- Registrar login de subusuário em `access_audit_logs`.
- Revisar auditoria de alterações de cargos/usuários/permissões.
- Rodar `npm run test`.

**Verification**:
- `npm run build` passou em 2026-05-12. ✓
- Build ainda emite warnings antigos de acessibilidade/unused exports fora do escopo desta task.

**Commit**: pendente

---

### [2026-05-12] Sprint 4 — Fechamento (mesas/comandas, login e APIs auditadas)

**Files**:
- `src/routes/app/mesas/+page.svelte` (atualizado: contexto do dono + `id_operador` ao abrir comanda)
- `src/routes/app/mesas/[id]/+page.svelte` (atualizado: contexto do dono + `id_operador`/audit log em mesa/comanda/pagamentos/transferência)
- `src/routes/login/+page.svelte` (atualizado: dispara auditoria de login após `signInWithPassword`)
- `src/routes/auth/callback/+page.svelte` (atualizado: dispara auditoria de login no retorno OAuth)
- `src/routes/api/access/audit-login/+server.js` (novo: endpoint server-side para registrar login de subusuário)
- `src/lib/server/accessControl.js` (atualizado: `logServerAuditAction` + `logSubUserLogin`)
- `src/routes/api/access/users/+server.js` (atualizado: auditoria de convite)
- `src/routes/api/access/users/[id]/+server.js` (atualizado: auditoria de update/remove)
- `src/routes/api/access/roles/+server.js` (atualizado: auditoria de criação)
- `src/routes/api/access/roles/[id]/+server.js` (atualizado: auditoria de update/delete)

**Feito**:
- Mesas e comandas agora usam `ownerUserId` como tenant efetivo.
- Comandas abertas/fechadas/transferidas e ações principais de mesa agora atualizam `id_operador`.
- Login de subusuário passou a registrar `auth.login` com deduplicação server-side.
- Cargos e subusuários agora escrevem audit log nas rotas server-side, sem depender do cliente.
- Sprint 4 ficou totalmente verde no checklist.

**Verification**:
- `npm run build` passou em 2026-05-12. ✓
- `npm run test` passou em 2026-05-12 (`82` testes). ✓

**Commit**: pendente

---

### [2026-05-12] Sprint 5 — Server-side coverage (`accessControl`)

**Files**:
- `tests/pricing.acessos.test.js` (novo: pricing do add-on `acessos`)
- `tests/guards.ensureActiveSubscription.test.js` (atualizado: dono vs subusuário + bloqueios por assinatura/add-on do dono)
- `tests/server.accessControl.test.js` (novo: cargos padrão, limite de subusuários, e-mail já cadastrado e fluxo feliz de convite)
- `PROJETO_ACESSOS.md` (atualizado: checklist/status/handoff)

**Feito**:
- Cobertos os cenários de compatibilidade e precificação do add-on `acessos`.
- Cobertos os cenários de guard para dono, subusuário e bloqueio quando a assinatura ou o add-on do dono está inativo.
- Coberto `ensureDefaultRoles` para provisionar Caixa, Atendente e Gerente.
- Coberto `inviteSubUser` para:
  - barrar o limite padrão de 5 subusuários
  - rejeitar e-mail já convidado/cadastrado na mesma empresa
  - rejeitar e-mail de titular já existente no ZeloPDV
  - confirmar o fluxo feliz de criação do convite pendente + disparo do invite auth

**Verification**:
- `npx vitest run tests/server.accessControl.test.js` passou. ✓
- `npm run test` passou com **14 arquivos / 87 testes** verdes. ✓
- Playwright não foi rodado nesta máquina porque faltam `E2E_TEST_EMAIL` e `E2E_TEST_PASSWORD`.

**Commit**: pendente

---

### [2026-05-12] Sprint 5 — E2E base destravada

**Files**:
- `e2e/auth.setup.js` (atualizado: seletor estável de senha por `#login-password`)
- `e2e/auth.spec.js` (atualizado: seletores estáveis de login/cadastro por `id`)
- `e2e/access-control.spec.js` (novo: cobertura inicial da rota `/gestao/acessos` no estado ativo ou de upsell)
- `PROJETO_ACESSOS.md` (atualizado: status/handoff)

**Feito**:
- Corrigido o `auth.setup` do Playwright para não conflitar com o botão "Mostrar senha".
- Corrigidos os testes de auth que também dependiam de seletores ambíguos.
- Validado o login E2E com a conta de teste funcional.
- Adicionado E2E de `/gestao/acessos` que:
  - confirma carregamento da rota
  - valida o estado de upsell quando o add-on está inativo
  - ou, se o add-on estiver ativo no ambiente, valida a presença das abas principais e do fluxo inicial de usuários

**Ambiente E2E validado**:
- Conta E2E autenticada localmente com sucesso nesta máquina.
- Observação: manter `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` apenas como env local; não persistir credenciais em arquivo versionado.

**Verification**:
- `E2E_TEST_EMAIL='<local>' E2E_TEST_PASSWORD='<local>' npx playwright test e2e/auth.setup.js --project=setup` passou. ✓
- `E2E_TEST_EMAIL='<local>' E2E_TEST_PASSWORD='<local>' npx playwright test e2e/access-control.spec.js --project=chromium` passou com **3 testes** verdes (incluindo setup). ✓

**Commit**: pendente

---

### [2026-05-12] Sprint 5 — Admin dashboard + conta E2E ativa

**Files**:
- `admin-dashboard/src/lib/pricing.js` (atualizado: suporte ao add-on `acessos`)
- `admin-dashboard/src/routes/subscriptions/+page.svelte` (atualizado: modal/tabela/admin sync com `acessos`)
- `src/routes/api/admin/billing/sync-plan/+server.js` (atualizado: aceita/sincroniza `acessos`)
- `PROJETO_ACESSOS.md` (atualizado: status/handoff)

**Feito**:
- Adicionado `Controle de Acessos` no catálogo de addons do `admin-dashboard`.
- Modal de edição de assinatura do admin agora mostra, calcula e persiste o add-on `acessos`.
- Endpoint `/api/admin/billing/sync-plan` passou a aceitar `addons.acessos` e sincronizar `has_acessos_addon`.
- Add-on `acessos` ativado via Supabase MCP na conta E2E de validação.
- UI do módulo confirmada no estado ativo: item “Acessos” no sidebar, rota `/gestao/acessos` acessível e abas de gestão visíveis.

**Verification**:
- Supabase MCP: assinatura da conta E2E atualizada com `has_acessos_addon = true`. ✓
- `npm run build` no app principal passou. ✓
- `npx playwright test e2e/access-control.spec.js --project=chromium` passou após ativação do add-on. ✓
- `npm run build` em `admin-dashboard/` passou após instalar deps locais. ✓
- `npm run check` em `admin-dashboard/` ainda falha por configuração pré-existente do subprojeto (`jsconfig.json` ausente no script atual), não por regressão do módulo `acessos`.

**Commit**: pendente

---

### [2026-05-12] Sprint 5 — E2E ativos de permissões + correção de RLS

**Files**:
- `src/lib/accessControl.js` (atualizado: resolve permissões por join em `access_users`)
- `src/routes/+layout.svelte` (atualizado: subusuário herda contexto do titular para assinatura/perfil/pin)
- `src/routes/gestao/acessos/+page.svelte` (atualizado: bloqueio owner-only)
- `src/routes/relatorios/+page.svelte` (atualizado: bloqueio por `relatorios.ver` + contexto do titular)
- `src/routes/app/pedidos/+page.svelte` (atualizado: gate `pedidos.acessar`)
- `src/routes/app/pedidos/novo/+page.svelte` (atualizado: gate `pedidos.criar`)
- `src/routes/app/pedidos/[id]/editar/+page.svelte` (atualizado: gate `pedidos.criar`)
- `src/routes/app/pedidos/cozinha/+page.svelte` (atualizado: gate `pedidos.cozinha`)
- `src/routes/app/mesas/+page.svelte` (atualizado: gate `mesas.acessar` + esconder config para subusuário)
- `src/routes/app/mesas/[id]/+page.svelte` (atualizado: gate `mesas.acessar`)
- `src/lib/components/GestaoSidebar.svelte` (atualizado: sidebar orientada por permissões reais do subusuário)
- `e2e/auth.setup.js` (atualizado: seed + storage states de dono, caixa e atendente)
- `e2e/helpers/access-control-fixtures.js` (novo: seed idempotente com service role para E2E)
- `e2e/access-control.subusers.spec.js` (novo: convite + Caixa + Atendente)
- `.ai/migrations/access_roles_subuser_select.sql` (novo)
- `PROJETO_ACESSOS.md` (atualizado: status/handoff)

**Feito**:
- Corrigido o bug real em que subusuário conseguia ler `access_users`, mas não o `access_role` associado por causa de RLS; isso zerava permissões no browser.
- Aplicada policy `access_roles_subuser_select` no Supabase para liberar `SELECT` do cargo atribuído ao próprio subusuário.
- Ajustado o layout global para subusuário validar assinatura/perfil/pin a partir do titular, sem cair indevidamente em `/perfil?msg=complete`.
- Fechados os guards client-side das rotas sensíveis de pedidos, cozinha, mesas, relatórios e gestão de acessos.
- Setup E2E agora semeia e sincroniza automaticamente:
  - add-ons `acessos`, `pedidos` e `mesas` no titular E2E
  - cargos padrão
  - subusuários `Caixa` e `Atendente`
  - storage states dedicados para cada papel
- E2E novos cobrindo:
  - convite do titular em `/gestao/acessos`
  - `Caixa` bloqueado de relatórios/acessos/extensões/assinatura
  - `Atendente` com acesso a pedidos/cozinha/mesas e bloqueio de relatórios/acessos

**Verification**:
- Supabase MCP: policy `access_roles_subuser_select` aplicada com sucesso. ✓
- `npm run build` passou. ✓
- `npm run test` passou com **14 arquivos / 87 testes** verdes. ✓
- `E2E_TEST_EMAIL='<local>' E2E_TEST_PASSWORD='<local>' npx playwright test e2e/access-control.subusers.spec.js --project=chromium` passou com **4 testes** verdes (incluindo setup). ✓
- `E2E_TEST_EMAIL='<local>' E2E_TEST_PASSWORD='<local>' npx playwright test e2e/access-control.spec.js e2e/access-control.subusers.spec.js --project=chromium` passou com **6 testes** verdes (incluindo setup). ✓

**Commit**: pendente

---

### [2026-05-13] Sprint 5 — E2E final de acessos + hardening de subscriptions

**Files**:
- `e2e/helpers/access-control-fixtures.js` (atualizado: seed do cargo `Gerente` + helper de toggle de add-ons)
- `e2e/auth.setup.js` (atualizado: storage state do `Gerente`)
- `e2e/access-control.subusers.spec.js` (atualizado: `Gerente`, módulos inativos e desligamento do add-on; suíte serializada)
- `.ai/migrations/harden_subscriptions_select_acl.sql` (novo)
- `PROJETO_ACESSOS.md` (atualizado: status/handoff)

**Feito**:
- Fechados os E2E restantes da Sprint 5 para o add-on `acessos`:
  - `Gerente` acessa gestão operacional e é bloqueado de assinatura/extensões/acessos
  - matriz de permissões esconde grupos de `Mesas` e `Pedidos / Cozinha` quando os add-ons estão desligados
  - desligar `acessos` mantém o titular entrando no app, mas bloqueia subusuário
- Consolidada a suíte stateful de acessos em um único arquivo serial para evitar flake por concorrência de toggle de add-ons.
- Revisão de RLS feita com Supabase Advisor + checagem manual no catálogo.
- Hardening aplicado:
  - `REVOKE EXECUTE` de `public.get_owner_user_id(uuid)` para `PUBLIC/anon`
  - `GRANT EXECUTE` explícito apenas para `authenticated` e `service_role`
  - policies `subscriptions_self_select` e `subscriptions_subuser_read` alteradas de `public` para `authenticated`

**Verification**:
- `E2E_TEST_EMAIL='<local>' E2E_TEST_PASSWORD='<local>' npx playwright test e2e/access-control.remaining.spec.js --project=chromium` passou antes da consolidação. ✓
- `E2E_TEST_EMAIL='<local>' E2E_TEST_PASSWORD='<local>' npx playwright test e2e/access-control.spec.js e2e/access-control.subusers.spec.js --project=chromium` passou com **10 testes** verdes (incluindo setup). ✓
- `npm run test` passou com **14 arquivos / 87 testes** verdes. ✓
- Supabase catalog:
  - `get_owner_user_id` agora sem ACL pública (`postgres`, `authenticated`, `service_role` apenas). ✓
  - `subscriptions_self_select` e `subscriptions_subuser_read` agora restritas a `authenticated`. ✓

**Notas da revisão de RLS**:
- O módulo `acessos` ficou coerente em RLS/ACL após este hardening.
- O Supabase Security Advisor ainda aponta warnings antigos e mais amplos fora do escopo direto deste add-on, incluindo:
  - tabelas auxiliares com RLS habilitado sem policies (`email_onboarding_logs`, `webhook_events_processed`, etc.)
  - funções `SECURITY DEFINER` públicas/assinadas no schema `public`
  - buckets públicos com listagem aberta
  - proteção contra senhas vazadas desativada no Auth
- Esses pontos devem entrar num backlog de segurança mais amplo, mas não bloquearam a finalização funcional do add-on `acessos`.

**Commit**: pendente

---

### [2026-05-13] Sprint 5 — Convite de subusuário com e-mail formatado

**Files**:
- `src/lib/server/accessControl.js` (atualizado: `generateLink(invite)` + envio via Resend + cleanup de pending/auth user em falha)
- `src/lib/server/emailTemplates.js` (atualizado: template `emailAccessControlInvite`)
- `tests/server.accessControl.test.js` (atualizado: cobertura do convite branded + cleanup em falha)
- `PROJETO_ACESSOS.md` (atualizado: status/handoff)

**Feito**:
- Removida a dependência do e-mail padrão do Supabase para convites de subusuário.
- Convite agora usa link seguro gerado por `supabaseAdmin.auth.admin.generateLink({ type: 'invite' })`.
- E-mail enviado pelo fluxo transacional existente (`Resend`) com:
  - layout HTML do Zelo
  - nome da empresa que convidou
  - nome do cargo, quando disponível
  - CTA para aceitar o convite e criar senha
  - link direto visível como fallback
- Redirect do aceite apontado para `/redefinir-senha`, alinhando o onboarding do subusuário com a tela já existente de definição de senha.
- Em caso de falha após gerar o link, o sistema limpa:
  - a linha `pending` em `access_users`
  - o usuário de Auth criado pelo convite

**Verification**:
- `npm run test -- tests/server.accessControl.test.js` passou com **6 testes** verdes. ✓
- `npm run test` passou com **14 arquivos / 88 testes** verdes. ✓
- `E2E_TEST_EMAIL='<local>' E2E_TEST_PASSWORD='<local>' npx playwright test e2e/access-control.subusers.spec.js --project=chromium --grep 'titular consegue enviar convite pela gestão de acessos'` passou com **2 testes** verdes (setup + cenário de convite). ✓
- O cenário real de convite respondeu `201` em `/api/access/users`, confirmando geração do link e aceitação do disparo do e-mail no fluxo normal. ✓
- `npm run build` passou; warnings antigos de acessibilidade e exports não usados continuam fora do escopo desta rodada. ✓

**Notas**:
- O ambiente local já estava com `Resend` configurado, então esta validação não ficou só em mock.
- Continuam pendentes na Sprint 5 apenas os blocos de revisão obrigatória de billing/Stripe e dados financeiros, além do beta controlado.

**Commit**: pendente

---

### [2026-05-13] Sprint 5 — Revisão de billing/Stripe + dados financeiros

**Files**:
- `src/routes/api/billing/create-subscription/+server.js` (atualizado: preserva trial/assinatura ativa até confirmação do Checkout)
- `src/lib/finance/saleOps.js` (atualizado: bloqueia fiado sem cliente no helper central)
- `tests/api.create-subscription.test.js` (novo)
- `tests/finance.saleOps.test.js` (atualizado)
- `PROJETO_ACESSOS.md` (atualizado: status/handoff)

**Feito**:
- Revisado o fluxo principal de billing (`create-subscription`, `change-plan`, `toggle-addon`, `webhook`, `cancel-subscription`) com foco em riscos de estado inconsistente.
- Corrigido um bug importante em `create-subscription`:
  - antes, um usuário em `trialing` podia ser regravado como `incomplete` no momento em que abria o Stripe Checkout
  - isso podia derrubar o acesso antes do pagamento ou até após um checkout cancelado
  - agora a subscription existente em `trialing` ou `active` preserva status/plano/add-ons até o webhook confirmar a mudança
- Revisado o helper financeiro central `buildVendaPayload`.
- Corrigido um risco de integridade financeira:
  - vendas em `fiado` sem cliente associado agora falham imediatamente
  - pagamentos múltiplos com linha `fiado` sem `pessoaId` também falham
  - isso evita venda órfã, saldo de fiado inconsistente e divergência entre `vendas.id_cliente` e `pessoas.saldo_fiado`

**Verification**:
- `npm run test -- tests/api.create-subscription.test.js tests/finance.saleOps.test.js` passou com **24 testes** verdes. ✓
- `npm run test` passou com **15 arquivos / 92 testes** verdes. ✓
- `npm run build` passou; permanecem apenas warnings antigos de acessibilidade/export não usado e um warning conhecido do PWA sobre glob de `prerendered`. ✓

**Notas da revisão**:
- Billing:
  - o ponto mais crítico encontrado era a transição prematura para `incomplete` antes da confirmação do Stripe; ficou corrigido e coberto por teste
  - `change-plan`, `toggle-addon` e `webhook` permaneceram coerentes para o escopo atual após essa correção
- Financeiro:
  - o helper central agora protege melhor os fluxos do PDV e de pedidos, já que ambos passam por `buildVendaPayload`
  - essa validação reduz o risco de erro silencioso em caixa/fiado, inclusive em refactors futuros

**Commit**: pendente

---

### [2026-05-12] Sprint 5 — Início (pricing + guards)

**Files**:
- `tests/pricing.acessos.test.js` (novo)
- `tests/guards.ensureActiveSubscription.test.js` (reescrito para o fluxo atual de dono/subusuário)

**Feito**:
- Cobertura do pricing do add-on `acessos` (`isAddonAllowed`, `calculateValue`, `sanitizeAddons`, `buildStripeLineItems`, `parseStripeSubscriptionItems`).
- Cobertura de guard para dono ativo, subusuário ativo e bloqueio quando add-on/assinatura do dono está inativo.

**Verification**:
- `npx vitest run tests/pricing.acessos.test.js tests/guards.ensureActiveSubscription.test.js` passou. ✓
- `npm run test` passou em seguida com a suíte completa. ✓

**Commit**: pendente
