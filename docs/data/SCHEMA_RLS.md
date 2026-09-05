# Schema + RLS

> Fonte operacional para tenancy, RLS e trust boundaries.
> Ler junto com [[CLAUDE]] e [[CODE_REVIEW]] quando a tarefa tocar `supabase`, subusuarios, `empresa_perfil` ou qualquer mutacao server-side.

## Estado desta doc

- Baseada em código, baseline/ledger em `supabase/` e migrations forward; `.ai/migrations/` é somente acervo legado.
- Nao substitui validacao no banco real de producao.
- Quando houver conflito entre esta doc e o schema real, o schema real vence e a doc deve ser atualizada.

Verificação live em 2026-09-04: nenhuma tabela pública base com SELECT
acessível e RLS desligado apareceu no catálogo consultado. Isso não certifica
as permissões de todas as operações. `create_zelo_order`, confirmação WhatsApp
atômica e função de salvar delivery continuam sem EXECUTE para anon/authenticated.
O erro record/JSONB da função de delivery foi corrigido por
`20260904222157_delivery_pricing_rule_jsonb.sql`, sem mudar grants. Advisors
e limites do lint estão detalhados em `docs/audits/2026-09-04-zelopdv.md`.

## Snapshot financeiro de fechamento (2026-08-28)

- A migration `supabase/migrations/20260828120000_caixa_payment_totals.sql`
  adiciona `caixa_fechamentos.totais_pagamento jsonb not null default '{}'`.
- A coluna exige JSONB do tipo objeto e guarda totais positivos por ID de
  pagamento, incluindo métodos nativos, plataformas dinâmicas, fiado e
  desconhecidos; `multiplo` é apenas marcador e não é salvo como meio.
- Fechamentos antigos recebem `dinheiro`, `pix` e `cartao` a partir das colunas
  legadas. As colunas antigas continuam preenchidas para compatibilidade.
- A migration não altera RLS, grants ou policies: INSERT continua exigindo
  `caixa.fechar` e SELECT continua exigindo `relatorios.ver` para subusuários.

## Pizzas montáveis — migration aplicada em 2026-09-05

`20260905144329_pizza_composition_contract.sql`, aplicada e registrada no
Supabase vinculado, acrescenta `produtos.tipo_produto`
(`simples`/`pizza`), `pizza_config` e `empresa_perfil.pizza_pricing_mode`
(`highest`/`average`). A configuração é publicada exclusivamente por
`save_pizza_config(integer, uuid, jsonb)`: exige `produtos.gerenciar`, valida o
titular e compara a revisão esperada antes de gerar uma UUID no servidor.
`save_pizza_pricing_mode(text)` exige o titular e republica as pizzas da loja.

`pizza_config_revisions` tem RLS, leitura pelo titular efetivo e nenhuma escrita
direta concedida aos clientes. Cada revisão preserva configuração, preços e
vínculos de complementos e o destino de estoque (produto ou categoria
compartilhada, incluindo os indicadores de controle). Mudanças nessas
dependências publicam revisões novas; quantidade de estoque não gera revisão.
As funções internas não têm EXECUTE para `authenticated`/`anon`.

`vendas_itens`, `comanda_itens` e `zelo_order_items` guardam `pizza jsonb` com
tamanho, sabores ordenados, frações iguais, regra, preço base e observação
opcional de até 200 caracteres. Sabores nunca são vínculos de estoque. Grupos
projetados `__pizza_size`, `__pizza_flavors` e `__pizza_notes` são apresentação,
com acréscimo zero e sem produto vinculado. Complementos continuam usando os
limites independentes de opções distintas e quantidade total.

Compras novas exigem revisão atual. `criar_venda_completa` aceita
`pizza_offline: true` para validar a revisão histórica e preservar o valor já
cobrado. Quando há pizza, reconstrói as necessidades de estoque dos itens no
banco, sem confiar na lista de estoque enviada pelo cliente. Repetições
preservam a chave `client_sale_id` e a proteção de owner/operador existente.
Conversão de pedido já reservado não baixa estoque novamente. Envio de item
de mesa antigo à cozinha aceita histórico somente com composição, preço,
quantidade e complementos iguais ao item persistido da mesma loja.

