# Fixes Progress

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
