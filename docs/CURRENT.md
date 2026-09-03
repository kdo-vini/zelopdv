# ZeloPDV — Foco atual

- Zelinho Gerente redesenhado (2026-09-02): a página `/gestao/gerente` ganhou
  cabeçalho com saudação (`buildGreeting`), faixa do dia (`DayStrip` +
  `computeDayStrip`), abas Briefing / Ações do Zelinho / Histórico via `?aba=`
  e sinais em linhas (`SignalRow`) dentro de uma moldura única; `SignalCard`
  e `DaySnapshotSummary` foram removidos. O painel do Zelinho foi refeito:
  mensagens sem bolha, cartão de proposta com o efeito da ação e contador de
  expiração, respostas rápidas em pills, erro com "Tentar de novo" e compositor
  em textarea. O agente passou a devolver `pendingAction.effect` e
  `quickReplies` (frames SSE `pending_action` e `quick_replies`). Regra:
  nunca exibir nomes de ferramenta ou ids ao dono. Padrões em
  `docs/DESIGN_PATTERNS.md` §14. Validado visualmente em 2026-09-02 no dev
  server (desktop 1440 e mobile 390, tema escuro, conta de teste): briefing, painel,
  estado de erro e aba de ações. A ação rápida "Pausar no cardápio" só aparece
  com ZeloMenu ativo (). Tema claro ainda não conferido.

- Zelinho Gerente conversacional, fase 2 (lado ZeloPDV) (2026-09-02): o dono agora
  pareia um número de WhatsApp com a empresa em Gestão > Zelinho Gerente >
  Preferências, no cartão "Zelinho no WhatsApp". `POST /api/gerente/pair/start`
  gera o código de pareamento, `POST /api/gerente/pair` confirma o vínculo e
  `DELETE /api/gerente/pair` desvincula. O canal de mensagens fica em
  `POST /api/gerente/channel`, protegido pela chave interna
  `GERENTE_CHANNEL_INTERNAL_KEY` e chamado pelo ZeloChat. Os vínculos e códigos
  ficam nas novas tabelas `gerente_phone_links` e `gerente_pairing_codes`
  (A migration 20260902140000 foi aplicada no Supabase vinculado em 2026-09-02
  via db query --file e registrada com migration repair --status applied). O
  adaptador que fala com o WhatsApp propriamente dito vive no repo ZeloChat,
  com plano próprio em
  `docs/superpowers/plans/2026-09-02-zelinho-gerente-agente-zelochat.md`.

- Zelinho Gerente conversacional, fase 1 (2026-09-02): o painel do Zelinho passou a
  usar `/api/gerente/agent`, com function calling (`gpt-4.1-mini` por padrão, env
  `GERENTE_AGENT_MODEL`), sessões e histórico persistidos em
  `gerente_agent_sessions`/`gerente_agent_messages` e ações de escrita
  (`pausar_no_cardapio`, `ocultar_no_pdv`, `criar_categoria`, `criar_produto`,
  `alterar_preco`) que só executam após confirmação do dono, registradas em
  `gerente_agent_actions`. Toda escrita passa pelas RPCs `gerente_*` owner-scoped
  (`20260902131000`). Só o dono conversa; subusuário recebe 403. Kill switch
  `GERENTE_AGENT_ENABLED=false`. A rota antiga `/api/chat/assistant` permanece para
  rollback. O briefing ganhou a seção "Ações do Zelinho" com desfazer para pausa e
  ocultar. Migrations `20260902130000` e `20260902131000` aplicadas no Supabase
  vinculado em 2026-09-02 (via db query --file, registradas com migration repair
  --status applied). Verificado no banco: 6 funções gerente_*, 5 tabelas gerente_*
  com RLS ativo e ai_usage_logs_chat_type_check aceitando gerente_agent.
  Pendências operacionais: envs GERENTE_AGENT_ENABLED, GERENTE_AGENT_MODEL,
  GERENTE_CHANNEL_INTERNAL_KEY e GERENTE_WHATSAPP_NUMBER na Vercel, merge da
  branch feat/zelinho-gerente-agente e smoke autenticado após deploy.

- Reimpressão de recibos no dashboard (2026-09-01): a atividade recente do
  caixa agora usa o menu de três pontos por venda, com as ações **Reimprimir
  venda** e **Excluir venda**. A reimpressão reconstrói a venda persistida,
  incluindo itens, modificadores, descontos, entrega e pagamentos múltiplos, e
  reutiliza `printVenda` com a marcação de segunda via. O perfil da empresa é
  carregado sob demanda para manter cabeçalho, logo e rodapé do recibo.

- Layout de Relatórios (2026-08-31): a página deixou de criar, no desktop,
  uma segunda área de rolagem ao lado do relatório. O documento concentra a
  rolagem e a sidebar fica presa ao viewport com `position: sticky`, evitando
  tanto o trilho lateral quanto a navegação sair da tela. O `min-h-full` do
  conteúdo excedia essa workspace e criava uma faixa vazia ao fim; foi removido.
  A correção está somente local e a validação autenticada em localhost confirmou
  que o documento e a workspace terminam juntos. Cobertura direcionada em
  `tests/relatoriosLayout.test.js` e `npm run check` sem diagnósticos. A suíte
  completa está vermelha por dois testes preexistentes de
  `tests/gerente.weekReport.test.js`, sem relação com esta alteração.

- Pedido conversacional WhatsApp (2026-08-30): as cinco migrations forward-only
  `20260829120000_whatsapp_order_canonical_contract.sql`,
  `20260829121000_whatsapp_confirmation_tokens.sql`,
  `20260830195410_whatsapp_confirmation_token_idempotent_issue.sql`,
  `20260830202349_confirm_whatsapp_zelo_order_atomic_v1.sql` e
  `20260830211500_patch_customer_ordering_overrides_atomic.sql` estabelecem o
  carrinho `whatsapp_order`, tokens opacos idempotentes, confirmação atômica
  exclusiva de `create_zelo_order` e overrides CRM server-only. Ainda não foram
  aplicadas no banco compartilhado. Antes do rollout, executar o verifier SQL e
  o probe de concorrência apenas em PostgreSQL descartável local com os opt-ins
  documentados; nunca apontar esses probes à produção.

- Formas de pagamento no relatório (2026-08-29): o fluxo legado do
  ZeloMenu/ZeloChat podia gravar rótulos de apresentação (`Pix`, `Dinheiro`,
  `Cartão de crédito` e `Cartão de débito`) em `vendas.forma_pagamento`,
  enquanto o PDV usa IDs canônicos. `normalizePaymentMethodId` agora unifica
  esses aliases no resumo, na legenda/exportação e nos snapshots históricos;
  IDs de plataformas personalizadas continuam intactos. A migration
  `20260829134640_payment_method_alias_normalization.sql` adiciona a mesma
  proteção na entrada de `vendas`/`vendas_pagamentos`, sem reescrever o
  histórico financeiro. Aplicação no Supabase real ainda está pendente.

- Vale-Refeição (2026-08-28): o pagamento canônico `vale_refeicao` foi
  integrado ao PDV e às três jornadas de Mesas (fechamento único, dividido e
  parcial). A interface exibe **Vale-Refeição** e a impressão usa
  `Vale-refeicao`; não há operadora, taxa, TEF ou alteração no checkout do
  ZeloMenu. O domínio compartilhado evita colisão com plataformas dinâmicas.
  Fechamentos gravam `caixa_fechamentos.totais_pagamento` (JSONB) junto das
  colunas legadas, e Caixa, Período, PDF, Excel, recibos, WhatsApp e
  Intelligence mantêm o valor separado de dinheiro, cartões, Pix e fiado.
  Migration preparada em
  `supabase/migrations/20260828120000_caixa_payment_totals.sql`; aplicar após
  preflight de colisões no banco de produção.

- ZeloMenu — prazo de entrega manual (2026-08-29): a migration
  `20260830002037_zelomenu_delivery_estimated_minutes.sql` foi aplicada e
  registrada no Supabase real. `empresa_perfil.zelomenu_delivery_estimated_minutes`
  é anulável e aceita somente 1–1440; nulo não exibe prazo ao cliente. A nova
  sobrecarga service-role da RPC `save_zelomenu_delivery_settings` preserva a
  assinatura anterior para clientes ainda atualizando. O ZeloMenu configura um
  único valor em minutos, não o calcula mais pelo raio, mostra-o apenas no
  fluxo de delivery e preserva o valor quando um painel antigo salva outras
  configurações. Verificado no banco: coluna, constraint e execute apenas para
  `service_role`; no ZeloMenu: typechecks client/server, 365 testes e build.

- Índices do CRM compartilhado (2026-08-26): a migration
  `20260826131437_060_customer_crm_fk_indexes.sql` adiciona índices para as
  FKs e buscas owner-scoped usadas por Clientes, campanhas e automações. Ela é
  aditiva/idempotente, mantém o acesso de browser negado às tabelas de CRM e
  já está aplicada no Supabase real; o ledger local está íntegro.

- Vínculos CRM em pedidos (2026-08-25): a migration
  `20260825123000_customer_order_links.sql` adiciona `zelo_orders.pessoa_id`
  com vínculo anulável ao cadastro mestre, índice para histórico por cliente e
  validação owner-scoped na criação canônica. A exclusão de pessoa quitada
  preserva vendas, pedidos, snapshots e razão financeiro, removendo apenas os
  vínculos vivos; a tela Pessoas explica que vendas e pedidos permanecem sem
  vínculo. A validação de runtime no Postgres segue pendente enquanto o Docker
  local não está disponível.

- Identidade canônica de Clientes (2026-08-25): a primeira fundação do CRM
  ficou versionada no PDV em `20260825120000_customer_identity_foundation.sql`.
  `pessoas` continua sendo o cadastro mestre; aniversários e `updated_at` foram
  adicionados, `pessoa_identities` é owner-scoped e a resolução server-only do
  WhatsApp usa lock transacional, preservando o nono dígito e evitando conflito
  com funcionários. A tela Pessoas exibe/persiste aniversário e Acessos lista
  `clientes.comunicar`. A validação de runtime ainda precisa ser executada em
  um banco vinculado antes de qualquer aplicação em produção.

- Separação de visibilidade PDV/ZeloMenu (2026-08-24):
  `produtos.ocultar_no_pdv` é exclusivamente a visibilidade interna do
  ZeloPDV; `zelomenu_product_publications.visivel_online` e
  `pausado_manualmente` são o contrato do cardápio digital para clientes.
  A migration forward-only
  `20260824134536_catalog_visibility_separation_guard.sql` registra essa
  fronteira sem alterar linhas de produtos/publicações. O guardrail de testes
  rejeita migrations que copiem um campo para o outro. A Bem Servido não teve
  dados de cardápio alterados nesta correção.
- Validação da rodada (2026-08-24): `svelte-check` passou com 0 erros/0
  warnings; o guardrail focado passou. A suíte completa teve 113/114 arquivos
  e 710/711 testes, com um timeout isolado em
  `tests/guards.zelomenu.test.js`; a mesma suíte isolada passou (7/7). O build
  concluiu com o warning preexistente de `src/hooks.client.js`.

- Migração Vercel Node.js 24 (2026-08-20): os projetos `zelopdv` e
  `zelopdv-admin` estão confirmados em runtime `24.x` nas configurações Vercel.
  Os commits `743545c`, `5908aef`, `1114c0d` e `228ad99` atualizam o contrato
  de runtime e a documentação, incluindo `@sveltejs/adapter-vercel` explícito
  com `nodejs24.x` no app principal e no admin. Os previews finais estão
  `READY` e os logs não mostram falhas de runtime. A promoção para produção foi
  concluída via `origin/main` no commit integrado `4cc0599`: o app principal
  (`dpl_8v5sq3HWxijrNS2fm6cG4ufFWXX1`) e o admin
  (`dpl_59mYocX714FCyQ6Vc8xtCy8mL2kd`) ficaram `READY`, e as páginas públicas
  verificadas responderam HTTP `200`. O smoke autenticado permanece pendente
  por falta de conta dedicada.

- Simplificação estrutural pós-auditoria (2026-08-20): `ConfirmDialog` agora
  usa `<dialog>` nativo com foco inicial, Escape e retorno ao gatilho; guards de
  assinatura foram consolidados sem alterar seus contratos públicos; wrappers
  `alert-dialog`/`separator`, o rail sem consumidores e helpers de impressão
  sem consumidores foram removidos. O Iconify do Pix foi preservado conforme
  decisão do produto. `npm run check`: 0 erros/0 warnings. `npm test`: 113
  arquivos / 709 testes passando. `npm run build`: bundles e precache PWA
  concluídos; adapter Vercel segue falhando apenas no symlink Windows `EPERM`.

- PIN administrativo opcional (2026-08-20): `empresa_perfil.pin_enabled` agora
  representa explicitamente se a proteção está ativa. O titular pode ativar o
  PIN com um novo valor ou desativá-lo mediante o PIN atual; “Continuar sem
  PIN” grava `pin_admin = null` e `pin_enabled = false`, sem criar `0000`.
  Relatórios e Despesas aguardam o status server-side e falham fechado quando
  o endpoint está indisponível. A migration idempotente
  `20260820154751_admin_pin_optional.sql` garante a coluna em ambientes que
  ainda não a possuem. `.env.local` recebeu a chave service-role apenas para o
  dev server e permanece ignorado pelo Git.

- Refinamento cirúrgico de interface e acessibilidade (2026-08-20): Produtos
  não repete a contagem no cabeçalho; a árvore de categorias separa foco de
  seleção, expansão e menu; o Zelinho Rail global foi removido e o assistant
  retorna foco ao gatilho contextual. Overlays principais usam dialogs
  acessíveis, labels/controles foram associados e `npm run check` termina com
  0 erros e 0 warnings. A paleta/rebranding permanece fora desta rodada.
  A suíte completa atual passa com 113 arquivos / 709 testes. `npm run build`:
  compilação SSR/client e precache PWA
  concluídos; o adapter Vercel falha apenas no symlink local do Windows
  (`EPERM`).

- Dev server — falso prompt de configuração do PIN (2026-08-20): o layout global
  tratava falha, ausência de resposta ou payload incompleto de
  `/api/auth/admin-pin` como PIN inexistente. Isso fazia a prévia local abrir o
  modal mesmo para contas configuradas. `shouldPromptPinSetup` agora exige a
  confirmação explícita `{ configured: false, canSet: true }`; o caso de erro
  fica fechado e coberto por teste direcionado.

- Fichário — cartões da lista lateral com poucos registros (2026-08-20): no
  desktop, `.people-list` continua ocupando a altura disponível para manter a
  rolagem previsível, mas `align-content: start` impede que as linhas implícitas
  do grid estiquem um cartão único ou poucos cartões até cobrir toda a barra
  lateral. O problema foi reproduzido na tela publicada com 1 pessoa (cartão de
  576px para uma lista de 576px); teste de regressão direcionado passa no código.

- Incidente resolvido — Mesas travadas em producao (2026-08-14): todas as
  comandas recusavam item, fechamento e cancelamento com
  `Comanda aberta nao encontrada`. A flag `v_service` das tres RPCs de comanda
  criadas em `20260812234500` era um boolean de tres valores, porque
  `current_setting('request.jwt.claim.role', true)` devolve NULL no PostgREST
  atual; com isso o owner nunca era resolvido e o predicado da comanda virava
  NULL. `20260814200000_mesas_comanda_rpc_service_flag_fix.sql` corrige a
  deteccao com `coalesce(current_setting('role', true) = 'service_role', false)`
  e exige `v_owner` nao nulo, sem tocar no contrato de capabilities. Aplicada em
  producao e confirmada pelo cliente. Detalhe em INC-2026-08-14-01.

- Varredura do mesmo defeito (2026-08-14): o GUC morto deixava o bypass de
  service_role inerte em mais quatro triggers RBAC. Nos dois de Mesa era inocuo;
  nos dois de vendas era o proximo "prod down" latente, porque a primeira rota
  server-side a criar venda ou desconto com service key cairia em
  `Usuario nao autenticado`. `20260814210000` padroniza a deteccao nos quatro e
  corrige as mensagens com acento duplamente codificado que chegavam ilegiveis
  ao operador. Aplicada em producao; DT-SEC-02 fechado. O caminho SECURITY
  DEFINER de `criar_venda_completa` continua exigindo `pdv.vender` +
  `pdv.receber`, coberto por teste.