`comanda_aplicar_delta_item` passa a ter sexto argumento opcional
`p_pizza jsonb`; o overload antigo é removido para evitar ambiguidade no
PostgREST. Chamadas comuns de cinco argumentos continuam válidas. A reserva
e a devolução de pizzas usam o destino de estoque da revisão, mesmo após
mudar a categoria ou desligar o controle no cadastro.

Produtos comuns com movimentos existentes não podem ser convertidos no mesmo
ID: o editor cria um novo rascunho. Arquivar uma pizza via RPC oculta-a no PDV
e no Menu na mesma transação. Exclusão física de pizzas, produtos vinculados
e categorias de estoque referenciadas é recusada para preservar histórico e
fila offline; a exclusão integral da conta via cascade de `auth.users` continua
permitida. As revisões não são apagadas por edição ou arquivamento.

Verificação transacional: `supabase/verification/pizza_composition_runtime.sql`,
somente com `scripts/verify-supabase-baseline.ps1 -ApplyForwardMigrations
-ExcludeTenantDataSeeds -PostMigrationVerification
supabase/verification/pizza_composition_runtime.sql`. Cobre ACL, CAS, preços,
estoque histórico, fila idempotente, mesas, pedidos, arquivo e purge de conta.
Esta seção descreve código local; não afirma aplicação ao banco compartilhado.

## Modelo de tenancy observado

- A empresa continua ancorada no owner.
- Tabelas operacionais de dominio tendem a usar `id_usuario` apontando para o owner.
- Tabelas de billing usam `user_id`.
- Para subusuarios, o RLS principal foi ampliado para usar `get_owner_user_id(auth.uid())`, permitindo operar em nome da empresa dona.

Em termos práticos:

- owner autenticado -> enxerga/escreve seus proprios dados
- subusuario ativo -> enxerga/escreve dados da empresa do owner, dentro do que o codigo de aplicacao permitir
- `supabaseAdmin` -> ignora RLS e deve ficar restrito a handlers server-side

## Policies e padrao dominante

Fonte principal: `.ai/migrations/rls_subuser_access.sql`.

Padrao recorrente:

- `vendas`, `caixas`, `produtos`, `pessoas`, `mesas`, `comandas`, `pedidos`:
  `get_owner_user_id(auth.uid()) = id_usuario`
- tabelas filhas (`vendas_itens`, `comanda_itens`, `pedido_itens`):
  `EXISTS (...)` apontando para a tabela pai da empresa dona
- `subscriptions`:
  SELECT liberado para subusuario quando `get_owner_user_id(auth.uid()) = user_id`
- `empresa_perfil`:
  SELECT permitido para owner, subusuario da empresa e super admin

## Tabelas centrais que importam para seguranca

| Area | Tabelas / funcoes | Observacao |
| --- | --- | --- |
| Billing | `subscriptions`, `billing_payments`, `webhook_events_processed`, `billing_webhook_events` | acesso final depende de `subscriptions` |
| Acessos | `access_users`, `access_roles`, `access_settings`, `access_audit_logs` | papéis e permissões vivem em JSON; writes de auditoria client-side exigem operador autenticado e owner resolvido |
| Operacao | `vendas*`, `caixas*`, `pessoas`, `fiado_lancamentos`, `produtos`, `mesas`, `comandas*`, `pedidos*` | escopo por owner via RLS |
| ZeloMenu | `zelomenu_product_publications`, `zelomenu_modifier_groups`, `zelomenu_modifier_options` | camada PDV-owned de publicação/modificadores, escopo por owner via RLS |
| Perfil | `empresa_perfil` | contem dados operacionais e `pin_admin` |

### `access_users` (estado remoto verificado em 2026-08-12)

- `access_users_owner` concede CRUD somente quando o autenticado e o titular
  efetivo (`auth.uid() = owner_user_id` e
  `get_owner_user_id(auth.uid()) = auth.uid()`).
- `access_users_self_select` permite ao subusuario ativo ler apenas a propria
  linha para resolver contexto e permissoes.
- `access_users_super_admin_select` preserva a leitura cross-tenant do
  super-admin ativo; nao existe policy nova de escrita para ele.
