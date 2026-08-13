# ZeloPDV — Code Review

> Baseline criado em 2026-06-01 a partir de inspeção do repo + `npm test` + `npm run check`.
> Estado das correções: [[FIXES_PROGRESS]]

## Findings

### Update 2026-08-13 - enforcement do Zelinho Gerente por relatorios

O finding foi confirmado em produção: as policies owner-scoped de
`business_signals` e `business_daily_snapshots` permitiam que um subusuário
sem `relatorios.ver` lesse a inteligência financeira e atualizasse
`business_signals.read_at`. Os consumidores browser são as telas/loja do
Zelinho; engine, cron e admin usam service-role. A migration
`20260813043000_gerente_reports_rbac.sql` adiciona a capability existente às
três policies e o item de navegação passa a respeitar o mesmo contexto. Owner,
subusuário autorizado, super-admin fora do tenant, anon e service-role foram
verificados sem persistência; o blast radius e o rollback estão no snapshot
`docs/operations/GERENTE-REPORTS-RBAC-SNAPSHOT-2026-08-13.md`.

### Update 2026-08-13 - integridade tenant-scoped de `access_audit_logs`

O finding foi confirmado em producao: um subusuario conseguia inserir um
evento com `operator_user_id = auth.uid()` mas escolher `owner_user_id` de
outra empresa, forjando historico cross-tenant. O unico consumidor browser e
`logAuditAction` em `src/lib/accessControl.js`, que ja passa o owner resolvido;
os writes server-side usam service-role. A migration
`20260813041000_access_audit_logs_tenant_guard.sql` exige simultaneamente o
operador autenticado e `get_owner_user_id(auth.uid())`, preservando o write
legitimo no proprio tenant, service-role, leituras e grants. Snapshot e matriz:
`docs/operations/ACCESS-AUDIT-LOGS-TENANT-GUARD-SNAPSHOT-2026-08-13.md`.

### Update 2026-08-13 - enforcement da leitura do ledger de fiado

