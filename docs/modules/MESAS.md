# Mesas

> Fonte viva do add-on Mesas.
> Tracker historico por sprint: `docs/projects/PROJETO_MESAS.md`.

## O que o modulo faz hoje

- CRUD de mesas em `/gestao/mesas`
- mapa operacional em `/app/mesas`
- comanda por mesa em `/app/mesas/[id]`
- fechamento da mesa convertendo consumo em `vendas` + `vendas_itens`
- pre-conta e recibo final imprimivel

## Fontes de codigo

- `src/routes/gestao/mesas/+page.svelte`
- `src/routes/app/mesas/+page.svelte`
- `src/routes/app/mesas/[id]/+page.svelte`
- `src/routes/api/billing/toggle-addon/+server.js`
- `src/lib/guards.js`

## Dependencias de dados observadas

- `mesas`
- `comandas`
- `comanda_itens`
- `comanda_pagamentos`
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

## Relacao com billing

- o add-on e controlado por `subscriptions.has_mesas_addon`
- checkout/toggle de add-on passam por `pricing.js`
- qualquer mudanca de preco ou flag deve sair do catalogo canônico

## Quando atualizar esta doc

- mudanca no fluxo de fechamento
- mudanca em pre-conta/recibo
- nova tabela ou RPC do modulo
- alteracao no gate de add-on
