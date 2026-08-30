# Fixes Progress

- [x] FX-WHATSAPP-CONFIRMATION-TOKENS-02 (2026-08-30) — emissão/substituição
  de token era uma sequência Data API sujeita a corrida e token expirado podia
  ocupar o índice live → RPC server-only atômica
  `issue_whatsapp_zelo_confirmation_token` trava a sessão `whatsapp_order`
  aberta, invalida qualquer token não consumido (inclusive expirado) e insere
  o próximo no mesmo commit. Confirmação adotou a mesma ordem sessão→token e
  deriva a idempotência de sessão+token, com checagem defensiva de que o pedido
  retornado pertence à sessão antes de consumir. Cobertura transacional em
  `supabase/verification/whatsapp_confirmation_tokens_runtime.sql`; migration
  pendente de aplicação: `supabase/migrations/20260829121000_whatsapp_confirmation_tokens.sql`.

- [x] FX-WHATSAPP-CONFIRMATION-TOKENS-01 (2026-08-29) — confirmação de pedido
  WhatsApp passou a ter contrato de token opaco server-only: persiste somente
  hash SHA-256 ligado a empresa/JID/sessão/revisão/validade e a RPC
  `confirm_whatsapp_zelo_order` bloqueia token e carrinho, valida bindings,
  chama apenas `create_zelo_order` e consome em uma transação. Retry de token
  consumido retorna o pedido canônico existente; token expirado, invalidado ou
  de revisão antiga não confirma. Catálogo/preço são revalidados pelo ZeloMenu
  antes da RPC. Migration pendente de aplicação:
  `supabase/migrations/20260829121000_whatsapp_confirmation_tokens.sql`.
  Cobertura: `tests/whatsappConfirmationTokensSchema.test.js` (RED 4 falhas;
  GREEN 4/4).

- [x] FX-WHATSAPP-ORDER-CONTRACT-01 (2026-08-29) — sessões
  `whatsapp_order` agora são cobertas pelo motor canônico
  `create_zelo_order(..., p_pessoa_id)` e materializam `source='whatsapp'`,
  preservando `public_order`/`table_order`, ACL somente `service_role` e o
  vínculo CRM opcional. `ordering_overrides` fica no relacionamento de cliente
  com JSON objeto obrigatório; o índice parcial permite apenas um carrinho
  WhatsApp aberto por conversa, arquivando antes somente duplicatas abertas
  mais antigas, sem apagar pedidos. Migration ainda pendente de aplicação:
  `supabase/migrations/20260829120000_whatsapp_order_canonical_contract.sql`.
  Cobertura: `tests/whatsappOrderCanonicalContractSchema.test.js` (RED 3
  falhas esperadas; GREEN 3/3) e `tests/customerOrderLinksSchema.test.js`
  (5/5).

- [x] FX-CLIENTES-CRM-INDEXES-01 (2026-08-26) — adicionados índices owner-scoped
  para as FKs do CRM compartilhado (sessões, relacionamentos, tags, segmentos,
  campanhas, filas e automações), reduzindo custo de deleções e consultas por
  empresa/pessoa sem conceder acesso adicional ao browser. A migration
  `20260826131437_060_customer_crm_fk_indexes.sql` foi aplicada no Supabase real;
  `npm run verify:migrations` passou com 107/107 artefatos, 59/59 versões e 24
  migrations forward.

- [x] FX-CLIENTES-ORDERS-01 (2026-08-25) — pedidos canônicos ganharam
  `zelo_orders.pessoa_id` com FK `ON DELETE SET NULL`, índice por empresa/pessoa
  e criação owner-scoped com snapshot obrigatório preservado. A exclusão CRM-safe
  desvincula vendas, pedidos e lançamentos financeiros antes de remover a pessoa,
  sem apagar histórico; a confirmação da tela Pessoas comunica o vínculo
  removido. Cobertura: `tests/customerOrderLinksSchema.test.js` e suíte focada;
  runtime Postgres pendente por indisponibilidade do Docker local.

- [x] FX-CLIENTES-IDENTITY-01 (2026-08-25) — criada a fundação de identidade
  canônica no PDV: aniversário e `updated_at` em `pessoas`,
  `pessoa_identities` com RLS/`pessoas.gerenciar`, normalização brasileira que
  preserva o nono dígito e RPC server-only idempotente para resolver clientes
  vindos do WhatsApp com lock transacional. Pessoas ganhou aniversário e o
  grupo de acesso ganhou `clientes.comunicar`. Cobertura: `tests/customerIdentitySchema.test.js`,
  `npm run check`; verificação runtime transacional em
  `supabase/verification/customer_identity_authz.sql`.

- [x] FX-CATALOG-VISIBILITY-SEPARATION-01 (2026-08-24) - corrigido o
  acoplamento histórico entre `produtos.ocultar_no_pdv` e a publicação online
  do ZeloMenu. O ZeloPDV continua filtrando o PDV pelo campo interno; a
  publicação usa apenas o overlay `visivel_online`/`pausado_manualmente`. A
  migration `20260824134536_catalog_visibility_separation_guard.sql` é
  metadata-only, foi aplicada no Supabase real e não alterou o catálogo da Bem
  Servido. Regressão em `tests/catalogVisibilitySeparation.test.js`; contagem
  pós-migration da Bem Servido: 122 produtos, 104 visíveis no PDV, 83
  publicados e 39 não publicados.

- [x] FX-PONYTAIL-SIMPLIFICATION-01 (2026-08-20) - consolidado o
  `ConfirmDialog` em `<dialog>` nativo com gerenciamento de foco, reduzida a
  duplicação dos guards de subscription e removidos wrappers/primitivos sem
  consumidores, rail sem uso e helpers de impressão sem uso. Iconify do Pix
  permaneceu intacto por decisão do produto. Checker em 0/0, suíte em 113
  arquivos/709 testes; build compila e gera precache PWA, com o symlink
  Windows `EPERM` conhecido no adapter Vercel.

- [x] FX-ADMIN-PIN-OPTIONAL-01 (2026-08-20) - PIN administrativo tornou-se
  opcional por empresa: o onboarding não grava mais `0000`, Perfil permite
  ativar/desativar com validação server-side, e Relatórios/Despesas aguardam o
  status antes de consultar dados, permanecendo bloqueados em caso de falha.
  A migration idempotente `20260820154751_admin_pin_optional.sql` garante
  `empresa_perfil.pin_enabled`; testes direcionados cobrem os estados, owner,
  subusuário e o caminho sem PIN.

- [x] FX-UI-A11Y-SURGICAL-01 (2026-08-20) - removido o rail global do Zelinho,
  corrigida a árvore de categorias, modais/labels/foco/teclado e avisos
  restantes do app; `npm run check` ficou em 0 erros/0 warnings. A suíte
  completa atual passa com 113 arquivos/709 testes. Build compila e gera
  precache PWA; o
  adapter Vercel permanece bloqueado localmente por symlink Windows `EPERM`.

- [x] FX-DEV-PIN-SETUP-FALSE-POSITIVE-01 (2026-08-20) - o layout global
  interpretava erro ou resposta ausente de `/api/auth/admin-pin` como PIN não
  configurado, especialmente no dev server sem a sessão da publicação. O
  prompt agora exige `configured: false` e `canSet: true` explicitamente;
  respostas indisponíveis não abrem o modal. Coberto por
  `tests/adminPinPrompt.test.js`.

- [x] FX-FICHARIO-SHORT-LIST-ROWS-01 (2026-08-20) - a lista lateral do
  Fichário usava um grid flexível no workspace desktop; com uma ou poucas
  pessoas, o alinhamento padrão `stretch` expandia as linhas implícitas e o
  cartão selecionado cobria toda a barra lateral. `align-content: start` mantém
  os cartões na altura do conteúdo sem remover a área rolável. Reprodução
  visual confirmada na publicação com a conta já aberta; teste direcionado
  `tests/ficharioLayout.test.js` passa após a correção.

- [x] FX-DEV-CRLF-WORKING-TREE-01 (2026-08-14) - `npm run verify:migrations`
  falhava com `Git-normalized content changed` em `045_legacy_placeholder.sql`.
  Causa: `core.autocrlf=true` no Git de sistema desta maquina Windows checkou
  esses arquivos com CRLF antes do override local (`false`) existir; o cache de
  stat do indice escondia isso do `git status`/`diff` normais. Varredura dos 107
  artefatos do manifest achou 56 arquivos no mesmo estado
  (`.ai/migrations/*`, `supabase/migrations/*_placeholder*`,
  `.ai/migrations/verification/*`); todos com conteudo normalizado identico ao
  HEAD, so a quebra de linha divergia. Restaurados bytes exatos via
  `fs.writeFileSync` a partir de `git show HEAD:<path>` — `git checkout`/
  redirecionamento de shell nesta maquina reintroduz CRLF mesmo com
  `-c core.autocrlf=false -c core.eol=lf` explicito, confirmado
  experimentalmente. Suite completa 695/695 depois; nada para commitar, pois os
  arquivos ja eram byte-identicos ao commitado. Falta real: `.gitattributes`
  sem regra `eol=lf` para `*.sql` fora de `supabase/baselines|verification|
  history`, registrado como DT-DEV-01 em [[TRADEOFFS]].

