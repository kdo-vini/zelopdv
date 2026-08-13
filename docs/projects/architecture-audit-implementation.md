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

### 3. Migration/schema reconciliation — concluída

- [x] Capturar novamente o estado remoto e o histórico local/remoto. A tabela
  `supabase_migrations.schema_migrations` preserva os statements autoritativos
  das 23 versões que hoje são placeholders/markers locais.
- [x] Classificar os 107 artefatos SQL existentes (59 em
  `supabase/migrations`, 46 legados e 2 verificadores), sem nenhuma origem ou
  situação `unknown`.
- [x] Capturar um snapshot completo do schema de produção, sem dados nem
  segredos.
- [x] Recuperar os 23 payloads autoritativos representados por placeholders ou
  markers sem editar/reexecutar arquivos aplicados: 22 foram versionados como
  referência e `20260722170000`, que continha UUID e catálogo reais de tenant,
  foi preservado somente por versão e hashes no manifest.
- [x] Definir e versionar o caminho de bootstrap a partir do baseline +
  migrations forward-only.
- [x] Provar o bootstrap em banco vazio e comparar objetos/policies/grants com
  produção; registrar diferenças deliberadas.
- [x] Confirmar `supabase migration list --linked` alinhado e dry-run sem
  pendências.

Critério de saída: 107/107 artefatos classificados, baseline versionado,
bootstrap descartável reproduzível e diff estrutural/de segurança igual a zero
contra produção, sem depender de SQL manual ou inferência por documentação.

Observação: a reconciliação mínima necessária para publicar migrations foi
concluída em 2026-08-12; esta entrega concluiu também o bootstrap integral.

Evidência final: `supabase/baselines/20260813091000/README.md`. O bootstrap
descartável reproduziu o dump `public` e a configuração capturada de
Storage/Realtime com diff zero; nenhuma escrita ou repair foi feita no projeto
vinculado. Os dois findings existentes do lint de funções foram reproduzidos e
registrados, sem mudança comportamental oportunista.

### 3.1. P0 de Storage revelado pela reconciliação — concluído

- [x] Confirmar no catálogo real que `storage.objects` tem RLS e grants de
  INSERT/DELETE para `anon`/`authenticated`.
- [x] Confirmar que `zelochat-media service insert` e
  `zelochat-media service delete` são permissivas e `TO PUBLIC` para todo o
  bucket.
- [x] Identificar todos os consumidores de upload/delete e provar quais usam
  service-role, browser authenticated ou anon.
- [x] Executar probes Storage API com objeto sintético e remoção imediata,
  cobrindo anon, authenticated e service-role.
- [x] Criar snapshot e migration forward-only mínima; não alterar o baseline,
  que precisa continuar representando o cutoff anterior.
- [x] Testar/deployar/observar a contenção antes de iniciar RBAC residual.

Classificação: P0 confirmado, porque grant de INSERT/DELETE + policy `TO PUBLIC`
forma um caminho efetivo de escrita anônima. O baseline registrou a exposição;
ele não a criou nem a trata como aprovada.

Evidência e rollback:
`docs/operations/ZELOCHAT-MEDIA-STORAGE-CONTAINMENT-SNAPSHOT-2026-08-13.md`.

### 4. RBAC por papel — fechamento incremental

- [x] Congelar uma matriz única `capability → rota → operação → tabela/RPC →
  enforcement atual`, usando todas as capabilities e todos os consumidores
  browser existentes como universo finito.
- [x] Classificar cada linha como `enforced`, `compartilhamento intencional` ou
  `candidato a gap`; só promover a `gap confirmado` após o probe live e não
  alterar linhas sem finding reproduzido.
- [x] Corrigir cada gap confirmado em PR/commit independente, com snapshot,
  consumidores, blast radius, migration forward-only e rollback.
- [x] Para cada fatia, validar owner, papel autorizado, papel não autorizado,
  subusuário bloqueado, super-admin externo, anon e `service_role`, além dos
  writes que dependem de SELECT/`RETURNING`.
- [x] Encerrar explicitamente os compartilhamentos necessários ao PDV/Mesas/
  Caixa/Fichário para que não reapareçam como finding genérico.

