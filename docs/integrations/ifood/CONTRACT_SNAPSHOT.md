# iFood Order e Events — snapshot de contrato

**Data do snapshot:** 2026-09-15
**Escopo:** app de teste iFood do ZeloPDV, integração centralizada
**Status:** Task 1 concluída com a coleção Events v1 confirmada e o ACK exercitado; não é homologação nem liberação de produção.

Este documento separa o que foi observado na conta de teste do que vem de
contratos e amostras oficiais, mas ainda não foi exercitado nesta sessão. Os
identificadores, valores e dados de comprador dos artefatos versionados são
placeholders sanitizados. Credenciais permanecem somente no `.env.local`
ignorado e não são reproduzidas aqui.

## 1. Evidência real desta sessão

### Comprovado

- O app de teste é **centralizado** e aceitou OAuth 2.0 com
  `grantType=client_credentials`.
- `GET /merchant/v1.0/merchants` respondeu `200` e retornou uma loja.
- `GET /merchant/v1.0/merchants/{merchantId}/status` respondeu `200`.
- O polling efetivamente liberado para a conta é Events v1:
  `GET /events/v1.0/events:polling` respondeu `204` quando não havia eventos.
- A coleção Events v1 completa fornecida nesta sessão confirmou a base
  `https://merchant-api.ifood.com.br/events/v1.0`, os headers `Accept:
  application/json` e `x-polling-merchants`, e que `types`, `groups` e
  `categories` devem ser omitidos ou enviados sem valor vazio.
- A conta gerou dois pedidos automáticos de teste. Foram observados eventos
  `PLACED` e cada detalhe foi lido com `GET /order/v1.0/orders/{id}` em `200`.
- Nos detalhes reais foram observados os campos de topo `id`, `displayId`,
  `createdAt`, `category`, `orderTiming`, `orderType`, `delivery`,
  `preparationStartDateTime`, `isTest`, `salesChannel`, `merchant`, `customer`,
  `items`, `total`, `payments`, `additionalFees`, `picking` e
  `additionalInfo`.
- Os pedidos reais observados eram `category=FOOD`,
  `orderTiming=IMMEDIATE`, `orderType=DELIVERY`,
  `delivery.deliveredBy=MERCHANT` e `isTest=true`; havia `items` e
  `payments`.
- `GET /order/v1.0/orders:polling` respondeu `404`. Essa rota não é usada
  como fonte de eventos neste snapshot.

Os dois pedidos automáticos foram gerados durante esta sessão e são a evidência
descrita acima; nenhum pedido adicional foi gerado deliberadamente para esta
entrega. O polling posterior retornou seis envelopes, correspondentes a
reentregas at-least-once desses dois pedidos que ainda não tinham sido
confirmados. O ACK real foi enviado no formato de lista de objetos `{id}` e
respondeu `202`; o polling seguinte respondeu `204`. IDs, tokens, segredos e
PII dessa prova não foram persistidos. Não houve comando Order, configuração
de webhook ou outro side effect externo além da geração automática e do ACK.

### Não comprovado nesta sessão

| Superfície | Estado | Regra para implementação |
| --- | --- | --- |
| Webhook | Não existe/configurado no app de teste | Só usar depois de registrar URL HTTPS e validar `X-IFood-Signature` sobre bytes crus. |
| Comandos Order | Não exercitados | Tratar `202` apenas como aceite HTTP; estado comercial só muda por evento posterior. |
| `DELIVERY` iFood, `TAKEOUT` e `SCHEDULED` | Não observados na conta | Fixtures sintéticas baseadas nas amostras oficiais, explicitamente marcadas abaixo. |
| Presença/heartbeat granular | Não exercitado | Não abrir ou fechar merchants sem contrato e gate de saúde por merchant. |
| `429`, headers e limites | Nenhum `429` observado | Fixture e limites documentados são referências sintéticas; observar headers e atualizar após homologação. |
| Homologação Order/Events/Merchant | Não concluída | O app não está homologado e a integração não está habilitada em runtime. |
| Conexão de lojista em produção | Não concluída | O fluxo self-service, autorização por merchant e escopos finais exigem confirmação do iFood. |

## 2. Autenticação

Endpoint oficial do app centralizado:

```text
POST https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token
Content-Type: application/x-www-form-urlencoded
```