O finding foi confirmado em produção: a policy
`fiado_lancamentos_select_owner` usava somente escopo por owner, então
Caixa/Atendente sem `fiado.visualizar` liam o extrato completo pela Data API.
`src/routes/gestao/fichario/+page.svelte` é o único consumidor browser direto;
triggers, RPCs de recebimento/estorno e purge usam caminhos confiáveis. A
migration `20260813034000_fiado_ledger_select_rbac.sql` adiciona
`fiado_actor_can('fiado.visualizar', id_usuario)` à policy existente, mantendo
owner, Gerente, service-role, recebimento e `pessoas.saldo_fiado` operacional.
O blast radius, matriz e rollback estão em
`docs/operations/FIADO-LEDGER-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

### Update 2026-08-13 - containment de RPCs SECURITY DEFINER

O finding foi confirmado no schema de producao: `saldo_caixa(bigint)` tinha
EXECUTE para anon/autenticados e calculava saldo de qualquer `caixa` sem
ownership; `get_user_id_by_email(text)` retornava UUID de `auth.users` por
email. Nenhum consumidor foi encontrado no repositorio, e o app calcula o
saldo localmente. A migration `20260813033000_rpc_security_definer_containment.sql`
remove EXECUTE client-side dos dois e preserva somente `service_role`, sem
alterar definicoes. `add_empresa_membro_por_email(integer,text,text)` continua
com EXECUTE autenticado porque `src/routes/gestao/empresas/+page.svelte` o usa;
somente anon/public foram removidos. Blast radius, matriz e rollback estao em
`docs/operations/RPC-SECURITY-DEFINER-CONTAINMENT-SNAPSHOT-2026-08-13.md`.

### Update 2026-08-13 - billing_payments server-only

O finding foi confirmado em producao: a policy
`billing_payments_self_insert` mais o grant de tabela permitiam que um
autenticado criasse uma cobranca arbitraria para o proprio `user_id` via Data
API. Nenhum consumidor browser foi encontrado; criacao/reconciliacao Pix,
webhook, status e settlement usam `supabaseAdmin`/service-role. A migration
`20260813032000_billing_payments_server_insert_only.sql` revoga somente INSERT
para `anon`/`authenticated`, preserva SELECT do titular e o caminho service-role,
e deixa a remocao da policy stale para o trabalho separado de reconciliation.
Blast radius e rollback estao em
`docs/operations/BILLING-PAYMENTS-INSERT-SNAPSHOT-2026-08-12.md`.

### Update 2026-08-12 - enforcement de desconto no POS

O finding foi confirmado em producao: `pdv.desconto` era aplicado somente no
browser. Um subusuario com `pdv.vender` e `pdv.receber`, sem a capacidade de
desconto, conseguiu inserir uma venda positiva via Data API. A migration
`20260813030000_discount_rbac.sql` adiciona trigger estreito para desconto
positivo em INSERT/UPDATE, preserva desconto zero, fechamento direto de Mesa,
owner e service-role, sem tocar no contrato de billing/offline.

### Update 2026-08-12 - enforcement de escritas das extensoes de catalogo

O finding foi confirmado em producao: as policies owner-scoped das tabelas de
grupos/opcoes de modificadores, vinculos opcao-produto e publicacoes do
ZeloMenu nao consultavam `produtos.gerenciar`. A migration
`20260813020000_catalog_extensions_rbac.sql` exige a capability nas escritas,
mantem os checks de ownership dos pais e deixa SELECT, grants, service-role,
cache do PDV e consumidores de produto inalterados. O snapshot documenta o
blast radius e a matriz owner/subusuario/super-admin/anon/service-role.

### Update 2026-08-12 - enforcement de leitura do histórico de fechamentos

O finding foi confirmado em produção: `/relatorios` bloqueava o subusuário sem
`relatorios.ver` apenas no cliente, enquanto `caixa_fechamentos` tinha SELECT
owner-scoped para `public`. A migration
`20260813010000_reports_select_rbac.sql` exige `relatorios.ver` no RLS,
revoga o grant anônimo sem consumidor e preserva owner, relatório autorizado,
INSERT e service-role. Tabelas compartilhadas como `vendas` e `caixas` ficaram
fora por terem consumidores operacionais legítimos; o snapshot documenta esse
blast radius.

### Update 2026-08-12 - enforcement de criação de vendas

O finding foi confirmado em produção: subusuário sem `pdv.vender`/`pdv.receber`
conseguia chamar `criar_venda_completa(jsonb)` e inserir uma venda direta por
owner scope. A migration `20260813000000_sales_creation_rbac.sql` adiciona um
guard BEFORE INSERT que separa o checkout POS/offline do fechamento direto de
Mesa (`mesas.fechar`), revoga EXECUTE anônimo da RPC e preserva service-role,
leituras, cancelamento e o contrato de payload. Consumidores, snapshot e
rollback estão documentados em `docs/operations/SALES-CREATION-RBAC-SNAPSHOT-2026-08-12.md`.

### Update 2026-08-12 - enforcement operacional de Mesas

A migration `20260812233000_mesas_operational_rbac.sql` foi desenhada após
reprodução transacional do bypass owner-scoped. Policies de INSERT/UPDATE/
DELETE e dois guards de trigger agora consultam as chaves `mesas.*`
existentes. A migration complementar `20260812234500_mesas_operational_rpc_rbac.sql`
resolve o owner efetivo nas RPCs de estoque já consumidas pelo browser e exige
as capabilities correspondentes. O snapshot documenta consumidores e
service-role.

### Update 2026-08-12 - enforcement de pagamentos parciais de Mesas

O finding foi confirmado em produção: `comanda_pagamentos` e
`comanda_pagamento_itens` aceitavam writes owner-scoped por subusuários sem
`mesas.acessar`/capacidade de recebimento. A migration
`20260812230000_mesas_payment_rbac.sql` exige `mesas.acessar` e
`pdv.receber` ou `pedidos.receber` para mutações do ledger, preservando
leituras, fechamento completo, grants e service-role. Consumidores e blast
radius estão em `docs/operations/MESAS-PAYMENT-RBAC-SNAPSHOT-2026-08-12.md`.

### Update 2026-08-12 - enforcement de mutações de caixa

O finding foi confirmado em produção: `caixas_actor_update/delete` aceitavam
mutação owner-scoped por subusuários, e `caixa_movs_actor_insert` não consultava
`caixa.movimentar`. A migration `20260812214518_caixa_role_rbac.sql` exige as
capacidades existentes para abrir, fechar, movimentar e registrar o histórico;
delete continua owner-only. Leituras e service-role permanecem inalterados.
Consumidores e blast radius estão em
`docs/operations/CAIXA-RBAC-SNAPSHOT-2026-08-12.md`.

### Update 2026-08-12 - enforcement de cancelamento de vendas

O finding foi confirmado em produção: `vendas`, `vendas_itens`,
`vendas_pagamentos` e `vendas_taxas_plataforma` permitiam mutações
owner-scoped por subusuários, apesar de a matriz já possuir `pdv.cancelar`.
As migrations `20260812210856_sales_cancel_rbac.sql` e
`20260812211428_sales_cancel_helper_grant_fix.sql` exigem essa capacidade para
alterações pós-criação e hard delete. O rollback interno de Mesas continua
funcionando apenas para venda vazia, recente e criada pelo operador atual;
criação/recebimento e SELECT ficaram fora desta fatia para preservar o contrato
operacional.

### Update 2026-08-12 - contencao de escrita em `access_users`

O finding foi confirmado em producao: `access_users_owner_or_self` era uma
policy `ALL` para `authenticated`, entao um subusuario podia atingir a propria
linha por chamadas diretas ao Data API. As migrations
`20260812204706_access_users_self_write_containment.sql` e
`20260812205010_access_users_owner_guard.sql` separam CRUD do titular de
self-SELECT do subusuario e exigem que o usuario resolva para si mesmo como
owner antes de qualquer escrita. Convites, ativacao, atualizacao, remocao e
admin continuam em `supabaseAdmin`; as leituras client-side permanecem
compativeis.

### Update 2026-08-12 — enforcement incremental em Pessoas

`20260812202400_pessoas_role_rbac.sql` fechou o bypass de writes diretos em
`pessoas`: INSERT/UPDATE/DELETE de subusuários agora exigem
`pessoas.gerenciar`. SELECT continua owner-scoped para preservar PDV, Mesas,
Fichário e Relatórios. O P1 permanece aberto somente para as superfícies ainda
não migradas.

### P1 — Permissões de subusuário são majoritariamente enforcement de UI, não RBAC forte no servidor

- Evidência: [src/lib/accessControl.js](/home/vinicius/code/zelopdv/src/lib/accessControl.js:122), [.ai/migrations/rls_subuser_access.sql](/home/vinicius/code/zelopdv/.ai/migrations/rls_subuser_access.sql:11), [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:72), [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:215)
- Impacto: o contexto owner/subusuário existe e o RLS escopa por empresa dona, mas o JSON de permissões é lido no browser. Em superfícies como `despesas`, o carregamento da página acontece sem um gate explícito de permissão por rota. Isso é mais próximo de navegação/UI gating do que de RBAC de enforcement.
- Ação recomendada: documentar isso como limitação atual, priorizar checks server-side para mutações e definir quais superfícies precisam de enforcement real além do escopo por owner.
- Update 2026-06-01: a camada de *dados* de `expenses` foi endurecida — `expenses_owner_scoped_write_policies_2026_06_01` adicionou policies owner-scoped de `INSERT`/`UPDATE`/`DELETE`/`SELECT` em produção, então um subusuário não consegue mais escrever fora da empresa dona via RLS. O ponto P1 permanece aberto porque isso é escopo por *owner*, não RBAC por *papel*: a granularidade por cargo (quem pode lançar despesa vs. só ver) segue gated na UI. Tratado como dívida aceita em [[TRADEOFFS]].
- Update 2026-08-12: Despesas saiu desse estado específico: `20260812193009_expenses_role_rbac.sql` exige
  `despesas.visualizar` para leitura e `despesas.gerenciar` para mutações, preservando owners e Gerente.
  O catálogo base (`produtos`, `categorias`, `subcategorias`) também foi
  endurecido por `20260812195032_products_role_rbac.sql`: leituras continuam
  owner-scoped para o PDV, mas writes de subusuários exigem `produtos.gerenciar`.
  O ajuste de estoque, que tem permissão própria, foi preservado por RPCs
  limitadas às colunas de estoque em `20260812200550_catalog_stock_adjustment_rpc.sql`.
  O P1 permanece aberto para as demais superfícies ainda client-side.

### P1 (resolvido 2026-08-12) — `AdminLock` não protegia segredo no servidor

- Evidência: [src/lib/components/AdminLock.svelte](/home/vinicius/code/zelopdv/src/lib/components/AdminLock.svelte:37), [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:223), [.ai/migrations/rls_subuser_access.sql](/home/vinicius/code/zelopdv/.ai/migrations/rls_subuser_access.sql:107)
- Impacto: páginas sensíveis leem `pin_admin` de `empresa_perfil` no browser e o componente compara `inputPin === correctPin` localmente. Como subusuários podem ler o perfil do titular via RLS para fins operacionais, o PIN vira um dado observável no cliente, não uma barreira forte.
- Resolução: `/api/auth/admin-pin` autentica o bearer, resolve o titular server-side, retorna apenas
  `{configured, canSet}` no GET e compara o PIN no servidor com comparação constante. O POST de alteração
  é restrito ao titular; despesas, relatórios, layout, perfil e o fluxo de reset deixaram de ler ou escrever
  `pin_admin` diretamente pelo browser. Há rate limit específico para tentativas de verificação.

### P1 — Deleção definitiva de conta depende de um sweeper fora deste repositório

- Evidência: [.ai/migrations/account_deletion_grace_2026_05_31.sql](/home/vinicius/code/zelopdv/.ai/migrations/account_deletion_grace_2026_05_31.sql:5), [src/routes/api/account/delete/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/delete/+server.js:1). A fonte do ZeloChat contém `server/accountDeletionSweeper.ts`, ligado no startup por `startAccountDeletionSweepLoop()`, mas o deploy/monitoramento desse processo externo ainda não foi confirmado nesta rodada.
- Impacto: o app agenda grace period e cancela Stripe no fim do ciclo, mas o purge real não é garantido só com este repo. Se o sweeper externo não existir ou parar, contas ficam presas em estado intermediário, com risco de descumprimento operacional/LGPD.
- Ação recomendada: confirmar o processo implantado e seu monitoramento com operação; não duplicar o sweeper no ZeloPDV sem evidência de necessidade.

### P1 — `admin-dashboard/` assume tabelas sem RLS e usa anon key direto no browser

- Evidência: [admin-dashboard/src/lib/supabaseClient.js](/home/vinicius/code/zelopdv/admin-dashboard/src/lib/supabaseClient.js:1)
- Impacto: o painel ainda fala direto com o Data API via anon key, mas a verificação remota confirmou RLS ativo nas tabelas administrativas relevantes (`admin_activity_logs`, `empresa_perfil`, `subscriptions`) e policies owner/super-admin. Continua sendo uma superfície de defesa em profundidade, não um P0 confirmado.
- Ação recomendada: revisar a lista de tabelas acessadas pelo admin, preferir handlers server-side para mutações críticas e registrar explicitamente quais tabelas estão com RLS desligado por design.

### P0 (resolvido 2026-07-06) — Tabelas em `public` sem RLS e com grants completos para `anon`/`authenticated`

- Evidência: `supabase db advisors` no projeto real em 2026-07-06 + consulta a `information_schema.role_table_grants`. Tabelas com RLS desligado e SELECT/INSERT/UPDATE/DELETE/TRUNCATE liberados para `anon` e `authenticated`: `billing_webhook_events`, `leads`, `lead_events`, `outreach_messages`, `approvals`, `agent_runs`, `suppression_list`.
- Impacto: qualquer portador da anon key (embutida no bundle do client) podia ler/alterar/apagar essas tabelas via Data API. `leads`/`outreach_messages` contêm dados pessoais de prospecção; `billing_webhook_events` é auditoria de billing.
- Status parcial: `billing_webhook_events` corrigida em 2026-07-06 (RLS ligado + grants revogados de anon/authenticated; único consumidor é o webhook AbacatePay via service role, verificado). Migration: `.ai/migrations/billing_webhook_events_enable_rls_2026_07_06.sql`.
- Resolvido: as outras 6 tabelas eram de um bot antigo de captação de leads (confirmado pelo dono, sem consumidor ativo). RLS ligado + grants revogados em 2026-07-06 via `.ai/migrations/leadbot_tables_enable_rls_2026_07_06.sql`; dados preservados (`leads`=72, `lead_events`=1865, `outreach_messages`=4, demais vazias). Follow-up recomendado: dropar/anonimizar essas tabelas — contêm dados pessoais de prospecção sem uso (minimização LGPD).
- Advisor ainda acumula itens fora desta rodada: policies com `auth.uid()` sem initplan, funções SECURITY DEFINER não confirmadas como administrativas e buckets públicos com listagem. As views sensíveis e RPCs administrativas confirmadas foram tratadas na contenção P0 de 2026-08-12; findings novos exigem consumidor/blast-radius próprio antes de qualquer mudança.

### P2 (resolvido 2026-08-12) — Reativação de conta podia limpar o agendamento antes do Stripe

- Evidência: [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:28), [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:47)
- Impacto: se `cancel_at_period_end=false` falhar no Stripe, o endpoint apenas loga warning e limpa `deletion_scheduled_at` no banco local. O usuário pode parecer reativado enquanto a assinatura segue cancelando no fim do ciclo.
- Resolução: o endpoint agora falha fechada em erros Stripe não transitórios e só limpa o agendamento depois do sucesso (ou de recurso já ausente). Teste direcionado cobre o erro e confirma que não há update local.

### P2 (resolvido 2026-08-12) — Vários fluxos assumiam implicitamente "uma assinatura efetiva por usuário"

- Evidência: [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:166), [src/routes/api/billing/create-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-subscription/+server.js:80), [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:69)
- Impacto: o padrão `order(updated_at desc).limit(1)` aparece em guardas, checkout, portal e Pix. Não há constraint única por `user_id` no schema, então entitlement, cancelamento e reconciliação seguem dependentes de convenção implícita, ainda que a produção atual não tenha usuários com múltiplas rows em `subscriptions`.
- Resolução: snapshot de produção confirmou zero duplicatas vivas; migration forward-only adicionou o índice parcial `subscriptions_one_live_row_per_user`, mantendo histórico terminal append-only. O contrato de leitura “última linha efetiva vence” permanece compatível.

### P2 (resolvido anteriormente) — Webhook Pix aceita fallback para chave pública hardcoded

- Evidência: [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:5), [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:121)
- Impacto: se `ABACATEPAY_PUBLIC_KEY` faltar no ambiente, a verificação continua com uma chave embutida no código. Isso cria ambiguidade operacional e dificulta garantir que a trust boundary do webhook está configurada como esperado.
- Resolução: a implementação atual já falha fechada quando `ABACATEPAY_PUBLIC_KEY` não existe; o fallback citado no baseline não está presente no runtime. A documentação foi corrigida para não reabrir o finding sem evidência nova.

### P2 — Ainda não há snapshot único completo do schema de produção

- Evidência: `supabase/migrations/` agora contém apenas o histórico reconciliado/novo de algumas fases,
  enquanto migrations históricas continuam em `.ai/migrations/` e o dump completo ainda não foi reconstruído.
- Impacto: para incidentes, onboarding de IA e mudanças de RLS, a verdade do banco continua parcialmente
  espalhada entre código, docs e SQLs soltos.
- Ação recomendada: manter [[CLAUDE]] e [[ZeloPDV.memory]] atualizados e considerar um snapshot/referência consolidada do schema quando o projeto estabilizar.

### P2 — `svelte-check` passa sem erros, mas há 133 warnings concentrados em superfícies grandes

- Evidência: `npm run check` executado em 2026-06-01 retornou `0 errors / 133 warnings`, concentrados em arquivos operacionais e páginas grandes como `src/routes/app/+page.svelte`, `src/routes/perfil/+page.svelte`, `src/routes/gestao/produtos/+page.svelte`, `src/routes/+page.svelte` e `src/routes/precificacao/+page.svelte`.
- Impacto: a barra de qualidade está ambígua. O comando “passa”, mas o ruído de warnings esconde regressões reais e a11y debt.
- Ação recomendada: tratar warnings por lotes, começando pelos fluxos operacionais e componentes compartilhados, e só depois pelas páginas de marketing.

### P3 — Hotspots gigantes seguem concentrando muita lógica em arquivos únicos

- Evidência: `src/routes/app/mesas/[id]/+page.svelte` (~124 KB), `src/routes/relatorios/+page.svelte` (~96 KB), `src/routes/gestao/produtos/+page.svelte` (~88 KB), `src/routes/assinatura/+page.svelte` (~80 KB), `src/routes/perfil/+page.svelte` (~76 KB), `src/routes/app/+page.svelte` (~64 KB), `admin-dashboard/src/routes/subscriptions/+page.svelte` (~64 KB).
- Impacto: onboarding mais lento, merges mais frágeis, maior chance de regressão lateral e mais dificuldade para agentes trabalharem em paralelo.
- Ação recomendada: usar os trackers existentes e decompor por superfícies de domínio, não por "limpeza geral".

### P3 — Prompt de suporte expunha preço antigo do add-on Acessos — ✅ RESOLVIDO (2026-06-01)

- Evidência: [src/routes/api/chat/support/+server.js](/home/vinicius/code/zelopdv/src/routes/api/chat/support/+server.js:26), [src/routes/api/chat/support/+server.js](/home/vinicius/code/zelopdv/src/routes/api/chat/support/+server.js:137), catálogo atual em [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:68)
- Impacto: o suporte automatizado comunicava `+R$ 20/mês` quando o catálogo canônico já estava em `R$ 30`.
- Resolução: ambas as ocorrências (linhas 26 e 137) foram alinhadas manualmente para `+R$ 30/mês`.
- Dívida residual: o copy continua sendo texto literal no prompt, não lido de `pricing.js`, então pode driftar de novo a cada mudança de preço. Registrado como dívida técnica conhecida em [[TRADEOFFS]] (DT-BILLING-01).

## Open questions

- O sweeper do ZeloChat que consome `deletion_scheduled_at` está implantado e monitorado em produção?
- Quais superfícies, além da navegação, realmente exigem enforcement de permissão por papel no servidor?

## Summary

Os riscos mais altos remanescentes são enforcement de permissões por papel em superfícies client-side e a confirmação operacional do sweeper externo de deleção. O PIN server-side, a reativação fail-closed e a unicidade de linhas vivas de assinatura já foram implementados e verificados; a base continua deliberadamente sem refactors gerais.