Inventário versionado: `docs/operations/RBAC-CAPABILITY-INVENTORY-2026-08-13.md`.
As linhas ainda classificadas como candidatas não autorizam mudança de
produção: cada uma exige o probe live e o mapeamento de consumidores descritos
no próprio inventário.

Primeira fatia encerrada em produção: o bypass de
`fiado_estornar_venda(bigint)` foi reproduzido e contido pela migration
`20260813093000`, com matriz completa e rollback em
`docs/operations/FIADO-ESTORNO-RBAC-SNAPSHOT-2026-08-13.md`. A segunda fatia
também foi encerrada: `20260813094000` restringe orders/items/events canônicos
a owner, `pedidos.acessar` ou `pedidos.cozinha`, preservando actions, Realtime e
service-role; evidência em
`docs/operations/CANONICAL-ORDERS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`. O
boundary server-side do assistant foi fechado no endpoint com
`relatorios.ver`; o uso agregado live encontrou zero chamadas de subusuário
atual e a evidência/rollback estão em
`docs/operations/ASSISTANT-SERVER-RBAC-SNAPSHOT-2026-08-13.md`. O HTTP live
permanece bloqueado por um 401 preexistente inclusive para owner, sem ser
misturado à correção.

Já concluído e rastreado em `docs/FIXES_PROGRESS.md`: Despesas, catálogo,
estoque, Pessoas, `access_users`, Caixa, Mesas, vendas, desconto, relatórios,
Fiado, Zelinho, taxas e leituras financeiras. O item só fecha após o inventário
provar que não existe outra superfície sensível atual sem decisão.

### 5. Deleção de conta / sweeper externo

- [x] Confirmar no ambiente que executa o ZeloChat se
  `startAccountDeletionSweepLoop()` está implantado e ativo.
- [x] Confirmar cadência, exclusão mútua/idempotência, credenciais, falha/retry
  e como identificar contas vencidas que ficaram para trás.
- [x] Executar reconciliação somente leitura das deleções vencidas e registrar
  o resultado.
- [x] Se o runner existir, documentar owner operacional, monitoramento e
  runbook; não duplicá-lo no ZeloPDV.
- [x] O runner existente foi endurecido no sistema proprietário e validado com
  fixtures sintéticas; nenhuma conta real foi usada como fixture destrutiva.

Critério operacional: runner, claim/lease, retry e fila foram verificados; a
fila live estava vazia, portanto não foi fabricada uma deleção real para smoke
destrutivo. A prova de produção de uma conta agendada continua explicitamente
pendente e deve ocorrer somente com janela aprovada.

### 6. ZeloAdmin — defesa das mutações críticas

- [x] Congelar a lista de tabelas/RPCs e mutações diretas consumidas pelo
  `admin-dashboard`.
- [x] Revalidar RLS, grants, guards internos e consumidores em produção.
- [x] Classificar cada mutação como segura no Data API, server-only necessária
  ou finding não confirmado.
- [x] Não mover mutações: nenhuma mutação crítica adicional foi confirmada;
  preservar leituras e contratos browser que já são seguros.
- [x] Validar admin legítimo, authenticated comum, anon, super-admin removido e
  `service_role`, incluindo tentativa cross-tenant.

Critério de saída: nenhuma mutação administrativa crítica depende apenas de
gating do browser ou de uma policy genérica. Evidência:
`docs/operations/ZELOADMIN-CRITICAL-MUTATIONS-SNAPSHOT-2026-08-13.md`.

### 7. Auditoria final de conclusão

- [x] Reexecutar suíte completa, typecheck, builds aplicáveis, E2E crítico,
  lint/advisors do banco e matrizes de autorização.
- [x] Comparar cada requisito desta lista com evidência atual, não com intenção
  ou commits antigos.
- [x] Entregar relatório final: verificado, alterado, intencionalmente
  preservado, testes, riscos residuais, deploy/observação e rollback.
- [x] Só então encerrar a meta ativa.

Relatório: `docs/operations/ARCHITECTURE-AUDIT-FINAL-2026-08-13.md`. A suíte
ZeloChat ainda tem um único teste preexistente de slug vermelho, explicitamente
fora do escopo e não mascarado.

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