- Convite, ativacao, alteracao de cargo/status e remocao continuam usando
  `supabaseAdmin` nos handlers server-side.
| Telemetria de módulos | `product_usage_events` | presença diária por módulo, server-owned; não registra cliques nem conteúdo |
| RPC critica | `criar_venda_completa(jsonb)` | usa `get_owner_user_id(auth.uid())` |
| Pedidos online | `zelo_orders`, `zelo_order_items`, `zelo_order_events` | leitura owner-scoped; mutacoes somente por RPC |
| Outbox online | `zelo_order_outbox` | somente `service_role`; sem acesso pelo browser |

## Trust boundaries reais

### `supabase` / anon key

- Usado no browser.
- Depende integralmente de RLS e policies do banco.
- Sempre assumir que qualquer dado retornado aqui e observavel no cliente.

### `supabaseAdmin`

- Service role.
- Ignora RLS.
- Deve existir so em codigo server-side (`+server.js`, helpers server-only, cron/admin backend).

### `get_owner_user_id(auth.uid())`

- Resolve owner de owner ou subusuario.
- E a base do tenant scoping atual.
- Nao implementa permissao por papel; apenas decide "em nome de qual empresa" a consulta roda.

## Fiado auditável

Migration local: `.ai/migrations/fiado_ledger_2026_07_15.sql` (aguarda validação/aplicação no banco real).

- `fiado_lancamentos` é leitura owner-scoped para o titular e subusuários com
  `fiado.visualizar`; escrita direta pelo browser é revogada.
- `fiado_registrar_pagamento_v2(...)` valida `fiado.receber` para subusuários, bloqueia a pessoa durante a operação e grava pagamento, saldo e suprimento de caixa na mesma transação.
- `fiado_estornar_venda(...)` cria evento compensatório ao desfazer uma venda; o razão não perde histórico.
- Triggers registram novos débitos de vendas fiado simples e de parcelas fiado em venda múltipla. Saldos anteriores entram como um lançamento único `saldo_inicial` porque pagamentos antigos não são reconstituíveis.

- `fiado_excluir_pagamento(...)` e uma exclusao intencional para corrigir lancamentos feitos por engano: remove o recebimento, a movimentacao de caixa vinculada e ajusta o saldo na mesma transacao.

## ZeloMenu publication layer

Migration local: `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql`.
Estado produção em 2026-06-23: aplicada no Supabase real como `zelomenu_publication_schema_2026_06_23`.

- `zelomenu_product_publications` guarda visibilidade online, nome/descricao/foto publicos, ordem e pausa manual por produto.
- `zelomenu_modifier_groups` e `zelomenu_modifier_options` guardam adicionais/variacoes vinculados ao produto comum.
- O produto base segue em `produtos`; preco base segue em `produtos.preco`.
- `produtos.ocultar_no_pdv` nao controla publicacao online. A visibilidade do ZeloMenu e `zelomenu_product_publications.visivel_online` + `pausado_manualmente`.
- RLS usa `get_owner_user_id(auth.uid()) = id_usuario`; writes tambem verificam que o produto/grupo pertence ao mesmo `id_usuario`.
- As tabelas novas incluem grants explicitos mínimos (`select`, `insert`, `update`, `delete`) para `authenticated`/`service_role` e revogam `anon`, porque RLS sozinho nao deve ser assumido como permissao de acesso ao PostgREST.
- Verificação pós-rollout: RLS ligado nas 3 tabelas, 4 policies por tabela, constraints/FKs/índices presentes, nenhum grant para `anon` e chave pública bloqueada para acesso anônimo.

## ZeloMenu catalog write capabilities

- Desde `20260813020000_catalog_extensions_rbac.sql`, INSERT/UPDATE/DELETE
  de `zelomenu_modifier_groups`, `zelomenu_modifier_options`,
  `zelomenu_modifier_option_products` e `zelomenu_product_publications`
  tambem exigem `produtos.gerenciar` para subusuarios.
- Owner, service-role e SELECT owner-scoped permanecem preservados; o cache
  do PDV continua lendo a configuracao do tenant.

## ZeloMenu table capabilities