- Governanca de migrations (2026-08-14): `[db.migrations] enabled` virou `true`
  em `supabase/config.toml` por decisao do dono do repo, e
  `supabase db push --linked` volta a ser o fluxo normal de deploy de banco.
  `scripts/verify-supabase-baseline.ps1` foi ajustado para nao depender mais do
  flag estar `false`. Rodar `--dry-run` antes de todo push. O baseline
  `20260813091000` ficou defasado em duas versoes; nova captura pendente.

- Acesso de leitura ao banco de producao (2026-08-14):
  `supabase db query --linked "<sql>"` reaproveita a sessao ja logada do CLI
  via Management API, sem precisar de Docker nem de token novo. Confirmado com
  leitura real em producao. Resultado sempre vem com um bloco `<boundary>`
  marcado como dado nao confiavel.

- `npm run verify:migrations` investigado e parcialmente corrigido (2026-08-14):
  falhava por dois motivos independentes. (1) 56 arquivos versionados tinham
  CRLF fantasma na working tree desta maquina Windows, mascarado do `git
  status` normal pelo cache de stat do indice — conteudo identico ao HEAD,
  corrigido reescrevendo os bytes exatos via Node (`git checkout` nesta maquina
  reintroduz CRLF, confirmado). Suite completa 695/695 depois da correcao; nada
  para commitar, porque os arquivos ja eram identicos ao commitado. (2) o
  manifest do baseline trava hash de `README.md` e `config.toml`, que mudaram
  ontem por decisao sua; recaptura completa exige Docker (indisponivel nesta
  maquina). Sem impacto real: o script nao esta encadeado em build/test/deploy.
  Detalhe em DT-DEV-01 e DT-DEV-02 em [[TRADEOFFS]].
- Impressao do Zelo Menu no cupom (2026-08-13): `src/lib/escpos.js` e
  `src/lib/receipt.js` agora preservam e exibem descricao, grupos de
  modificadores e opcoes da montagem em linhas separadas no cupom ESC/POS e no
  fallback HTML. O formato segue o padrao estruturado do Zelo Chat e cobre o
  recebimento automatico dos pedidos sem alterar o payload ou o banco.

- Meta ativa do audit de arquitetura (2026-08-13): o escopo foi congelado em
  `docs/projects/architecture-audit-implementation.md`. P0 e reliability de
  webhooks estão concluídos; a reconciliação integral de migrations também foi
  encerrada com 107/107 artefatos classificados, baseline PG17 reproduzível,
  dump/ACL/policies e configuração Storage/Realtime com diff zero e dry-run
  linked sem pendências. O P0 de Storage revelado pela captura também foi
  contido pela migration `20260813092000`: anon/auth perderam upload, listagem e
  delete em `zelochat-media`; service-role e GET público foram preservados, com
  zero fixtures residuais. A primeira fatia RBAC residual também foi encerrada:
  a migration `20260813093000` exige `pdv.cancelar` dentro de
  `fiado_estornar_venda`, após o probe live provar que um papel sem a capability
  conseguia alterar saldo/ledger; owner, papel autorizado, negados, super-admin,
  anon e service-role passaram e não restou fixture. A leitura dos pedidos
  canônicos também foi confirmada e contida pela migration `20260813094000`:
  owner e papéis `pedidos.acessar`/`pedidos.cozinha` mantêm orders/items/events,
  papéis sem leitura foram bloqueados e suas RPCs de ação continuaram válidas.
  Matriz SQL, Data API nested, Realtime, benchmark e zero resíduo passaram.
  O último boundary RBAC, no assistant, também foi verificado: nenhum uso
  histórico foi atribuído a subusuário atual, e o endpoint agora exige
  `relatorios.ver` antes de qualquer leitura financeira com service-role ou
  ferramenta de WhatsApp. Owners e papéis autorizados permanecem. Restam a
  verificação operacional do sweeper de deleção, mutações críticas confirmadas
  do ZeloAdmin e auditoria final. Request
  IDs, structured logging, rate limiting compartilhado, decomposição de
  componentes, dependency cleanup e redesign de confirmação por IA estão
  explicitamente fora da meta. A matriz RBAC 31/31 e a evidência de fechamento estão
  em `docs/operations/RBAC-CAPABILITY-INVENTORY-2026-08-13.md`. Evidência da reconciliação:
  `supabase/baselines/20260813091000/README.md`. O lint de banco continua
  reproduzindo dois findings preexistentes em `criar_venda_completa` e
  `save_zelomenu_delivery_settings`; nenhum foi mascarado ou alterado nesta
  entrega de preservação de comportamento. `npm run build` completou as
  transformações client/server, mas o adapter Vercel terminou vermelho neste
  Windows com `EPERM` ao criar o symlink `.vercel/output/functions/index.func`;
  é uma limitação local de permissão de symlink e permanece registrada.

- RBAC incremental — Zelinho assistant (2026-08-13): o endpoint autenticado
  resolvia qualquer subusuário ativo para o owner e usava service-role para
  vendas, despesas, caixa, fiado, signals e WhatsApp sem capability. O uso live
  agregado mostrou 50 logs históricos, nenhum atribuível a subusuário atual;
  existem 4 subusuários ativos, todos sem `relatorios.ver`. O endpoint agora
  usa `getServerAccessContext` e exige o booleano estrito `relatorios.ver` antes
  de qualquer leitura privilegiada. Owners e papéis autorizados passam; UI,
  assinatura, prompts, rate limit e banco não mudaram. TDD RED→GREEN, 656/656
  testes, typecheck 0 erros/95 warnings e revisão independente aprovados. O
  probe HTTP live ficou bloqueado por um 401 preexistente inclusive para o JWT
  válido do owner e permanece separado desta fatia. Snapshot:
  `docs/operations/ASSISTANT-SERVER-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — leitura de pedidos canônicos (2026-08-13): produção
  confirmou que as policies owner-scoped de `zelo_orders`,
  `zelo_order_items` e `zelo_order_events` deixavam qualquer subusuário ativo
  do tenant ler customer/payment/itens/auditoria. A migration forward-only
  `20260813094000_canonical_orders_select_rbac.sql` preserva owner e restringe
  leitura browser a `pedidos.acessar` ou `pedidos.cozinha`; papéis apenas de
  recebimento/cancelamento continuam executando suas RPCs sem leitura direta.
  Grants, funções, publication Realtime e writes não mudaram. Matriz linked,
  Data API nested e Realtime passaram para owner/acesso/cozinha e negaram o
  action-only; benchmark de 1.000 orders passou de 1,438 ms para 1,852 ms com
  InitPlan. Suíte 654/654 e typecheck 0 erros/95 warnings conhecidos. Snapshot:
  `docs/operations/CANONICAL-ORDERS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — histórico de vendas (2026-08-13): a revalidação remota
  confirmou que um cargo só de Pedidos lia `vendas` e `vendas_itens`. A
  migration forward-only `20260813090000_sales_history_read_rbac.sql` exige
  capacidades legítimas de PDV, Mesas, Caixa, Relatórios ou Fichário e remove
  SELECT anônimo. A companion forward-only
  `20260813091000_sales_history_read_rbac_performance.sql` mantém a mesma
  autorização, mas resolve a união de capabilities uma vez por statement e
  delega itens à policy da venda-pai; o benchmark representativo caiu de
  731,117 ms para 7,593 ms. A matriz de atores e writes foi repetida após a
  companion. O Dashboard continua owner-only na prática, writes e service-role
  não mudaram; matriz/rollback em
  `docs/operations/SALES-HISTORY-READ-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — pagamentos de venda e movimentações de caixa
  (2026-08-13): a revalidação remota mostrou que um cargo sem capacidades
  financeiras lia `vendas_pagamentos` e `caixa_movimentacoes`. A migration
  forward-only `20260813080000_sales_payment_cash_read_rbac.sql` exige as
  capabilities legítimas de PDV, Mesas, Caixa ou Relatórios e revoga SELECT
  anônimo; writes, `vendas`/`vendas_itens` e service-role permanecem. Matriz
  transacional e rollback em
  `docs/operations/SALES-PAYMENT-CASH-READ-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — taxas de plataforma (2026-08-13): a revalidação remota
  confirmou que um subusuário sem `caixa.ver`/`relatorios.ver` lia
  `vendas_taxas_plataforma` pela Data API. A migration forward-only
  `20260813070000_vendas_taxas_select_rbac.sql` exige uma dessas capabilities,
  revoga SELECT anônimo e mantém writes, tabelas de venda, owners,
  super-admins e service-role. O relatório e a tela de Caixa continuam com o
  caminho legítimo; snapshot em
  `docs/operations/VENDAS-TAXAS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- Security containment — `empresa_perfil.pin_admin` (2026-08-13): a
  revalidação remota mostrou que o grant de tabela permitia a um subusuário
  pedir o PIN diretamente pela Data API, apesar do fluxo normal já usar o
  endpoint server-side. A migration forward-only
  `20260813060000_empresa_perfil_pin_select_containment.sql` troca o SELECT de
  `anon`/`authenticated` por colunas explícitas sem `pin_admin`; os dois
  wildcards do PDV foram reduzidos aos campos que realmente usam. Policies,
  writes, owners, subusuários, super-admins e service-role foram preservados.
  Snapshot: `docs/operations/EMPRESA-PERFIL-PIN-SELECT-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — leitura de Mesas (2026-08-13): a revalidação remota
  confirmou que um subusuário sem `mesas.acessar` conseguia ler mesas,
  comandas, itens e pagamentos parciais da empresa pela Data API. A migration
  forward-only `20260813050000_mesas_select_rbac.sql` exige a capability nas
  leituras privadas, mantém `relatorios.ver` somente para o resumo de
  comandas usado por `/relatorios` e revoga grants anônimos sem consumidor.
  Owner, subusuário autorizado, report-only, super-admin fora do tenant e
  service-role foram verificados em smoke transacional; a fixture e as
  permissões temporárias foram revertidas. Snapshot:
  `docs/operations/MESAS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — Zelinho Gerente (2026-08-13): a revalidação remota
  confirmou que as policies owner-scoped de `business_signals` e
  `business_daily_snapshots` deixavam um subusuário sem `relatorios.ver` ler
  sinais/snapshots e marcar `business_signals.read_at` como lido pela Data
  API. A migration forward-only
  `20260813043000_gerente_reports_rbac.sql` exige a capability existente nas
  três policies e `appNavigation` passou a esconder o Zelinho para o mesmo
  contexto sem permissão. Owner, subusuário autorizado, super-admin fora do
  tenant, anon e service-role foram verificados em smoke transacional; a
  fixture foi revertida. Snapshot:
  `docs/operations/GERENTE-REPORTS-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — integridade do `access_audit_logs` (2026-08-13): a
  revalidação remota reproduziu que um subusuário podia forjar um evento sob o
  `owner_user_id` de outra empresa, pois a policy aceitava apenas
  `operator_user_id = auth.uid()` como alternativa. A migration forward-only
  `20260813041000_access_audit_logs_tenant_guard.sql` exige operador autenticado
  e owner resolvido pelo helper existente, preservando o helper browser,
  writes service-role, leituras, grants e dados existentes. O smoke
  cross-tenant/same-tenant foi transacional e revertido. Snapshot:
  `docs/operations/ACCESS-AUDIT-LOGS-TENANT-GUARD-SNAPSHOT-2026-08-13.md`.
  O setup E2E com `kdo.vini@gmail.com` resetou e limpou o tenant dedicado,
  mas o harness local voltou a ficar em `/login` após renderizar o app e
  excedeu o timeout de navegação; isso é a mesma flakiness de ambiente já
  registrada, não evidência contra a policy. A matriz SQL de produção é a
  validação autoritativa desta fatia.

- RBAC incremental — leitura do ledger de fiado (2026-08-13): a revalidação
  remota reproduziu que Caixa/Atendente sem `fiado.visualizar` conseguiam ler
  `fiado_lancamentos` diretamente pelo Data API, embora a navegação escondesse
  o Fichário. A migration forward-only
  `20260813034000_fiado_ledger_select_rbac.sql` adiciona a capability à policy
  SELECT, preserva owner, Gerente, service-role, RPC de recebimento e leitura
  operacional de `pessoas.saldo_fiado`. Smoke remoto cobriu owner, subusuário
  com/sem permissão, super-admin e anon sem persistência. Snapshot:
  `docs/operations/FIADO-LEDGER-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- Contencao incremental — RPCs SECURITY DEFINER (2026-08-13): a
  revalidacao remota confirmou que `saldo_caixa(bigint)` podia ser executada
  por `anon`/`authenticated` e calculava saldo de qualquer caixa sem guard de
  tenant; `get_user_id_by_email(text)` tambem retornava UUIDs de `auth.users`
  sem consumidor no repositorio. A migration forward-only
  `20260813033000_rpc_security_definer_containment.sql` remove EXECUTE de
  `public`/`anon`/`authenticated` nesses dois RPCs e preserva `service_role`.
  O RPC `add_empresa_membro_por_email(integer,text,text)` tinha consumidor
  browser identificado, entao somente `public`/`anon` foram removidos; o
  grant autenticado, a definicao e o guard owner/admin permanecem. Snapshot:
  `docs/operations/RPC-SECURITY-DEFINER-CONTAINMENT-SNAPSHOT-2026-08-13.md`.
  A producao confirmou anon negado nos tres, authenticated negado nos dois
  server-only e service-role executando os dois sem persistencia. O banco nao
  possui linhas em `empresas`/`empresa_usuarios`, portanto nao foi possivel
  executar um caso owner positivo do legado de membership sem fabricar uma
  fixture; o grant autenticado e a funcao foram preservados sem alteracao.

- Validacao da contenção RPC (2026-08-13): `npm test` passou com 96 arquivos e
  619 testes; `npm run check` passou com 0 erros e 95 avisos preexistentes.
  `npx supabase db lint --linked` manteve somente os dois erros conhecidos de
  `save_zelomenu_delivery_settings`/`criar_venda_completa`, e o advisor de
  seguranca nao reportou mais execucao anonica de `saldo_caixa` ou
  `get_user_id_by_email`. O setup E2E com a conta permanente informada pelo
  usuario passou 2/2 (autenticacao + cleanup), sem persistir senha.

- Contencao incremental — `billing_payments` server-only (2026-08-13): a
  revalidacao remota confirmou que a policy `billing_payments_self_insert`
  permitia que qualquer autenticado criasse uma linha de cobranca arbitraria
  para si pelo Data API, embora nenhum consumidor browser exista. A migration
  forward-only `20260813032000_billing_payments_server_insert_only.sql`
  revoga somente INSERT de `anon`/`authenticated`; SELECT do titular e os
  writes service-role dos fluxos Pix/webhook permanecem iguais. Snapshot:
  `docs/operations/BILLING-PAYMENTS-INSERT-SNAPSHOT-2026-08-12.md`.

- E2E pos-migration (2026-08-13): a conta permanente informada pelo usuario
  foi usada sem persistir a senha. O cleanup dedicado passou, mas o setup do
  Playwright excedeu 30s esperando a URL apos o login, apesar do snapshot
  mostrar a sessao autenticada no app. Trata-se de falha/flakiness do setup
  local, nao de autorizacao do billing; nao foi feito cleanup de UI por causa
  disso. `npm run build` tambem nao concluiu neste Windows porque o
  `adapter-vercel` nao conseguiu criar um symlink em `.vercel/output`
  (`EPERM`); o typecheck e a suite Vitest continuam verdes.

- RBAC incremental — desconto POS (2026-08-12): a revalidacao remota confirmou
  que `pdv.desconto` era apenas gate de UI: um subusuario com venda/recebimento
  conseguia inserir venda com desconto positivo pelo Data API. A migration
  forward-only `20260813030000_discount_rbac.sql` adiciona trigger estreito
  para INSERT/UPDATE de desconto, preserva desconto zero, fechamento de Mesa,
  owner e service-role. Snapshot:
  `docs/operations/DISCOUNT-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — extensoes de catalogo ZeloMenu (2026-08-12): a
  revalidacao remota confirmou que um subusuario sem `produtos.gerenciar`
  conseguia alterar grupos/opcoes de modificadores, vinculos opcao-produto e
  publicacoes pelo Data API. A migration forward-only
  `20260813020000_catalog_extensions_rbac.sql` exige a capability nas escritas,
  preserva os checks de ownership dos pais, as leituras do cache POS, grants,
  service-role e o fluxo existente de produto. Snapshot:
  `docs/operations/CATALOG-EXTENSIONS-RBAC-SNAPSHOT-2026-08-12.md`.
  `npm test` e `npm run check` ficaram verdes. O E2E de autorizacao executou o
  setup e quatro cenarios; um cenario antigo de convite continua vermelho por
  esperar o seletor inexistente `#invite-role`, sem relacao com esta migration.