- [x] FX-MESAS-COMANDA-SERVICE-FLAG-01 (2026-08-14) - incidente em producao
  afetando todos os tenants com Mesas: nenhuma comanda aceitava item, fechamento
  ou cancelamento, sempre com `Comanda aberta nao encontrada`. A flag
  `v_service` das tres RPCs introduzidas em `20260812234500` vinha de
  `current_setting('request.jwt.claim.role', true) = 'service_role'`, GUC que o
  PostgREST nao popula desde a v9, entao a flag era NULL e nao false. Com isso
  `not v_service` nunca resolvia o owner e o predicado da comanda virava NULL.
  `20260814200000_mesas_comanda_rpc_service_flag_fix.sql` torna a deteccao de
  service-role em dois valores via `coalesce(current_setting('role', true) =
  'service_role', false)` e exige `v_owner` nao nulo antes de qualquer
  predicado, sem mexer no contrato de capabilities. Aplicada em producao e
  confirmada; suite 689/689. Detalhe em INC-2026-08-14-01.
  Pendencia relacionada fechada no mesmo dia por
  FX-RBAC-GUARDS-SERVICE-ROLE-01.

- [x] FX-RBAC-GUARDS-SERVICE-ROLE-01 (2026-08-14) - fecha o DT-SEC-02 aberto
  algumas horas antes: os quatro guards que ainda liam o GUC morto
  (`mesas_status_rbac_guard`, `comandas_mutation_rbac_guard`,
  `vendas_insert_rbac_guard`, `vendas_discount_rbac_guard`) nunca disparavam o
  bypass de service_role. Nos dois de Mesa era inocuo, porque `v_actor is null`
  ja curto-circuitava; nos dois de vendas era outro "prod down" esperando
  acontecer, porque a primeira rota server-side a criar venda ou desconto com a
  service key cairia em `Usuario nao autenticado` (28000).
  `20260814210000_rbac_guards_service_role_detection_fix.sql` padroniza a
  deteccao em `coalesce(current_setting('role', true) = 'service_role', false)`
  e corrige as mensagens cujos acentos estavam codificados duas vezes em UTF-8
  (bytes `C3 83 C2 AA` no lugar de um unico `e` circunflexo), que chegavam
  ilegiveis ao toast do operador. Nenhuma capability,
  policy, trigger ou grant mudou; o caminho SECURITY DEFINER de
  `criar_venda_completa` continua exigindo `pdv.vender` + `pdv.receber`, coberto
  por teste. Aplicada em producao com `supabase db push --linked` apos dry-run
  limpo; ledger conferido, suite 695/695.

- [x] FX-ZELOMENU-MODAL-RESET-01 (2026-08-13) - ao reabrir o mesmo produto
  montável no PDV mobile, o modal preservava a montagem anterior porque o
  reset dependia apenas de mudança de produto/preço. A abertura de uma nova
  montagem agora limpa as seleções mesmo quando o produto e o preço-base são
  iguais; o teste cobre esse ciclo e a suíte completa passou com 685 testes.

- [x] FX-ZELOMENU-RECEIPT-DETAILS-01 (2026-08-13) - o cupom do PDV
  ignorava a montagem estruturada recebida do Zelo Menu e imprimia somente o
  nome do produto. Os geradores ESC/POS e HTML agora seguem o mesmo contrato
  usado pelo Zelo Chat: descricao e grupos de modificadores sao exibidos em
  linhas separadas, completas e quebradas na largura da impressora. Testes de
  regressao cobrem Tamanho, Abacate e Coberturas/confeitos, inclusive opcoes
  repetidas.

- [x] FX-ASSISTANT-SERVER-RBAC-01 (2026-08-13) - o assistant resolvia todo
  subusuário ativo para o owner e lia dados financeiros/fiado/signals e expunha
  a ferramenta de WhatsApp via service-role sem capability. Uso live agregado
  encontrou zero chamadas de subusuário atual. O endpoint agora exige
  `relatorios.ver: true` antes de qualquer leitura privilegiada, preservando
  owner e papéis autorizados sem mudar UI/banco. TDD, 656/656 testes, typecheck
  e revisão independente passaram. O 401 live preexistente inclusive para owner
  está registrado separadamente. Evidência/rollback em
  `docs/operations/ASSISTANT-SERVER-RBAC-SNAPSHOT-2026-08-13.md`.

- [x] FX-CANONICAL-ORDERS-SELECT-RBAC-01 (2026-08-13) - produção confirmou
  que qualquer subusuário ativo do tenant lia customer/payment, items e events
  do motor canônico sem `pedidos.acessar`/`pedidos.cozinha`. A migration
  forward-only `20260813094000_canonical_orders_select_rbac.sql` restringe as
  três policies SELECT a owner ou papel de fila/cozinha, preserva RPCs de ação,
  grants, service-role e Realtime. Matriz linked, Data API nested, Realtime,
  benchmark, suíte 654/654 e typecheck passaram; zero fixtures residuais.
  Evidência/rollback em
  `docs/operations/CANONICAL-ORDERS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- [x] FX-FIADO-ESTORNO-RBAC-01 (2026-08-13) - finding reproduzido em
  produção: um subusuário ativo sem `pdv.cancelar` conseguia chamar diretamente
  `fiado_estornar_venda(bigint)`, reduzir `pessoas.saldo_fiado` e inserir o
  ledger compensatório antes de a policy bloquear a exclusão da venda. A
  migration forward-only `20260813093000_fiado_estorno_rbac.sql` exige a
  capability dentro da RPC e preserva owner, escopo, cálculo simples/múltiplo,
  idempotência, ACL e service-role. Matriz linked completa passou, dry-run
  alinhou e não restou fixture. Evidência/rollback em
  `docs/operations/FIADO-ESTORNO-RBAC-SNAPSHOT-2026-08-13.md`.

- [x] FX-ZELOCHAT-MEDIA-STORAGE-P0-01 (2026-08-13) - o catálogo e o Storage API
  confirmaram que anon e authenticated podiam listar, inserir e apagar qualquer
  objeto de `zelochat-media`. A migration forward-only `20260813092000` removeu
  a policy SELECT e restringiu INSERT/DELETE ao service role, mantendo o bucket
  público para os downloads do Whatsmiau/browser/OpenAI. Pós-deploy: anon/auth
  negados, service-role completo, GET público HTTP 200, zero objetos sintéticos
  residuais e migration dry-run sem pendências. Evidência/rollback em
  `docs/operations/ZELOCHAT-MEDIA-STORAGE-CONTAINMENT-SNAPSHOT-2026-08-13.md`.

- [x] FX-MIGRATION-RECONCILIATION-01 (2026-08-13) - os 107 SQLs do worktree
  foram classificados sem estado desconhecido; as 59 versões remotas tiveram
  hashes congelados; 22 payloads autoritativos foram arquivados e o patch de
  dados de um tenant foi preservado apenas por hash, sem reescrever migrations
  aplicadas nem versionar seus dados. Um baseline atual fora
  do stream de migrations restaura `public`, ACLs/RLS/policies, buckets,
  policies de Storage e Realtime em uma stack Supabase PG17 descartável. O dump
  normalizado e a configuração de plataforma tiveram diff zero; migration list
  e dry-run linked ficaram sem pendências. Nenhuma mutação de produção foi
  necessária. Evidência e rollback em
  `supabase/baselines/20260813091000/README.md`.

- [x] FX-SALES-HISTORY-READ-RBAC-01 (2026-08-13) - finding confirmado:
  subusuário com somente `pedidos.acessar` lia `vendas` e `vendas_itens` do
  titular. A migration forward-only
  `20260813090000_sales_history_read_rbac.sql` preserva consumidores de PDV,
  Mesas, Caixa, Relatórios e Fichário, remove SELECT anônimo e mantém writes e
  service-role. A companion forward-only
  `20260813091000_sales_history_read_rbac_performance.sql` substitui as
  chamadas por linha por uma autorização calculada uma vez por statement e
  mantém `vendas_itens` subordinada à venda-pai (731,117 ms → 7,593 ms no
  benchmark representativo). A matriz remota transacional, repetida após a
  companion, cobriu titular, fixture
  permanente, capabilities isoladas, subusuário bloqueado, super-admin externo,
  anon, service-role, Mesa INSERT RETURNING e cancelamento UPDATE/DELETE.

- [x] FX-SALES-PAYMENT-CASH-READ-RBAC-01 (2026-08-13) - finding confirmado:
  subusuário sem capacidades de PDV/Mesas/Caixa/Relatórios lia pagamentos de
  venda e movimentações de caixa owner-scoped. A migration forward-only
  `20260813080000_sales_payment_cash_read_rbac.sql` exige as capabilities
  existentes, remove SELECT anônimo e preserva writes e service-role. Owner,
  subusuário sem/com cada capacidade, super-admin fora do tenant e service-role
  foram verificados com fixtures transacionais revertidas. Snapshot:
  `docs/operations/SALES-PAYMENT-CASH-READ-RBAC-SNAPSHOT-2026-08-13.md`.

- [x] FX-VENDAS-TAXAS-SELECT-RBAC-01 (2026-08-13) - finding confirmado em
  produção: subusuário sem `caixa.ver`/`relatorios.ver` lia taxas de plataforma
  owner-scoped pela Data API. A migration forward-only
  `20260813070000_vendas_taxas_select_rbac.sql` exige uma das duas
  capabilities e remove o grant anônimo; owner, subusuários autorizados,
  super-admin fora do tenant e service-role foram verificados com linha
  transacional revertida. Snapshot:
  `docs/operations/VENDAS-TAXAS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- [x] FX-ADMIN-PIN-COLUMN-01 (2026-08-13) - finding confirmado em produção:
  `empresa_perfil` tinha SELECT de tabela para clientes, então um subusuário
  conseguia pedir `pin_admin` pela Data API. A migration forward-only
  `20260813060000_empresa_perfil_pin_select_containment.sql` revoga SELECT de
  tabela e concede apenas as colunas não-PIN a `authenticated`; `/app` e
  `/app/pedidos` deixaram de usar `select('*')`. Owner, subusuário,
  super-admin, anon e service-role foram cobertos em smoke transacional, sem
  persistência. Snapshot:
  `docs/operations/EMPRESA-PERFIL-PIN-SELECT-SNAPSHOT-2026-08-13.md`.

