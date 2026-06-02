# ZeloPDV — Code Review

> Baseline criado em 2026-06-01 a partir de inspeção do repo + `npm test` + `npm run check`.
> Estado das correções: [[FIXES_PROGRESS]]

## Findings

### P1 — Permissões de subusuário são majoritariamente enforcement de UI, não RBAC forte no servidor

- Evidência: [src/lib/accessControl.js](/home/vinicius/code/zelopdv/src/lib/accessControl.js:122), [.ai/migrations/rls_subuser_access.sql](/home/vinicius/code/zelopdv/.ai/migrations/rls_subuser_access.sql:11), [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:72), [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:215)
- Impacto: o contexto owner/subusuário existe e o RLS escopa por empresa dona, mas o JSON de permissões é lido no browser. Em superfícies como `despesas`, o carregamento da página acontece sem um gate explícito de permissão por rota. Isso é mais próximo de navegação/UI gating do que de RBAC de enforcement.
- Ação recomendada: documentar isso como limitação atual, priorizar checks server-side para mutações e definir quais superfícies precisam de enforcement real além do escopo por owner.
- Update 2026-06-01: a camada de *dados* de `expenses` foi endurecida — `expenses_owner_scoped_write_policies_2026_06_01` adicionou policies owner-scoped de `INSERT`/`UPDATE`/`DELETE`/`SELECT` em produção, então um subusuário não consegue mais escrever fora da empresa dona via RLS. O ponto P1 permanece aberto porque isso é escopo por *owner*, não RBAC por *papel*: a granularidade por cargo (quem pode lançar despesa vs. só ver) segue gated na UI. Tratado como dívida aceita em [[TRADEOFFS]].

### P1 — `AdminLock` não protege segredo no servidor; o PIN é carregado e comparado no cliente

- Evidência: [src/lib/components/AdminLock.svelte](/home/vinicius/code/zelopdv/src/lib/components/AdminLock.svelte:37), [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:223), [.ai/migrations/rls_subuser_access.sql](/home/vinicius/code/zelopdv/.ai/migrations/rls_subuser_access.sql:107)
- Impacto: páginas sensíveis leem `pin_admin` de `empresa_perfil` no browser e o componente compara `inputPin === correctPin` localmente. Como subusuários podem ler o perfil do titular via RLS para fins operacionais, o PIN vira um dado observável no cliente, não uma barreira forte.
- Ação recomendada: tratar o PIN atual como trava de conveniência operacional. Se a intenção for proteção real, mover validação para o servidor e parar de expor o valor bruto ao cliente.

### P1 — Deleção definitiva de conta depende de um sweeper fora deste repositório

- Evidência: [.ai/migrations/account_deletion_grace_2026_05_31.sql](/home/vinicius/code/zelopdv/.ai/migrations/account_deletion_grace_2026_05_31.sql:5), [src/routes/api/account/delete/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/delete/+server.js:1). Validação manual: o banco real possui `public.delete_account(...)`, mas não há job `pg_cron` chamando `delete_account`, `deletion_scheduled_at` ou equivalente.
- Impacto: o app agenda grace period e cancela Stripe no fim do ciclo, mas o purge real não é garantido só com este repo. Se o sweeper externo não existir ou parar, contas ficam presas em estado intermediário, com risco de descumprimento operacional/LGPD.
- Ação recomendada: localizar o job no ZeloChat, documentar owner/monitoramento e adicionar runbook de reconciliação.

### P1 — `admin-dashboard/` assume tabelas sem RLS e usa anon key direto no browser

- Evidência: [admin-dashboard/src/lib/supabaseClient.js](/home/vinicius/code/zelopdv/admin-dashboard/src/lib/supabaseClient.js:1)
- Impacto: a segurança do painel depende de `super_admins` + ausência de RLS nas tabelas administrativas. Qualquer relaxamento indevido em policies/dados pode expor operações sensíveis no cliente.
- Ação recomendada: revisar a lista de tabelas acessadas pelo admin, preferir handlers server-side para mutações críticas e registrar explicitamente quais tabelas estão com RLS desligado por design.

### P2 — Reativação de conta limpa o agendamento local mesmo se a retomada no Stripe falhar

- Evidência: [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:28), [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:47)
- Impacto: se `cancel_at_period_end=false` falhar no Stripe, o endpoint apenas loga warning e limpa `deletion_scheduled_at` no banco local. O usuário pode parecer reativado enquanto a assinatura segue cancelando no fim do ciclo.
- Ação recomendada: decidir se a operação deve falhar fechada, ou ao menos gravar estado de reconciliação pendente para o suporte.

### P2 — Vários fluxos assumem implicitamente "uma assinatura efetiva por usuário"

- Evidência: [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:166), [src/routes/api/billing/create-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-subscription/+server.js:80), [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:69)
- Impacto: o padrão `order(updated_at desc).limit(1)` aparece em guardas, checkout, portal e Pix. Não há constraint única por `user_id` no schema, então entitlement, cancelamento e reconciliação seguem dependentes de convenção implícita, ainda que a produção atual não tenha usuários com múltiplas rows em `subscriptions`.
- Ação recomendada: validar o schema real e registrar explicitamente se `subscriptions` é uma linha viva por `user_id` ou histórico append-only com contrato de "última linha vence".

### P2 — Webhook Pix aceita fallback para chave pública hardcoded

- Evidência: [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:5), [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:121)
- Impacto: se `ABACATEPAY_PUBLIC_KEY` faltar no ambiente, a verificação continua com uma chave embutida no código. Isso cria ambiguidade operacional e dificulta garantir que a trust boundary do webhook está configurada como esperado.
- Ação recomendada: validar se o fallback é oficial/estável. Se não for, remover o default e falhar fechado.

### P2 — Não há snapshot único do schema de produção; migrations vivem em `.ai/migrations/`

- Evidência: ausência de `supabase/migrations/` e dependência operacional explícita de migrations avulsas em `.ai/migrations/`
- Impacto: para incidentes, onboarding de IA e mudanças de RLS, a verdade do banco fica espalhada entre código, docs e SQLs soltos.
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

- Onde está implantado o sweeper que consome `deletion_scheduled_at`?
- Quais tabelas do admin dashboard estão realmente com RLS desligado em produção?
- O fallback `DEFAULT_ABACATEPAY_PUBLIC_KEY` é uma exigência da AbacatePay ou apenas conveniência temporária?
- Quais superfícies, além da navegação, realmente exigem enforcement de permissão por papel no servidor?

## Summary

Os riscos mais altos hoje são trust boundaries frágeis em acessos/PIN, dependências operacionais implícitas e drifts internos de contrato no billing. A documentação agora cobre melhor o terreno, mas a base ainda precisa de validação manual em schema real, sweeper externo e enforcement real de permissões.