- RBAC incremental — leitura de fechamentos de caixa (2026-08-12): a
  revalidação remota confirmou que um subusuário sem `relatorios.ver` ainda
  conseguia ler `caixa_fechamentos` diretamente pelo Data API, apesar do gate
  client-side de `/relatorios`. A migration forward-only
  `20260813010000_reports_select_rbac.sql` exige a capability na policy SELECT,
  revoga o grant anônimo sem consumidor e preserva owner, relatório autorizado,
  service-role e os caminhos operacionais compartilhados. Snapshot:
  `docs/operations/REPORT-SELECT-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — criação de vendas (2026-08-12): a revalidação remota
  confirmou que `criar_venda_completa(jsonb)` e o INSERT direto de `vendas`
  aceitavam subusuários sem `pdv.vender`/`pdv.receber`. A migration forward-only
  `20260813000000_sales_creation_rbac.sql` adiciona guard BEFORE INSERT,
  preserva o INSERT direto de fechamento de Mesa somente com `mesas.fechar`,
  mantém service-role e contratos existentes e revoga EXECUTE anônimo da RPC.
  Snapshot: `docs/operations/SALES-CREATION-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — operação de Mesas (2026-08-12): a revalidação remota
  confirmou que o Atendente, sem `mesas.fechar`/`mesas.cancelar`, conseguia
  alterar diretamente status de comanda/mesa e campos de fechamento por
  policies apenas owner-scoped. A migration forward-only
  `20260812233000_mesas_operational_rbac.sql` separa INSERT/DELETE de
  comandas, mutações de itens e guards de transição/fechamento por
  `mesas.abrir_comanda`, `mesas.editar_itens`, `mesas.fechar` e
  `mesas.cancelar`, mantendo grants, service-role e leituras fora desta fatia.
  A migration complementar `20260812234500_mesas_operational_rpc_rbac.sql`
  resolveu owner de subusuário e capabilities nas três RPCs de estoque já
  consumidas pelo browser, sem alterar seus contratos. Snapshot:
  `docs/operations/MESAS-OPERATIONAL-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — pagamentos parciais de Mesas (2026-08-12): o schema remoto confirmou que um Atendente sem `pdv.receber`/`pedidos.receber` podia inserir pagamentos owner-scoped em `comanda_pagamentos`. A migration `20260812230000_mesas_payment_rbac.sql` exige `mesas.acessar` e uma capacidade de recebimento para INSERT/UPDATE/DELETE nos pagamentos parciais e no ledger `comanda_pagamento_itens`. SELECT, fechamento completo, comandas/itens, grants e service-role ficaram fora desta fatia. Smoke transacional cobriu owner, Atendente sem receber, subusuário temporariamente autorizado, anon, super-admin e service-role; nenhum fixture persistiu. Snapshot: `docs/operations/MESAS-PAYMENT-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — cancelamento de vendas (2026-08-12): o schema remoto
  confirmou que subusuários podiam editar/remover vendas, itens, pagamentos e
  taxas apenas por estarem no tenant owner, ignorando `pdv.cancelar`. As
  migrations `20260812210856_sales_cancel_rbac.sql` e
  `20260812211428_sales_cancel_helper_grant_fix.sql` exigem a permissão para
  mutações pós-criação e preservam somente o rollback de Mesa para venda vazia,
  recente e criada pelo próprio operador. INSERT/criação e leituras não foram
  alterados. Smoke transacional cobriu owner, subusuário sem/com permissão,
  rollback recente/antigo, anon, super-admin e service-role; snapshot:
  `docs/operations/SALES-CANCEL-RBAC-SNAPSHOT-2026-08-12.md`.

- E2E focado pós-cancelamento (2026-08-12): a conta permanente de teste
  autenticou no ambiente local com o tenant configurado; setup, os dois
  cenários de Controle de Acessos e cleanup passaram (4/4). O setup usou a
  chave de serviço somente em memória para semear o fixture, sem persistir
  credenciais ou arquivos no repositório.

- RBAC incremental — caixa (2026-08-12): o schema remoto confirmou que
  subusuários sem `caixa.fechar` podiam alterar/remover caixas e que
  `caixa.movimentar` não era consultada pela policy de movimentações. A
  migration `20260812214518_caixa_role_rbac.sql` exige as capacidades
  existentes, mantém leituras e o comportamento service-role, e preserva a
  criação de histórico de fechamento. Smoke transacional cobriu owner,
  subusuário sem/com capacidades, anon e super-admin; nenhum fixture persistiu.
  Snapshot: `docs/operations/CAIXA-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — `access_users` (2026-08-12): o finding foi confirmado em
  produção e fechado com as migrations forward-only
  `20260812204706_access_users_self_write_containment.sql` e
  `20260812205010_access_users_owner_guard.sql`. Titular mantém CRUD; o
  subusuário mantém apenas self-SELECT para contexto/cargo e não pode alterar
  `role_id`, `owner_user_id` ou `status`, nem remover/criar vínculos. Convite,
  ativação e gestão continuam server-side/service-role. Smoke remoto cobriu
  owner, subusuário, cargo, super-admin, anon e service-role sem persistência;
  snapshot: `docs/operations/ACCESS-USERS-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — Pessoas (2026-08-12): a migration
  `20260812202400_pessoas_role_rbac.sql` mantém as leituras owner-scoped usadas
  pelo PDV, Mesas, Fichário e Relatórios, mas exige `pessoas.gerenciar` para
  INSERT/UPDATE/DELETE de subusuários. Titular e Gerente continuam com CRUD;
  Caixa/Atendente não ganham escrita indireta. A página de Pessoas agora grava
  novos cadastros com o `ownerUserId` resolvido do contexto de acesso. Smoke
  remoto transacional cobriu owner, Gerente, subusuário sem permissão, leitura
  compatível, anon e service-role; nenhum dado de produção persistiu. Snapshot:
  `docs/operations/PESSOAS-RBAC-SNAPSHOT-2026-08-12.md`.

- E2E focado pós-Pessoas (2026-08-12): a conta permanente
  `kdo.vini@gmail.com` foi usada com o tenant dedicado; o cleanup remoto
  passou e não ficou manifesto persistido. O setup chegou ao `/app`, mas o
  harness local excedeu o timeout de 30s na asserção de URL do login. Isso não
  é evidência de regressão da policy; a autorização foi coberta pelos smokes
  SQL em produção. O problema do harness continua documentado, sem alteração
  de código para mascará-lo. A repetição pós-`access_users` foi bloqueada no
  setup por `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` ausentes; cleanup passou.

- Segurança/reliabilidade incremental (2026-08-12): `POST /api/account/reactivate` agora falha
  fechada quando o Stripe não consegue retomar a assinatura, preservando a agenda local para retry.
  O schema de produção recebeu o índice parcial `subscriptions_one_live_row_per_user`, mantendo
  histórico terminal e impedindo mais de uma linha viva por titular. O PIN administrativo deixou de
  ser enviado ao browser: status e verificação passam por `/api/auth/admin-pin`, e somente o titular
  pode alterá-lo. A suíte Vitest passou 587/587 e `npm run check` passou com 0 erros/95 avisos
  conhecidos. O lint SQL continua com os dois erros pré-existentes fora desta rodada.

- RBAC incremental (2026-08-12): o catálogo base (`produtos`, `categorias` e
  `subcategorias`) agora exige `produtos.gerenciar` para mutações de
  subusuários no RLS. Owners e o papel Gerente preservam CRUD; Caixa e
  Atendente continuam lendo o catálogo para o PDV, mas não conseguem escrever.
  A migration `20260812195032_products_role_rbac.sql` foi aplicada em produção
  com smoke transacional owner/Caixa/Gerente/anon/service-role e sem linhas
  persistidas. A capacidade separada `estoque.ajustar` foi preservada por
  `20260812200550_catalog_stock_adjustment_rpc.sql`, com a página de Estoque
  usando RPCs que só alteram colunas de estoque. O snapshot está em
  `docs/operations/PRODUCTS-RBAC-SNAPSHOT-2026-08-12.md`.

- Webhook reliability round 2 (2026-08-12): os cenários descritos foram
  confirmados no código e no schema de produção. Stripe agora só registra o
  evento depois dos efeitos locais e propaga falhas de update para permitir
  retry; AbacatePay reabre eventos `received`/`failed`, transforma pagamento
  local ausente em erro retryável em vez de `ignored`; liquidação Pix paga usa
  a RPC transacional `settle_pix_payment`, com lock do pagamento e renovação de
  assinatura no mesmo commit. Testes direcionados passaram (31/31). A migration
  `supabase/migrations/20260812165936_webhook_reliability_pix_atomicity.sql`
  foi aplicada em produção após reconciliação segura do histórico remoto/local.
  O snapshot está em `docs/operations/WEBHOOK-RELIABILITY-SNAPSHOT-2026-08-12.md`;
  o smoke transacional pós-apply confirmou liquidação idempotente e terminou
  com rollback.

- E2E de producao (2026-08-12): a conta informada pelo usuario foi designada
  como tenant dedicado permanente, sem credenciais persistidas no repositorio.
  O setup/teardown Playwright remoto passou 2/2, cobrindo owner e os tres
  subusuarios. A tentativa da suite completa (110 testes) avancou para os
  cenarios, mas encontrou falhas preexistentes do proprio E2E (seletor CSS
  invalido e produto hard-coded ausente); esses cenarios ficaram deliberadamente
  fora deste PR. O fixture foi corrigido para respeitar a restricao de uma
  caixa aberta, evitar corrida de hidratacao no login e limpar apenas IDs do
  manifesto, preservando historico preexistente.

- E2E focado pós-RBAC (2026-08-12): setup e cleanup do tenant dedicado passaram,
  mas o cenário de Gerente que esperava redirecionamento de `/assinatura`
  falhou no servidor local. O dev server registrou `SUPABASE_SERVICE_ROLE_KEY`
  ausente e 500 em `/api/access/audit-login`; isso impede usar esse resultado
  como regressão da policy, já coberta pelo smoke SQL de produção. Não foi
  alterado código para mascarar a falha de ambiente.

- P0 security containment (2026-08-12): a migration forward-only foi preparada
  em `supabase/migrations/20260812150000_p0_security_containment.sql` após
  revalidação do schema remoto. Ela remove grants de cliente nas views
  SECURITY DEFINER sensíveis, torna `user_entitlements` invoker-scoped,
  restringe RPCs administrativas sem consumidor browser a `service_role`,
  mantém os RPCs usados pelo ZeloAdmin com guarda interna de super-admin ativo
  e limita a exposição de `super_admins`. O snapshot pré-mudança está em
  `docs/operations/P0-SECURITY-CONTAINMENT-SNAPSHOT-2026-08-12.md`.
  A matriz transacional anon/authenticated/owner/subuser/super-admin/service-role
  passou no banco vinculado depois do apply. O histórico foi reconciliado sem
  reaplicar SQL histórico; o detalhe está em
  `docs/operations/MIGRATION-HISTORY-RECONCILIATION-2026-08-12.md`. A
  reconstrução de bootstrap das três versões remotas sem SQL local continua
  deliberadamente como trabalho separado.

- Cobertura operacional (2026-08-11): a suíte Vitest passou de 517 para **557/557 testes**
  (78 arquivos), incluindo regras de estoque, pedidos canônicos, impressão automática,
  modifiers, APIs de produtos/acessos/conta e contratos de migrations/RLS/offline. O Playwright
  agora lista **110 testes Playwright** (**108 cenários de produto** em Chromium desktop e Pixel
  mobile, mais setup/teardown), com tenant remoto dedicado,
  seed/reset/cleanup owner-scoped em `e2e/helpers/test-tenant.js`. `npm run check` passou com
  0 erros e 95 avisos conhecidos. A execução transacional remota ainda não foi rodada nesta
  sessão porque as variáveis seguras `E2E_SUPABASE_*`, `E2E_TEST_*` e `E2E_DEDICATED_TENANT`
  não estavam disponíveis; o setup falha explicitamente nesse caso, sem skips novos.

- Fichário — confirmação de pagamento via WhatsApp (2026-08-11): após a RPC
  `fiado_registrar_pagamento_v2` concluir, a ficha exibe um card de sucesso com
  valor recebido, saldo atualizado, impressão opcional e um link `wa.me` com
  mensagem pronta para revisão do operador. O texto diferencia saldo em aberto,
  dívida quitada e crédito disponível; o nome comercial vem de
  `empresa_perfil.nome_exibicao`, sem fallback para “ZeloPDV”. Contatos ausentes
  ou inválidos mantêm o pagamento concluído e exibem atalho para cadastro. Não
  há envio automático nem registro de entrega nesta primeira versão. Testes
  direcionados: 4/4; `npm run check`: 0 erros / 95 avisos conhecidos. `npm run
  build` compila os bundles, mas a etapa final do adapter Vercel permanece
  bloqueada pelo EPERM de symlink conhecido no clone Windows.

- Fichário — hierarquia do CTA de pagamento (2026-08-11): o botão superior
  `Receber pagamento` é um gatilho secundário para abrir o formulário e aparece
  apenas quando ele está fechado no desktop; o botão final `Registrar pagamento`
  fica dentro do formulário. O mobile preserva o gatilho como abertura do bottom
  sheet. Em larguras de laptop, o formulário usa duas colunas para valor e
  previsão, com as opções e o botão em linhas próprias; os campos têm largura
  limitada ao grid para evitar sobreposição.

- Fichário — formatação da confirmação no WhatsApp (2026-08-11): a mensagem
  agora usa quebras CRLF com blocos em branco, marcação de negrito do WhatsApp
  para pagamento/situação e não envia emojis, evitando o caractere `�` no link
  `wa.me`.

- PDV — navegacao desktop com caixa fechado (2026-08-10): o modal
  `Abrir Caixa` continua bloqueando a frente de caixa, mas a sidebar desktop
  permanece acessivel para navegar para Gestao, Financeiro, Relatorios e
  Perfil. O comportamento mobile existente foi preservado. `npm run check`:
  0 erros / 95 avisos conhecidos; requer deploy do frontend para producao.

- Admin — exclusao de usuarios com historico de fiado (2026-08-09): a RPC
  `admin_delete_user` delega para `delete_account`, que agora remove os
  `fiado_lancamentos` da conta antes de apagar `pessoas` e `auth.users`.
  Isso corrige no banco o erro de FK `fiado_lancamentos_id_pessoa_fkey` na
  tela `/users`, inclusive para exclusoes em lote. A migration
  `supabase/history/observed-local/account_deletion_fiado_2026_08_09.sql` foi aplicada via
  Supabase CLI no projeto vinculado e verificada por introspeccao do corpo da
  funcao, ordem dos deletes e grants. Nenhuma conta foi apagada durante a
  correcao. Teste direcionado: 1/1; `npm test`: 513/513; `npm run check`:
  0 erros / 96 avisos conhecidos; `cd admin-dashboard && npm run build`:
  concluido.

- Meta Pixel da LP (2026-08-07): o rastreamento de navegador e o fallback
  `noscript` agora usam o pixel `904797296018757`; a API de Conversões foi
  alinhada ao mesmo ID para manter o funil consistente. O carregamento segue
  a fila local existente e baixa o script externo em idle.

- Fichário (2026-08-04): corrigida a rolagem desktop da lista de pessoas e do
  detalhe do usuário. A tela agora usa uma única rolagem previsível por coluna
  (lista à esquerda e detalhe completo à direita), sem rolagens aninhadas no
  extrato. O grid desktop também força os painéis a ocuparem a altura
  disponível, evitando que o conteúdo cresça além da área rolável. O workspace
  foi limitado ao breakpoint desktop, para que no mobile a página continue
  usando a rolagem natural do conteúdo.

- Mesas/pagamento parcial (2026-08-03): confirmado que o fluxo existente ja
  registrava pagamentos parciais por valor e recalculava o saldo quando novos
  itens eram adicionados. O modulo agora tambem permite selecionar quantidades
  por item, impede sobrealocacao no cliente e no banco, preserva a relacao item
  -> pagamento -> venda no fechamento e corrige a impressao de mesa para separar
  couvert/taxa de servico de taxa de entrega. A migration foi aplicada via
  Supabase CLI no projeto vinculado; `npm run check` terminou com 0 erros/96
  avisos conhecidos e os testes direcionados passaram 38/38.