- `public.zelomenu_table_capabilities` e uma tabela server-owned para capacidades temporarias de mesa.
- Em producao (2026-07-28), RLS esta ligado, nao ha policies para browser roles e os grants de `anon`/`authenticated` foram revogados.
- As RPCs `issue_table_capability(...)` e `revoke_table_capability(...)` sao `SECURITY DEFINER` e aceitam somente `service_role`; nao devem ser expostas pelo PostgREST a usuarios ou ao cliente publico.
- A tabela estava vazia e nenhuma sessao de carrinho usava `capability_id` no momento da correcao.

## O que o add-on Acessos realmente garante hoje

- Contexto owner/subusuario existe no servidor (`src/lib/server/accessControl.js`).
- O browser tambem resolve esse contexto (`src/lib/accessControl.js`).
- O RLS abre o conjunto de dados da empresa dona para subusuarios ativos.
- O JSON de permissoes por papel e consultado majoritariamente no cliente para mostrar/esconder rotas e acoes.

Conclusao operacional:

- hoje existe tenant scoping forte por empresa
- nao existe garantia uniforme de RBAC fino no servidor

## Vendas: criação, cancelamento e mutações pós-criação

- Desde `20260813030000_discount_rbac.sql`, INSERT/UPDATE de `valor_desconto`
  positivo exigem `pdv.desconto` no actor efetivo. Desconto zero continua
  compatível; fechamento direto de Mesa continua usando `mesas.fechar`.

- `vendas_insert_rbac_guard` exige `pdv.vender` e `pdv.receber` para o
  caminho POS/offline (`criar_venda_completa`) e para INSERTs diretos
  não-Mesa.
- O INSERT direto usado pelo fechamento de Mesa exige `mesas.fechar`; o guard
  distingue esse caminho do `SECURITY DEFINER` para não aceitar um payload
  POS forjado como `tipo_pedido = 'mesa'`.
- A migration `20260813000000_sales_creation_rbac.sql` revoga EXECUTE anônimo
  de `criar_venda_completa`, mantendo authenticated/service-role e o contrato
  do payload.

- `vendas_actor_delete` usa `vendas_actor_can_delete(bigint)` e exige
  `pdv.cancelar` para vendas concluídas.
- A única exceção é o rollback de uma venda vazia, criada pelo operador atual
  nos últimos 15 minutos, sem itens, pagamentos ou taxas de plataforma. Isso
  preserva a compensação do fechamento de Mesas sem liberar exclusão histórica.
- UPDATE/DELETE de `vendas_itens`, `vendas_pagamentos` e
  `vendas_taxas_plataforma` também exigem `pdv.cancelar`.
- SELECT, cancelamento e service-role permanecem fora desta fatia; o fluxo de
  recebimento parcial e ownership da RPC será avaliado separadamente.

## Caixa: mutações por capacidade

- INSERT de `caixas` exige `caixa.abrir` e mantém `id_usuario` no owner
  resolvido do ator.
- UPDATE de `caixas` exige `caixa.fechar`; DELETE continua owner-only.
- INSERT de `caixa_movimentacoes` exige `caixa.movimentar` e caixa ainda aberto.
- INSERT de `caixa_fechamentos` exige `caixa.fechar`.
- SELECT de `caixa_fechamentos` exige `relatorios.ver` para subusuários;
  owners mantêm bypass e `anon` não possui grant. Leituras das tabelas
  operacionais compartilhadas e o bypass deliberado de `service_role` continuam
  inalterados.

## Mesas: pagamentos parciais por capacidade

- SELECT de `mesas`, `comandas`, `comanda_itens`,
  `comanda_pagamentos` e `comanda_pagamento_itens` exige `mesas.acessar`
  para subusuários. `comandas` também aceita `relatorios.ver` somente para o
  resumo de comandas fechadas usado pelo relatório. Owners mantêm bypass,
  `service_role` permanece fora do RLS e grants de `anon` foram revogados.

- As mutações de `comanda_pagamentos` e `comanda_pagamento_itens` continuam
  exigindo `mesas.acessar` e capacidade de recebimento.
- INSERT/UPDATE/DELETE exigem `mesas.acessar` e `pdv.receber` ou
  `pedidos.receber` para subusuários; o owner mantém o bypass da função
  `fiado_actor_can`.
- O contrato de linhas, alocações, fechamento completo e service-role não foi
  alterado nesta fatia.