Campos do formulário documentados: `grantType=client_credentials`, `clientId`
e `clientSecret`. Uma resposta de sucesso contém `accessToken`, `type` e
`expiresIn`; não há refresh token no fluxo centralizado. O valor do token e o
`expiresIn` desta conta não são registrados para não expor segredo ou material
de sessão.

Todas as chamadas de recursos usam HTTPS e `Authorization: Bearer ...`. O
header aparece apenas como requisito textual: nenhum token, Authorization ou
segredo foi colocado em fixture, log ou snapshot.

O sucesso de Merchant, Events e Order detail comprova acesso efetivo a essas
famílias de recurso para a conta de teste. A lista exata de claims/escopos não
foi persistida; não tratar outros módulos como autorizados sem nova prova.

## 3. Merchant

Base oficial:

```text
https://merchant-api.ifood.com.br/merchant/v1.0
```

| Método | Rota | Retorno observado | Contrato mínimo |
| --- | --- | --- | --- |
| `GET` | `/merchants` | `200`, uma loja | Array de merchants com `id` string; paginação existe mas seus params/envelope não foram confirmados (a página oficial que os documenta retorna `403` para fetchers) — não invente `page`/`size`. |
| `GET` | `/merchants/{merchantId}/status` | `200` | Estado/validações operacionais em JSON; não usar somente HTTP 200 para inferir loja aberta. |
| `GET` | `/merchants/{merchantId}` | Não exercitado | Detalhe completo do merchant; contrato oficial, não prova da conta. |
| `GET/POST/DELETE` | `/merchants/{merchantId}/interruptions` | Não exercitado | Pausa temporária; qualquer escrita aguarda autorização e homologação. |
| `GET/PUT` | `/merchants/{merchantId}/opening-hours` | Não exercitado | Consulta/substituição de horários; fora do escopo da Task 1. |

O `merchantId` real não é armazenado. As fixtures usam `merchant-fixture`.

## 4. Events v1 — polling e ACK

### Coleção e polling efetivo

Base URL confirmada pela coleção Events v1:

```text
https://merchant-api.ifood.com.br/events/v1.0
```

Polling:

```text
GET https://merchant-api.ifood.com.br/events/v1.0/events:polling
Accept: application/json
x-polling-merchants: <merchant-fixture>
```

`x-polling-merchants` usa um valor de merchant autorizado; o valor real não é
armazenado. Os parâmetros de query `types`, `groups` e `categories` devem ser
omitidos ou não vazios. `200 OK` retorna uma lista de envelopes contendo
`id`, `createdAt`, `fullCode`, `metadata`, `code` e `orderId`; `204 No Content`
indica polling vazio.

Na conta, `204 No Content` foi observado antes de pedidos. Depois, o polling
retornou seis envelopes como reentregas at-least-once dos dois pedidos
automáticos não confirmados. Nenhum ID real foi copiado para este snapshot.

O polling ativo deve respeitar o mínimo oficial de 30 segundos. A frequência
de reconciliação reduzida quando houver webhook continua pendente: páginas
oficiais citam exemplos de cinco e trinta minutos. Não congelar esse fallback
em código antes da confirmação formal/homologação.

### ACK confirmado

```text
POST https://merchant-api.ifood.com.br/events/v1.0/events/acknowledgment
Content-Type: application/json
Accept: application/json

[{"id":"<uuid>"}]
```

A coleção exige uma lista de IDs únicos, com limite de 10.000 itens, e resposta
`202 Accepted`. A prova real enviou os IDs dos seis envelopes sem registrá-los
no repositório; a resposta foi `202` e o polling imediatamente seguinte foi
`204`. O contrato de persistir antes de confirmar permanece obrigatório; não
confirmar se a persistência falhar.

### Divergência de rota registrada

As páginas mais novas do guia Order também publicam
`/order/v1.0/orders:polling` e acknowledge sob `/order/v1.0`. A conta de teste
respondeu `404` para o polling Order, enquanto a coleção Events v1 e a prova
real confirmaram o polling e o ACK sob `/events/v1.0`. Portanto, Events v1 é a
referência da conta; não inferir a rota Order nova a partir dessa divergência.

## 5. Envelope de eventos

Os três arquivos em `tests/fixtures/ifood/events/` preservam os tipos e os
campos relevantes do envelope. O pedido/merchant/event ID de cada arquivo é
um placeholder não reutilizável fora do fixture.

