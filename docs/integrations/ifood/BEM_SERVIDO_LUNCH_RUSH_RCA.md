# Bem Servido — troubleshooting do almoço (2026-09-18/19)

Feedback da titular cruzado com código (ZeloPDV + ZeloChat) e com o banco
da empresa `2b862442-2376-4f21-af8f-ed11e00214e8`. Não é recap da conexão:
a loja chegou a receber pedidos reais do iFood (`source=ifood`, todos
`CONCLUDED` no provedor). A operação quebrou no turno.

Conexão `c0f6d2b1-…` em 2026-09-19 ~13:06 UTC: `status=paused`,
`print_owner=external`, merchant `d848b8aa-…`. Worker ainda carimba
`last_poll_at`/`last_token_at`. Enquanto `paused`, comandos Zelo→iFood
ficam fail-closed; operar no Gestor de Pedidos.

## Mapa do feedback

| Reclamação | Classificação | Veredito |
| --- | --- | --- |
| Não aceita iFood no ZeloChat | produto + bug de superfície | Aceite iFood só existe no PDV (`confirm` command). O kanban do Chat chama `transition_zelo_order`, que o banco recusa com `IFOOD_ORDER_REQUIRES_COMMAND`. Zero `confirm` no histórico; só 2× `start_preparation` vindos do PDV. |
| Pedido fica em rota / não marca entregue / cliente sem código | gap de produto | Depois de `DISPATCHED` a UI é `kind: none` (“Em rota de entrega”). Não há `conclude` nem `verifyDeliveryCode`. Logística Bem Servido = `MERCHANT`; o handshake de drop-code continua no iFood. |
| Excluiu pedidos já lançados | operação + efeito colateral | Cancelar iFood pelo Chat também bate no guard. Ela provavelmente apagou duplicatas manuais / locais, não o pedido do provedor. |
| Imprime no iFood e de novo no ZeloChat | bug | `print_owner=external` só silencia o auto-print do **PDV**. O Chat imprime todo `zelo_orders` novo, inclusive `source=ifood`. |
| PDV não faz barulho | gap de produto (gate do piloto) | `/app/pedidos` não tem `Audio`. `docs/operations/IFOOD.md` ainda lista “som genérico” como pré-requisito não implementado. |
| IA não monta pedido digitado depois de “Pedir por aqui” | fragilidade conhecida | Fluxo híbrido: toque no botão ≠ texto livre. Catálogo ambíguo / genérico sem ferramenta de pedido devolve link ou outra opção. Nota fiscal fora de escopo da IA. |
| Novo pedido manual: não imprime como entrega / taxa 0 | **bug** | Grava `fulfillment.address` e `deliveryFee: 0`. Leitura, impressão e WhatsApp de “pronto” olham `fulfillment.deliveryAddress`. Hotel Esplanada / Av. Júlio Prestes no banco: `type=delivery`, endereço no campo errado, taxa `0.00`. |

## Evidência iFood

- 8 pedidos `source=ifood` nas últimas ~48h, todos `delivered` canônico /
  `CONCLUDED` no provedor. Quase todos `fulfillment.type=delivery` com taxa
  iFood (`8.99`–`9.86`); dois `takeout`.
- `ifood_internal.order_commands` da empresa: **somente**
  `start_preparation` ×2 (`confirmed_event`). Nenhum `confirm`, `dispatch`,
  `cancel`.
- `ifoodPrimaryIntent('out_for_delivery')` → `null`.
  `resolveQueueAdvance` iFood sem intent → `{ kind: 'none' }`.
- Adapter: `confirm` / `startPreparation` / `readyToPickup` / `dispatch` /
  `requestCancellation`. Sem conclude.
- `codeFor(..., 'delivery')` esconde código quando `deliveredBy === 'IFOOD'`.
  Bem Servido é `MERCHANT`, então o código **deveria** aparecer se o payload
  trouxer. Reclamação de “não tinha código na porta” é o handshake do app
  iFood (cliente mostra, entregador confirma) — o Zelo não conclui o pedido
  sem isso e nem oferece o campo.

## Evidência impressão / som