- [x] FX-MESAS-SELECT-RBAC-01 (2026-08-13) - finding confirmado em
  produção: subusuário sem `mesas.acessar` lia mesas, comandas, itens e
  pagamentos parciais owner-scoped pela Data API. A migration forward-only
  `20260813050000_mesas_select_rbac.sql` exige a capability nas leituras
  privadas, preserva `relatorios.ver` somente para o resumo de comandas e
  remove grants anônimos sem consumidor. Smoke remoto cobriu owner,
  subusuário sem/com permissão, report-only, super-admin e service-role, sem
  persistência. Snapshot em
  `docs/operations/MESAS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- [x] FX-GERENTE-REPORTS-RBAC-01 (2026-08-13) - finding confirmado em
  produção: subusuário sem `relatorios.ver` lia `business_signals`/
  `business_daily_snapshots` e atualizava `read_at` pela Data API. A migration
  forward-only `20260813043000_gerente_reports_rbac.sql` adiciona a capability
  existente às três policies e o menu do Zelinho respeita o mesmo gate. A
  matriz owner, subusuário com/sem permissão, super-admin fora do tenant, anon
  e service-role foi validada em transação revertida.

- [x] FX-AUDIT-LOG-TENANT-RBAC-01 (2026-08-13) - finding confirmado em
  produção: subusuário conseguia escolher outro `owner_user_id` ao inserir
  `access_audit_logs`, forjando histórico cross-tenant. A migration
  forward-only `20260813041000_access_audit_logs_tenant_guard.sql` exige o
  operador autenticado e o owner resolvido por `get_owner_user_id`, preserva
  o write same-tenant, service-role, leituras e grants. Smoke remoto
  transacional cobriu forged owner e same-tenant; snapshot em
  `docs/operations/ACCESS-AUDIT-LOGS-TENANT-GUARD-SNAPSHOT-2026-08-13.md`.

- [x] FX-FIADO-SELECT-RBAC-01 (2026-08-13) - finding confirmado em produção:
  Caixa/Atendente sem `fiado.visualizar` liam o ledger detalhado por Data API,
  apesar do gate de navegação do Fichário. A migration forward-only
  `20260813034000_fiado_ledger_select_rbac.sql` adiciona a capability existente
  à policy SELECT de `fiado_lancamentos`, preserva owner/Gerente/service-role,
  não altera as RPCs de recebimento/estorno e mantém `pessoas.saldo_fiado`
  operacional. Matriz remota confirmou owner, subusuário com/sem permissão,
  super-admin, anon e service-role; nenhuma alteração persistiu. Snapshot em
  `docs/operations/FIADO-LEDGER-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- [x] FX-SECURITY-DEFINER-RPC-01 (2026-08-13) - finding confirmado em
  producao: `saldo_caixa(bigint)` e `get_user_id_by_email(text)` eram
  `SECURITY DEFINER`, executaveis por anon/autenticados e sem consumidor no
  repositorio; o primeiro calculava saldo por id arbitrario e o segundo
  consultava `auth.users`. A migration forward-only
  `20260813033000_rpc_security_definer_containment.sql` revoga EXECUTE de
  `public`/`anon`/`authenticated` e preserva `service_role`. O mesmo finding
  mostrou `add_empresa_membro_por_email(integer,text,text)` em uso pelo browser;
  somente anon/public foram removidos e o grant autenticado/guard interno
  ficaram intactos. Snapshot em
  `docs/operations/RPC-SECURITY-DEFINER-CONTAINMENT-SNAPSHOT-2026-08-13.md`.
  Smoke remoto confirmou anon negado nos tres, owner/subuser/super-admin
  negados nos dois server-only e service-role executando os dois. Nao havia
  empresas/empresa_usuarios em producao para um owner positivo do fluxo legado;
  nenhum dado foi criado.

- [x] FX-BILLING-PAYMENTS-INSERT-01 (2026-08-13) - finding confirmado em
  producao: `billing_payments_self_insert` permitia INSERT arbitrario de uma
  cobranca para o proprio usuario por cliente autenticado, sem consumidor
  browser legitimo. A migration forward-only
  `20260813032000_billing_payments_server_insert_only.sql` revoga somente
  INSERT para `anon`/`authenticated`, preservando SELECT do titular, rotas
  server-side, webhook, RPC de settlement e service-role. Matriz remota
  cobriu owner, subusuario, super-admin, anon e service-role sem persistencia;
  snapshot em `docs/operations/BILLING-PAYMENTS-INSERT-SNAPSHOT-2026-08-12.md`.