- Mesas/RLS (2026-08-03): auditoria do fechamento encontrou policies de INSERT
  que comparavam `auth.uid()` diretamente com o owner e bloqueavam subusuarios.
  A migration `20260803170000_mesas_owner_scoped_payment_policies.sql` agora
  usa `get_owner_user_id(auth.uid())` para comanda_pagamentos, vendas,
  vendas_itens e vendas_pagamentos; aplicada via Supabase CLI e verificada no
  schema vinculado.

- QA local do logo (2026-08-03): corrigido o encaixe do logo do header para `object-fit: contain`, mantendo a marca inteira em desktop e mobile. Dev server validado em 127.0.0.1:5173, sem overflow horizontal nem erros de console; nenhuma publicação em produção foi feita.

- Performance da home pública (2026-08-03): o Supabase e o modal de PIN deixaram o bundle inicial do layout por imports dinâmicos; em páginas públicas, a autenticação também aguarda 5s para não competir com a primeira pintura, enquanto rotas protegidas continuam carregando-a imediatamente. GTM, gtag e Meta Pixel mantêm suas filas locais e carregam scripts externos em idle, sem preconnect prematuro. O logo da home ganhou recorte, dimensões e `fetchpriority="high"`; screenshots abaixo da dobra usam WebP responsivo em 800/1600 px e mantêm PNG apenas como fallback. `npm run check`: 0 erros / 96 avisos conhecidos. O build compila os bundles, mas a etapa final do adapter Vercel continua falhando pelo `EPERM` de symlink conhecido no clone Windows.

- Limpeza de overengineering (2026-08-01): removidos o `ToastContainer` legado sem referências, exports/funções sem chamadas (`platformTotalsFromPayments`, `estoqueLabel` e wrappers simples de follow-up), props não consumidas de `ModalPagamento` e duas dependências duplicadas de ícones/Playwright. Os scripts de screenshot continuam usando `chromium` via `@playwright/test`; nenhuma regra de negócio foi alterada. Validação: `npm run check` com 0 erros / 96 avisos conhecidos e `npm test` com 497/497 testes.

- Modais acima da bottom navbar (2026-08-01): a varredura da pasta `src/lib/components/modals` e dos overlays equivalentes em rotas/componentes encontrou modais de produtos montáveis, modificadores, alert dialogs, PIN, perfil, acessos, onboarding, mesas e confirmação que poderiam perder a área inferior no mobile. O shell global agora reserva `--mobile-bottom-nav-offset` para esses overlays e limita seus painéis à altura útil, mantendo desktop/tablet inalterados. Validação: `npm run check` em 0 erros / 99 avisos conhecidos e `npm test` em 497/497.

- Comanda mobile acima da bottom navbar (2026-08-01): o drawer da comanda em `/app` agora reserva `--mobile-bottom-nav-offset` na base quando aberto no celular. O rodapé com tipo de pedido, subtotal, limpeza e `Receber` permanece acessível acima da navbar fixa; o layout desktop e a lógica de venda não foram alterados. Validação: `npm run check` em 0 erros / 99 avisos conhecidos e `npm test` em 497/497.

- Zelinho — auditoria adicional de datas (2026-08-01): os defaults do contexto sazonal e do resumo semanal agora usam a data de negócio em `America/Sao_Paulo`, evitando troca antecipada de dia/semana no rollover UTC. UTC permanece apenas nos cálculos determinísticos de chaves de data e timestamps técnicos. Cobertura adicionada para 23h30 BRT; sem alteração de schema ou dados.

- Zelinho — despesas na virada do mês (2026-07-31): corrigido o contexto financeiro do assistente. O período mensal agora usa os limites do fuso `America/Sao_Paulo`, evitando que o servidor UTC troque para o mês seguinte antes do Brasil; receita e despesas do resultado operacional aproximado usam o mesmo mês local. Despesas e receitas financeiras passaram a ser paginadas, e o contexto inclui quantidade, categorias, participação na receita e categoria mais pesada. Validação na Apex Burgers: 118 vendas / R$ 7.274,30 e 7 despesas / R$ 7.431,00 no mês local; testes direcionados 35/35 e `npm run check` 0 erros / 99 avisos conhecidos.

- Navegação mobile autenticada (2026-07-31): o hamburger/drawer do `GestaoSidebar` foi substituído, abaixo do breakpoint existente `md` (768px), por uma bottom navbar global com PDV, Gestão, Financeiro, Outros e Perfil. Desktop continua consumindo a sidebar; as duas apresentações usam a fonte única `src/lib/navigation/appNavigation.js`, que preserva as permissões de subusuário, os entitlements de Mesas/ZeloMenu/Acessos, o badge dinâmico do Zelinho, o suporte e o logout existentes. `MobileBottomNav.svelte` resolve rotas filhas pelo item compatível mais específico, fecha em navegação/Escape/back, respeita safe area, teclado virtual e reduced motion; layouts autenticados, toasts, atualização PWA, chat de suporte e o drop-up de Produtos usam os mesmos tokens de offset. Validação: `npm run check` em 0 erros / 95 avisos conhecidos; `npm test` em 491/491. O build compilou os bundles e PWA, mas a etapa final do adapter Vercel repetiu o `EPERM` conhecido do clone Windows ao criar symlink em `.vercel/output`. QA visual responsivo realizado em 390×844, 360×740 e 1024×768.

- Elevação de modais (2026-07-31): o design system passou a expor `--shadow-modal` em `src/themes/base.css`. O shell global `.modal-content`, o modal de complementos e os principais modais/diálogos do app usam o mesmo token para separar a superfície do backdrop sem alterar overlays, z-index, handlers ou regras de negócio.

- Ações contextuais de categorias (2026-07-31): a árvore de categorias e subcategorias em `/gestao/produtos` usa o mesmo padrão de três pontos da lista de produtos; editar e excluir ficam dentro do menu contextual, sem alterar os handlers nem a seleção da categoria.

- Cadastro de produtos (2026-07-31): a listagem em `/gestao/produtos` foi alinhada ao novo padrão visual da tabela no desktop e, no mobile, virou uma lista de cards com cabeçalho, categoria/subcategoria e grade 2x2 de preço/complementos/estoque/status. Avatares, iniciais coloridas e códigos foram removidos da listagem em ambos os breakpoints; os fluxos existentes de edição/busca foram preservados. O status segue alternável, as ações ficam no menu de três pontos, a seleção em massa continua disponível e o mobile mantém paginação, busca em largura total, chips horizontais com contagens e o FAB de criação com Produto/Categoria/Subcategoria. O botão de nova categoria, o fluxo de complementos, permissões e handlers existentes foram preservados.
- Ticket médio no admin dashboard (2026-07-31): o Painel Financeiro exibe e exporta o ticket médio (ARPU), calculado como `MRR ÷ contas pagantes ativas`, usando a mesma base do MRR e excluindo trials e contas internas Donutopia/Techne.

- Cardápio por empresa (2026-07-31): a ferramenta de cardápio agora grava configurações e dados no `localStorage` com o UUID do proprietário autenticado; chaves antigas sem escopo são ignoradas para impedir que uma empresa herde o cardápio de outra.

- Zelo Impressão (2026-07-31): depois que o aplicativo Windows é instalado e aberto, o ZeloPDV tenta criar a conexão automaticamente no navegador. O código de 6 dígitos ficou apenas como fallback para agentes antigos ou quando a autorização automática não for concluída. A jornada e a página pública `/zelo-impressao` refletem esse fluxo; pedidos e a configuração da impressora continuam usando o fallback do navegador quando o agente não está disponível.

- Carga operacional Mix Guaraná (2026-07-31): o usuário `39192d38-507c-443c-b075-85998abde740` (`Mix Guaraná`) recebeu o produto-base `Guaraná da Amazônia` (ID 1043), o componente ausente `Guaraná 500ml` (ID 1039), nomes normalizados e 5 grupos montáveis com 78 opções/76 vínculos. Componentes ficam ocultos do PDV via `ocultar_no_pdv` e não publicados no cardápio via `zelomenu_product_publications.visivel_online`; o base fica visível nos dois. Nenhum controle de estoque individual ou compartilhado foi ativado sem saldo confirmado. `zelomenu_slug` foi configurado como `mixguarana` e o link público foi validado.
  - Guardrail do PDV: `pdvCache` busca também os produtos vinculados que estão ocultos no catálogo e `zelomenuModifiers` considera estoque individual e estoque compartilhado da categoria ao resolver disponibilidade. Sem esse fallback, uma opção montável oculta aparecia indisponível por falta de produto no cache.

> Atualizar a cada sprint/sessão.
> Referências: [[CLAUDE]] · [[BILLING]] · [[CODE_REVIEW]] · [[FIXES_PROGRESS]] · [[INCIDENTS]]

- Produtos montáveis no PDV (2026-07-31): cadastro, PDV e Mesas/comandas agora usam os grupos já existentes do ZeloMenu. `ModalModificadores.svelte` permite criar/editar/reordenar grupos e opções, configurar modo de preço, quantidade e vínculo com produto real; produtos com grupos ativos abrem `ModalProdutoMontavel.svelte`, enquanto produtos simples mantêm um toque. A montagem aparece na comanda/cozinha, forma linhas distintas por combinação e segue como snapshot em `vendas_itens` e no caminho offline. A migration `.ai/migrations/produtos_montaveis_pdv_2026_07_31.sql` foi aplicada no Supabase vinculado: as RPCs de comanda agora reservam/devolvem também o estoque dos produtos vinculados e ficaram sem execução para `public`/`anon`; nenhum dado de teste foi persistido.
  - Hotfix de produção (2026-07-31): `comanda_aplicar_delta_item` tinha simultaneamente a assinatura legada de 3 argumentos e a assinatura nova de 5 argumentos com defaults. O PostgREST retornava `Could not choose the best candidate function` para clientes ainda usando o payload antigo. Aplicada via Supabase CLI a migration `.ai/migrations/comanda_aplicar_delta_item_remove_ambiguous_overload_2026_07_31.sql`, removendo apenas a sobrecarga de 3 argumentos; a assinatura de 5 argumentos com defaults preserva a compatibilidade. Verificado no banco: uma única função, `authenticated` com `EXECUTE`, sem dados alterados.
  - Correção pós-revisão (2026-07-31): a revisão encontrou que a venda de balcão (online e replay offline), que passa por `criar_venda_completa`, descartava o snapshot `modifiers` e não baixava estoque dos produtos vinculados às opções — só o fechamento de Mesas fazia isso corretamente. Corrigido: `buildVendaPayload` (`src/lib/finance/saleOps.js`) agora expande `estoque` com os produtos vinculados às opções selecionadas; `resolveModifierSelections` (`src/lib/zelomenuModifiers.js`) agora ordena `selectedOptions` de forma determinística (por `optionId`) e inclui `linkedProductId` no snapshot, evitando linhas duplicadas na comanda quando a mesma combinação é escolhida em ordem de clique diferente. Nova migration `.ai/migrations/criar_venda_completa_persistir_modifiers_2026_07_31.sql` (ainda **não aplicada** no Supabase vinculado — precisa rodar depois da migration `produtos_montaveis_pdv_2026_07_31.sql`) adiciona `modifiers` ao insert de `vendas_itens` dentro de `criar_venda_completa`, sem alterar o restante da função. Testes direcionados: 45/45; `npm run check`: 0 erros / 93 avisos conhecidos.
  - Pendente de verificação: se `zelomenu_modifier_option_products` tem RLS escopado por tenant — a função `comanda_modifier_stock_requirements` resolve o produto vinculado a partir do `optionId` enviado pelo cliente sem revalidar contra os grupos reais do produto, e é concedida a `authenticated`.
- Correção visual do modal de produtos montáveis (2026-07-31): opções agora usam os controles canônicos `.themed-radio`/`.themed-checkbox`, com estado selecionado visível, foco acessível e mesma linguagem visual do restante do PDV. O rodapé mantém altura estável no desktop, o resumo longo é truncado sem barra própria e a lista de opções continua navegável sem barra visual; o comportamento mobile bottom-sheet foi preservado. O modal também recebeu refinamento de estados, espaçamento e hierarquia visual alinhado ao DESIGN.md.
  - Critique + polish `$impeccable` (2026-07-31): critique salva em `.impeccable/critique/2026-07-31T18-43-24Z__lib-components-modals-modalprodutomontavel-svelte.md` (28/40, 2 P0 + 2 P1 + 3 P2). Corrigido: `--bg-page` indefinido quebrando o backdrop de `ModalProdutoMontavel.svelte`; 6 `<select>` nativos trocados por `Select` (shadcn) em `ModalModificadores.svelte`; toque bloqueado num grupo/opção no limite agora avisa via toast e desabilita a opção em vez de travar silenciosamente; botão de confirmar não mostra mais o preço-base quando a seleção é inválida; shell dos dois modais alinhado ao DESIGN.md (`--bg-panel`, 14px, `bg-black/60 backdrop-blur`); Esc fecha os dois modais; alvos de toque do stepper/fechar/mover/editar aumentados; `prefers-reduced-motion` adicionado; ícones trocados por `lucide-svelte`; formatação de dinheiro unificada via `toLocaleString('pt-BR')`; badge `variacao`/`adicional` deixou de usar duas cores idênticas. Fora do escopo, propositalmente: drift de `font-size`/`border-radius` pré-existente em `ModalModificadores.svelte` (legado, não tocado por esta feature). Testes: 460/460; `npm run check`: 0 erros / 97 avisos conhecidos (4 a mais que o baseline, esperados: 2 labels de `Select` sem `for` + 2 seletores CSS aplicados via `Select.Trigger`, mesmo padrão já aceito em `gestao/produtos/+page.svelte`).
  - Bug bloqueante encontrado em teste manual ao vivo (conta real Donutopia, 2026-07-31) e corrigido: `ModalModificadores.svelte` recebia `ownerUserId` vazio da página `gestao/produtos` e mandava `id_usuario: ""` pro Supabase ao salvar um grupo, retornando `invalid input syntax for type uuid` cru pro usuário — travava o cadastro de complementos por completo. Causa provável em `src/routes/gestao/produtos/+page.svelte`: `onMount` resolvia `ownerUserId` via `Promise.all([supabase.auth.getUser(), getAccessContext()])`, e essa concorrência entre duas chamadas de auth do supabase-js no boot da página deixava o valor vazio sem lançar erro (mascarado até aqui porque `criarProduto()` já tinha seu próprio fallback de `getUser()`; `ModalModificadores` não tinha). Corrigido em duas camadas: (1) `+page.svelte` agora resolve `ownerUserId` sequencialmente, não em paralelo; (2) `ModalModificadores.svelte` nunca mais confia só na prop — resolve `resolvedOwnerUserId` com fallback próprio (`supabase.auth.getUser()`) antes de qualquer leitura/escrita, e `salvarGrupo` reforça essa checagem antes de gravar. Também removido o rodapé "Fechar" duplicado (já tinha o X no cabeçalho) nos dois modais, por pedido do usuário. Confirmado ao vivo: salvar grupo funciona (toast "Grupo adicionado."). Testes: 460/460; `npm run check`: sem novos erros/avisos. Ficou um produto de teste "Vitamina de Morango" com grupo "Tamanho" na conta Donutopia (Supabase vinculado) — perguntar ao usuário se remove.
  - Redesign mobile-first de "Complementos e opções" (2026-07-31): implementado o modelo descrito em [[complementos-opcoes-redesign-mobile-first]] — seletor de modelo em cartões (`src/lib/modifierModels.js` + `ModelSelector.svelte`) substituindo os 4 campos crus, navegação lista→detalhe em duas telas no mobile com split lado a lado no desktop (`GroupDetailView.svelte` novo). Implementado com apoio do CLI `verboo` em 3 rodadas de revisão: 1ª rodada corrigiu um bug real (toggle "Obrigatório" no fluxo de criar grupo não tinha efeito nenhum no que era salvo — `salvarGrupo` lia o campo errado), um `<select>` nativo reintroduzido, alvos de toque regredidos, ícones inline em vez de `lucide-svelte`, e um teste (`tests/modelMapping.test.js`) que só comparava uma cópia local dos dados contra si mesma — reescrito pra importar `src/lib/modifierModels.js` de verdade e testar `calcMinSel`. Um bug crítico adicional (cabeçalho do modal — voltar/fechar — completamente invisível e inacessível no mobile, escondido atrás dos painéis de lista/detalhe por `position:absolute` relativo ao elemento errado) foi corrigido diretamente, sem passar pelo CLI. Confirmado ao vivo em 390px e 1440px: modelo com exemplo real do produto, navegação lista↔detalhe funcionando, split desktop 960px/400px correto. Testes: 471/471; `npm run check`: 0 erros / 95 avisos.
    - Passo "tier S" de UX/UI, com o fluxo mobile do Fichário (`gestao/fichario/+page.svelte`) como referência de "fácil de usar" (2026-07-31): implementado o bottom sheet "Ver como fica" que faltava (comparado às imagens do mockup aprovado) — `.summary-bar` virou botão clicável, abre `.resumo-sheet` com o padrão já usado no Fichário (overlay com blur, handle, lista de grupos ativos com as mesmas tags da lista principal, aviso de que é só prévia). Fecha por botão "Fechar", clique no backdrop ou Escape (sem fechar o modal inteiro). Subtítulo explicativo adicionado acima da lista; ícones inline trocados por `lucide-svelte` (`ArrowLeft`, `X`, `ChevronRight`, `SlidersHorizontal`, `Eye`). Alvos de toque: `.close-btn`/`.back-btn` e os botões de rodapé do grupo (Salvar/Cancelar/Ativo-Inativo/Excluir) subiram a 44px — as ações densas por opção em `GroupDetailView.svelte` (mover/editar/excluir por linha) ficaram como estavam (34px), mesmo precedente do Fichário para listas densas. Transição de slide (`transform`, 220ms) adicionada à navegação lista↔detalhe no mobile, ausente até então. Ao testar ao vivo (390px e 1440px) foi encontrado um bug real e corrigido: `.modal-content` deste componente nunca definia `max-width`, então um utilitário genérico `.modal-content { max-w-md }` em `src/app.css:218` (Tailwind, 448px) vencia por padrão e espremia o painel de detalhe do split desktop a ~0px de largura (o conteúdo existia no DOM, mas ficava visualmente invisível). Corrigido com `max-width: none` explícito no `.modal-content` deste arquivo. Confirmado ao vivo: sheet abre/fecha nas três formas, grupo criado/editado/excluído com o confirm-dialog padrão, split desktop agora mostra o painel de detalhe corretamente. Testes: 471/471; `npm run check`: 0 erros / 95 avisos (sem novos avisos).