## Mesas: operação por capacidade

- `comandas` INSERT exige `mesas.abrir_comanda`; DELETE exige
  `mesas.cancelar`.
- `comanda_itens` INSERT/UPDATE/DELETE exige `mesas.editar_itens`.
- Triggers em `mesas` e `comandas` comparam `OLD`/`NEW` para exigir
  `mesas.abrir_comanda` ao ocupar, `mesas.fechar` ao fechar/liberar e
  `mesas.cancelar` ao cancelar. Campos de fechamento (`id_venda`,
  `total_calculado`, `fechada_em`) também exigem `mesas.fechar`.
- A migration `20260812233000_mesas_operational_rbac.sql` não altera grants,
  leituras owner-scoped ou service-role.
- A migration `20260812234500_mesas_operational_rpc_rbac.sql` torna as três
  RPCs de estoque `SECURITY DEFINER` com `search_path` fixo, resolve
  `get_owner_user_id(auth.uid())`, exige a capability da operação e mantém o
  bypass explícito do service-role. O contrato dos argumentos permanece
  inalterado.

## Ponto critico: `empresa_perfil.pin_admin`

- `empresa_perfil.pin_enabled` é `boolean NOT NULL DEFAULT true` e controla se
  a barreira administrativa está ativa. O estado desativado é representado por
  `pin_enabled = false` e `pin_admin = null`; a migration
  `20260820154751_admin_pin_optional.sql` é idempotente para bases que já
  receberam a coluna pelo baseline.
- A migration `20260813060000_empresa_perfil_pin_select_containment.sql`
  remove o SELECT de tabela de `anon`/`authenticated` e concede somente
  colunas explicitas sem `pin_admin` a `authenticated`; os wildcards legados do
  PDV foram reduzidos aos campos necessarios. `service_role` continua com o
  caminho completo para o endpoint server-side.

- Paginas como `relatorios` e `despesas` consultam apenas o status de configuração por `/api/auth/admin-pin`.
- `AdminLock` envia a tentativa ao endpoint autenticado; o valor bruto não atravessa o Data API nem é
  retornado ao browser.
- O endpoint resolve o owner para subusuários e restringe alteração do PIN ao titular.

## Ponto critico: `expenses`

- A pagina de despesas resolve o contexto via `ensureActiveSubscription`.
- Depois disso, consulta `expenses` pelo `uid` do owner.
- A página usa `AdminLock` para UX; as policies de `20260812193009_expenses_role_rbac.sql` também exigem
  `despesas.visualizar` para leitura e `despesas.gerenciar` para mutações de subusuários.

## Ponto crítico: catálogo base

- `produtos`, `categorias` e `subcategorias` continuam com SELECT owner-scoped
  para que Caixa/Atendente carreguem o catálogo no PDV.
- A migration `20260812195032_products_role_rbac.sql` restringe INSERT/UPDATE/
  DELETE de subusuários ativos à chave `produtos.gerenciar`; o owner mantém o
  bypass existente e `service_role` não muda.
- A permissão distinta `estoque.ajustar` usa as RPCs
  `ajustar_estoque_produto`/`ajustar_estoque_categoria` da migration
  `20260812200550_catalog_stock_adjustment_rpc.sql`; elas alteram somente os
  campos de estoque e não são executáveis por `anon`.
- A página `/gestao/produtos` é browser-side, então a policy é a barreira de
  segurança real para chamadas diretas ao Data API.

## Pessoas

## Taxas de plataforma

- `vendas_taxas_plataforma` permanece owner-scoped para o titular, mas SELECT
  de subusuários exige `caixa.ver` ou `relatorios.ver`, conforme a migration
  `20260813070000_vendas_taxas_select_rbac.sql`.
- `/relatorios` e `/gestao/caixa` são os consumidores browser legítimos; o
  motor de inteligência usa service-role. INSERT/DELETE e as tabelas de venda
  não foram alterados nesta fatia.

## Pagamentos de venda e movimentações de caixa

- `vendas_pagamentos` exige `pdv.acessar`, `pdv.receber`, `mesas.acessar`,
  `caixa.ver` ou `relatorios.ver` para SELECT de subusuários.
