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
| Operacao | `vendas*`, `caixas*`, `pessoas`, `produtos`, `mesas`, `comandas*`, `pedidos*` | escopo por owner via RLS |
| ZeloMenu | `zelomenu_product_publications`, `zelomenu_modifier_groups`, `zelomenu_modifier_options` | camada PDV-owned de publicação/modificadores, escopo por owner via RLS |
| Perfil | `empresa_perfil` | contem dados operacionais e `pin_admin` |
| RPC critica | `criar_venda_completa(jsonb)` | usa `get_owner_user_id(auth.uid())` |

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

## ZeloMenu publication layer

Migration local: `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql`.

- `zelomenu_product_publications` guarda visibilidade online, nome/descricao/foto publicos, ordem e pausa manual por produto.
- `zelomenu_modifier_groups` e `zelomenu_modifier_options` guardam adicionais/variacoes vinculados ao produto comum.
- O produto base segue em `produtos`; preco base segue em `produtos.preco`.
- `produtos.ocultar_no_pdv` nao controla publicacao online. A visibilidade do ZeloMenu e `zelomenu_product_publications.visivel_online` + `pausado_manualmente`.
- RLS usa `get_owner_user_id(auth.uid()) = id_usuario`; writes tambem verificam que o produto/grupo pertence ao mesmo `id_usuario`.
- As tabelas novas incluem grants explicitos para `authenticated`/`service_role` e revogam `anon`, porque RLS sozinho nao deve ser assumido como permissao de acesso ao PostgREST.

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

## Pendente de validacao

- Confirmar no banco real se todas as policies de `.ai/migrations/rls_subuser_access.sql` batem com producao.
- Confirmar o schema real da tabela `expenses` e suas policies atuais.
- Definir se `pin_admin` continuara existindo como trava de conveniencia ou sera redesenhado.