- Passo visual adicional do redesign de "Complementos e opções" (2026-07-31): `ModalModificadores.svelte` recebeu réplica fiel da hierarquia dos mockups aprovados, com botão primário no topo, cartões de grupos com alça/tags/contagem, criação em tela cheia no desktop e bottom sheet no mobile. `ModelSelector.svelte` agora usa cartões ricos com ícone, descrição e exemplos `Ex.: Suco de Laranja`; `GroupDetailView.svelte` ganhou resumo do modelo, regras em chips e opções em cartões com badge. O split desktop agora usa modal largo (até 1180px) e mantém a área de detalhe visível; o estado de criação não deixa painel vazio ao lado. Validado no navegador em 390x844 e 1440x900, sem erros de console; grupo e opção temporários criados para teste foram removidos pela UI. `npm run check`: 0 erros / 95 avisos; `npx vitest run`: 473/473.

- Correção de bloqueios explicados no fluxo de complementos (2026-07-31): reproduzido no mobile o caso em que “Salvar grupo” ficava desabilitado após escolher um modelo sem que o campo obrigatório estivesse mais visível. O nome do grupo permanece visível na etapa de configuração; a ação bloqueada agora recebe mensagem inline e `aria-describedby` (“Informe um nome para habilitar o salvamento deste grupo”). Controles indisponíveis por modelo e limites de reordenação também mostram textos amigáveis no próprio fluxo, sem depender de hover. Validação manual: criação, edição, prévia/Esc e exclusão com `alertdialog`; `npm run check`: 0 erros / 95 avisos; suíte: 473/473.
- Auditoria de bloqueios silenciosos e helper reutilizável (2026-07-31): criado `src/lib/components/ui/InlineHelper.svelte`, com mensagem persistente, tom de aviso, modo compacto e suporte a `aria-describedby`, para substituir explicações dependentes de hover. Aplicado nos limites de escolha do `ModalProdutoMontavel`, permissões/estado vazio das ações do PDV, bloqueios de cancelamento/conclusão em `/app/pedidos` e `/app/pedidos/cozinha`, preferências do Zelinho para subusuários/regras sempre ativas e ações sem itens na comanda de mesas. Estados de carregamento e paginação foram mantidos apenas como `disabled` operacional, pois já exibem progresso ou contexto. Validação: `npm run check` com 0 erros / 95 avisos; suíte completa `npx vitest run` com 476/476.

- Aviso de atualização (2026-07-30): `UpdateAvailable` agora usa copy em português, exibe somente o botão `Atualizar`, oferece X para dispensar e aceita deslize horizontal no mobile. A dispensa continua suprimindo a mesma versão por duas horas e a atualização preserva o fluxo existente de service worker/cache. `npm run check` passou com 0 erros / 98 avisos conhecidos.

- Exclusão de pessoas quitadas (2026-07-30): a FK do extrato de fiado bloqueava o `DELETE` direto mesmo quando o saldo estava em R$ 0,00. A RPC `fiado_excluir_pessoa` foi aplicada em produção: exige permissão `pessoas.gerenciar`, bloqueia saldo diferente de zero, desvincula vendas históricas e remove os lançamentos do fiado na mesma transação antes de apagar `pessoas`. A tela de Pessoas passou a chamar a RPC e traduz o erro de saldo. Nenhum cadastro foi apagado nesta correção; validação da RPC por assinatura/grants concluída. Deploy do frontend ainda é necessário.

- Admin — usuários e uso de produto (2026-07-30): `/users` agora separa relacionamento de analytics: filtros por atividade e recência de cadastro, data de entrada + idade da conta e cópia de email/telefone com um clique. `/analytics` passa a mostrar cobertura de módulos e permite copiar uma abordagem contextual por cliente, baseada só em dados observados. A migration `.ai/migrations/product_usage_events_2026_07_30.sql` cria telemetria mínima por empresa/módulo/dia (sem cliques, conteúdo ou dados pessoais); o client passa a registrar PDV, Zelinho Gerente, Relatórios e demais módulos, e abrir o chat registra Zelinho. O endpoint server-side `/api/admin/usage-insights` protege snapshots, sinais e essa telemetria com autenticação de super-admin. A migration foi aplicada no Supabase vinculado via `supabase db query --linked --file`; verificação pós-DDL: RLS ativo, sem policies/grants para `anon` ou `authenticated`, e `service_role` como único consumidor de dados. Validação: `npm run check` passou com 0 erros / 96 avisos conhecidos; `cd admin-dashboard && npm run build` passou. O `npm run check` do admin segue bloqueado pela ausência pré-existente de `admin-dashboard/jsconfig.json`; build do app compilou, mas o adapter Vercel falhou no Windows por `EPERM` ao criar symlink em `.vercel/output`.

- Ticket médio no admin dashboard (2026-07-31): o Painel Financeiro agora exibe e exporta o ticket médio (ARPU), calculado como `MRR ÷ contas pagantes ativas`. A base do numerador e do denominador é a mesma do MRR: assinaturas `active` vigentes, sem trials e sem as contas internas Donutopia e Techne. Quando não há pagantes ativos, o valor é `R$ 0,00`.

- Zelinho Gerente (2026-07-30): rollout global implementado. A UI, o resumo semanal, preferências, badge da sidebar, contexto do chat, processamento diário e digest do WhatsApp não dependem mais de `empresa_perfil.intelligence_enabled_at`; a coluna permanece apenas como histórico do piloto. O engine agora processa empresas com assinatura ativa ou em trial e a env `INTELLIGENCE_ENGINE_ENABLED` virou kill switch opt-out (`false` desliga; ausente mantém ligado). Validação local: 13 testes focados passaram e `npm run check` terminou com 0 erros / 98 avisos conhecidos.

- Fila de pedidos (2026-07-29): incidente reportado com `permission denied for table zelo_orders`. O ACL/RLS de producao foi conferido e esta correto (`authenticated` com SELECT, `anon` sem SELECT); a tela agora tenta renovar a sessao, repete a leitura e encaminha sessoes expiradas ao login. O ajuste local passou em 9 testes direcionados e `npm run check` com 0 erros / 96 avisos; aguarda deploy.

- Página de extensões / identidade dos produtos (2026-07-28): o card do ZeloMenu agora usa o mini-mascote extraído da hero com fundo transparente, animação sutil e tratamento roxo próprio por tokens (`--zelomenu-brand*`). O card do ZeloChat usa os tokens verdes oficiais do repo do produto (`--zelochat-brand*`). Os preços exibidos e os textos de meta, FAQ e passos derivam de `src/lib/pricing.js`; não há mais preço atual de produto escrito à mão em `src/lib/data/extensoes.js`. `npm run check` passou com 0 erros / 96 avisos conhecidos; QA visual validou desktop e mobile sem overflow, com os assets carregados.

- Seguranca ZeloMenu (2026-07-28): `public.zelomenu_table_capabilities` foi endurecida em producao via `supabase db query --linked`: RLS ligado, nenhum privilegio para `anon`/`authenticated` e as RPCs `issue_table_capability`/`revoke_table_capability` ficaram restritas ao `service_role`. A tabela estava vazia e sem sessoes usando `capability_id`; o advisor deixou de reportar `rls_disabled_in_public`. Migration registrada em `.ai/migrations/zelomenu_table_capabilities_enable_rls_2026_07_28.sql` e a migration original do ZeloMenu tambem foi corrigida para novos ambientes.

- Fase 2 — implementada e publicada (2026-07-28): o contrato `source='mesa'` agora cobre QR público e envio de item da comanda no mesmo motor `zelo_orders`. QR consome estoque na transição para `accepted`; item já reservado pela comanda leva `fulfillment.comandaItemId`, nasce com `stock_committed_at` e não sofre restituição duplicada em cancelamento. `ensure_zelo_order_sale` fica sem venda para mesa e `close_zelo_order` rejeita fechamento financeiro alternativo. ZeloMenu passou a materializar `table_order` canonicamente e os dois consumidores de entitlement removeram `has_pedidos_addon`; a cópia órfã de `delivery-frontend` também foi atualizada. O DDL foi executado em produção, com asserções de schema e ACL aprovadas; o merge do ZeloPDV é `5a6f45a3`.

- Correção pós-migration (2026-07-28): o primeiro smoke de cancelamento revelou que a função protegia a restituição de estoque de item de comanda, mas ainda preenchia `stock_released_at`. A migration corretiva `.ai/migrations/pedidos_cozinha_mesa_cancel_marker_2026_07_28.sql` condiciona também o marcador; smoke transacional repetido passou 3/3 e terminou com rollback, sem pedidos persistidos.

- Validação da fase 2 local: `npm test -- --run tests/pedidosCozinhaFase2Schema.test.js tests/api.mesas-cozinha.test.js` — 11/11; suíte completa do ZeloPDV — 441/441; `npm run check` — 0 erros / 96 avisos; `cd ../zelomenu && npm run typecheck` — OK; `cd ../zelomenu && npm test` — 262/262; ZeloChat lint e testes direcionados — OK. O endpoint de cozinha valida bearer, permissões, add-on Mesas, owner da empresa, comanda aberta, mesa ativa, item pertencente, idempotência server-side e não devolve erro bruto do RPC. Pré-flight no banco confirmou que só `confirm_zelomenu_cart`, `delete_account` e `proximo_numero_pedido` referenciavam as tabelas legadas; não há dependentes externos exigindo `CASCADE`. O smoke pós-DDL cobriu QR/comanda, estoque, venda e fechamento; `delete_account` passou com usuário sintético em transação e terminou em rollback.

- Validação do ZeloChat (2026-07-28): `npm run lint` e os testes direcionados de entitlement passaram. A suíte completa terminou com 1 falha preexistente e fora do diff desta tarefa em `tests/zelomenuSlug.test.ts`: o teste espera `/menu/:slug`, mas o runtime atual gera `/:slug`.

- Assinatura `d5625be9` (2026-07-28): auditoria de `billing_payments` mostrou último pagamento confirmado de R$89 (PDV + Mesas, sem Acessos), e a assinatura não tem `provider_subscription_id` ativo. A alteração manual sem evidência contratual foi corrigida: `has_acessos_addon=false`, `monthly_value_cents=22800` (bundle + Mesas, R$228), com registro em `admin_activity_logs`; nenhum histórico ou estorno foi alterado.

## Snapshot validado (2026-07-27)

- Módulo Pedidos + Cozinha aposentado (2026-07-28): o add-on legado saiu inteiro do código do ZeloPDV. `ADDONS.pedidos` e `allowsPedidos` foram removidos de `src/lib/pricing.js` e do espelho do Admin; `hasPedidosAddon` saiu de `guards.js` e o fallback `has_pedidos_addon` deixou de conceder `ordering_review`/`kitchen_queue` (D-099 encerrado). O runtime legado foi deletado: rotas `/app/pedidos/novo` e `/app/pedidos/[id]/editar`, os branches da tabela `pedidos` em `/app/pedidos` e `/app/pedidos/cozinha`, o breakdown "Pedidos (Cozinha)" dos relatórios e o unlink em `gestao/+page.svelte`. `/app/pedidos` e `/app/pedidos/cozinha` agora operam só o motor canônico `zelo_orders`. A remoção física das tabelas/colunas e o deploy cross-repo foram concluídos; o botão das Mesas está publicado via `source='mesa'` após deploy e soak.
  - **Cozinha virou exclusiva do ZeloMenu (2026-07-28, decisão de produto):** `hasKitchenQueueAccess` e o `kitchenQueueActive` da sidebar perderam o fallback por `has_mesas_addon` — a fila de preparo é alimentada só pelo motor canônico, então cliente só-Mesas deixa de ver o item Cozinha em vez de abrir uma tela sempre vazia. D-100 fica revogado nessa parte. Guardrail em `tests/guards.zelomenu.test.js` falha se `hasKitchenQueueAccess` e `hasOrderingReviewAccess` divergirem em silêncio.
  - **"Enviar pra cozinha" da comanda: publicado na fase 2 com `source='mesa'`.** O botão foi restaurado apontando para o motor canônico com guardas contra baixa dupla de estoque e cobrança dupla. `comanda_aplicar_delta_item` já decrementa `produtos.estoque_atual`/`categorias.estoque_compartilhado_atual` quando o item entra na comanda, então o endpoint envia `fulfillment.comandaItemId`; `transition_zelo_order` não baixa nem restaura esse estoque, e `ensure_zelo_order_sale`/`close_zelo_order` não criam venda para mesa. A rota QR pública e a comanda convergem no mesmo agregado, com DDL aplicada e smoke técnico pós-deploy aprovado.
  - Chaves de permissão `pedidos.*` foram **mantidas** de propósito (estão persistidas no JSON de `access_roles`; renomear apagaria a permissão de subusuários existentes). Só os rótulos mudaram. `pedidos.criar` saiu da matriz e do cargo Atendente porque a capacidade não existe mais.

- Homepage visual (2026-07-28): a landing foi refeita com a direção visual do pacote Zelinho, preservando a copy de conversão e os preços reais. O hero escuro agora usa o recorte transparente otimizado (`static/images/landing/zelinho-hero-transparent.webp`, 60 KB, com fallback SVG) sem o retângulo da arte original; o restante da página usa superfícies claras frias, screenshots reais do produto, três planos completos, FAQ e um único CTA principal. Header e footer compartilhados foram refinados com o logo original e menu mobile. QA em 360, 390, 768 e 1440 px ficou sem overflow ou erros de console; o detector Impeccable ficou limpo e `npm run check` passou com 0 erros / 96 avisos preexistentes.

- Refinamento da landing (2026-07-28): o hero agora escala em telas acima de 1600 px (shell de até 1536 px, headline de até 88 px e arte de até 896 px no QA de 1920 px), ganhou o caminho secundário "Ver o Zelo funcionando" e a seção do Zelinho virou uma demonstração clicável de pergunta → resposta → números → conclusão, sempre marcada como ilustrativa. Ações preenchidas usam `--marketing-action` para contraste de 5,93:1; o menu mobile fecha com Escape e trava o scroll de fundo; o rodapé passa a colapsar antes de 840 px para não cortar em 768 px. Playwright validou 360, 390, 768, 1440 e 1920 px sem overflow; `npm run check` segue em 0 erros / 96 avisos conhecidos.