- Conexão `print_owner=external` → `shouldPrintIfoodOrder` no PDV = skip.
  A segunda via **não** é o PDV.
- ZeloChat `selectOrdersToAutoPrint` + `useAutoPrint`: qualquer pedido novo
  na lista canônica, sem filtro de `source` nem de `print_owner`.
- iFood Gestor imprime no aceite nativo. Sequência observada pela titular:
  aceita no iFood → papel 1; Chat vê o canônico novo → papel 2.

## Evidência pedido manual (Hotel Esplanada / Rafa)

| Pedido | type | `fulfillment.address` | `fulfillment.deliveryAddress` | taxa |
| --- | --- | --- | --- | --- |
| Anderson (cancelado) | delivery | `hotel esplanada quarto 61` | null | 0.00 |
| Adriano (cancelado) | delivery | `Av. Júlio Prestes, 930` | null | 0.00 |
| Adriano (entregue) | delivery | `Av. Júlio Prestes, 930` | null | 0.00 |

Contraste ZeloMenu no mesmo dia: `deliveryAddress` preenchido, taxa `8.00`.

Cadeia:

1. `createManualZeloOrder` seta `type` por presença de endereço, mas grava
   a string em `fulfillment.address` e `pricing.deliveryFee: 0`.
2. Form “Novo pedido” não tem campo de taxa/bairro.
3. `canonicalRowToOrder` lê só `deliveryAddress`.
4. `printerService` só imprime bloco Entrega se `order.deliveryAddress`.
5. PATCH de status: `isDelivery = !!existing.deliveryAddress` → mensagem
   “pronto para retirada”.

## Evidência IA WhatsApp

Já registrado em `zelochat/FIXES_PROGRESS.md` (ZCHAT-AI-028, ZCHAT-AI-021)
e `zelochat/CURRENT.md`: Bem Servido descreve prato em texto/áudio; se a
busca do catálogo é ambígua ou o turno cai no modelo genérico (sem
ferramenta de pedido), a IA relista opções ou reenvia o cardápio. O toque
“Pedir por aqui” como texto exato já foi contido; o caminho **digitar o
pedido em vez de usar o link** continua o ponto frágil. Intervenção humana
+ nota fiscal é o comportamento esperado hoje, não um incidente novo.

## O que **não** é bug

- “Tem que aceitar no iFood” enquanto ela tenta no **Chat**: o Chat nunca
  foi o canal de comando iFood. O PDV tem o botão; ela não usou (zero
  `confirm`).
- Pedido iFood não avançar no kanban do Chat: guard deliberado
  (`20260917060000_ifood_order_transition_guard`).
- Código de entrega no app do cliente: regra do iFood, não do Zelo.

## Prioridade de correção

P0 (antes do próximo almoço, conexão ainda pausada):

1. ZeloChat: honrar `print_owner=external` — não auto-imprimir `source=ifood`.
2. PDV `/app/pedidos`: som genérico em pedido iFood `pending_review`.
3. ZeloChat manual: gravar `fulfillment.deliveryAddress`, calcular taxa
   (ou campo explícito), imprimir/avisar como entrega.

P1:

4. Superfície única de aceite iFood: ou o Chat encaminha `confirm`, ou
   esconde “Aguardando aceite” / recusar iFood no kanban e aponta ao PDV
   (e ao Gestor, enquanto `paused`).
5. `out_for_delivery` MERCHANT: comando conclude / código de entrega na
   fila do PDV; mostrar o código quando o payload tiver.

P2:

6. IA: pedido digitado após “Pedir por aqui” / link ignorado — planner
   deve montar a partir da descrição, não reenviar catálogo. Escopo
   separado, já tem histórico no repo do Chat.

## Operação imediata com a cliente

Enquanto a conexão estiver `paused`: aceitar, despachar e concluir **só**
no Gestor de Pedidos iFood. Não lançar o mesmo pedido de novo no
“Novo pedido” do Chat. Taxa de entrega no manual: lançar como item só
como gambiarra temporária — o endereço que ela preenche já vira
`type=delivery` no banco, mas a UI mente que é retirada.

Não `resume` até o P0.1 (dupla impressão) estar no ar; senão o próximo
pico reimprime duas vias.