| Fixture | `code` / `fullCode` | Proveniência |
| --- | --- | --- |
| `placed.json` | `PLC` / `PLACED` | **Observado** na conta; conteúdo sanitizado. |
| `concluded.json` | `CON` / `CONCLUDED` | **Fixture sintética baseada no contrato/amostra oficial**, não observada nesta sessão. |
| `cancelled.json` | `CAN` / `CANCELLED` | **Fixture sintética baseada no contrato/amostra oficial**, não observada nesta sessão. |

O guia Order mais novo ilustra códigos nomeados (`CONCLUDED` e
`CANCELLED`, com `ORDER_CANCELLED` como `fullCode` em uma amostra). Essa
variação é mantida como lacuna: os códigos finais de terminal devem ser
confirmados na coleção Events v1 autorizada antes de virar regra de domínio.
Evento desconhecido deve ser preservado e sinalizado, nunca descartado por
uma conversão silenciosa.

## 6. Order detail e ações

Detalhe oficial:

```text
GET https://merchant-api.ifood.com.br/order/v1.0/orders/{id}
```

O retorno de `200` observado contém o envelope de pedido usado nas fixtures:

- identidade e apresentação: `id`, `displayId`, `createdAt`;
- operação: `category`, `orderTiming`, `orderType`, `salesChannel`, `isTest`;
- preparação: `preparationStartDateTime`;
- loja/comprador: `merchant`, `customer`;
- produção e preço: `items`, `benefits`, `additionalFees`, `total`,
  `payments`;
- logística e complementos: `delivery`, `takeout`, `schedule`, `picking` e
  `additionalInfo` quando presentes.

As amostras sanitizadas preservam itens, `externalCode`, complementos em
`items[].options`, descontos em `benefits`, taxas em `additionalFees`, total e
formas de pagamento. Endereço, email, telefone, documentos, códigos reais e
IDs reais foram removidos; os placeholders não são pedidos válidos de produção.

As ações abaixo são contratos oficiais e **não foram chamadas** nesta sessão:

| Método | Rota | Resposta/documentação |
| --- | --- | --- |
| `POST` | `/orders/{id}/confirm` | `202`; resultado efetivo em evento posterior. |
| `POST` | `/orders/{id}/startPreparation` | `202`; respeitar `preparationStartDateTime` em agendados. |
| `POST` | `/orders/{id}/readyToPickup` | `202`; obrigatório para retirada conforme o guia. |
| `POST` | `/orders/{id}/dispatch` | `202`; aplicável à entrega `MERCHANT`. |
| `GET` | `/orders/{id}/cancellationReasons` | Motivos dinâmicos antes de solicitar cancelamento. |
| `POST` | `/orders/{id}/requestCancellation` | `202`; desfecho chega por evento. |
| `POST` | `/orders/{id}/validatePickupCode` ou `/verifyDeliveryCode` | Validação conforme modalidade/código habilitado. |

Um `404` transitório do detalhe logo após `PLACED` deve seguir backoff limitado
conforme o guia oficial; não confundir esse cenário com o `404` confirmado da
rota `/order/v1.0/orders:polling`.

## 7. Modalidades cobertas pelas fixtures

Todos os pedidos fixture são `category=FOOD`, `salesChannel=IFOOD` e
`isTest=true`. Valores monetários e códigos abaixo são apenas exemplos
sanitizados.

| Fixture | Contrato | Proveniência |
| --- | --- | --- |
| `immediate-ifood-delivery.json` | `DELIVERY` + `IMMEDIATE`, `delivery.deliveredBy=IFOOD`, itens/opção/benefit/taxa/pagamento | **Sintética baseada no detalhe oficial, não observada nesta sessão.** |
| `immediate-merchant-delivery.json` | `DELIVERY` + `IMMEDIATE`, `delivery.deliveredBy=MERCHANT`, pagamento offline | **Baseada na forma real observada; IDs, nomes e valores sanitizados.** |
| `immediate-pickup.json` | `TAKEOUT` + `IMMEDIATE`, `takeout.mode=DEFAULT`, sem `delivery` | **Sintética baseada no detalhe oficial, não observada nesta sessão.** |
| `scheduled.json` | `DELIVERY` + `SCHEDULED`, `preparationStartDateTime` e janela `schedule` explícitos | **Sintética baseada no detalhe oficial, não observada nesta sessão.** |