- Homepage de conversão (2026-07-28): a home foi reescrita com promessa concreta, hero "Sua lanchonete vendeu bem. Mas sobrou dinheiro? O Zelo te mostra.", registro em 3 toques, lucro depois de aluguel/luz/retiradas, IA do Zelinho, operação offline, fiado digital e três configurações de preço reais (PDV R$59, PDV + Mesas R$89, PDV + ZeloMenu R$99). A `og:image` da home agora aponta para a miniatura desenhada `static/og-image-home.png`. Depoimentos e métricas de clientes não foram adicionados porque não há prova autorizada no repositório; a seção de confiança usa fatos verificáveis do produto. `npm run check` passou com 0 erros / 96 avisos, sendo os avisos conhecidos do projeto. `npm run build` compilou os bundles e continua bloqueado no adapter Vercel por `EPERM` de symlink neste clone Windows.

- Trial de 30 → 14 dias (2026-07-27): decisão de produto vinda de mentoria — em ticket baixo (R$59, dono de lanchonete) 30 dias é tempo demais para esquecer que instalou; o que converte é acompanhamento humano, não a duração do teste. A duração agora sai de `TRIAL_DAYS` em [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:1) e é lida por `start-trial` (trial local), `create-subscription` (`trial_period_days` do Stripe), `metaPixel`, `/perfil`, `GestaoSidebar` e `/assinatura`. **Assinaturas em andamento não foram encurtadas** — `current_period_end` é gravado na criação, então quem já está em trial mantém os 30 dias.

- Aviso de fim de trial disparando cedo demais na coorte legada (2026-07-27, corrigido): a sequência inteira era agendada por `daysSince` (idade da assinatura). Com o dia 13 passando a significar "encerra amanhã", uma conta de 30 dias receberia esse e-mail e o WhatsApp correspondente no **dia 13**, quando ainda faltavam 17 — anunciando um vencimento falso e empurrando pra cobrança quem tinha meio trial pela frente. As regras de agendamento saíram do handler para `src/lib/server/onboardingSchedule.js` (`+server.js` só exporta métodos HTTP, e essa é a parte que precisa de teste), com `END_ANCHORED_DAYS = {13}`: os dias de urgência disparam por `diasRestantes <= 1`, calculado de `current_period_end`/`manually_extended_until`, e não pela idade. Num trial de 14 dias o comportamento é idêntico; nas contas de 30 dias e nas estendidas à mão, o aviso passa a sair na véspera real. Coberto por 16 testes, incluindo varredura das idades 0 a 28 de uma conta legada.

- Trials em voo não foram encurtados, mas a UI quebrou (2026-07-27, corrigido): `TRIAL_DAYS` só é lido na criação da assinatura, então quem já estava em trial manteve o `current_period_end` de 30 dias e **ninguém perdeu acesso** — `isSubscriptionActiveStrict` e o cron `expire-trials` olham só a data, nunca a constante. O que quebrou foi a exibição: com 20 dias restantes, `GestaoSidebar` mostrava "Dia 1 de 14", a barra em `/perfil` travava em 0% e o gate `trialDaysLeft <= TRIAL_DAYS` em `/assinatura` escondia o aviso de fim de teste. Corrigido com `getTrialTotalDays(sub, fallback)` em `src/lib/subscriptionStatus.js`, que deriva a duração real de `created_at → current_period_end` (respeitando `manually_extended_until`) e só cai na constante para contas novas. As três telas passaram a buscar `created_at`. O gate de `/assinatura` perdeu o teto numérico: `trialing` já delimita o aviso.

- Nome da loja nas mensagens (2026-07-27): todos os templates recebiam `empresa_perfil.nome_exibicao` e faziam `.split(' ')[0]` tratando como primeiro nome, então "Lanchonete do Zé" virava "Oi, Lanchonete!" nos 6 e-mails e nas 3 mensagens de WhatsApp. As saudações agora tratam o valor como nome de loja ("A conta da Lanchonete do Zé já está ativa") e caem numa saudação sem nome quando o campo vem vazio. De quebra, o nome passou a ser escapado com `escapeHtml`: era entrada de usuário indo crua pro HTML do e-mail. Não existe campo com o nome da pessoa; adicionar um no onboarding continua sendo a correção de fundo.

- Oferta de configuração assistida no dia 0 (2026-07-27): a tese do mentor é que em ticket baixo quem converte é alguém sentando do lado, não a duração do trial. O convite de "a gente configura o sistema e cadastra seus produtos com você" agora sai já na criação da conta, no WhatsApp de boas-vindas (`enviarBoasVindasDetalhado`) e no `emailDay0`. Foi pros dois canais de propósito: o WhatsApp só dispara quando `empresa_perfil.contato` está preenchido e o ZeloChat configurado, então sem a versão por e-mail quem cadastra sem telefone não recebia convite nenhum. O `emailDay5` (antigo `emailDay25`) deixou de ser e-mail de urgência e virou segundo convite pra configurar junto, agora na primeira semana.

- Oferta de extensões condicional (2026-07-27): novo `emailDay9`, o primeiro template que pode devolver `null` para dizer "não faz sentido pra esta empresa". Duas travas: quem tem zero vendas registradas não recebe, e extensão já ativa não aparece; se não sobrar nada, o cron pula sem gravar log (assim a oferta ainda pode sair depois, dentro da janela de catch-up). Os sinais de uso (`produtos`, `vendas`, `access_users`) vêm de `fetchUsageSignals`, uma query por tabela contada em memória. `ADDONS.pedidos` fica fora por ser entitlement legado migrado pro ZeloMenu, e ZeloChat entra como troca de plano, não add-on. **Limite conhecido:** o banco não sabe distinguir hamburgueria de balcão de restaurante com salão, então Mesas e ZeloChat vão por auto-seleção do dono. Um campo de tipo de negócio no onboarding resolveria isso.

- Atribuição de aquisição (2026-07-27): antes disso só o canal de indicação era rastreável ponta a ponta; Google Ads, Meta, orgânico e comparativos não gravavam nada, e o `?origem=` dos links de `/contato` era descartado sem ninguém ler. Agora `src/lib/attribution/client.js` grava first-touch (utm_*, gclid, fbclid, `origem`, referrer reduzido a host+caminho, página de entrada) no localStorage, enviado em dois pontos: `user_metadata.acquisition` no signup, que cobre quem abandona antes do onboarding, e `empresa_perfil.origem_aquisicao` no fim do wizard, que é o que cruza com `subscriptions` por `user_id`. Migration `.ai/migrations/empresa_perfil_origem_aquisicao_2026_07_27.sql` **ainda não aplicada no banco real**. As consultas de canal e de MRR por origem estão no arquivo de verificação correspondente. Não há backfill possível: a origem dos clientes atuais não foi registrada em lugar nenhum.

- Cadência de onboarding remapeada (2026-07-27): `EMAIL_DAYS` foi de `[0,1,3,7,14,25,28]` para `[0,2,5,9,11,13]` e `WHATSAPP_DAYS` de `[0,7,28]` para `[0,7,13]`. Motivo estrutural: o cron só busca `status='trialing' AND current_period_end > now()`, então qualquer dia agendado além do fim do trial **nunca dispara** — com 14 dias, os e-mails 25/28 (oferta de call e último aviso, os dois de maior conversão) sumiriam em silêncio. Templates removidos: `emailDay7` (prova social/estoque) e `emailDay14`. Renomeados para casar com o dia real: `emailDay1→emailDay2`, `emailDay3→emailDay7`, `emailDay25→emailDay11`, `emailDay28→emailDay13`, `enviarFollowup28d*→enviarFollowupFinal*`. As colunas `whatsapp_followup_28d_sent_at` foram mantidas (nome legado, sem migration). Novo `MAX_CATCHUP_DAYS = 3` no cron impede que uma futura mudança de cadência despeje a sequência inteira na caixa de quem já está no meio do trial.

- Montagem do item e reimpressão manual (2026-07-27): `/app/pedidos` e `/app/pedidos/cozinha` agora exibem os grupos de modificadores do ZeloMenu (`zelo_order_items.modifiers`) abaixo do nome do produto, então itens montados como "Monte sua Massa" deixam de aparecer só pelo nome. O detalhe do pedido ganhou botão `Reimprimir`, que ignora de propósito o dedupe de 48h do auto-print (o caso de uso é a via que não saiu) e, ao imprimir, reserva o pedido no store para a reconciliação não gerar uma terceira via. A normalização virou `normalizeModifierGroups` / `itemModifierGroups` em `src/lib/onlineOrders.js`, compartilhada entre tela e bilhete. Testes direcionados: 12/12.

- Impressão automática de pedidos online (2026-07-27): `/app/pedidos` agora detecta pedidos canônicos novos, envia o bilhete textual completo ao Zelo Impressão, reconcilia perdas do Realtime via polling/retorno da aba e persiste o dedupe por 48h. Pedidos existentes no primeiro carregamento não são reimpressos; falhas liberam nova tentativa. Ver `src/lib/orderAutoPrint.js`, `src/lib/orderPrint.js`, `src/lib/printService.js` e `src/routes/app/pedidos/+page.svelte`.

- Validação da mudança de trial (2026-07-27): `npm test` em 425/427, com 40 testes novos entre `emailTemplates.extensoes`, `onboardingSchedule` e o bloco `getTrialTotalDays`. Antes da âncora no fim do trial, 409/411 com 24 testes novos entre `tests/emailTemplates.extensoes.test.js` e o bloco `getTrialTotalDays` em `tests/subscriptionStatus.test.js`. Antes das correções de UI e nome de loja, 401/403 com 12 testes novos em `tests/emailTemplates.extensoes.test.js` cobrindo as travas de fit e um guarda-corpo que falha se algum dia de `EMAIL_DAYS` cair fora de `TRIAL_DAYS` (exatamente o bug silencioso que motivou o remapeamento). Antes disso, `npm test` em 389/391 — as duas falhas continuam sendo as conhecidas de `api.create-subscription` (400 onde se espera 200), confirmadas como pré-existentes via `git stash` antes de tocar no código. `npm run check` em 0 erros / 96 avisos. `cd admin-dashboard && npm run build` passou. `npm run build` do app principal compilou os dois bundles e parou no adapter Vercel por `EPERM` de symlink (limitação conhecida deste clone Windows). `cd admin-dashboard && npm run check` segue quebrado pela ausência pré-existente de `jsconfig.json`.

- Validação desta sessão (2026-07-27): testes direcionados de pedidos/impressão passaram (11/11) e `npm run check` passou com 0 erros / 96 avisos. A suíte completa ficou em 388/390: as duas falhas conhecidas de `api.create-subscription` continuam retornando 400 onde os testes esperam 200; não têm relação com esta alteração. `npm run build` compilou os bundles, mas continua bloqueado no adapter Vercel por `EPERM` ao criar symlink local, limitação já conhecida deste clone.

- Precos no ZeloAdmin (2026-07-24): a edicao de plano manual/Abacate Pay agora grava `monthly_value_cents` junto com plano e add-ons; o catalogo do Admin foi alinhado ao catalogo canonico, tratando ZeloMenu como R$40 no ZeloPDV e Pedidos como legado incluido no ZeloMenu. O pacote Gestao + Atendimento permanece R$198, sem somar R$30 de Pedidos. A sincronizacao Stripe tambem atualiza o valor mensal persistido. Teste direcionado de pricing passou e `cd admin-dashboard && npm run build` passou com warnings pre-existentes.
- ZeloAdmin zerado (2026-07-24): o deploy de 2026-07-22 passou a selecionar `subscriptions.monthly_value_cents`, mas a migration `.ai/migrations/subscriptions_monthly_value_cents_2026_07_22.sql` ainda nao havia sido aplicada no Supabase real. O PostgREST rejeitava a consulta e as telas tratavam o erro como array vazio, zerando Dashboard, Assinaturas e Usuarios sem perda de dados. A migration aditiva foi aplicada no projeto real `xnnjyrblpvsqrtsshawa`; validacao encontrou 18 assinaturas (5 `active`, 7 `trialing`, 5 `trial_expired`, 1 `canceled`). O select do Dashboard tambem passou a incluir `has_pedidos_addon`, evitando subcontagem do MRR quando o valor real ainda esta nulo. `monthly_value_cents` continua nulo nas linhas antigas e o admin usa fallback pelo preco do plano ate o backfill. `cd admin-dashboard && npm run build` passou; `npm run check` continua bloqueado pela ausencia pre-existente de `admin-dashboard/jsconfig.json`; permanecem tambem warnings pre-existentes de a11y/Vite/Svelte.

- Dashboard de Gestão (2026-07-17): decisão de produto — o dashboard (`src/routes/gestao/+page.svelte`) reflete a **sessão do caixa atual**, não o dia de calendário. Motivo: negócios que atravessam a meia-noite (bar, lanchonete) precisam ver a noite inteira num único caixa; cortar por data zeraria os números às 00h. Os números sempre foram do caixa; o bug era só semântico (rótulos diziam "Hoje"). Roupagem corrigida: "Vendas Hoje" → "Vendas do Caixa" ("N cupons no caixa atual"), gráfico "Vendas por Hora (Caixa Atual)", tooltip nos cards de Vendas/Caixa com "aberto desde dd/mm às hh:mm · Xh ativo", link "Ver relatório completo" → `/relatorios` na Atividade Recente e action "Fechar caixa" → `/gestao/caixa` no alerta de caixa aberto há +10h. `npm run check` em 0 erros. Commit `f057edc` na `main` (push direto autorizado).

- Copy e moeda em Produtos (2026-07-17): a opcao "Venda por unidade" foi renomeada para "Venda em atacado" nos fluxos de criacao/edicao. Os campos de preco do modal de novo produto agora exibem o prefixo visual `R$` sem alterar o valor numerico enviado ao formulario. `npm run check` segue em 0 erros / 94 avisos.

- Precos na edicao de Produtos (2026-07-17): os campos de preco do editor inline desktop e do editor em card mobile agora exibem o prefixo visual `R$`, incluindo as tabelas de preco opcionais, sem alterar o valor numerico persistido.

- Acoes duplicadas em Produtos (2026-07-17): o bloco legado com quatro botoes no lado direito do cabecalho foi removido. O novo conjunto `Novo produto` + `Acoes` agora e o unico grupo global visivel e permanece alinhado a direita no desktop; no mobile, os atalhos continuam no fluxo do FAB.

- Triggers de categoria em Produtos (2026-07-17): os formularios deixaram de depender do label interno do Bits UI para renderizar o valor selecionado. Os triggers agora resolvem diretamente o nome da categoria/subcategoria pelo catalogo carregado, evitando que o ID apareca ao editar ou apos selecionar um novo produto. `npm run check` segue em 0 erros / 94 avisos.

- Labels dos selects de Produtos (2026-07-17): categorias e subcategorias nos formularios de criacao/edicao agora usam IDs string na camada do Bits UI para resolver corretamente o label visivel; inserts/updates convertem os IDs de volta para numero antes de persistir. `npm run check` segue em 0 erros / 94 avisos.

- Selects em modais (2026-07-17): o `Select.Content` compartilhado agora usa `z-[300]`, acima do backdrop dos modais de criacao (`z-index: 200`). Isso corrige os dropdowns de categoria/subcategoria nos modais de categoria, subcategoria e produto sem duplicar ajustes por rota.

- Produtos (2026-07-16): a rota `src/routes/gestao/produtos/+page.svelte` foi alinhada ao layout de referencia no desktop e mobile. Desktop ganhou acoes globais com "Novo produto" e menu de acoes; mobile usa filtros compactos, chips de categoria/subcategoria, cards de produto e um FAB de `+` com drop-up animado para criar categoria, subcategoria ou produto. O hamburger e o Zelinho existentes foram preservados e nenhum bottom nav foi adicionado. `npm run check` terminou com 0 erros / 94 avisos; `npm test` ficou em 367/369, com as duas falhas conhecidas de `api.create-subscription`. A validacao visual automatizada ficou pendente porque o navegador embutido nao iniciou nesta sessao.

- Fichario — exclusao de pagamento (2026-07-16): recebimentos exibem um botao X alinhado a direita do valor/saldo. A confirmacao usa um modal nativo do ZeloPDV e chama a RPC `fiado_excluir_pagamento`, que remove o lancamento e a movimentacao de caixa vinculada atomicamente e devolve o valor ao saldo da pessoa. A migration do ledger foi validada no banco real em 2026-07-30.

