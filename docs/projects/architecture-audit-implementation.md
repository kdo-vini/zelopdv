# Meta — implementação controlada do audit de arquitetura

> Fonte de verdade da meta ativa a partir de 2026-08-13.
> Escopo congelado: nenhum finding novo entra sem reclassificação explícita.

Estados permitidos para cada finding: `pendente de verificação`,
`não confirmado — sem mudança`, `implementado`, `produção validada` ou
`backlog excluído`.

## Objetivo

Encerrar os riscos confirmados do audit na sequência aprovada, com mudanças
pequenas, deployáveis e reversíveis, preservando o comportamento de produção.
O audit é evidência para verificação; não é autorização para reconstruir o
produto.

## Definição de pronto

A meta termina somente quando todos os itens obrigatórios abaixo estiverem
marcados, cada mudança tiver evidência de produção e não restar finding P0/P1
confirmado dentro deste escopo. Finding não confirmável é encerrado como
"reportado, sem mudança", com a evidência registrada.

## To-do list congelada

### 1. Security containment P0

- [x] Remover acesso client-side indevido às views sensíveis.
- [x] Restringir RPCs administrativas e demais `SECURITY DEFINER` confirmadas.
- [x] Restringir `super_admins` sem quebrar o ZeloAdmin.
- [x] Validar anon, authenticated, owner, subusuário, super-admin e
  `service_role`.

Evidência: `docs/operations/P0-SECURITY-CONTAINMENT-SNAPSHOT-2026-08-12.md`.

### 2. Webhook reliability

- [x] Corrigir a ordem de processamento/idempotência do Stripe.
- [x] Tornar settlement Pix atômico e idempotente.
- [x] Validar retry, duplicidade, concorrência e rollback.

Evidência: `docs/operations/WEBHOOK-RELIABILITY-SNAPSHOT-2026-08-12.md`.

### 3. Migration/schema reconciliation — próxima entrega ativa

- [x] Capturar novamente o estado remoto e o histórico local/remoto. A tabela
  `supabase_migrations.schema_migrations` preserva os statements autoritativos
  das 23 versões que hoje são placeholders/markers locais.
- [ ] Classificar os 107 artefatos SQL existentes (59 em
  `supabase/migrations`, 46 legados e 2 verificadores), sem nenhuma origem ou
  situação `unknown`.
- [ ] Capturar um snapshot completo do schema de produção, sem dados nem
  segredos.
- [ ] Reconstruir como artefatos históricos de referência o DDL autoritativo
  das 20 versões representadas por `-- placeholder` e das três representadas
  por markers (`047`, `20260805143653`, `20260807134325`), sem editar ou
  reexecutar os arquivos de versões já aplicadas.
- [ ] Definir e versionar o caminho de bootstrap a partir do baseline +
  migrations forward-only.
- [ ] Provar o bootstrap em banco vazio e comparar objetos/policies/grants com
  produção; registrar diferenças deliberadas.
- [ ] Confirmar `supabase migration list --linked` alinhado e dry-run sem
  pendências.

Critério de saída: 107/107 artefatos classificados, baseline versionado,
bootstrap descartável reproduzível e diff estrutural/de segurança igual a zero
contra produção, sem depender de SQL manual ou inferência por documentação.

Observação: a reconciliação mínima necessária para publicar migrations já foi
concluída em 2026-08-12. Este item trata do bootstrap integral ainda pendente.

### 4. RBAC por papel — fechamento incremental

- [ ] Congelar uma matriz única `capability → rota → operação → tabela/RPC →
  enforcement atual`, usando todas as capabilities e todos os consumidores
  browser existentes como universo finito.
- [ ] Classificar cada linha como `enforced`, `compartilhamento intencional` ou
  `gap confirmado`; não alterar linhas sem finding reproduzido.
- [ ] Corrigir cada gap confirmado em PR/commit independente, com snapshot,
  consumidores, blast radius, migration forward-only e rollback.
- [ ] Para cada fatia, validar owner, papel autorizado, papel não autorizado,
  subusuário bloqueado, super-admin externo, anon e `service_role`, além dos
  writes que dependem de SELECT/`RETURNING`.
- [ ] Encerrar explicitamente os compartilhamentos necessários ao PDV/Mesas/
  Caixa/Fichário para que não reapareçam como finding genérico.

Já concluído e rastreado em `docs/FIXES_PROGRESS.md`: Despesas, catálogo,
estoque, Pessoas, `access_users`, Caixa, Mesas, vendas, desconto, relatórios,
Fiado, Zelinho, taxas e leituras financeiras. O item só fecha após o inventário
provar que não existe outra superfície sensível atual sem decisão.

### 5. Deleção de conta / sweeper externo

- [ ] Confirmar no ambiente que executa o ZeloChat se
  `startAccountDeletionSweepLoop()` está implantado e ativo.
- [ ] Confirmar cadência, exclusão mútua/idempotência, credenciais, falha/retry
  e como identificar contas vencidas que ficaram para trás.
- [ ] Executar reconciliação somente leitura das deleções vencidas e registrar
  o resultado.
- [ ] Se o runner existir, documentar owner operacional, monitoramento e
  runbook; não duplicá-lo no ZeloPDV.
- [ ] Se não existir, implementar um único runner no sistema proprietário em
  trabalho separado e validar uma conta sintética antes de ativar produção.

Critério de saída: há evidência operacional de que uma deleção agendada chega
ao purge ou gera alerta/retry acionável.

### 6. ZeloAdmin — defesa das mutações críticas

- [ ] Congelar a lista de tabelas/RPCs e mutações diretas consumidas pelo
  `admin-dashboard`.
- [ ] Revalidar RLS, grants, guards internos e consumidores em produção.
- [ ] Classificar cada mutação como segura no Data API, server-only necessária
  ou finding não confirmado.
- [ ] Mover somente mutações críticas confirmadas para handlers autenticados;
  preservar leituras e contratos browser que já são seguros.
- [ ] Validar admin legítimo, authenticated comum, anon, super-admin removido e
  `service_role`, incluindo tentativa cross-tenant.

Critério de saída: nenhuma mutação administrativa crítica depende apenas de
gating do browser ou de uma policy genérica.

### 7. Auditoria final de conclusão

- [ ] Reexecutar suíte completa, typecheck, builds aplicáveis, E2E crítico,
  lint/advisors do banco e matrizes de autorização.
- [ ] Comparar cada requisito desta lista com evidência atual, não com intenção
  ou commits antigos.
- [ ] Entregar relatório final: verificado, alterado, intencionalmente
  preservado, testes, riscos residuais, deploy/observação e rollback.
- [ ] Só então encerrar a meta ativa.

## Fora desta meta

Estes itens continuam backlog arquitetural e não serão executados durante esta
meta:

- request IDs;
- structured logging;
- rate limiting compartilhado;
- decomposição de componentes/arquivos grandes;
- limpeza ou atualização de dependências;
- redesign de confirmação de ações por IA;
- limpeza geral de warnings, UI ou código;
- refactor de billing, vendas/offline ou arquitetura de Mesas;
- P2/P3 estético ou de manutenibilidade sem risco funcional reproduzido.

## Regras de execução

- Uma entrega por vez; aplicar, validar produção e observar antes da próxima.
- Nunca reescrever migration aplicada; correção sempre forward-only.
- Antes de mudar permissão: snapshot exato, consumidores e blast radius.
- Nenhum finding não confirmado muda comportamento de produção.
- Credenciais de teste são usadas somente em memória e nunca versionadas.