O fato de a fixture usar `isTest=true` não significa homologação; é apenas a
propriedade presente nos pedidos de teste observados e necessária para impedir
que os dados sejam confundidos com produção.

## 8. Erro de limite de requisição

`tests/fixtures/ifood/errors/rate-limit.json` é uma **fixture sintética baseada
em documentação oficial, não observada nesta sessão**. Ela preserva o sinal
operacional `429`, mensagem e `retryAfter`, sem token ou identificador real.

As referências oficiais também descrevem `Retry-After` e headers
`X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset`. Os limites
por endpoint publicados (incluindo exemplos para Events, Order e Merchant)
não são evidência de limite efetivo desta conta e não devem ser copiados como
configuração imutável. O worker deverá observar os headers, aplicar backoff e
registrar somente métricas sanitizadas quando essa superfície for implementada.

## 9. Webhook, presença e homologação

O contrato oficial de webhook, ainda não exercitado, é:

- app com autenticação centralizada e uma URL pública HTTPS;
- `POST` com `Content-Type: application/json` e `X-IFood-Signature`;
- HMAC-SHA256 com o `clientSecret` sobre os bytes exatos antes do parse;
- resposta `202 Accepted` rapidamente (as referências citam dois segundos como
  recomendação e cinco segundos como timeout);
- entrega pelo menos uma vez, sem ordem garantida e sem ACK separado;
- polling independente como reconciliação/fallback.

Presença também não foi exercitada. Polling gera heartbeat para merchants
autorizados; webhook pode operar no modo por aplicação ou granular por
merchant. Nenhuma presença deve ser ligada por este snapshot: abrir a loja sem
worker saudável é um risco operacional.

Order/Events e Merchant ainda não passaram homologação. A documentação de
homologação exige aplicação pronta, conta profissional, loja de teste e
cenários de conexão, confirmação, cancelamento, despacho e conclusão. Este
snapshot registra pré-condições e lacunas; não afirma aprovação.

## 10. Segurança e sanitização

- As fixtures usam somente strings como `merchant-fixture`, `order-fixture`,
  `event-fixture`, `Cliente Teste` e `phone-fixture`.
- Não há `Bearer`, access token, client secret, refresh token, API key,
  Authorization, email, CPF, telefone brasileiro, CEP ou endereço real.
- Nenhum UUID, merchant ID, order ID, client ID ou código monetário real da
  conta foi copiado.
- O teste `tests/ifood.contract-fixtures.test.js` descobre recursivamente todos
  os JSONs sob `tests/fixtures/ifood/`, exige exatamente os oito fixtures desta
  Task 1, verifica forma/tipos/códigos/modalidades/pagamentos e falha diante de
  padrões de credencial, PII, endereço ou ID real; ele também prova que os
  placeholders não geram falso positivo.
- A coleção bruta anexada foi usada somente como referência e não entra no Git;
  nenhum token, segredo, header `Authorization`, ID real ou PII foi copiado
  dela.
- Este arquivo não autoriza comandos externos, presença, webhook, homologação,
  publicação ou geração de pedidos.

## 11. Fontes oficiais

As rotas e regras não observadas devem ser revistas contra a coleção/OpenAPI
efetivamente liberada ao app antes de cada task de implementação.

- [Coleções oficiais](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/collections/)
- [Autenticação](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro/)
- [Fluxo centralizado](https://developer.ifood.com.br/en-US/docs/guides/modules/authentication/centralized/)
- [Merchant — endpoints](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/endpoints/)
- [Events — polling](https://developer.ifood.com.br/es-CO/docs/food/guides/modules/events/polling-overview/)
- [Events — homologação](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/homologation/)
- [Webhook — visão geral](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-overview/)
- [Webhook — requisição](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-request/)
- [Webhook — boas práticas](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-best-practices/)
- [Webhook — presença](https://developer.ifood.com.br/en-US/docs/guides/modules/events/webhook-presence/)
- [Order — detalhes](https://developer.ifood.com.br/en-US/docs/guides/modules/order/details/)
- [Order — eventos](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/events/)
- [Order — endpoints](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/endpoints/)
- [Order — fluxo](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/workflow/)
- [Homologação Order](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/homologation/)
- [Rate limits](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/rate-limit/)
- [Uso indevido e limites de erro](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/improper-use/)
