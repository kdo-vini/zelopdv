# Mesas

> Fonte viva do add-on Mesas.
> Tracker historico por sprint: `docs/projects/PROJETO_MESAS.md`.

## O que o modulo faz hoje

Protocolo offline v1 implementado localmente em 2026-09-05, ainda sem publicação:
mapa/comandas e operações persistidas no aparelho preparado, fila por comanda,
fechamento atômico no servidor (também no caminho online) e conflitos preservados
para conferência. Parcial recebido mantém `id_caixa` original ao converter em
pagamento de venda. A cozinha requer conexão e estado sincronizado; não há LAN
entre aparelhos nesta fase. Contratos, ativação e limites em
[OFFLINE](../operations/OFFLINE.md).

- CRUD de mesas em `/gestao/mesas`
- mapa operacional em `/app/mesas`
- comanda por mesa em `/app/mesas/[id]`
- fechamento da mesa convertendo consumo em `vendas` + `vendas_itens`
- pre-conta e recibo final imprimivel
- pagamentos parciais por valor ou por quantidade de item
- historico de itens pagos preservado na venda apos o fechamento
- as jornadas de fechamento único, dividido e parcial compartilham o catálogo
  de pagamentos. Vale-Refeição (`vale_refeicao`) está disponível nas três;
  pagamentos parciais continuam em `comanda_pagamentos` enquanto a mesa fica
  aberta e são vinculados às linhas de `vendas_pagamentos` no fechamento.

## Fontes de codigo

- `src/routes/gestao/mesas/+page.svelte`
- `src/routes/app/mesas/+page.svelte`
- `src/routes/app/mesas/[id]/+page.svelte`
- `src/routes/api/billing/toggle-addon/+server.js`
- `src/lib/guards.js`
- `supabase/migrations/20260812230000_mesas_payment_rbac.sql`
- `supabase/migrations/20260812233000_mesas_operational_rbac.sql`
- `supabase/migrations/20260812234500_mesas_operational_rpc_rbac.sql`

## Dependencias de dados observadas

- `mesas`
- `comandas`
- `comanda_itens`
- `comanda_pagamentos`
- `comanda_pagamento_itens`
- `vendas`
- `vendas_itens`
- `produtos`
- `pessoas` para fiado

## Gate de acesso

- O modulo depende de `has_mesas_addon`.
- Sem add-on ativo, as rotas exibem upsell/redirect para `/assinatura?addon=mesas`.
- Para subusuarios, o entitlement efetivo continua vindo da assinatura do owner.

## Fluxo operacional

### Abrir e usar mesa

1. usuario entra no mapa `/app/mesas`
2. escolhe mesa livre
3. sistema cria ou abre a comanda da mesa
4. itens sao adicionados/ajustados na comanda

### Fechar mesa

1. usuario escolhe forma de pagamento
2. sistema grava venda
3. insere `vendas_itens`
4. se houver fiado, chama RPC dedicada
5. baixa estoque quando aplicavel
6. marca comanda como fechada
7. libera a mesa

### Pagamento parcial

- O fluxo existente por valor continua disponivel em `Informar valor`.
- INSERT/UPDATE/DELETE de pagamentos parciais e do ledger de itens exigem
  `mesas.acessar` e `pdv.receber` ou `pedidos.receber` para subusuarios; o
  titular continua com acesso total.
- `Selecionar itens` registra a quantidade de cada `comanda_itens` em
  `comanda_pagamento_itens`; a mesma quantidade nao pode ser cobrada duas vezes.
- Couvert, taxa de servico e desconto sao encargos globais. O modo por item cobra
  apenas o subtotal dos itens selecionados; o saldo residual (se houver) deve ser
  quitado por valor.
- No fechamento, `vendas_itens.id_comanda_item`,
  `vendas_pagamentos.id_comanda_pagamento` e os vinculos da tabela filha
  preservam a trilha item -> pagamento -> venda antes da limpeza da comanda.

### Capacidades operacionais

- Abrir comanda exige `mesas.abrir_comanda` para subusuários.
- Alterar itens, dados operacionais ou transferir comanda exige
  `mesas.editar_itens`.
- Iniciar/concluir fechamento e alterar campos financeiros exige
  `mesas.fechar`.
- Cancelar comanda ou liberar mesa por cancelamento exige `mesas.cancelar`.
- Os guards vivem no banco para cobrir chamadas diretas ao Data API; o
  service-role permanece fora dessa barreira.
- As RPCs `comanda_aplicar_delta_item`, `comanda_cancelar_com_estoque` e
  `comanda_garantir_estoque_baixado` resolvem o owner do subusuário e repetem
  os checks (`mesas.editar_itens`, `mesas.cancelar`, `mesas.fechar`) antes de
  qualquer alteração de estoque/comanda.

### Impressao

- Pre-conta e recibo final de mesa imprimem `Couvert` e `Taxa de servico` com
  seus valores reais.
- `Taxa de entrega` fica reservada a pedidos com `tipoPedido = delivery` e nao
  e usada como alias visual para couvert.

## Invariantes

- add-on Mesas custa `R$ 30` no catalogo canônico atual
- o fechamento da mesa vira venda operacional real; nao e um ledger paralelo
- pre-conta nao fecha a comanda
- subusuario usa dados do owner, nao tenant proprio
- `comanda_aplicar_delta_item` usa uma assinatura canônica de cinco argumentos (`uuid, integer, integer, numeric, jsonb`); os dois últimos têm defaults para manter clientes antigos compatíveis. Não recriar uma sobrecarga separada de três argumentos, pois o PostgREST pode rejeitar a RPC como ambígua.

## Pontos de atencao

- `src/routes/app/mesas/[id]/+page.svelte` e um dos maiores hotspots do repo
- o tracker antigo cita `.ai/migrations/mesas_module.sql`, mas o repo atual nao deve ser tratado como snapshot perfeito de producao
- fiado e estoque no fechamento compartilham risco com o fluxo de venda normal
- a migracao `supabase/migrations/20260803164855_mesas_payment_item_allocation.sql`
  cria a tabela de atribuicao, RLS, limites de quantidade e colunas de rastreio
  na venda; ela foi aplicada no Supabase vinculado em 2026-08-03
- a migracao `supabase/migrations/20260803170000_mesas_owner_scoped_payment_policies.sql`
  alinha os INSERTs financeiros ao owner efetivo, permitindo operacao por
  subusuario sem trocar o tenant do registro

## Relacao com billing

- o add-on e controlado por `subscriptions.has_mesas_addon`
- checkout/toggle de add-on passam por `pricing.js`
- qualquer mudanca de preco ou flag deve sair do catalogo canônico

## Quando atualizar esta doc

- mudanca no fluxo de fechamento
- mudanca em pre-conta/recibo
- nova tabela ou RPC do modulo
- alteracao no gate de add-on