- Fichário (2026-07-16): a página foi reorganizada em um workspace de três camadas no desktop, com lista de pessoas, ficha ativa e extrato/recebimento no mesmo quadro. Em telas pequenas, a seleção virou um fluxo em duas telas: pessoas primeiro e ficha da pessoa depois, com voltar, ações de pagamento/cobrança e bottom sheets de recebimento/cobrança. A rota mantém a lógica do razão `fiado_lancamentos` e a leitura opcional de `?p=<id>`; `npm run check` segue em 0 errors / 93 warnings pré-existentes. A validação visual automatizada ficou pendente nesta sessão porque o navegador embutido falhou ao iniciar. `npm test` ficou em 367/369, com as duas falhas já conhecidas de `api.create-subscription` (400 onde os testes esperam 200).

- Fiado auditável (2026-07-15): implementados localmente o razão `fiado_lancamentos`, RPCs atômicas de recebimento/estorno, backfill por saldo inicial, fichário pesquisável e responsivo, situação de crédito em Pessoas e nomes no resumo de fechamento. A migration do ledger foi validada no banco real em 2026-07-30. Validação local histórica: 41 testes financeiros direcionados passaram; `npm run check` terminou com 0 errors / 93 warnings pré-existentes; `npm run build` compilou os bundles, mas parou no adapter Vercel por `EPERM` ao criar symlink em `.vercel/output` (limitação local já observada).

- Relatórios — vendas do caixa (2026-07-15): produtos vendidos agora deixam explícito que são um resumo agrupado; vendas do caixa são cupons individuais. O antigo tooltip de itens/cliente dentro de um contêiner rolável foi substituído por detalhes expansíveis, operáveis por mouse, teclado e toque, sem conteúdo essencial depender de hover ou scroll lateral. Rotas com sidebar agora bypassam a shell de viewport do layout raiz. Em telas pequenas, Relatórios usa a rolagem natural do documento; no desktop, a rolagem interna é contida no painel para não vazar ao documento externo e revelar área vazia. O encerramento sem movimentações ocupa o espaço restante como estado vazio explícito. A workspace declara `--text-main` como cor-base, impedindo textos pretos herdados sobre o fundo navy.

- Contraste das áreas autenticadas (2026-07-15): as shells de Gestão, PDV, Ferramentas, Perfil e Assinatura agora declaram `--text-main` junto de `--bg-app`. Isso impede que conteúdo sem cor explícita herde preto quando o layout raiz é bypassado; a varredura também removeu utilitários de texto escuro remanescentes no Dashboard e no Fechar Caixa.

- Selects (2026-07-15): o wrapper compartilhado deixou de passar um slot vazio ao `bits-ui`, que anulava o placeholder nativo, e agora repassa o `label` de cada item ao primitive. Filtros e formulários exibem o placeholder até uma opção ser escolhida e, depois, mostram o nome legível em vez do ID interno.

- Pos-publicacao do Zelinho (2026-07-13): o CTA de contexto usa botao nativo (o wrapper Svelte 5 descartava eventos), o refresh do Gerente aguarda a requisicao mais recente e o chat inicial usa tres icebreakers clicaveis que preenchem o input. Commit enviado ao `main` para o deploy automatico da Vercel; nenhuma publicacao direta foi mantida.

- Branch: `main`
- HEAD inspecionado: `acc90cc` — `fix(caixa): impedir abertura duplicada + fechar orfaos`
- **Audit de design system concluído (2026-07-13):** auditoria impecable em 5 superfícies (PDV, marketing, auth+billing, gestão, admin-dashboard). Health score médio 13.8/20. 14 correções aplicadas (P0-P3): touch targets 44px no carrinho PDV, purple/indigo substituídos por sky-500, glassmorphism do card auth removido, tabular-nums global, tokens CSS em auth pages, shadows do assinatura capadas, numbered markers substituídos por ícones, aria-labels em toggles de senha, polling de pedidos reduzido (3s→30s), guardrail de cancelamento no admin. Detalhes em [[docs/projects/impeccable-audit-2026-07.md]]
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Auditoria UX do Zelinho contextual (2026-07-13): o drawer fechado agora fica `inert`, o foco retorna ao trilho ao fechar e o contexto de tela invalida ao mudar pathname, query ou entidade. Em mobile o painel usa semântica de dialog, foco fica preso no painel e todos os controles principais têm alvo mínimo de 44px. O contraste do cabeçalho usa tokens de tema, a reserva do workspace não anima padding e o motion de digitação/indicador crítico respeita `prefers-reduced-motion`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

## Validação executada nesta sessão

- Branch: `main`
- HEAD inspecionado: `e01d908` — `feat(seo): páginas comparativas vs concorrentes + hub + sitemap dinâmico`
- **Sprint concluída:** marketing redesign 2026-06 — ver [[docs/projects/marketing-redesign-2026-06.md]] para o brief completo. Cover: home hero, 2 templates compartilhados (SegmentLandingPage + CompetitorComparison), pricing section, data files, audit visual.
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

## Validação executada nesta sessão

- Motor canônico de pedidos online (2026-07-12): migration aditiva `.ai/migrations/canonical_online_orders_2026_07_12.sql` criada, mas **não aplicada em produção**. Inclui pedido/itens/eventos/outbox, RLS/grants, criação idempotente ligada atomicamente à sessão ZeloMenu, transições com revisão, fechamento financeiro e backfill não destrutivo das fontes legadas. O cutover e a auditoria no banco real continuam pendentes.

- Zelinho Gerente (2026-07-12): briefing/feed, badge/sidebar, chat contextual owner-scoped, relatório semanal, preferências e digest WhatsApp foram implementados. As migrations de engine, narrativa e preferências estão aplicadas e auditadas no Supabase real. O digest é protegido por `CRON_SECRET`, kill switch e idempotência diária. O chat contextual usa "resultado operacional aproximado" com a nota obrigatória de que não inclui o custo dos produtos; o servidor normaliza a saída do modelo para manter essa copy e o teste do endpoint cobre a rejeição de `signal_id` de outro tenant para subusuário. Em 2026-07-13, o contexto do chat passou a incluir todas as vendas/itens paginados dos últimos 30 dias, categorias reais, estoque individual ou compartilhado correto e mix de pagamentos; a classificação histórica por categoria é explicitamente baseada no catálogo atual.
- Zelinho contextual (2026-07-13): o antigo atalho lateral foi substituído por um trilho persistente. Em desktop amplo, o painel reserva 24rem do workspace; em largura intermediária, abre como sheet explícito; no mobile, ocupa a tela inteira. O contexto de um sinal agora define o foco da conversa e o cabeçalho expõe o contexto ativo. O resumo semanal e a edição de produto abrem o chat com IDs mínimos; o servidor reconsulta snapshots/produto pelo owner antes de injetar os dados. Para perguntas amplas como "salgados por venda", o servidor também agrega categorias reais com termo comum e declara as categorias incluídas.
- Validação do Zelinho contextual (2026-07-13): os 31 testes focados de chat/contexto/gerente passaram e `npm run check` terminou com 0 errors / 108 warnings. O painel fechado usa `inert`, devolve foco ao trilho e limpa contexto ao fechar ou trocar de rota. A suíte completa (`npm test`) está vermelha somente em dois testes de `api.create-subscription` que retornam 400 onde esperam 200; a fatia não toca billing e esse desvio precisa de investigação separada antes de declarar a branch totalmente verde.
- Pós-auditoria Impeccable do Zelinho (2026-07-13): a evidência exibida nos sinais agora inclui folhas aninhadas do contrato real, sinais silenciados continuam visíveis mas colapsados, semanas inválidas/futuras são normalizadas e falhas de leitura restauram o estado otimista. Os 31 testes focados passaram; `npm run check` está em 0 errors / 108 warnings; o detector scoped não encontrou achados não-advisory (os avisos restantes são somente tamanhos tipográficos explícitos).
- E2E autenticado do Zelinho (2026-07-13): no build local, o fluxo foi validado em desktop 1440px e mobile 393px: rail visível, drawer com foco automático, `dialog`/`aria-modal` e tela cheia no mobile, fechamento por Escape com foco devolvido ao rail. O setup Playwright completo ficou bloqueado porque este clone não tem `SUPABASE_SERVICE_ROLE_KEY` para semear subusuários; a execução isolada encontrou apenas 500 de infraestrutura em `/api/access/audit-login` e `/api/referrals/claim`. A produção atual ainda mostra o deploy antigo com o atalho `Parceiro IA`; publicar este working tree continua pendente.
- Rollout Zelinho (2026-07-12): `INTELLIGENCE_ENGINE_ENABLED=true` está configurado em Production. O piloto foi habilitado para Casa dos Salgados (`dc7eea7a-892f-418b-ae80-f3bd46ecc640`) e Donutopia (`d5625be9-abef-4371-a8e7-e915220aec42`). A execução manual para 2026-07-11 processou as duas empresas sem falhas, gerou quatro sinais e confirmou os snapshots contra as vendas-fonte: Casa dos Salgados R$ 868,00/24 vendas e Donutopia R$ 40,70/1 venda. A conta Vercel é Hobby e recusou cron horário; o digest usa o fallback no cron diário e a preferência de horário saiu da V1.
- Registro histórico (2026-07-12) da validação local do Zelinho: 18 testes direcionados passaram; `npm run check` estava em 0 errors / 111 warnings. O `npm run build` local chegou à adaptação Vercel, mas parou em `EPERM` ao criar symlink dentro de `.vercel/output`; o deploy remoto `dpl_5jVPRMZgqQ7sz54y7pC27G2tLBhk` compilou e está `Ready` em Production. As pendências operacionais de aceite continuam acompanhadas acima.

- Zelo Intelligence Engine V1 (2026-07-12, commits `0b7bbdf` + `9958268`): motor determinístico, cron `GET /api/cron/intelligence-daily` (vercel `4 6 * * *`) e migration `.ai/migrations/intelligence_engine_v1_2026_07_10.sql` estão versionados. A migration foi aplicada e auditada no Supabase real: RLS ativo nas três tabelas, policies owner-scoped para snapshots/sinais e grant de `UPDATE` do run log para service role. A Fase 1 também está aplicada: templates determinísticos para os 11 sinais, LLM opcional com fallback e uso/custo no run log; `.ai/migrations/intelligence_narratives_2026_07_12.sql` ampliou `ai_usage_logs_chat_type_check` para `intelligence` e foi verificada no banco. O primeiro processamento do piloto foi conferido contra os dados-fonte; permanecem a observação de três dias e o E2E autenticado.

- Supabase CLI conectado (2026-07-06): CLI v2.109.0 instalado como devDependency (`npx supabase`), logado e linkado ao projeto `xnnjyrblpvsqrtsshawa` (ZeloPDV). Migrations agora podem ser aplicadas via `npx supabase db query --file <sql> --linked`. Estado do link fica em `supabase/.temp/` (gitignored).

- Seguranca RLS (2026-07-06): advisor apontou 7 tabelas em `public` sem RLS e com grants completos para anon/authenticated. `billing_webhook_events` (deste repo, so acessada via service role) foi corrigida em producao: RLS ligado + grants revogados (`.ai/migrations/billing_webhook_events_enable_rls_2026_07_06.sql`, aplicada e verificada). As outras 6 (`leads`, `lead_events`, `outreach_messages`, `approvals`, `agent_runs`, `suppression_list`) eram de um bot antigo de captacao de leads sem consumidor ativo (confirmado pelo dono) e foram fechadas do mesmo jeito em 2026-07-06 (`.ai/migrations/leadbot_tables_enable_rls_2026_07_06.sql`, aplicada e verificada: RLS on nas 6, zero grants anon/authenticated, dados preservados). P0 resolvido — detalhe e follow-up (dropar tabelas do bot, LGPD) em [[CODE_REVIEW]].

- Caixa duplicado/orfao (2026-07-06): corrigida a abertura de dois caixas simultaneos que deixava o mais antigo "orfao" (aberto para sempre, invisivel no PDV e no fechamento). Invariante agora garantida no banco por indice unico parcial (`.ai/migrations/caixas_one_open_per_user_2026_07_06.sql`, que tambem fecha orfaos existentes — **aplicada no Supabase real em 2026-07-06** via CLI linkado; saneamento foi no-op pois nao havia orfao ativo no momento, e insert duplicado testado retornou 23505 como esperado) e no client por `abrirCaixaIdempotente` em `src/lib/finance/caixaOps.js` (adota caixa existente em corrida 23505). `ModalAbrirCaixa` nao trava mais em "Abrindo..." apos falha. Detalhes em INC-2026-07-06-01. Validacao: `npx vitest run tests/finance.caixaOps.test.js` 6/6, `npm test` 213/214 (unica falha: `zelomenuPublicationSchema` pre-existente, sem relacao), `npm run check` 0 errors / 110 warnings.

- Despesas (2026-07-01): corrigido falso sucesso ao lancar despesa em `src/routes/gestao/despesas/+page.svelte`. Causa: conversao de `YYYY-MM-DD` via `new Date(...).toISOString()` deslocava a data para UTC e, em inicio de mes no fuso BR, a despesa ficava fora do filtro mensal apesar do toast "Despesa lancada!". O fluxo agora usa datas locais inclusivas, exige retorno da linha em insert/update/delete e exibe erro real quando Supabase/configuracao/sessao/periodo/operacao falham. Cobertura: `tests/dateRange.test.js`; validacao: `npx vitest run tests/dateRange.test.js` 3/3, `npm run check` 0 errors / 110 warnings.