- [x] FX-DISCOUNT-RBAC-01 (2026-08-12) - finding confirmado em producao:
  subusuario com `pdv.vender`/`pdv.receber`, mas sem `pdv.desconto`, conseguia
  inserir venda com desconto positivo diretamente. A migration forward-only
  `20260813030000_discount_rbac.sql` e o hardening forward-only
  `20260813031000_discount_rbac_update_hardening.sql` exigem a capability no
  trigger de INSERT/UPDATE do desconto, preservam desconto zero, Mesa, owner e
  service-role. Matriz remota confirmou owner, subusuarios, Mesa e service-role;
  nenhuma fixture persistiu. Snapshot em
  `docs/operations/DISCOUNT-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-CATALOG-EXTENSIONS-RBAC-01 (2026-08-12) - finding confirmado em
  producao: subusuarios sem `produtos.gerenciar` conseguiam escrever as
  extensoes de catalogo do ZeloMenu por policies apenas owner-scoped. A
  migration forward-only `20260813020000_catalog_extensions_rbac.sql` exige a
  capability em INSERT/UPDATE/DELETE dos quatro agregados, preserva checks de
  pais, SELECT, grants e service-role. Smoke remoto cobriu owner, subusuarios
  com/sem permissao, super-admin sem tenant, anon e service-role; nenhuma
  fixture persistiu. Snapshot em
  `docs/operations/CATALOG-EXTENSIONS-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-REPORT-SELECT-RBAC-01 (2026-08-12) - finding confirmado em produção:
  a policy owner-scoped de `caixa_fechamentos` permitia que subusuário sem
  `relatorios.ver` lesse o histórico financeiro via Data API. A migration
  forward-only `20260813010000_reports_select_rbac.sql` exige a capability na
  policy SELECT e remove o grant anônimo sem consumidor. Owner, subusuário
  autorizado, service-role e INSERT de fechamento foram preservados; smoke
  remoto transacional cobriu owner, ambos os subusuários, super-admin e anon,
  sem fixture persistente. Snapshot em
  `docs/operations/REPORT-SELECT-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-SALES-CREATION-RBAC-01 (2026-08-12) - finding confirmado em produção:
  `criar_venda_completa` e o INSERT direto de `vendas` ignoravam
  `pdv.vender`/`pdv.receber`. A migration forward-only
  `20260813000000_sales_creation_rbac.sql` adicionou guard transacional,
  preservou fechamento direto de Mesa por `mesas.fechar`, manteve
  service-role/contratos e removeu EXECUTE anônimo da RPC. Smoke transacional
  cobriu owner, Caixa/Gerente, Atendente sem venda, Mesa, anon e service-role;
  nenhuma fixture persistiu. Snapshot em
  `docs/operations/SALES-CREATION-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-MESAS-OPERATIONAL-RBAC-01 (2026-08-12) - finding confirmado no
  schema remoto: Atendente sem `mesas.fechar`/`mesas.cancelar` podia alterar
  diretamente status de comanda/mesa e campos financeiros owner-scoped. A
  migrations forward-only `20260812233000_mesas_operational_rbac.sql` e
  `20260812234500_mesas_operational_rpc_rbac.sql` aplicaram policies, guards
  transacionais e owner/capability checks nas RPCs de estoque consumidas pelo
  browser. Smoke remoto cobriu owner, Atendente, subusuário com fechamento,
  anon e service-role; nenhuma fixture persistiu. Snapshot em
  `docs/operations/MESAS-OPERATIONAL-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-MESAS-PAYMENT-RBAC-01 (2026-08-12) - finding confirmado no schema remoto: policies owner-scoped permitiam que subusuários sem capacidade de recebimento criassem, alterassem ou removessem pagamentos parciais e linhas de alocação de Mesas. A migration forward-only `20260812230000_mesas_payment_rbac.sql` exige `mesas.acessar` e `pdv.receber` ou `pedidos.receber`, preservando SELECT, o contrato de dados, fechamento completo e service-role. Smoke remoto transacional cobriu owner, Atendente sem receber, subusuário autorizado, anon, super-admin e service-role; nenhuma linha persistiu. Snapshot em `docs/operations/MESAS-PAYMENT-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-CAIXA-RBAC-01 (2026-08-12) - finding confirmado no schema remoto:
  `caixas_actor_update/delete` eram apenas owner-scoped e
  `caixa_movs_actor_insert` não exigia `caixa.movimentar`. A migration
  forward-only `20260812214518_caixa_role_rbac.sql` exige `caixa.abrir`,
  `caixa.fechar` e `caixa.movimentar` nas mutações correspondentes, mantém
  delete owner-only e preserva leituras/service-role. Smoke remoto transacional
  cobriu owner, subusuário sem/com capacidades, anon e super-admin; nenhum
  fixture persistiu. Snapshot em
  `docs/operations/CAIXA-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-SALES-CANCEL-RBAC-01 (2026-08-12) - finding confirmado no schema
  remoto: policies owner-scoped permitiam que subusuários editassem/removessem
  vendas, itens, pagamentos e taxas sem `pdv.cancelar`. As migrations
  forward-only `20260812210856_sales_cancel_rbac.sql` e
  `20260812211428_sales_cancel_helper_grant_fix.sql` preservam criação,
  leituras, service-role e o rollback estreito de Mesa (venda vazia, recente,
  do próprio operador), exigindo `pdv.cancelar` para o restante. Smoke remoto
  transacional cobriu owner, subusuário sem/com permissão, rollback recente e
  antigo, anon, super-admin e service-role; nenhuma fixture persistiu. Snapshot
  em `docs/operations/SALES-CANCEL-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-ACCESS-USERS-01 (2026-08-12) - finding confirmado no schema remoto:
  `access_users_owner_or_self` concedia `ALL` a subusuarios sobre a propria
  linha, permitindo tentar alterar cargo/tenant/status ou remover o vinculo;
  uma policy owner-only tambem precisava impedir que um subusuario fabricasse
  uma linha com `owner_user_id = auth.uid()`. As migrations forward-only
  `20260812204706_access_users_self_write_containment.sql` e
  `20260812205010_access_users_owner_guard.sql` preservam leituras de contexto,
  CRUD do titular, leitura de cargos pelo proprio subusuario e todos os fluxos
  server-side/service-role. Smoke remoto transacional cobriu owner,
  subusuario, cargo, super-admin, anon e service-role; nenhum fixture persistiu.
  Snapshot em `docs/operations/ACCESS-USERS-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-ACCESS-PESSOAS-01 (2026-08-12) — finding confirmado: as policies
  owner-scoped de `pessoas` permitiam writes diretos de subusuários sem
  `pessoas.gerenciar`. A migration forward-only
  `20260812202400_pessoas_role_rbac.sql` preserva SELECT para o PDV/Mesas/
  Fichário/Relatórios, exige a permissão para INSERT/UPDATE/DELETE e mantém os
  RPCs de fiado existentes como barreiras separadas. A página de Pessoas passa
  a enviar o `ownerUserId` no cadastro de Gerente. Smoke remoto transacional
  cobriu owner, Gerente, subusuário sem permissão, leitura, anon e service-role;
  nenhuma linha persistiu. Snapshot em
  `docs/operations/PESSOAS-RBAC-SNAPSHOT-2026-08-12.md`.

- [x] FX-ACCESS-PRODUCTS-01 (2026-08-12) — finding confirmado: as policies
  owner-scoped de `produtos`, `categorias` e `subcategorias` permitiam que um
  subusuário ativo contornasse o menu e mutasse o catálogo via Data API. A
  migration forward-only `20260812195032_products_role_rbac.sql` mantém as
  leituras do PDV, preserva CRUD do owner, exige `produtos.gerenciar` para
  mutações do Gerente e nega writes a Caixa/Atendente. Smoke remoto
  transacional cobriu owner, Caixa, Gerente, anon e service-role; nenhuma linha
  de produção foi criada ou removida. A permissão separada `estoque.ajustar`
  continua funcional via `20260812200550_catalog_stock_adjustment_rpc.sql`,
  que não concede a um cargo de estoque poder para editar nome/preço.

- [x] FX-SEC-PIN-01 (2026-08-12) - o PIN administrativo deixou de ser exposto
  ao browser. Status, verificação e alteração passam por `/api/auth/admin-pin`,
  com comparação constante, rate limit por titular e alteração restrita ao owner.
  Layout, Despesas, Relatórios, Perfil e reset de PIN foram migrados sem alterar
  o contrato visual; testes direcionados cobrem owner, subusuário e PIN incorreto.

- [x] FX-BILLING-INVARIANTS-01 (2026-08-12) - reativação agora falha fechada
  quando o Stripe não retoma a assinatura e preserva `deletion_*` para retry.
  O índice parcial `subscriptions_one_live_row_per_user` foi aplicado em produção
  após snapshot sem duplicatas vivas; histórico terminal segue append-only.
  Vitest completo: 579/579; `npm run check`: 0 erros/95 avisos conhecidos.

- [x] FX-E2E-DEDICATED-01 (2026-08-12) - a conta informada pelo usuario foi
  validada como tenant dedicado permanente. O setup/teardown remoto passou
  2/2; o fixture agora aguarda a hidratacao do login, trata a caixa aberta ja
  existente e limpa apenas IDs do manifesto, sem apagar historico preexistente.
  A suite completa de 110 testes foi tentada, mas revelou falhas preexistentes
  de selectors/produtos hard-coded e nao foi alterada neste escopo.

- [x] FX-BILLING-WEBHOOK-RELIABILITY-01 (2026-08-12) — findings confirmados:
  Stripe marcava o evento antes do efeito e engolia falhas; AbacatePay
  descartava retries de eventos `received`/`failed` e confirmava como `ignored`
  um pagamento cuja linha local ainda não havia chegado; a confirmação Pix
  podia renovar a mesma assinatura em duas operações concorrentes. O fix local
  move a marcação Stripe para depois do processamento, torna updates fatais
  retryáveis, reabre eventos AbacatePay não concluídos, mantém pagamento ainda
  não persistido retryável e adiciona a RPC
  service-role-only `settle_pix_payment` para lock + assinatura + pagamento em
  uma transação. Testes direcionados: 31/31; smoke pós-apply confirmou que a
  segunda liquidação não estende novamente a assinatura. Migration aplicada em
  `supabase/migrations/20260812165936_webhook_reliability_pix_atomicity.sql`.

- [x] FX-SEC-P0-CONTAINMENT-01 (2026-08-12) — findings P0 confirmados no schema
  remoto: grants `anon`/`authenticated` nas quatro views SECURITY DEFINER,
  execução pública de RPCs administrativas e `USING (true)` em
  `super_admins`. Criados snapshot pré-mudança e migration forward-only com o
  menor blast radius: `user_entitlements` mantém SELECT owner/subuser via
  `security_invoker`; RPCs consumidos pelo Admin preservam `authenticated` com
  guarda interna; RPCs sem consumidor browser ficam em `service_role`; o
  dashboard mantém SELECT/UPDATE necessários em `super_admins`. Contrato
  estrutural 5/5 e matriz de autorização transacional remota passaram, com
  rollback da transação de verificação; `npm test` 568/568 e `npm run check`
  0 erros. Aplicada em produção pela migration
  `supabase/migrations/20260812150000_p0_security_containment.sql` após
  reconciliação de histórico documentada em
  `docs/operations/MIGRATION-HISTORY-RECONCILIATION-2026-08-12.md`.

- [x] FX-PDV-01 (2026-08-10) - o modal obrigatorio `Abrir Caixa` cobria a
  sidebar inteira no desktop porque seu backdrop fixo tinha camada acima do
  menu. O modal agora sinaliza seu estado no documento e a sidebar sobe acima
  do backdrop somente em telas desktop; o conteudo da frente de caixa continua
  bloqueado. A bottom navbar mobile permanece acima do modal. `npm run check`:
  0 erros / 95 avisos conhecidos; requer deploy do frontend.

- [x] FX-FIADO-03 (2026-08-04) — corrigida a rolagem desktop do Fichário:
  `gestao-main-content` agora permite que a workspace ocupe corretamente a
  altura disponível, a lista de pessoas rola dentro do painel esquerdo e o
  detalhe da pessoa rola como um único contêiner, incluindo o extrato. As
  rolagens aninhadas do extrato foram removidas. A causa final era o grid
  desktop com `align-items: start`, que deixava os painéis maiores que a área
  rolável; os painéis agora esticam até a altura disponível. As regras do
  workspace foram restringidas a telas acima de 760px, restabelecendo a
  rolagem natural da página no mobile sem alterar o desktop. `npm run check`:
  0 erros / 96 avisos conhecidos.

- [x] FX-MESAS-01 (2026-08-03) — o pagamento parcial existente por valor ganhou
  atribuicao opcional por item, com controle de quantidade disponivel, RLS e
  trigger no banco. O fechamento preserva a origem em `vendas_pagamentos` e o
  item em `vendas_itens`/`comanda_pagamento_itens`. Pre-conta e recibo final
  deixaram de chamar couvert de taxa de entrega; delivery continua imprimindo a
  propria taxa. Migration aplicada no Supabase vinculado; testes direcionados
  38/38 e `npm run check` 0 erros/96 avisos conhecidos.

- [x] FX-MESAS-02 (2026-08-03) — corrigidas as policies de INSERT do fechamento
  para subusuarios: pagamentos da comanda, venda, itens e pagamentos da venda
  agora validam o owner efetivo, sem exigir que `auth.uid()` seja o owner.
  Migration aplicada no Supabase vinculado.

- [x] FX-MKT-08 (2026-08-03) — corrigido o logo cortado no header: o asset horizontal agora respeita `object-fit: contain` e a altura declarada de 40 px. QA no dev server em desktop e mobile confirmou logo completo, sem overflow horizontal e sem erros de console; `npm run check` passou com 0 erros / 96 avisos e `npm test` com 497/497.

- [x] FX-MKT-07 (2026-08-03) — reduzido o caminho crítico da home: autenticação/Supabase e modal de PIN foram divididos em carregamento dinâmico e, na superfície pública, adiados por 5s; tracking de Google/Meta foi movido para filas client-side + carregamento em idle sem preconnect prematuro; logo principal recebeu dimensões/prioridade; screenshots de marketing ganharam WebP responsivo em 800/1600 px. `npm run check` passou com 0 erros / 96 avisos conhecidos. Build compila, mas o adapter Vercel permanece bloqueado pelo `EPERM` de symlink conhecido no Windows.

- [x] FX-ZELINHO-02 (2026-08-01) — auditoria encontrou dois defaults de data ainda baseados em UTC: o contexto sazonal e o resumo semanal podiam avançar um dia/uma semana antes da virada brasileira. Ambos agora derivam a data de negócio de `America/Sao_Paulo`; os cálculos internos de datas sem horário continuam em UTC por determinismo. Testes cobrem a virada de 23h30 BRT; sem migration ou alteração de dados.

- [x] FX-ZELINHO-01 (2026-07-31) — o Zelinho ignorava despesas no início do mês seguinte em UTC, enquanto ainda era o mês anterior no fuso brasileiro; o resultado também misturava receita de 30 dias com despesas do mês. Corrigidos os limites locais, alinhado o cálculo no mesmo período, adicionada paginação de vendas/despesas e ampliado o contexto com categorias e participação na receita. Validado na Apex Burgers e coberto por testes de timezone/contexto; `npm test` completo verde e `npm run check` em 0 erros / 99 avisos.

- [x] FX-PRINT-01 (2026-07-31) — a instalação do Zelo Impressão ainda orientava todos os usuários a digitar um código e não aproveitava a conexão automática do agente; o cliente local agora chama a conexão automática quando o aplicativo está aberto, mantém o código apenas como fallback e a copy do Perfil, da página pública e do suporte foi atualizada — `src/lib/zeloImpressaoClient.js`, `src/routes/perfil/+page.svelte`, `src/routes/zelo-impressao/+page.svelte`, `src/routes/api/chat/support/+server.js`.

- [x] FX-ZELOMENU-09 (2026-07-31) — componentes de produtos montáveis ocultos do PDV continuam resolvíveis para preço, vínculo e estoque; a disponibilidade agora respeita estoque individual e estoque compartilhado por categoria. Carga do Mix Guaraná aplicada e verificada no Supabase: 5 grupos, 78 opções, 76 vínculos, 0 vínculos órfãos, 42 componentes ocultos no PDV/cardápio e nenhum estoque ativado sem saldo informado. Cobertura: 8 testes direcionados, suíte completa 473/473 e `npm run check` com 0 erros / 97 avisos conhecidos.

- [x] FX-PRODUTOS-01 (2026-07-31) — removida chamada órfã a `carregarPublicacoes()` em `src/routes/gestao/produtos/+page.svelte`, que causava `Uncaught (in promise) ReferenceError` ao carregar a tela. A tela de Produtos não tinha essa função definida nem outro consumidor local.

- [x] FX-UI-UPDATE-01 (2026-07-30) — aviso de nova versão simplificado: copy traduzida, ação única `Atualizar`, dismiss por X e swipe horizontal no mobile, mantendo supressão temporária por versão e suporte a `prefers-reduced-motion`. `npm run check` passou com 0 erros / 98 avisos conhecidos.

- [x] FX-ADMIN-DELETE-FIADO-01 (2026-08-09) — exclusão definitiva de conta no `/users` corrigida: `delete_account` agora remove o ledger `fiado_lancamentos` da conta antes de apagar `pessoas`, desbloqueando a delegação de `admin_delete_user` sem alterar o FK auditável `ON DELETE RESTRICT`. Migration aplicada no Supabase vinculado via CLI; cobertura: teste estrutural 1/1, suíte 513/513, `npm run check` com 0 erros / 96 avisos conhecidos e build do admin concluído.

- [x] FX-FIADO-02 (2026-07-30) — exclusão definitiva de pessoa quitada corrigida: a tela de Pessoas chama `fiado_excluir_pessoa`, que exige saldo zero, desvincula vendas históricas, apaga os lançamentos do extrato e exclui a pessoa na mesma transação. A função foi aplicada no Supabase real com `authenticated` autorizado e `anon` bloqueado. Cobertura: 2 testes de schema e `npm run check` com 0 erros / 98 avisos conhecidos; requer deploy do frontend.

- [ ] FX-ZELOMENU-08 (2026-07-29) - fila de pedidos agora recupera sessao expirada quando o Postgres retorna `permission denied for table zelo_orders`; sessao invalida volta ao login e ACL de producao foi validada (`authenticated` com SELECT, `anon` sem SELECT). Codigo aguarda deploy; incidente em [[INCIDENTS]].

- [x] FX-ZELOMENU-07 (2026-07-28) — fase 2 publicada: `source='mesa'` unifica QR público e envio da comanda, com separação de estoque por `comandaItemId`, sem venda financeira duplicada e com endpoint owner-scoped `/api/mesas/cozinha`. ZeloMenu e ZeloChat removeram o consumidor runtime de `has_pedidos_addon`; migrations transacionais e testes 11/11 foram executados, o DDL passou em produção, e o smoke técnico pós-deploy retornou 200 nas rotas dependentes e 401 no endpoint sem bearer. Um smoke transacional 3/3 encontrou e corrigiu o marcador indevido de estoque liberado; o smoke de `delete_account` com usuário sintético também passou, e todas as transações foram revertidas sem pedidos/usuários de teste persistidos. E2E persistido com tenant descartável não foi executado por falta de credenciais.

- [x] FX-BILLING-03 (2026-07-28) — assinatura `d5625be9` reconciliada e corrigida: o último pagamento confirmado foi R$89 (PDV + Mesas, sem Acessos), não há `provider_subscription_id` ativo, e a alteração manual que deixou Acessos ligado não tinha evidência contratual. Acessos foi removido, `monthly_value_cents` ajustado para R$228 (bundle + Mesas), a mudança foi auditada e nenhum histórico/estorno foi alterado.

- [x] FX-RLS-02 (2026-07-28) - corrigido o alerta `rls_disabled_in_public` da tabela `public.zelomenu_table_capabilities`: RLS ligado, grants de tabela revogados para browser roles e RPCs `issue_table_capability`/`revoke_table_capability` removidas de `PUBLIC`/`anon`/`authenticated`, mantendo `service_role`. Auditoria pos-mudanca via Supabase CLI confirmou tabela vazia, nenhuma sessao dependente, browser roles sem acesso e advisor sem o alerta.

- ✅ FX-MKT-06 (2026-07-28) — cards de ZeloMenu e ZeloChat na LP `/extensoes` passaram a usar os assets/tokens reais dos produtos: mini-mascote do ZeloMenu com alpha, animação reduzida em `prefers-reduced-motion` e card roxo; ZeloChat com o verde oficial da landing, inclusive CTA, badge e ícone. Meta description, descrições, passos e FAQs da página formatam valores atuais a partir de `src/lib/pricing.js`; o fallback silencioso de `getAddonPrice` também foi removido. QA visual em desktop/mobile confirmou os assets carregados e zero overflow; `npm run check` passou com 0 erros / 96 avisos conhecidos.

- ✅ FX-ZELOMENU-06 (2026-07-28) — módulo Pedidos + Cozinha aposentado no código: catálogo (`src/lib/pricing.js` + espelho do Admin), entitlement (`guards.js`, sem o fallback `has_pedidos_addon`), endpoints de billing (create-subscription, webhook, toggle-addon, change-plan, pix/create e os três de admin), `billingPix.js`, superfície in-app (sidebar, `/assinatura`, `/gestao/extensoes`, `/gestao/acessos`, `/perfil`), marketing (`extensoes.js`, `competitorComparisons.js`) e o prompt do bot de suporte, que ensinava o fluxo antigo e cobrava +R$ 30. Runtime legado deletado (`/app/pedidos/novo`, `/app/pedidos/[id]/editar`, branches da tabela `pedidos`, breakdown dos relatórios). Números de produção conferidos antes: 3 assinaturas com a flag legada, **todas** já com `has_zelo_menu`; 3 linhas em `pedidos` na história inteira. Cobertura ajustada em `tests/guards.zelomenu.test.js`, `tests/api.create-subscription.test.js`, `tests/api.billing-pix-status.test.js`; guards de regressão em `tests/pricing.acessos.test.js` e `tests/emailTemplates.extensoes.test.js` mantidos. `npm test` 426/426; `npm run check` 0 erros / 96 avisos. **Fase 2 local** está em FX-ZELOMENU-07; a publicação e o DDL foram concluídos no merge `5a6f45a3`.

- FX-BILLING-02 (2026-07-24) - corrigido o salvamento de plano no ZeloAdmin: edicoes manuais/Abacate Pay agora persistem `monthly_value_cents`, o catalogo do Admin nao cobra o add-on legado Pedidos quando o ZeloMenu ja esta incluido e a sincronizacao Stripe atualiza o mesmo valor. Cobertura em `tests/admin.pricing.test.js`; incidente em [[INCIDENTS]].

- FX-MKT-03 (2026-07-28) - home de marketing reescrita para conversao com copy concreta, CTA unico de teste de 14 dias, tres configuracoes reais de preco, destaque para IA do Zelinho, offline e fiado, miniatura social desenhada em `static/og-image-home.png` e frase memoravel no rodape. Nao foram adicionados depoimentos, logos ou metricas sem fonte autorizada. `npm run check` passou com 0 erros / 96 avisos; `npm run build` continua bloqueado pelo EPERM de symlink do adapter Vercel no clone Windows.

- FX-MKT-04 (2026-07-28) - landing da homepage refeita com a direcao visual do pacote Zelinho e a copy Marc Lou preservada. O hero usa o recorte transparente otimizado em WebP de 60 KB, com fallback SVG, luz criada em CSS e sem o bloco retangular da imagem anterior. Abaixo do hero, a base mudou para superficies claras frias com screenshots reais do produto, fluxo de dinheiro, recursos, offline, Zelinho, segmentos, tres planos completos, FAQ e CTA final. Header e footer compartilhados foram refinados com o logo original. Nenhuma metrica, prova social ou preco foi inventado. QA em 360/390/768/1440 px sem overflow ou erros de console; menu mobile funcional, detector Impeccable limpo e `npm run check` com 0 erros / 96 avisos preexistentes.
- FX-MKT-05 (2026-07-28) - refinamento pós-crítica da home: hero responsivo para telas amplas (shell de até 1536 px, headline de até 88 px e arte de até 896 px), CTA secundário para "Ver o Zelo funcionando" e demo interativa do Zelinho com respostas, números e conclusão explicitamente ilustrativos. Ações preenchidas passaram a usar `--marketing-action` (5,93:1); menu mobile fecha com Escape e trava o scroll; footer colapsa até 840 px para evitar corte em 768 px. Playwright validou 360/390/768/1440/1920 px sem overflow; `npm run check` passou com 0 erros / 96 avisos conhecidos.

> Tracker operacional. Atualize após cada fix, feature sensível ou mudança de comportamento.
> Base técnica: [[CLAUDE]] · riscos abertos: [[CODE_REVIEW]]

## Fechados / presentes no código

- ✅ FX-ZELOMENU-05 (2026-07-27) — pedidos online no ZeloPDV agora imprimem automaticamente no recebimento, com o mesmo contrato textual do ZeloChat (`kitchen_order`), reconciliação de pedidos novos após perda de Realtime, dedupe persistente por 48h e retry após falha. O mapeamento também preserva grupos/opções de modificadores no bilhete — `src/routes/app/pedidos/+page.svelte:189`, `src/lib/orderAutoPrint.js:18`, `src/lib/printService.js:121`. Cobertura: `tests/orderAutoPrint.test.js`, `tests/orderPrint.test.js`, `tests/onlineOrders.test.js`; `npm run check` em 0 erros.

- FX-ADMIN-02 (2026-07-24) - ZeloAdmin voltou a carregar os dados apos a migration `.ai/migrations/subscriptions_monthly_value_cents_2026_07_22.sql` ser aplicada no Supabase real. O deploy que passou a selecionar `monthly_value_cents` encontrava a coluna ausente; o erro PostgREST era ignorado e Dashboard/Assinaturas/Usuarios exibiam zeros. Nenhuma assinatura foi apagada: a base validou 18 rows (5 ativas, 7 em trial, 5 trials vencidos e 1 cancelada). Backfill de valores reais continua pendente; linhas antigas usam fallback de preco por plano no admin. `cd admin-dashboard && npm run build` passou; `npm run check` continua bloqueado pela ausencia pre-existente de `admin-dashboard/jsconfig.json`; incidente em [[INCIDENTS]].

- ✅ FX-ZELOMENU-04 (2026-07-22) — o fechamento financeiro de pedidos online agora interpreta os snapshots atuais do motor (`payment.declaredMethod` e `fulfillment.type`) e os compatíveis legados, preservando forma de pagamento e delivery nos relatórios/caixa. A fila do ZeloPDV assina `zelo_orders` em tempo real: cancelamento feito pelo Kanban do ZeloChat remove o pedido da fila sem esperar o polling. O cancelamento pré-fechamento não cria venda; após fechamento, qualquer cancelamento deve ser estorno auditável, nunca exclusão silenciosa.

- ✅ FX-DASHBOARD-01 (2026-07-17) — o dashboard de Gestão dizia "Vendas Hoje" mas os números sempre vieram da **sessão do caixa atual** (que pode durar dias); com caixa aberto há 44h, vendas de dias anteriores apareciam como se fossem de hoje. Decisão de produto: manter o dado do caixa (cortar por dia de calendário quebraria bar/lanchonete que atravessam a meia-noite) e corrigir só a semântica. "Vendas Hoje" → "Vendas do Caixa" ("N cupons no caixa atual"), gráfico "Vendas por Hora (Caixa Atual)", tooltip nos cards de Vendas/Caixa com "aberto desde dd/mm às hh:mm · Xh ativo", link "Ver relatório completo" → `/relatorios` na Atividade Recente e action "Fechar caixa" → `/gestao/caixa` no alerta de +10h. `npm run check` 0 erros; commit `f057edc` na `main` — [src/routes/gestao/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/+page.svelte:1)

- ✅ FX-CONTRASTE-01 (2026-07-15) — a causa sistêmica de texto preto em fundos navy nas áreas autenticadas foi removida: as shells de Gestão, PDV, Ferramentas, Perfil e Assinatura fixam `color: var(--text-main)` ao aplicar `--bg-app`. Estoque e as demais páginas sob Gestão passam a herdar a cor correta; Dashboard e Fechar Caixa também deixaram de usar utilitários de cinza-escuro que dependiam de um modo `dark` externo.

- ✅ FX-SELECT-01 (2026-07-15) — `Select.Value` não envia mais um slot vazio ao primitive do `bits-ui` e `Select.Item` repassa seu `label`; placeholders declarados nos filtros e formulários aparecem até que exista uma seleção, que passa a exibir o nome legível em vez do ID interno.

- ✅ FX-RELATORIOS-01 (2026-07-15) — a lista de cupons em `/relatorios` deixou de esconder cliente e itens em tooltip de hover dentro de contêiner com overflow. Cada venda agora abre detalhes inline por botão acessível, inclusive no mobile; a UI também diferencia o resumo agregado de produtos das transações individuais do caixa. Rotas com sidebar não recebem mais uma segunda shell de viewport do layout raiz. No mobile, o relatório usa a rolagem do documento; no desktop, o painel contém o overscroll para impedir que, ao final da lista, o documento externo se desloque e exponha fundo vazio. Sem movimentações, a seção final agora é um estado vazio explícito que ocupa o espaço disponível. A workspace restaura explicitamente a cor `--text-main`, corrigindo o contraste de conteúdo que antes herdava preto no navy.

- ✅ FX-FIADO-01 (2026-07-15) — fichário ganhou razão auditável, pagamento parcial visível, crédito por excedente, extrato por pessoa e lista mobile pesquisável; Pessoas passou a exibir situação do saldo e Fechar Caixa lista os clientes de cada fiado. A migration está versionada, mas aguarda validação/aplicação no Supabase real antes de considerar o rollout concluído — [[docs/projects/fiado-auditavel-implantacao]].

- ✅ FX-ZELOMENU-03 (2026-07-12) — `/app/pedidos`, Cozinha e sidebar passaram a reconhecer `pdv + has_zelo_menu`, ler pedidos online do motor canônico e operar estados por RPC com CAS. Balcão/comanda permanecem no fluxo legado e o fechamento financeiro online usa `close_zelo_order` exatamente uma vez.

- ✅ FX-DESPESAS-01 (2026-07-01) - lancamento de despesas deixou de mostrar sucesso sem confirmacao efetiva: datas de input agora sao convertidas como dia local, o filtro final inclui o dia inteiro e create/update/delete exigem linha retornada do Supabase antes de mostrar toast de sucesso. Adicionado tratamento explicito para Supabase ausente, sessao nao carregada, periodo/data invalidos, falhas de carregamento, insert/update/delete sem linha afetada e erros retornados pelo PostgREST - [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:1), [src/lib/dateRange.js](/home/vinicius/code/zelopdv/src/lib/dateRange.js:1), [tests/dateRange.test.js](/home/vinicius/code/zelopdv/tests/dateRange.test.js:1)

- ✅ FX-DOCS-01 — núcleo documental AI-first consolidado em `docs/` + vault `pdvObsidian/`, com runbooks, auditoria, memória e hub operacional — [README.md](/home/vinicius/code/zelopdv/README.md:1), [docs/CURRENT.md](/home/vinicius/code/zelopdv/docs/CURRENT.md:1), [CLAUDE.md](/home/vinicius/code/zelopdv/CLAUDE.md:1), [pdvObsidian/HOME.md](/home/vinicius/code/zelopdv/pdvObsidian/HOME.md:1)
- ✅ FX-DOCS-02 — documentação profunda reorganizada em fontes canônicas por domínio, com trackers antigos marcados como históricos — [docs/data/SCHEMA_RLS.md](/home/vinicius/code/zelopdv/docs/data/SCHEMA_RLS.md:1), [docs/integrations/EXTERNAL_DEPENDENCIES.md](/home/vinicius/code/zelopdv/docs/integrations/EXTERNAL_DEPENDENCIES.md:1), [docs/modules/ACESSOS.md](/home/vinicius/code/zelopdv/docs/modules/ACESSOS.md:1), [docs/modules/MESAS.md](/home/vinicius/code/zelopdv/docs/modules/MESAS.md:1)
- ✅ FX-ACCOUNT-01 — exclusão imediata da conta virou agendamento com janela de 14 dias → endpoints de deleção/reativação e colunas `deletion_*` adicionadas — [src/routes/api/account/delete/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/delete/+server.js:15), [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:7), [.ai/migrations/account_deletion_grace_2026_05_31.sql](/home/vinicius/code/zelopdv/.ai/migrations/account_deletion_grace_2026_05_31.sql:1)
- ✅ FX-OFFLINE-01 — replay offline ganhou idempotência de venda → `client_sale_id` centralizado no payload e migration dedicada — [src/lib/finance/saleOps.js](/home/vinicius/code/zelopdv/src/lib/finance/saleOps.js:61), [.ai/migrations/offline_sales_idempotency_2026_05_12.sql](/home/vinicius/code/zelopdv/.ai/migrations/offline_sales_idempotency_2026_05_12.sql:1)
- ✅ FX-OFFLINE-02 — fila offline passou a carregar contexto owner/operator para subusuários → Dexie v4 adiciona `ownerUserId` e `operatorUserId` — [src/lib/offlineDb.js](/home/vinicius/code/zelopdv/src/lib/offlineDb.js:27)
- ✅ FX-OFFLINE-03 — PDV virou offline-first na leitura e o gate de assinatura tolera queda de rede (motivado pelo cliente Agreste Salgados, "fica faltando produto offline"). Gate reusa snapshot de entitlement por até 7 dias só em falha de rede; catálogo/categorias/subcategorias lidos do IndexedDB (Dexie v5) no cold-start; retry periódico + badge de pendentes no PDV. Tradeoffs TA-OFF-01/02 em [[TRADEOFFS]] — [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:81), [src/lib/netStatus.js](/home/vinicius/code/zelopdv/src/lib/netStatus.js:1), [src/lib/offlineEntitlement.js](/home/vinicius/code/zelopdv/src/lib/offlineEntitlement.js:1), [src/lib/offlineDb.js](/home/vinicius/code/zelopdv/src/lib/offlineDb.js:29), [src/routes/app/+page.svelte](/home/vinicius/code/zelopdv/src/routes/app/+page.svelte:443), [docs/operations/OFFLINE.md](/home/vinicius/code/zelopdv/docs/operations/OFFLINE.md:1)
- ✅ FX-BILLING-01 — billing Pix transparente foi adicionado sem remover Stripe → `billing_payments`, endpoint de criação e webhook AbacatePay — [.ai/migrations/billing_payments_abacatepay_2026_05_21.sql](/home/vinicius/code/zelopdv/.ai/migrations/billing_payments_abacatepay_2026_05_21.sql:1), [src/routes/api/billing/pix/create/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/pix/create/+server.js:51), [src/routes/api/webhooks/abacatepay/+server.js](/home/vinicius/code/zelopdv/src/routes/api/webhooks/abacatepay/+server.js:53)
- ✅ FX-ACCESS-01 — módulo de subusuários/cargos/permissões ganhou contexto server-side e escopo owner-scoped via RLS — [src/lib/server/accessControl.js](/home/vinicius/code/zelopdv/src/lib/server/accessControl.js:106), [src/routes/api/access/activate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/access/activate/+server.js:21), [.ai/migrations/access_control_module.sql](/home/vinicius/code/zelopdv/.ai/migrations/access_control_module.sql:1)
- ✅ FX-REFERRAL-01 — referrals ganharam tracking e trilha auditável com reward manual — [.ai/migrations/referral_system_2026_05_16.sql](/home/vinicius/code/zelopdv/.ai/migrations/referral_system_2026_05_16.sql:1), [docs/referral-system.md](/home/vinicius/code/zelopdv/docs/referral-system.md:1)
- ✅ FX-ADMIN-01 — atividade admin passou a ser registrada server-side — commit `534970b` + rota [src/routes/api/admin/activity-logs/+server.js](/home/vinicius/code/zelopdv/src/routes/api/admin/activity-logs/+server.js:1)
- ✅ FX-BILLING-02 — extensão manual por data final foi implementada no admin — [src/routes/api/admin/billing/extend-subscription/+server.js](/home/vinicius/code/zelopdv/src/routes/api/admin/billing/extend-subscription/+server.js:50)
- ✅ FX-TESTS-01 — fixtures da suíte foram alinhadas ao contrato atual de CPF/CNPJ e telefone; `npm test` voltou a 140/140 — [tests/profileUtils.test.js](/home/vinicius/code/zelopdv/tests/profileUtils.test.js:1), [tests/guards.ensureActiveSubscription.test.js](/home/vinicius/code/zelopdv/tests/guards.ensureActiveSubscription.test.js:85), [tests/api.billing-pix-create.test.js](/home/vinicius/code/zelopdv/tests/api.billing-pix-create.test.js:177)
- ✅ FX-BILLING-03 — portal Stripe foi alinhado ao schema real de produção (`provider_customer_id`) — [src/routes/api/billing/create-portal-session/+server.js](/home/vinicius/code/zelopdv/src/routes/api/billing/create-portal-session/+server.js:1), [tests/api.create-portal-session.test.js](/home/vinicius/code/zelopdv/tests/api.create-portal-session.test.js:44)
- ✅ FX-BILLING-04 (2026-06-17) — trial grátis local vencido deixou de depender de interpretação ad hoc no admin: `trial_expired` virou status persistente, com migration/backfill, cron diário `/api/cron/expire-trials`, helper canônico de status e guards/endpoints de billing/Acessos checando validade por data. `past_due` segue reservado para falha/atraso de pagamento. Migration aplicada/registrada no Supabase real em 2026-06-23; auditoria prévia encontrou 0 assinaturas locais vencidas ainda em `trialing`, então não houve backfill visível nesta rodada. Cobertura: [src/lib/subscriptionStatus.js](/home/vinicius/code/zelopdv/src/lib/subscriptionStatus.js:1), [src/routes/api/cron/expire-trials/+server.js](/home/vinicius/code/zelopdv/src/routes/api/cron/expire-trials/+server.js:1), [.ai/migrations/trial_expired_status_2026_06_17.sql](/home/vinicius/code/zelopdv/.ai/migrations/trial_expired_status_2026_06_17.sql:1), [admin-dashboard/src/lib/subscriptionHelpers.js](/home/vinicius/code/zelopdv/admin-dashboard/src/lib/subscriptionHelpers.js:1), [tests/api.expire-trials.test.js](/home/vinicius/code/zelopdv/tests/api.expire-trials.test.js:1).
- ✅ FX-ZELOMENU-01 (2026-06-23) — camada PDV-owned de publicação do ZeloMenu saiu do campo implícito do produto → migration aplicada no Supabase real cria `zelomenu_product_publications`, `zelomenu_modifier_groups` e `zelomenu_modifier_options`, com RLS por owner, checagem de posse do produto/grupo, preço adicional em `price_delta`, grants mínimos para `authenticated`/`service_role` e nenhum grant para `anon`. Verificado por SQL pós-DDL e chave pública bloqueada para acesso anônimo — [.ai/migrations/zelomenu_publication_schema_2026_06_23.sql](/home/vinicius/code/zelopdv/.ai/migrations/zelomenu_publication_schema_2026_06_23.sql:1), [tests/zelomenuPublicationSchema.test.js](/home/vinicius/code/zelopdv/tests/zelomenuPublicationSchema.test.js:1)
- ✅ FX-ZELOMENU-02 (2026-06-24) — seleção em lote de Gestão → Produtos ganhou **Publicar no menu**, condicionada e revalidada pelo guard canônico `hasZeloMenuAccess`. A escrita usa upsert em lotes na camada `zelomenu_product_publications`; sucesso parcial mantém apenas as falhas selecionadas e informa os totais reais ao usuário — [src/routes/gestao/produtos/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/produtos/+page.svelte:1), [src/lib/zelomenuPublications.js](/home/vinicius/code/zelopdv/src/lib/zelomenuPublications.js:1), [tests/zelomenuPublications.test.js](/home/vinicius/code/zelopdv/tests/zelomenuPublications.test.js:1)
- ✅ FX-RLS-01 — policies de `expenses` foram alinhadas ao modelo owner-scoped para insert/update de subusuários e aplicadas no Supabase real — [.ai/migrations/expenses_owner_scoped_write_policies_2026_06_01.sql](/home/vinicius/code/zelopdv/.ai/migrations/expenses_owner_scoped_write_policies_2026_06_01.sql:1)
- ✅ FX-SUPPORT-01 — prompt do chat de suporte deixou de expor preço antigo do add-on Acessos; ambas as ocorrências (`R$ 20` → `R$ 30`) alinhadas ao catálogo canônico — [src/routes/api/chat/support/+server.js](/home/vinicius/code/zelopdv/src/routes/api/chat/support/+server.js:26), [src/routes/api/chat/support/+server.js](/home/vinicius/code/zelopdv/src/routes/api/chat/support/+server.js:137). Dívida residual (copy literal, não lê de `pricing.js`) registrada em [[TRADEOFFS]] como DT-BILLING-01.
- ✅ FX-MKT-01 (2026-06-12) — removida prova social fabricada do marketing: `aggregateRating 4.9/38` + 3 reviews falsas no JSON-LD e depoimentos inventados (Marcos/Fernanda/Carlos/Patrícia) na home e em `/vs-planilha`. Risco era penalização do Google por review schema falso + publicidade enganosa (CDC). Substituídos por seção de confiança honesta (home) e faixa de migração com CTA (`/vs-planilha`). Hero da home reposicionado: dor primeiro (PDV simples / lucro real, message-match com busca "sistema PDV lanchonete"), Zelinho como diferencial no subtítulo — [src/routes/+page.svelte](/home/vinicius/code/zelopdv/src/routes/+page.svelte:61), [src/routes/vs-planilha/+page.svelte](/home/vinicius/code/zelopdv/src/routes/vs-planilha/+page.svelte:74)

- ✅ FX-MKT-02 (2026-06-12) — a limpeza do FX-MKT-01 não cobria as segment pages: depoimentos fabricados + `aggregateRating 4.9/38` continuavam vivos em `/para-lanchonetes`, `/para-hamburguerias`, `/para-delivery`, `/para-mei` via [src/lib/data/segmentLandingPages.js](/home/vinicius/code/zelopdv/src/lib/data/segmentLandingPages.js:1) (risco de misrepresentation/suspensão de conta no Google Ads em final URLs). Removidos; seção de depoimento do template virou a seção honesta "Sem pegadinha" — [src/lib/components/marketing/SegmentLandingPage.svelte](/home/vinicius/code/zelopdv/src/lib/components/marketing/SegmentLandingPage.svelte:147)
- ✅ FX-ADS-01 (2026-06-12) — conversão Google Ads de inscrição disparava só no fim do OnboardingWizard (3 sessões após o clique → campanha registrou 34 cliques / 0 conversões). Agora dispara no sucesso do `/cadastro` e no callback OAuth, com dedup por `transaction_id` (user id) + sessionStorage; Enhanced Conversions (e-mail SHA-256 em `user_data`); GA4 `sign_up`/`begin_trial`; Consent Mode V2 default — [src/lib/googleAds.js](/home/vinicius/code/zelopdv/src/lib/googleAds.js:1), [src/routes/cadastro/+page.svelte](/home/vinicius/code/zelopdv/src/routes/cadastro/+page.svelte:56), [src/routes/auth/callback/+page.svelte](/home/vinicius/code/zelopdv/src/routes/auth/callback/+page.svelte:31), [src/app.html](/home/vinicius/code/zelopdv/src/app.html:14). **Pendência manual: habilitar Enhanced Conversions na conta Google Ads.**
- ✅ FX-AUTH-01 (2026-06-14) — removido o bloqueio de confirmação por e-mail no cadastro pago por tráfego: `POST /api/auth/signup` cria usuário confirmado com service role (`email_confirm: true`), faz `signInWithPassword` e devolve sessão; `/cadastro` grava a sessão, preserva referral, dispara `sign_up`/Google Ads e redireciona para `/perfil?msg=complete` (OnboardingWizard). Cobertura: [tests/api.auth-signup.test.js](/home/vinicius/code/zelopdv/tests/api.auth-signup.test.js:1), `npm run check` 0 errors / 106 warnings, `npm test` 151/151. Requer `SUPABASE_SERVICE_ROLE_KEY` no servidor.
- ✅ FX-ADS-02 (2026-06-14) — PostHog adicionado para heatmap/autocapture anonimo em paginas publicas do funil, com allowlist centralizada e bloqueio de `/app`, `/gestao`, `/relatorios`, `/perfil`, `/assinatura`, `/ferramentas` e `/auth/callback`; session recording desabilitado no client. Requer `PUBLIC_POSTHOG_KEY`. Cobertura: [src/lib/posthogClient.js](/home/vinicius/code/zelopdv/src/lib/posthogClient.js:1), [tests/posthogClient.test.js](/home/vinicius/code/zelopdv/tests/posthogClient.test.js:1).

## Agendado para a próxima sprint (2026-06-02)

> 3 frentes promovidas de [[TRADEOFFS]] (seção "Promovido para a próxima sprint"). Plano completo e
> definição de pronto ficam lá; aqui fica a trilha de execução. Marque ✅ conforme cada frente fechar.

- ⏳ SPRINT-1 — quebrar os god-components, começando pelo fluxo de pagamento de `src/routes/app/mesas/[id]/+page.svelte` (~3.400 linhas). Reclassifica `DT-ARCH-01` de prioridade baixa → ativa; extrair lógica para componentes/store testável reusando [src/lib/components/modals/ModalPagamento.svelte](/home/vinicius/code/zelopdv/src/lib/components/modals/ModalPagamento.svelte:1)
- ⏳ SPRINT-2 — defesa em profundidade em acessos continua incremental: Despesas e PIN já foram migrados;
  faltam outras mutações sensíveis, revisão de handlers do admin e testes amplos de escalonamento — [docs/modules/ACESSOS.md](/home/vinicius/code/zelopdv/docs/modules/ACESSOS.md:1)
- ⏳ SPRINT-3 — confirmar/monitorar o sweeper de deleção (LGPD, absorve OPS-DELETE-01); reativação fail-closed,
  linha viva única de assinatura e Pix sem fallback já estão concluídos — [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:28)

## Pendentes confirmados nesta sessão

- ⏳ FX-PENDING-05 — modelo de permissao do add-on Acessos ainda é majoritariamente gating de UI fora das
  superficies migradas; Despesas já exige `despesas.visualizar`/`despesas.gerenciar` no RLS — [docs/modules/ACESSOS.md](/home/vinicius/code/zelopdv/docs/modules/ACESSOS.md:1) → **SPRINT-2 incremental**
- [x] FX-PENDING-06 — `AdminLock` deixou de carregar `pin_admin` em claro no cliente; status/verificação/alteração
  passam por `/api/auth/admin-pin`, com rate limit e alteração owner-only — [src/lib/components/AdminLock.svelte](/home/vinicius/code/zelopdv/src/lib/components/AdminLock.svelte:1)

## Pendência operacional fora do repo

- ⚠️ OPS-DELETE-01 — a fonte do sweeper está em `ZeloChat/server/accountDeletionSweeper.ts` e é ligada no startup,
  mas deploy/monitoramento em produção ainda não foram confirmados — [.ai/migrations/account_deletion_grace_2026_05_31.sql](/home/vinicius/code/zelopdv/.ai/migrations/account_deletion_grace_2026_05_31.sql:5) → **agendado em SPRINT-3**, prioridade por LGPD
- [x] FX-ADMIN-METRIC-SCOPE (2026-08-04) — criado o escopo global configurável
  por empresa no dashboard administrativo. A configuração persistida no
  Supabase controla as métricas de base, financeiro e engajamento; Donutopia e
  Téchne permanecem excluídas por padrão.