- `caixa_movimentacoes` exige `pdv.acessar`, uma capacidade `caixa.*` de
  operação/leitura ou `relatorios.ver` para SELECT de subusuários.
- A migration `20260813080000_sales_payment_cash_read_rbac.sql` revoga os
  grants de `anon` e não altera INSERT/UPDATE/DELETE. `vendas` e
  `vendas_itens` seguem em fatia posterior por atenderem POS, Fichário,
  Dashboard, Relatórios e fechamento de Mesa.

## Histórico de vendas e itens

- SELECT de `vendas` e `vendas_itens` exige, para subusuários, uma capability
  operacional de PDV, Mesas, Caixa, Relatórios ou `fiado.visualizar`.
- A migration `20260813090000_sales_history_read_rbac.sql` revoga SELECT de
  `anon`, mantém o vínculo de `vendas_itens` com a venda-pai e não altera
  INSERT/UPDATE/DELETE.
- A companion forward-only
  `20260813091000_sales_history_read_rbac_performance.sql` mantém a mesma união
  de capabilities, mas calcula a autorização uma vez por statement e deixa
  `vendas_itens` herdar a visibilidade da venda-pai. Isso evita chamadas ao
  helper por linha/capability sem criar função ou RPC nova.
- O Fichário ainda recebe leitura owner-scoped completa por
  `fiado.visualizar`; limitar a somente vendas referenciadas no ledger requer
  outra fronteira de consulta e não faz parte desta contenção.

- `pessoas` continua com SELECT owner-scoped porque `/app`, Mesas, Fichário,
  Relatórios e o fluxo de fiado precisam ler nomes/saldos em operação normal.
- A migration `20260812202400_pessoas_role_rbac.sql` exige
  `pessoas.gerenciar` para INSERT/UPDATE/DELETE de subusuários; titular e
  `service_role` mantêm bypass deliberado.
- `fiado_registrar_pagamento_v2`, `fiado_excluir_pagamento` e
  `fiado_excluir_pessoa` já fazem suas próprias checagens de
  `fiado.receber`/`pessoas.gerenciar`; esta migration não altera o ledger nem o
  contrato de recebimento.

## Regras praticas para mudancas

1. Se tocar em `supabaseAdmin`, documente por que a operacao precisa furar RLS.
2. Se tocar em `empresa_perfil`, avalie se o campo pode ser exposto ao cliente.
3. Se adicionar nova superficie sensivel para subusuario, defina:
   - qual e o owner scope
   - se basta gating de UI
   - se precisa de enforcement server-side
4. Se mudar `criar_venda_completa`, revalidar offline, `id_operador` e idempotencia.

## Motor canonico de pedidos online e cozinha de mesa

Migration base: `.ai/migrations/canonical_online_orders_2026_07_12.sql`; o contrato adicional de mesa e a aposentadoria do legado foram aplicados em produção em 2026-07-28 pelas migrations listadas abaixo.

- `zelo_orders` e `zelo_order_items` sao a fonte canonica para pedidos online de ZeloMenu/ZeloChat e para os bilhetes `source='mesa'`; a rota QR `table_order` e o envio da comanda convergem nesse agregado.
- O item da comanda enviado pelo PDV carrega `fulfillment.comandaItemId` e ja consumiu estoque no momento em que entrou na comanda; o QR publico nao carrega esse campo e consome estoque na transicao para `accepted`.
- Criacao, transicao e fechamento passam pelas RPCs `create_zelo_order`, `transition_zelo_order` e `close_zelo_order`, com idempotencia e CAS por `revision`.
- Owner e subusuarios ativos com `pedidos.acessar` ou `pedidos.cozinha` podem
  ler orders/items/events do tenant; papéis apenas de recebimento/cancelamento
  não recebem leitura direta. Inserts/updates diretos continuam revogados e
  integrações públicas criam via `service_role`. Enforcement aplicado pela
  migration `20260813094000_canonical_orders_select_rbac.sql`.