- Produtos mobile refactor (2026-06-24): `src/routes/gestao/produtos/+page.svelte` deixou de comprimir árvore + tabela no viewport pequeno e ganhou cabeçalho de ações em grade, categorias/subcategorias em trilha horizontal, busca/filtros com alvos de toque e cards mobile para listagem/edição de produtos. Desktop preserva a tabela/árvore existentes. Validação: `npm run check` — 0 errors / 105 warnings; `npm run build` — sucesso com warnings pré-existentes de Svelte/PWA/dependências opcionais. Validação visual autenticada não foi possível na sessão local porque `/gestao/produtos` redireciona para `/login` sem sessão.
- Produtos → ZeloMenu bulk publish (2026-06-24): `src/routes/gestao/produtos/+page.svelte` ganhou a ação em lote **Publicar no menu**, visível somente quando `hasZeloMenuAccess` confirma o entitlement e revalidada no clique antes da escrita. O helper canônico `src/lib/zelomenuPublications.js` faz upsert owner-scoped em `zelomenu_product_publications`, ativa `visivel_online`, remove pausa manual e preserva falhas selecionadas quando apenas parte dos lotes conclui. Cobertura direcionada: `tests/guards.zelomenu.test.js`, `tests/zelomenuPublications.test.js` e `tests/zelomenuPublicationSchema.test.js` — 11/11; suíte completa `npm test` — 177/177; `npm run check` — 0 errors / 106 warnings; `npm run build` — sucesso com warnings pré-existentes de Svelte/PWA/dependências opcionais.
- ZeloMenu entitlement + slug + pricing (2026-06-23): migration `.ai/migrations/zelomenu_entitlement_and_slug_2026_06_23.sql` aplicada no Supabase real — adiciona `subscriptions.has_zelo_menu` (backfill chat/bundle→true, pdv→false), `empresa_perfil.zelomenu_slug` (único quando não-nulo) e a coluna na view `user_entitlements`. `src/lib/pricing.js`: ZeloChat R$147 / bundle R$197 (price IDs v2) + novo addon `menu` R$40, **billing-safe** (price IDs v1 legados mantidos no reverse-lookup `STRIPE_PRICE_TO_PLAN` para não quebrar assinantes atuais). Novos guards em `src/lib/guards.js`: `hasZeloMenuAccess`/`hasOrderingReviewAccess`/`hasKitchenQueueAccess`. Webhook (`src/routes/api/billing/webhook/+server.js`) passa a gravar `has_zelo_menu`. Admin `admin-dashboard/.../subscriptions` ganhou toggle ZeloMenu. Prices Stripe LIVE criados via API (chat v2 `price_1TlbH2LUJWyE4PkYSqFSXXVY`, bundle v2 `price_1TlbH2LUJWyE4PkYlS4IxMhs`, menu `price_1TlbH4LUJWyE4PkYX0kdJhAw`). Validação: `npx vitest run tests/pricing.acessos.test.js` 10/10 (inclui legacy-mapping + pdv+menu=99). Pendente: migrar assinatura do Agreste pro v2 com aviso (D-104); CS grandfathered (D-017).
- ZeloMenu schema (2026-06-23): migration `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` aplicada no Supabase real como `zelomenu_publication_schema_2026_06_23`, criando a camada PDV-owned de publicação do ZeloMenu (`zelomenu_product_publications`) e modificadores por produto (`zelomenu_modifier_groups`, `zelomenu_modifier_options`). A visibilidade online fica separada de `produtos.ocultar_no_pdv`; preço base continua em `produtos.preco`; opções usam `price_delta`. Verificado: RLS ligado nas 3 tabelas, 4 policies por tabela, grants mínimos para `authenticated`/`service_role`, nenhum grant para `anon`, constraints/FKs/índices presentes e chave pública bloqueada para acesso anônimo. Validação local: `npm test -- tests/zelomenuPublicationSchema.test.js` — 5/5.
- Rollout Supabase ZeloMenu concluído (2026-06-23): `trial_expired_status_2026_06_17` foi aplicado/registrado no Supabase real; auditoria prévia mostrou 0 assinaturas locais vencidas ainda em `trialing`. O hardening ZeloChat, a estrutura de `zelomenu_cart_sessions`/`zelomenu_cart_tokens`, as policies/grants finais do carrinho e a migration PDV-owned `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` também foram aplicados. Advisors Supabase rodados; não houve alerta novo específico da segurança/RLS das tabelas ZeloMenu.
- Billing/admin (2026-06-17): trial grátis local vencido agora tem status persistente próprio `trial_expired`; `past_due` fica reservado para inadimplência/falha de cobrança. Correção inclui migration do constraint/backfill, cron Vercel `/api/cron/expire-trials`, helper canônico de status, guards/endpoints de billing e Acessos usando validade por data, admin `/subscriptions`/`/users`/`/analytics` com status operacional e copy de trial expirado no app. Migration `.ai/migrations/trial_expired_status_2026_06_17.sql` aplicada/registrada no Supabase real em 2026-06-23; auditoria prévia mostrou 0 assinaturas locais vencidas ainda em `trialing`, então não houve backfill visível nesta rodada. Validação original: `npm test` 161/161, `npm run check` 0 errors / 106 warnings, `npm run build` ok, `cd admin-dashboard && npm run build` ok; `cd admin-dashboard && npm run check` continua quebrado por `./jsconfig.json` ausente (pré-existente).
- Marketing analytics (2026-06-14): PostHog instalado para heatmap/autocapture anonimo apenas em rotas externas permitidas (`/`, `/para-*`, `/vs-*`, `/blog/*`, `/cadastro`, `/login`, `/contato`, etc.). Bloqueado em `/app`, `/gestao`, `/relatorios`, `/perfil`, `/assinatura`, `/ferramentas` e `/auth/callback`; session recording fica desabilitado no client. Requer `PUBLIC_POSTHOG_KEY` no ambiente para ativar. Validado com `tests/posthogClient.test.js`.
- Auth/onboarding (2026-06-14): `/cadastro` deixou de exigir confirmação por e-mail. `POST /api/auth/signup` agora cria usuário confirmado via service role (`email_confirm: true`), faz login server-side com senha e devolve sessão; o cliente grava a sessão Supabase, preserva/reforça referral, dispara `sign_up`/Google Ads e manda direto para `/perfil?msg=complete` (OnboardingWizard). Requer `SUPABASE_SERVICE_ROLE_KEY` no servidor.
- Validação auth/onboarding + analytics (2026-06-14): `npm test -- tests/api.auth-signup.test.js tests/api.auth-login.test.js` — **4/4**; `npm test -- tests/posthogClient.test.js` — **2/2**; `npm run check` — **0 errors / 106 warnings**; `npm test` — **153/153**; `npm run build` — **sucesso** com warnings pré-existentes do Svelte/PWA/adapter.
- `npm run check` — **0 errors / 104 warnings** (redução de 112 pra 104 com a limpeza de CSS morto e inline SVGs)
- `npm run build` — **sucesso**
- `npm test` — **149/149** testes passando
- **Marketing redesign 2026-06** — sprint completa, ver docs/projects/marketing-redesign-2026-06.md:
  - Home hero convertido pra conversa Zelinho (2-col, chat mockup, voz operador, 1 glow, sem gradient)
  - `/vs-*` pivotado pra editorial-dossier (tese, fontes no topo, CTA invertido)
  - Eyebrow trope removido dos 2 templates (SegmentLandingPage + CompetitorComparison)
  - Decoração removida: 8 glows → 1, Easter banner → pill, gradient/conic keyframes deletados
  - Copy em voz operador (zero "sem enrolação", "solução integrada", "plataforma completa")
  - MarketingPriceSection sem animate-border, checkmarks sky, border estática
  - 3 hero archetypes distintos (home chat / segment numbered / competitor editorial)
  - Hex hardcoded → tokens CSS, inline SVGs → lucide-svelte, :root override removido do precificacao
  - Re-critique: **23/40 → 29/40 (+6)**
- `cd admin-dashboard && npm run build` — build concluiu.
- `cd admin-dashboard && npm run check` — falha de script/config (pré-existente, sem regressão).
- Admin: aba `/communications` agora suporta disparo individual e em lote de email via Resend e WhatsApp via ZeloChat interno, com placeholders clicáveis no composer e filtros por origem (`ZeloPDV`, `ZeloChat`, `Ambos`); validação local segue por `cd admin-dashboard && npm run build` porque `npm run check` continua quebrado por config legada.
- Ads/marketing: nova rota pública `/contato` com formulário interno de lead para sitelinks sem saída para domínio externo; `npm run check` manteve **0 errors / 133 warnings** e `npm run build` concluiu com warnings pré-existentes/adapter.
- Marketing: `/vs-planilha` agora usa layout full-width de página pública; CTAs de conversa em home, segmentos, extensões, precificação e comparação abrem o chatbot público sem alterar os botões de teste grátis para `/cadastro`. Rodapé mantém WhatsApp e adiciona link interno de demonstração para `/contato?assunto=demo`.
- SEO/marketing (2026-06-09): 12 páginas comparativas `/vs-<concorrente>` (saipos, goomer, anota-ai, whatsmenu, cardapio-web, yooga, sisfood, conta-azul, gestaoclick, bling, tiny, omie) — fundo de funil, data-driven em `src/lib/data/competitorComparisons.js` + template `src/lib/components/marketing/CompetitorComparison.svelte` (mesmo padrão de `SegmentLandingPage`). Conteúdo com preços datados ("a partir de", jun/2026), reclamações sempre atribuídas a terceiros (Reclame Aqui) e bloco "sendo justo" para E-E-A-T/proteção jurídica — regras no topo do data file. **Sitemap agora é dinâmico**: `src/routes/sitemap.xml/+server.js` (prerender) monta URLs a partir dos data files; o antigo `static/sitemap.xml` foi removido — não recriar à mão. Pendente: linkar internamente as páginas (hoje só no sitemap) e validar claims offline/Pix no navegador antes de divulgar. `npm run check` 0 errors; `npm run build` ok.
- Marketing/docs (2026-06-09): `docs/DESIGN_PATTERNS.md` agora cobre explicitamente páginas públicas/landings. `MarketingFooter.svelte` foi alinhado ao rodapé canônico da home e a home passou a reutilizar o componente compartilhado; links `Funcionalidades`/`Preços`/`Central de Ajuda` no footer agora resolvem para `/#...` fora da home, em vez de apontar para âncoras inexistentes na rota atual.
- Ads/tracking + landing (2026-06-12) — saída da auditoria `/ads` (tracking 28/100, LP 58/100; campanha Search pausada teve 34 cliques / 0 conversões registradas):
  - **Prova social fabricada removida das 4 segment pages** (`segmentLandingPages.js`): depoimentos fictícios + `aggregateRating 4.9/38` saíram do JSON-LD (risco de política de misrepresentation do Google Ads em final URLs). A seção de depoimento do `SegmentLandingPage.svelte` virou a seção honesta "Sem pegadinha" da home.
  - **Conversão antecipada do Google Ads**: `trackGoogleAdsInscricao` agora dispara no sucesso do `/cadastro` e no callback OAuth (antes só no fim do OnboardingWizard, 3 sessões depois do clique — por isso 0 conversões). Dedup por `transaction_id` (user id) + sessionStorage; refire no wizard/assinatura conta uma vez só.
  - **Enhanced Conversions**: e-mail hasheado (SHA-256 client-side) vai em `user_data` na conversão de inscrição. ⚠️ Exige habilitar Enhanced Conversions na conversão dentro do Google Ads (passo manual na conta).
  - **GA4 funnel events**: `sign_up` (cadastro/OAuth) e `begin_trial` (wizard/assinatura) — habilita import de conversões GA4 no Google Ads como backup.
  - **Consent Mode V2 default granted** em `app.html` (LGPD/BR sem banner; pronto pra `consent update` futuro).
  - `/cadastro`: subtítulo agora promete o trial ("30 dias, sem cartão"), campo "Confirmar senha" removido, `autocomplete` adicionado, linha de reasseguramento sob o botão.
  - `<title>` duplicado no SSR corrigido: título estático saiu do `app.html` e do root layout; fallback dinâmico via `afterNavigate` pra rotas internas sem título; `AuthLayout` define título próprio.
  - **Nova landing `/para-restaurantes`** (segmento + rota + card na home + sitemap automático) — query "sistema para restaurante" caía na home toda framada pra lanchonete. Header de segment pages agora usa âncoras locais (`localAnchors` no `SiteHeader`) em vez de vazar pra home.
  - Logo: `logo-horizontal.webp` 13,6 KB substitui o PNG de 123 KB nos componentes (PNG mantido em `static/` pro JSON-LD do blog).
  - Validação: `npm run check` 0 errors / 106 warnings, `npm test` 149/149, `npm run build` ok.
  - **Pendências manuais (conta Google Ads / deploy):** habilitar Enhanced Conversions na conversão de inscrição; confirmar `SUPABASE_SERVICE_ROLE_KEY` no ambiente de produção para o cadastro automático; reativar a campanha pausada depois do deploy.

## Falhas abertas confirmadas

- Nenhuma na suíte principal após alinhamento das fixtures ao contrato atual de perfil, CPF/CNPJ e telefone.

## Drifts e riscos ativos

- Controle de Acessos hoje faz enforcement fino majoritariamente no cliente; o servidor/RLS escopa dados por `owner_user_id`, mas não aplica o JSON de permissões como barreira forte em todas as rotas ([[CODE_REVIEW]]).
- `AdminLock`/`pin_admin` agora valida o valor em `/api/auth/admin-pin`; o browser recebe somente status de configuração ([[CODE_REVIEW]]).
- O Supabase real tem `delete_account()` e a fonte do ZeloChat contém o sweeper externo; deploy/monitoramento desse processo ainda precisam de confirmação operacional ([[CODE_REVIEW]]).
- `admin-dashboard/` usa anon key e continua sendo uma superfície de defesa em profundidade; as tabelas administrativas relevantes têm RLS ativo em produção ([[CODE_REVIEW]]).
- O webhook Pix falha fechado sem `ABACATEPAY_PUBLIC_KEY`; não há fallback hardcoded no runtime atual ([[CODE_REVIEW]]).

## Hotspots que pedem cautela

- `src/routes/app/mesas/[id]/+page.svelte` — maior superfície operacional do repo
- `src/routes/assinatura/+page.svelte` — billing UX e Pix
- `src/routes/perfil/+page.svelte` — perfil, add-ons, impressão, deleção
- `src/routes/app/+page.svelte` — frente de caixa e replay offline
- `admin-dashboard/src/routes/subscriptions/+page.svelte` — operação manual de assinatura

## Mudanças recentes visíveis no histórico Git

- **Marketing redesign sprint (2026-06-10)**: home hero Zelinho-conversação, `/vs-*` editorial-dossier, eyebrow trope removido, copy em voz operador, decoração silenciada, pricing section endurecida, 3 archetypes de hero, token drift corrigido, inline SVGs migrados. Brief completo em `docs/projects/marketing-redesign-2026-06.md`. Score do critique: **23 → 29/40**.

- Admin dashboard `/users`: avatar da tabela principal trocado por checkbox canônico de seleção, nova aba `Inativo`, barra de ação em lote mais compacta e exclusão em lote restrita a contas sem assinatura.
- Novo guia vivo do admin em `docs/admin/DESIGN_PATTERNS.md` para registrar preferências de UI/UX operacionais do painel.
- Admin dashboard `/communications`: aba operacional para comunicação individual e em lote com usuários, com envio server-side por `/api/admin/communications/send`, placeholders (`{{primeiro_nome}}`, `{{link_login}}`, etc.), filtros por origem de produto e WhatsApp saindo do número Techne `5514991537503`.
- Rota pública `/contato` para campanhas Google Ads: variações por `assunto`/`utm_content`, formulário interno de lead via Resend e entrada no sitemap.
- Robustez offline do PDV: gate de assinatura tolerante a queda de rede (snapshot de entitlement, carência de 7 dias), leitura offline-first de catálogo/categorias/subcategorias (Dexie v5), retry periódico de sync + badge de pendentes. Ver [[docs/operations/OFFLINE]] e [[TRADEOFFS]] (TA-OFF-01/02).
- Grace period de 14 dias para deleção de conta + reativação.
- Correção dos detalhes de plano na aba de perfil.
- Fluxo self-service de exclusão de conta.
- Extensão manual de assinatura por data final no admin.
- CORS global para API admin.
- Logging de atividade admin no servidor.

## Planejamento cross-produto

- ZeloMenu/ZeloChat/ZeloPDV: decisões completas e backlog por fases em [[docs/projects/zelomenu-linear-plan.md]]. Impacta pricing, catálogo comum, Pedidos como motor interno, entitlements, ZeloChat e integração futura com Mesas.
- A base de schema PDV-owned para publicação/modificadores do ZeloMenu já está aplicada no Supabase real.
- ZLM-205 (billing e planos) concluído: ZeloMenu como addon (R$40) no checkout, billing APIs, webhook, admin dashboard.
- ZLM-201 bulk publish concluído; self-service individual (nome/descrição/foto/ordem) ainda pendente.
- Status completo em [[docs/projects/zelomenu-zelopdv-status.md]].

## Próximas fatias recomendadas

1. Completar a UI self-service de publicação do ZeloMenu com edição de nome/descrição/foto/ordem, despublicação, pausa e modificadores; a publicação em lote básica já existe em Gestão → Produtos.
2. Expandir o adapter atual de `zelomenu_product_publications` para leitura/edição e adicionar adapters de `zelomenu_modifier_groups`/`zelomenu_modifier_options`, sem alterar o catálogo base `produtos`.
3. Finalizar landing page de marketing do ZeloMenu em `/extensoes` (card + seção detalhada + FAQ + entrada em `extensoes.js`).
4. Validar fim-a-fim o fluxo de deleção agendada com o sweeper externo.
5. Revisar e documentar o modelo de segurança do `admin-dashboard/`.
6. Atacar warnings de `svelte-check` por lote, começando pelos arquivos operacionais e não pelas páginas de marketing.
7. Expandir hero archetypes pra páginas standalone: `/precificacao` e `/vs-planilha` ainda usam layout legado (gradient text, multi-glow) — sprint separada pode ganhar +3-4 pontos no critique.

## Ajustes pós-QA da navegação mobile

- A bottom navbar usa uma camada acima dos modais operacionais, inclusive `Abrir Caixa`, e permanece operável. Os painéis do Zelinho e do suporte terminam acima da faixa reservada pela navbar por meio de `--mobile-bottom-nav-offset`; toasts usam `--toast-offset`.
- `Relatórios` passou de `Outros` para `Financeiro` na configuração central compartilhada por desktop e mobile. A rota `/relatorios`, a permissão `relatorios.ver` e a proteção por PIN não foram alteradas.
- O menu de três pontos dos cards de Produtos agora é ancorado ao próprio gatilho no mobile e acompanha o card durante o scroll, abrindo para cima quando falta espaço. Validação combinada da `main`: `npm run check` com 0 erros/99 avisos conhecidos e `npm test` com 492/492 testes.
Dashboard administrativo (2026-08-04): o escopo global das métricas agora é
  configurável por empresa em `/settings`; novas contas entram por padrão e
  contas de teste/internas podem ser excluídas de MRR, ARR, ticket médio,
  assinaturas, churn, DAU/WAU e custos de IA vinculados à conta.
