# Schema + RLS

> Fonte operacional para tenancy, RLS e trust boundaries.
> Ler junto com [[CLAUDE]] e [[CODE_REVIEW]] quando a tarefa tocar `supabase`, subusuarios, `empresa_perfil` ou qualquer mutacao server-side.

## Estado desta doc

- Baseada em codigo do repo + migrations em `.ai/migrations/`.
- Nao substitui validacao no banco real de producao.
- Quando houver conflito entre esta doc e o schema real, o schema real vence e a doc deve ser atualizada.

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
| Acessos | `access_users`, `access_roles`, `access_settings`, `access_audit_logs` | papeis e permissoes vivem em JSON |
| Operacao | `vendas*`, `caixas*`, `pessoas`, `fiado_lancamentos`, `produtos`, `mesas`, `comandas*`, `pedidos*` | escopo por owner via RLS |
| ZeloMenu | `zelomenu_product_publications`, `zelomenu_modifier_groups`, `zelomenu_modifier_options` | camada PDV-owned de publicação/modificadores, escopo por owner via RLS |
| Perfil | `empresa_perfil` | contem dados operacionais e `pin_admin` |
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

- `fiado_lancamentos` é leitura owner-scoped para usuários autenticados; escrita direta pelo browser é revogada.
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

## Ponto critico: `empresa_perfil.pin_admin`

- Paginas como `relatorios` e `despesas` carregam `pin_admin` no cliente e passam o valor bruto para `AdminLock`.
- `AdminLock` compara `inputPin === correctPin` no browser.
- Como `empresa_perfil` e legivel para subusuarios ativos, o PIN nao deve ser tratado como segredo forte.

## Ponto critico: `expenses`

- A pagina de despesas resolve o contexto via `ensureActiveSubscription`.
- Depois disso, consulta `expenses` pelo `uid` do owner.
- A pagina usa `AdminLock`, mas nao ha um gate server-side de permissao por papel antes de carregar a superficie.

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
- Usuarios autenticados podem ler o tenant do owner e executar transicoes; inserts/updates diretos sao revogados. Integracoes publicas criam via `service_role`.
- Para subusuarios, as RPCs tambem consultam `access_users`/`access_roles.permissions`: acesso, cozinha, recebimento e cancelamento exigem suas respectivas chaves `pedidos.*`; owner e `service_role` mantem bypass deliberado.
- `zelo_order_events` preserva a auditoria e `zelo_order_outbox` desacopla notificacao/impressao com retry.
- O cutover preservou os IDs do motor canônico; as tabelas legadas `pedidos`/`pedido_itens` foram removidas depois do snapshot sanitizado e da validação do DDL, conforme decisão registrada no handoff.

Migration de aposentadoria aplicada em producao em 2026-07-28: `.ai/migrations/pedidos_cozinha_source_mesa_and_drop_2026_07_28.sql` removeu `pedidos`/`pedido_itens`/`proximo_numero_pedido` na mesma transacao em que atualizou `delete_account`; `.ai/migrations/pedidos_cozinha_entitlement_columns_drop_2026_07_28.sql` recriou `user_entitlements` sem `has_pedidos_addon` e removeu as colunas legadas de `subscriptions` e `billing_payments`. As assercoes pos-DDL confirmaram os objetos ausentes, o `CHECK` de `source='mesa'` e os ACLs esperados.

## Zelo Intelligence Engine — tabelas adicionadas em 2026-07-10

Migration: `.ai/migrations/intelligence_engine_v1_2026_07_10.sql`.

| Tabela | Finalidade | RLS | Grants |
|--------|-----------|-----|--------|
| `business_daily_snapshots` | Snapshots diários de métricas por empresa | SELECT owner-scoped; INSERT/UPDATE/DELETE service_role | `authenticated`: select; `service_role`: full |
| `business_signals` | Sinais determinísticos detectados | SELECT owner-scoped; UPDATE read_at owner-scoped; INSERT/DELETE service_role | `authenticated`: select, update(read_at); `service_role`: full |
| `business_intelligence_runs` | Logs de execução do cron | RLS ligado, sem policy para `authenticated` | só `service_role` |

`empresa_perfil` mantém a coluna histórica `intelligence_enabled_at timestamptz`, usada no piloto inicial. Desde 2026-07-30 ela não controla mais o acesso: o Zelinho Gerente está disponível globalmente para empresas com assinatura ativa ou em trial. O kill switch operacional é `INTELLIGENCE_ENGINE_ENABLED=false`.

## Telemetria mínima de módulos — adicionada em 2026-07-30

Migration: `.ai/migrations/product_usage_events_2026_07_30.sql`.

- `product_usage_events` guarda somente a presença diária da empresa em um módulo (`feature`), com primeira/última abertura no dia.
- A tabela não recebe cliques, conteúdo, itens consultados nem dados pessoais novos.
- RLS está ativo e não há grants para `anon`/`authenticated`; a escrita passa por `POST /api/product-usage`, que autentica a sessão e resolve o owner para subusuários. A leitura de analytics passa por `GET /api/admin/usage-insights`, limitado a super admins.

## Pendente de validacao

- Confirmar no banco real se todas as policies de `.ai/migrations/rls_subuser_access.sql` batem com producao.
- Confirmar o schema real da tabela `expenses` e suas policies atuais.
- Definir se `pin_admin` continuara existindo como trava de conveniencia ou sera redesenhado.