- Para subusuarios, as RPCs tambem consultam `access_users`/`access_roles.permissions`: acesso, cozinha, recebimento e cancelamento exigem suas respectivas chaves `pedidos.*`; owner e `service_role` mantem bypass deliberado.
- `zelo_order_events` preserva a auditoria e `zelo_order_outbox` desacopla notificacao/impressao com retry.
- O cutover preservou os IDs do motor canônico; as tabelas legadas `pedidos`/`pedido_itens` foram removidas depois do snapshot sanitizado e da validação do DDL, conforme decisão registrada no handoff.

Migration de aposentadoria aplicada em producao em 2026-07-28: `.ai/migrations/pedidos_cozinha_source_mesa_and_drop_2026_07_28.sql` removeu `pedidos`/`pedido_itens`/`proximo_numero_pedido` na mesma transacao em que atualizou `delete_account`; `.ai/migrations/pedidos_cozinha_entitlement_columns_drop_2026_07_28.sql` recriou `user_entitlements` sem `has_pedidos_addon` e removeu as colunas legadas de `subscriptions` e `billing_payments`. As assercoes pos-DDL confirmaram os objetos ausentes, o `CHECK` de `source='mesa'` e os ACLs esperados.

## Zelo Intelligence Engine — tabelas adicionadas em 2026-07-10

Migration: `.ai/migrations/intelligence_engine_v1_2026_07_10.sql`.

| Tabela | Finalidade | RLS | Grants |
|--------|-----------|-----|--------|
| `business_daily_snapshots` | Snapshots diários de métricas por empresa | SELECT owner-scoped + `relatorios.ver` para subusuários; INSERT/UPDATE/DELETE service_role | `authenticated`: select; `service_role`: full |
| `business_signals` | Sinais determinísticos detectados | SELECT owner-scoped + `relatorios.ver` para subusuários; UPDATE read_at com a mesma capability; INSERT/DELETE service_role | `authenticated`: select, update(read_at); `service_role`: full |
| `business_intelligence_runs` | Logs de execução do cron | RLS ligado, sem policy para `authenticated` | só `service_role` |

`empresa_perfil` mantém a coluna histórica `intelligence_enabled_at timestamptz`, usada no piloto inicial. Desde 2026-07-30 ela não controla mais o acesso: o Zelinho Gerente está disponível globalmente para empresas com assinatura ativa ou em trial. O kill switch operacional é `INTELLIGENCE_ENGINE_ENABLED=false`.

## Telemetria mínima de módulos — adicionada em 2026-07-30

Migration: `.ai/migrations/product_usage_events_2026_07_30.sql`.

- `product_usage_events` guarda somente a presença diária da empresa em um módulo (`feature`), com primeira/última abertura no dia.
- A tabela não recebe cliques, conteúdo, itens consultados nem dados pessoais novos.
- RLS está ativo e não há grants para `anon`/`authenticated`; a escrita passa por `POST /api/product-usage`, que autentica a sessão e resolve o owner para subusuários. A leitura de analytics passa por `GET /api/admin/usage-insights`, limitado a super admins.

## Pendente de validacao

- Confirmar no banco real se todas as policies de `.ai/migrations/rls_subuser_access.sql` batem com producao.
- `expenses` foi reconciliada em produção pela migration `20260812193009_expenses_role_rbac.sql`:
  owner mantém CRUD; subusuário precisa de `despesas.visualizar` para SELECT ou
  `despesas.gerenciar` para mutações.
- `pin_admin` agora é verificado por `/api/auth/admin-pin`; o valor bruto não é selecionado pelo browser.

## Zelinho Gerente conversacional

- `gerente_agent_sessions`, `gerente_agent_messages`, `gerente_agent_actions`: owner-scoped por
  `owner_user_id`. SELECT via RLS com `get_owner_user_id(auth.uid())` e
  `fiado_actor_can('relatorios.ver', owner_user_id)`. Toda escrita é service-role (servidor).
- RPCs `gerente_*`: `security definer`. Com service role exigem `p_owner`; com `authenticated`
  resolvem o owner e exigem `produtos.gerenciar`. `gerente_set_menu_pause` escreve apenas
  `zelomenu_product_publications.pausado_manualmente`.
- `ai_usage_logs.chat_type` aceita `gerente_agent`.
- `gerente_phone_links` e `gerente_pairing_codes` são service-role only, sem policies nem
  grants para anon/authenticated; o dono consulta o vínculo via `/api/gerente/pair`.
