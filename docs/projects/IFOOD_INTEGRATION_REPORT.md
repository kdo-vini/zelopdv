# Integração iFood no ZeloPDV — relatório de viabilidade e arquitetura

> Relatório consolidado em **15 de setembro de 2026**, baseado na documentação oficial do iFood, na codebase atual do ZeloPDV e no schema conectado do Supabase. As afirmações sobre o iFood usam fontes primárias; pontos não resolvidos publicamente estão identificados como dependências de homologação ou confirmação formal.

## Conclusão executiva

**Sim, a integração pretendida é tecnicamente possível pelas APIs oficiais do iFood**, inclusive nos cinco eixos centrais da ideia:

1. receber pedidos do iFood no PDV e acompanhar seu ciclo de vida;
2. operar confirmação, preparo, pedido pronto, despacho e cancelamento;
3. sincronizar cardápio, adicionais, preço, pausa/disponibilidade e estoque vendável;
4. registrar vendas e alimentar relatórios com detalhes transacionais e financeiros;
5. controlar status, horários e interrupções da loja.

O acesso de produção, porém, **não é uma API aberta que basta ativar com uma chave**. O iFood exige cadastro profissional com CNPJ, aplicativo completo e funcional, credenciais e loja de teste, homologação dos módulos e autorização de cada estabelecimento. Para restaurantes, a categoria de aplicação **PDV** inclui os módulos Merchant, Events, Order, Catalog, Review, Shipping e Analytics; o módulo Financial é homologado em fluxo separado. O módulo Order é reservado a PDVs em tempo real, e aplicações meramente de leitura não são aceitas nos módulos operacionais ([política de homologação](https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories)).

A integração deve ser tratada como infraestrutura operacional crítica: a presença do integrador ajuda a determinar se a loja está online; pedidos têm SLA de confirmação; eventos podem duplicar, chegar fora de ordem ou ser descartados após falhas prolongadas; e o iFood monitora ACKs, erros e uso indevido, podendo bloquear a aplicação ([presença](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/presence), [uso indevido](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/improper-use)).

## Matriz de viabilidade pelas APIs públicas

| Objetivo de produto | Suporte oficial | Módulos principais | Observação |
|---|---|---|---|
| Pedidos do iFood dentro do ZeloPDV | Sim | Events + Order | Eventos iniciam o fluxo; os detalhes completos vêm de `GET /orders/{id}`. |
| Controlar pedidos somente pelo ZeloPDV | Sim, dentro dos fluxos expostos | Order + Events | Confirmação, preparo, pronto para retirada, despacho, cancelamento, rastreio e negociação pós-entrega são documentados. Algumas ocorrências ainda podem exigir suporte/Portal do Parceiro. |
| Lançar venda automaticamente | Sim, em termos de dados disponíveis | Order; Financial para verdade financeira | Order contém itens, totais e pagamentos. Financial contém venda, ajustes, comissão, taxas, recebedor e repasse. |
| Incluir vendas iFood nos relatórios | Sim | Financial; opcionalmente Analytics | Financial é transacional/financeiro; Analytics é agregado em D-1. |
| Sincronizar cardápio | Sim | Catalog | Categorias, itens, adicionais, pizza, combo, preço, status, agenda e múltiplos contextos. |
| Sincronizar preço e pausa | Sim | Catalog | Endpoints específicos e em lote; homologação exige propagação em tempo próximo do real. |
| Sincronizar quantidade vendável | Sim | Catalog | `POST /inventory` define quantidade máxima vendável; é diferente de um ledger completo de estoque. |
| Pausar/abrir a loja e controlar horários | Sim | Merchant + Events | Interrupções temporárias, horários, status e presença. |
| Acompanhar entregador iFood | Sim, quando aplicável | Order/Shipping | Tracking fica disponível após `ASSIGN_DRIVER` para entrega do iFood. |
| Solicitar logística iFood para pedidos externos | Sim, mediante elegibilidade/contratação | Shipping | Serviço separado; não é pré-requisito para apenas receber pedidos do marketplace. |
| Zelinho responder perguntas de vendas iFood | Dados existem | Financial e/ou Analytics | Uso concreto, autorização, retenção e modelo de dados precisam de avaliação jurídica/técnica; Analytics é agregado e D-1. |

## 1. Entrada no programa, aplicativos e ambientes

### Requisitos públicos

O roteiro oficial é: cadastrar-se no Portal do Desenvolvedor, receber automaticamente uma loja e um aplicativo de teste, desenvolver e testar, criar a aplicação de produção, homologar e então solicitar acesso às lojas. A página inicial informa que as APIs não têm cobrança para desenvolvedores que cumpram os requisitos, mas exige **CNPJ válido, CNAE relacionado a tecnologia e aplicação completa e funcional**; custos operacionais, como frete, são independentes ([Portal iFood Developer](https://developer.ifood.com.br/pt-BR), [primeiros passos](https://developer.ifood.com.br/pt-BR/docs/getting-started/first-steps)).

Ao criar uma aplicação, o portal pede:

- tipo de distribuição: **centralizada (SaaS)** ou **distribuída (on-premises)**;
- nome, descrição e URL;
- módulos de API solicitados;
- visibilidade **pública**, listada para parceiros, ou **privada/exclusiva** para clientes específicos;
- categoria do negócio, como Food;
- materiais de apresentação, incluindo logo e capturas de tela.

A aplicação de produção deve ser criada somente após o aplicativo de teste estar desenvolvido e homologado ([criação de aplicativo](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/create-app)).

### Categorias e módulos

Para restaurantes, a documentação atual lista:

- **PDV**: Merchant, Events, Order, Catalog, Review, Shipping e Analytics;
- **Catalog**: Merchant e Catalog;
- **Logistics**: Merchant, Events e Logistics;
- **Financial**: Merchant, Events e Financial;
- **BI**: Analytics.

Order é exclusivo para PDVs em tempo real. Order e Events, no fluxo Food, possuem homologação automática conjunta; os demais módulos são homologados por ticket. Financial sempre usa ticket separado dos módulos operacionais, e Analytics também exige ticket exclusivo ([política de homologação](https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories)).

### Ambiente de teste e produção

O cadastro cria automaticamente aplicação e loja de teste. A homologação do Order exige credenciais de teste, loja de teste e código de produção testado contra o sandbox ([homologação de Order](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/homologation)). Para Financial e Analytics, a documentação também descreve respostas de homologação acionadas por `x-request-homologation: true` ([homologação Financial](https://developer.ifood.com.br/en-US/docs/food/guides/modules/financial/homologation), [homologação Analytics](https://developer.ifood.com.br/en-US/docs/food/guides/modules/analytics/homologation)).

Não foi encontrada na documentação pública uma relação completa de diferenças funcionais entre sandbox e produção, nem garantias de paridade de todos os cenários e dados. Isso deve ser confirmado com o suporte durante o onboarding.

## 2. Autenticação, autorização e onboarding de lojas

Todas as APIs usam OAuth 2.0 com Bearer token e exigem HTTPS com TLS 1.2 ou superior ([autenticação](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro)).

### Aplicação centralizada

O fluxo centralizado usa `client_credentials` no endpoint `POST /authentication/v1.0/oauth/token`. O token expira, por padrão, em seis horas; não há refresh token, e o `clientSecret` deve permanecer no servidor ([fluxo centralizado](https://developer.ifood.com.br/en-US/docs/guides/modules/authentication/centralized/)).

Para conectar uma loja em produção, o proprietário da aplicação localiza a loja por ID ou CNPJ no Developer Portal e envia uma solicitação. O responsável pela loja aprova no Portal do Parceiro; depois disso, o integrador gera novo access token com as permissões atualizadas ([solicitar acesso](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access)).

### Aplicação distribuída

O fluxo distribuído usa `authorization_code` e `refresh_token`. A aplicação gera um `userCode` e apresenta ao lojista a URL do Portal do Parceiro; o responsável autoriza, recebe um `authorizationCode`, e a aplicação troca os códigos por access e refresh token. O `userCode` expira em dez minutos; o access token, por padrão, em seis horas. Somente quem concedeu a autorização pode revogá-la ([fluxo distribuído](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/distributed)).

Páginas oficiais ainda acessíveis apresentam durações padrão divergentes para o access token, entre três e seis horas. A implementação não deve codificar nenhum desses valores: deve usar o `expiresIn` devolvido pela autenticação e reagir corretamente a `401`. Tokens podem chegar a 8.000 caracteres. Mudança de permissões exige novo token e deve ser conferida listando os merchants autorizados.

### Implicação para o ZeloPDV

Pela classificação da página de criação, um SaaS como o ZeloPDV se enquadra naturalmente como aplicação centralizada. Há, entretanto, uma inconsistência textual nas páginas oficiais: a criação define centralizada como “SaaS disponível na nuvem”, enquanto a página de autenticação descreve o fluxo centralizado como voltado a ambientes internos/privados não acessíveis diretamente pela internet. Além disso, webhook só é oferecido à autenticação centralizada e exige URL HTTPS pública. **A seleção exata do tipo e o onboarding self-service de clientes devem ser confirmados com o iFood antes de cristalizar a experiência de conexão.**

## 3. Pedidos, estados e operação

O módulo Order é descrito como responsável por todo o ciclo do pedido e permite receber em tempo real, confirmar/rejeitar, acompanhar preparo e entrega e resolver questões pós-entrega ([fundamentos de Order](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/fundamentals)).

### Recebimento e detalhamento

Pedidos chegam por eventos. Ao receber um evento pertinente, a aplicação consulta `GET /order/v1.0/orders/{id}`. O objeto contém, entre outros campos:

- `id`, `displayId`, canal de venda, tipo e data;
- merchant e cliente;
- itens, quantidades, preços, adicionais e observações;
- `externalCode` do item, quando configurado no catálogo;
- benefícios, taxas, totais e pagamentos;
- entrega, retirada, agendamento e endereço.

O `externalCode` é explicitamente o código do item no sistema do PDV, o que permite mapear o produto do iFood ao cadastro do integrador ([detalhes do pedido](https://developer.ifood.com.br/en-US/docs/guides/modules/order/details/)).

A documentação orienta consultar detalhes antes de confirmar ou cancelar. O endpoint pode responder `404` logo após `PLACED`; nesse caso, deve-se repetir com backoff por até dez minutos, não indefinidamente. A página de fluxo informa que os detalhes ficam disponíveis por sete dias, enquanto as melhores práticas dizem para não consultar nem atualizar pedidos após oito horas do horário de entrega, porque a API não é backup. Assim, a integração precisa persistir seu próprio registro assim que receber o pedido ([guia de implementação](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/workflow), [melhores práticas gerais](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/best-practices)).

### SLA e transições

Todo pedido deve ser confirmado em até **oito minutos**: para pedido imediato, a partir de `createdAt`; para agendado, a partir de `preparationStartDateTime`. A ausência de confirmação gera cancelamento automático e pode penalizar a loja ([fundamentos de Order](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/fundamentals)).

Operações relevantes:

- `POST /orders/{id}/confirm`;
- `POST /orders/{id}/startPreparation`;
- `POST /orders/{id}/readyToPickup`;
- `POST /orders/{id}/dispatch`;
- `GET /orders/{id}/cancellationReasons`;
- `POST /orders/{id}/requestCancellation`;
- tracking e validação de códigos de retirada/entrega, quando habilitados.

As mutações retornam `202 Accepted`: o aceite HTTP não significa transição concluída. O resultado efetivo chega em evento posterior; confirmação, por exemplo, termina em `CONFIRMED` ou `CANCELLATION_REQUEST_FAILED` ([endpoints de Order](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/endpoints)).

Para FOOD, o ciclo documentado inclui `PLACED`, `CONFIRMED`, `PREPARATION_STARTED`, `READY_TO_PICKUP`, `DISPATCHED`, `CONCLUDED` e `CANCELLED`. Há ainda eventos de entregador, devolução, alteração do pedido/endereço/telefone e negociação pós-entrega (`HANDSHAKE_DISPUTE`/`HANDSHAKE_SETTLEMENT`) ([catálogo de eventos](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/events), [plataforma de negociação](https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/handshake-platform/)).

## 4. Eventos: polling, webhook, ACK e presença

### Polling

O polling deve consultar eventos a cada **30 segundos**, filtrar merchants com `x-polling-merchants`, persistir antes de confirmar consumo e enviar ACK para todos os eventos recebidos. Sem persistência bem-sucedida, não se deve enviar ACK, permitindo que o evento reapareça. IDs de evento devem ser usados para idempotência ([homologação Events](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/homologation), [melhores práticas](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/best-practices)).

Existe uma divergência pública de rota que precisa ser resolvida contra a coleção/OpenAPI efetivamente liberada para o app: a documentação específica de Events e a tabela de rate limits apresentam `/events/v1.0/events:polling` e `/events/acknowledgment`, enquanto páginas novas de Order apresentam `/order/v1.0/orders:polling` e acknowledge sob Order. O comportamento conceitual é o mesmo, mas não se deve fixar a rota antes de validar as credenciais de teste e a homologação ([coleções oficiais](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/collections/), [rate limits](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/rate-limit/)).

O monitoramento de uso indevido inclui:

- polling em intervalo menor que 30 segundos;
- consultas repetidas do mesmo pedido mais de dez vezes;
- tokens inválidos, merchants não autorizados e erros 400/404 recorrentes;
- ACK rate abaixo de 95%;
- inatividade da aplicação por 90 dias.

Infrações podem causar throttling e bloqueio temporário ou indefinido ([uso indevido](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/improper-use)).

### Webhook

Webhook está disponível apenas para aplicações com autenticação centralizada. Cada aplicação cadastra uma única URL HTTPS, de até 250 caracteres. O iFood envia um evento por `POST`, com `X-IFood-Signature`; a assinatura deve ser validada como HMAC-SHA256 sobre os bytes brutos do corpo usando o `clientSecret`, antes do parsing. A integração deve responder `202 Accepted` rapidamente; a recomendação é em até dois segundos e o timeout é cinco segundos ([visão geral](https://developer.ifood.com.br/pt-BR/docs/guides/modules/events/webhook-overview/), [requisição webhook](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-request), [boas práticas](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-best-practices)).

Garantias e limitações:

- entrega **at least once**, portanto eventos podem duplicar;
- ordem de entrega não é garantida;
- não há filtro por merchant ou tipo no webhook;
- não há ACK separado no webhook: o HTTP `202` confirma recepção;
- o iFood tenta reenviar por até cerca de 15 minutos; depois pode descartar o evento;
- webhook e polling são independentes, e polling deve existir como reconciliação/fallback;
- a documentação recomenda polling de fallback com frequência reduzida, mas páginas oficiais divergem entre exemplos de cinco e trinta minutos.

([limitações de webhook](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-overview), [boas práticas de webhook](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-best-practices)).

### Presença é uma obrigação operacional

Presença informa ao iFood que existe um sistema recebendo eventos. No polling, cada chamada gera heartbeat para os merchants autorizados ou filtrados. No webhook, o iFood envia heartbeats e espera resposta. A loja só aparece aberta quando combina horário, catálogo publicado, demais validações e presença ativa ([presença](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/presence)).

No webhook, o modo padrão pode marcar **todos os merchants da aplicação** online com uma resposta `202`; há também presença granular, na qual a resposta lista apenas os merchants online, em lotes de até 1.000 ([presença no webhook](https://developer.ifood.com.br/en-US/docs/guides/modules/events/webhook-presence)). Isso torna obrigatório controlar cuidadosamente quais lojas estão aptas a receber pedidos: uma falha de presença pode fechar uma loja; uma presença incorreta pode abrir uma loja sem operação capaz de responder.

## 5. Cardápio, preços, disponibilidade e estoque

O Catalog v2 organiza o menu em catálogo, contexto, categoria, item, produtos, grupos de adicionais e opções. Um mesmo catálogo atende contextos distintos: `DEFAULT` (delivery), `WHITELABEL` (cardápio digital) e `INDOOR` (consumo no local); preço, status e código do PDV podem variar por contexto via `contextModifiers` ([fundamentos de Catalog](https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/fundamentals)).

Catalog v2 é a versão recomendada para novas integrações; materiais legados de v1 ainda aparecem no portal e nas coleções. A coleção/OpenAPI associada às credenciais homologadas deve ser a referência de contrato ([coleções oficiais](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/collections/)).

### Operações documentadas

- listar catálogos e itens;
- criar/atualizar categorias;
- criar ou reescrever item completo com `PUT /items`;
- alterar preço de itens e adicionais em lote;
- pausar/reativar item, grupo ou opção;
- definir agenda de disponibilidade;
- trabalhar com múltiplos catálogos;
- acompanhar operações assíncronas por `batchId`;
- definir quantidade máxima vendável com `/inventory`;
- modelar adicionais, combos e pizzas.

([fluxo de Catalog](https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/workflow), [padrões comuns](https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/guides/common-patterns)).

O status de item é `AVAILABLE` ou `UNAVAILABLE`. A documentação recomenda usar `externalCode` único em itens e adicionais para rastreabilidade, atualização por ID próprio e sincronização bidirecional sem depender dos IDs do iFood. Enviar novamente um item com `externalCode` já existente reutiliza o item em vez de criar duplicata ([fundamentos](https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/fundamentals), [troubleshooting](https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/errors-and-troubleshooting)).

### Requisitos de homologação de Catalog

Catalog é homologado por ticket e requer demonstração da aplicação final, não apenas chamadas cURL. Para Food, o processo público prevê gravação dos cenários, com data/hora visíveis, análise de vídeos e logs e retorno em até cinco dias úteis. A homologação cobre:

- categorias e itens simples;
- adicionais, pizzas e combos quando aplicáveis;
- atualização em lote de preço e status;
- customização por contexto e agenda;
- múltiplos catálogos, se aplicável;
- validação, erros, retry e concorrência;
- propagação de preço/status em até dois segundos;
- lote de 100 ou mais itens em até dez segundos.

([homologação de Catalog](https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/homologation)).

### Limites do que está provado

A API oferece meios técnicos para sincronização bidirecional, mas a documentação pública não define uma política universal de resolução de conflitos quando o mesmo cardápio é editado simultaneamente no Portal do Parceiro e no PDV. Também não foi encontrada garantia pública de evento em tempo real para toda alteração manual de catálogo. A fonte de verdade e o comportamento diante de conflito precisam ser definidos pelo produto e validados com o iFood.

## 6. Merchant: loja, status, horários e interrupções

O módulo Merchant permite listar as lojas autorizadas, consultar dados e status, gerenciar operações, horários e pausas temporárias ([introdução Merchant](https://developer.ifood.com.br/pt-BR/docs/guides/modules/merchant/introducao/)).

Endpoints centrais:

- `GET /merchants` e `GET /merchants/{merchantId}`;
- `GET /merchants/{merchantId}/status` e status por operação;
- `GET/POST/DELETE /merchants/{merchantId}/interruptions`;
- `GET/PUT /merchants/{merchantId}/opening-hours`.

Uma interrupção é uma pausa temporária; horários são substituídos integralmente por `PUT`. Interrupções longas não devem substituir a configuração permanente de horário; a documentação publica limite de sete dias para uma interrupção ([endpoints Merchant](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/endpoints), [boas práticas Merchant](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/best-practices-troubleshooting)).

O status operacional inclui `OK`, `WARNING`, `CLOSED`, `ERROR` e `UNAVAILABLE`, com validações como conectividade, horário, catálogo habilitado, área de entrega e interrupções. Todos podem retornar HTTP 200; o estado real deve ser lido no JSON ([operações Merchant](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/operations)).

Merchant também exige homologação da aplicação pronta e validação dos endpoints de listagem, status, interrupção e horário ([homologação Merchant](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/homologacao)).

## 7. Vendas, relatórios, conciliação e repasses

Há duas camadas diferentes, que não devem ser confundidas.

### Camada operacional do pedido

Order fornece o que é necessário para representar a venda operacional: itens e adicionais, quantidades, preços, benefícios, taxas, totais, forma de pagamento, responsável pelo pagamento e estágio do pedido. Isso basta para criar um registro operacional no PDV, desde que o modelo local preserve o `orderId` e trate cancelamentos/alterações posteriores de modo idempotente ([detalhes do pedido](https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/details)).

### Camada financeira

O módulo Financial é a fonte oficial para faturamento, taxas, ajustes, conciliação e liquidação:

- **Sales** lista as vendas de um período, no mesmo dia em que ocorrem, com status, identificador do pedido, pagamentos, recebedor, GMV, benefícios e `saleBalance` atualizado;
- **Financial Events** registra créditos e débitos quase em tempo real, com referência a pedido, competência e impacto no repasse;
- **Reconciliation On Demand** produz conciliação por competência, inclusive lançamentos com e sem impacto no repasse;
- **Reconciliation** disponibiliza CSV compactado por competência, atualizado semanalmente;
- **Settlement** relaciona saldos, datas e transferências;
- **Anticipation** cobre antecipações quando contratadas.

([API Sales](https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-sales/?category=FOOD), [Financial Events](https://developer.ifood.com.br/es-CO/docs/guides/modules/financial/api-financial-events), [Reconciliation On Demand](https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-reconciliation-ondemand?category=FOOD), [Reconciliation](https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-reconciliation/)).

O recebedor importa: em pagamentos offline e VA/VR, a loja recebe diretamente (`responsavel_transacao = LOJA`), mas ainda pode sofrer taxas/comissões debitadas em repasses. Em pagamento online, o iFood é o recebedor e repassa à loja. Para calcular o líquido, a documentação manda somar apenas lançamentos com `impacto_no_repasse = SIM`/`hasTransferImpact = true`, não simplesmente subtrair uma comissão fixa ([Reconciliation](https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-reconciliation/)).

### Homologação financeira

Financial exige homologação antes do acesso de produção, sempre em ticket separado. A aplicação deve integrar e testar **todas as APIs financeiras**, renovar token, tratar rate limits e erros, calcular corretamente repasses e recebedores, exibir vendas, comissões, taxas, status e datas, e permitir download CSV da conciliação. A própria documentação lista como motivo de reprovação implementar apenas Sales sem Reconciliation ([homologação Financial](https://developer.ifood.com.br/en-US/docs/food/guides/modules/financial/homologation)).

Logo, há duas entregas possíveis conceitualmente:

- relatórios operacionais e lançamento da venda baseados em Order;
- conciliação financeira completa baseada em Financial, com homologação separada.

Não se deve prometer que o total de pedido operacional é igual ao valor líquido a receber.

### Analytics como opção para perguntas agregadas

O módulo Analytics fornece KPIs agregados por merchant/dia, como GMV, ticket médio, quantidade de pedidos, cancelamento, canal, status, logística e pagamento. Os dados são históricos em **D-1**, não transacionais nem em tempo real. O módulo pertence à categoria BI/escopo `analytics`, exige ticket exclusivo e pode autorizar por merchant ou por rede, em modelos mutuamente exclusivos ([homologação Analytics](https://developer.ifood.com.br/en-US/docs/food/guides/modules/analytics/homologation)).

Isso pode complementar perguntas gerenciais do Zelinho, mas não substitui Order para operação ao vivo nem Financial para conciliação.

## 8. Logística e entrega

É importante separar dois módulos:

- **Logistics** integra uma operação logística própria ao ecossistema iFood, incluindo atribuição de entregador e movimentos de coleta/entrega. É uma categoria própria, exige interface de motorista e homologação de seis endpoints; não é requisito para um PDV apenas acompanhar entregas feitas pelo iFood ([introdução Logistics](https://developer.ifood.com.br/en-US/docs/guides/modules/logistics), [homologação Logistics](https://developer.ifood.com.br/en-US/docs/food/guides/modules/logistics/homologation)).
- **Shipping** permite solicitar entregador do iFood para pedido da plataforma ou criar uma entrega para pedido externo. Requer contratar o serviço no Portal do Parceiro e verificar elegibilidade/cobertura. Tracking só existe quando a logística é feita pelo iFood e começa após `ASSIGN_DRIVER` ([introdução Shipping](https://developer.ifood.com.br/en-US/docs/food/guides/modules/shipping/intro), [endpoints Shipping](https://developer.ifood.com.br/en-US/docs/food/guides/modules/shipping/endpoints)).

Para o escopo inicial de centralizar pedidos iFood no ZeloPDV, Order + Events já cobrem a operação do pedido. Shipping é expansão opcional; Logistics só faz sentido se o ZeloPDV vier a coordenar frota própria como integrador logístico.

## 9. Rate limits, resiliência e políticas

Cada endpoint possui limite próprio. O iFood retorna `429` e publica `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset`; a integração deve implementar monitoramento e backoff exponencial ([rate limits](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/rate-limit/)). Alguns exemplos atuais: token e userCode, 100 req/min; polling e ACK de eventos, 6.000 req/min; detalhe e confirmação de pedido, 3.000 req/min; catálogo v2 varia por endpoint, em geral entre 3.000 e 5.000 req/min. Esses números devem ser lidos da documentação vigente durante a implementação, pois variam por endpoint, aplicação e janela.

As condições do programa concedem licença limitada, revogável, não sublicenciável e intransferível. Proíbem compartilhar dados obtidos, usar API para finalidade distinta da aplicação, permitir uso da API por terceiros, burlar limites, expor credenciais e usar marcas do iFood sem autorização expressa. O desenvolvedor assume responsabilidade pelo aplicativo; códigos de acesso pertencem ao iFood e podem ser revogados ([Condições Gerais do Programa](https://developer.ifood.com.br/pt-BR/terms-of-use/developer/)).

O pedido pode trazer CPF do cliente apenas quando solicitado para emissão fiscal; a própria referência diz que o campo deve ser usado somente para esse fim ([detalhes do pedido](https://developer.ifood.com.br/en-US/docs/guides/modules/order/details/)). Qualquer armazenamento, exposição ao Zelinho ou uso analítico de dados pessoais requer minimização e avaliação específica de LGPD e dos termos, que a documentação técnica pública não resolve por si só.

## 10. Homologações necessárias para a visão completa

| Entrega | Homologação pública aplicável |
|---|---|
| Receber e operar pedidos | Order + Events, automática conjunta no fluxo Food, seguida de revisão final. |
| Status, horários e pausas | Merchant, por critérios próprios/ticket. |
| Cardápio completo | Catalog, por ticket e evidências em vídeo/logs. |
| Vendas líquidas, taxas e repasses | Financial, em ticket separado e integração completa das APIs financeiras. |
| KPIs agregados D-1 | Analytics, ticket exclusivo. |
| Pedir entregador iFood | Shipping, além de contratação/elegibilidade do serviço. |
| Operar frota própria integrada | Logistics, homologação específica. |

Order/Events exige confirmação dentro do SLA, ACK quando o transporte é polling, cancelamento, retirada e despacho. A homologação automatizada pode ser iniciada apenas pelo proprietário do app, no máximo uma vez por aplicação a cada quatro horas; aprovação automática ainda passa por revisão de especialistas ([homologação Order](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/homologation), [homologação Events](https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/homologation)).

## 11. Lacunas e incertezas que exigem confirmação do iFood

1. **Tipo de aplicação para o ZeloPDV.** “Centralizada” é definida como SaaS na criação do app, mas a página de autenticação usa uma descrição de ambiente privado/interno. Webhook, por sua vez, só existe para centralizada e requer endpoint público. Confirmar formalmente o enquadramento.
2. **Onboarding escalável de merchants centralizados.** A documentação pública descreve solicitação iniciada manualmente pelo integrador no Developer Portal e aprovação no Portal do Parceiro. Não esclarece se uma aplicação pública no marketplace oferece um fluxo self-service adicional ou API para iniciar pedidos de autorização.
3. **Financial dentro ou fora do mesmo app PDV.** A política atual não lista Financial entre módulos da categoria PDV e exige ticket separado. Confirmar se será necessário segundo aplicativo/categoria Financial ou apenas homologação adicional.
4. **Conflitos de cardápio.** Não há contrato público completo para conciliar mudanças simultâneas feitas no Portal do Parceiro e no ZeloPDV, nem evento documentado para toda mudança manual de catálogo.
5. **Frequência do polling de fallback ao webhook.** Páginas oficiais citam exemplos de cinco e trinta minutos. Definir com o time de homologação o valor aceito para produção.
6. **Retenção de Order.** O fluxo diz que detalhes ficam sete dias, mas as melhores práticas proíbem consultar/atualizar após oito horas da entrega. Tratar oito horas como limite operacional conservador e persistir imediatamente, até confirmação oficial.
7. **Dados financeiros de teste.** Financial usa `x-request-homologation: true`, mas a documentação pública não prova a cobertura de todos os tipos de taxa, ajuste, cancelamento, antecipação e recebedor no ambiente de homologação.
8. **Zelinho e dados pessoais/financeiros.** Os termos permitem dados para funcionalidades do aplicativo autorizado, mas vedam compartilhamento e finalidade diversa; não há orientação pública específica sobre uso de modelos de IA. Consultar iFood e jurídico antes de enviar conteúdo identificável a qualquer provedor/modelo.
9. **Disponibilidade e SLA comercial.** Não foi localizado SLA público de uptime das APIs, prazo contratual de aprovação de todos os módulos, canal de plantão ou garantia de continuidade; o programa pode ser alterado/descontinuado e credenciais podem ser revogadas conforme os termos.
10. **Custos indiretos.** As APIs são declaradas gratuitas para elegíveis, mas Shipping e outros serviços operacionais podem ter custos contratuais próprios.
11. **Rotas de Events coexistentes.** A documentação pública expõe contratos sob `/events/v1.0` e também sob `/order/v1.0`. Confirmar a versão e as rotas aceitas no app de teste/OpenAPI antes de implementar.
12. **Validade de access token.** Páginas oficiais divergem entre três e seis horas. Usar sempre `expiresIn`, sem constante local.
13. **Settlement detalhado.** O índice oficial lista Settlement e Reconciliation liga lançamentos ao repasse por `id_saldo`, mas a pesquisa pública não encontrou uma página atual, indexada e completa com todos os endpoints/campos de Settlement. Confirmar pela coleção Financial e pela referência concedida ao app.

## 12. Perguntas objetivas para abrir com o iFood

1. Para um SaaS web multi-tenant como o ZeloPDV, qual tipo de aplicação deve ser criado e qual fluxo oficial de autorização por lojista oferece menor intervenção manual?
2. Uma aplicação PDV pública pode solicitar os escopos Merchant, Events, Order, Catalog, Shipping e Analytics no mesmo app?
3. Financial exige um segundo aplicativo da categoria Financial ou pode ser acrescentado ao app PDV após ticket separado?
4. Existe webhook/changelog confiável para mudanças de catálogo feitas fora do integrador, incluindo preço, pausa e estrutura?
5. Qual estratégia oficial de fonte de verdade é esperada para sincronização bidirecional do cardápio?
6. Qual intervalo de polling de reconciliação deve acompanhar webhook em produção e homologação?
7. Há política específica para retenção e uso de dados de pedidos/financeiros por recursos de IA do próprio aplicativo?
8. Aplicações públicas recebem fluxo de descoberta/instalação no Portal do Parceiro e quais critérios comerciais adicionais existem para listagem?
9. Quais cenários Financial o ambiente de homologação cobre e como simular ajustes, cancelamentos pós-entrega, VA/VR, pagamento offline e antecipação?
10. Quais SLAs, canais de incidente e exigências de suporte são esperados de um integrador PDV em produção?

## 13. Conclusão executiva para o ZeloPDV

**Sim, a integração é possível e tem aderência excepcional à arquitetura atual.** O ZeloPDV já possui a maior parte do domínio interno que normalmente torna uma integração desse porte cara: fila canônica de pedidos, eventos auditáveis, outbox durável, controle otimista de revisão, fechamento idempotente em venda, impressão automática, estoque, taxas de plataforma, relatórios e inteligência gerencial.

O maior trabalho não é redesenhar o PDV. É construir uma **fronteira profunda de integração** que traduza o protocolo assíncrono do iFood para contratos internos já conhecidos pelo ZeloPDV. Essa fronteira precisa absorver autenticação, autorização por loja, assinatura de webhook, polling de reconciliação, deduplicação, reordenação de eventos, retentativas, rate limits, catálogo e conciliação financeira.

O resultado pretendido é realista:

- pedidos iFood aparecem em Pedidos e Cozinha, com origem identificada;
- confirmação, preparo, pronto, despacho, retirada e cancelamento podem ser comandados pelo ZeloPDV;
- impressão, estoque e auditoria reaproveitam o motor existente;
- a conclusão materializa uma venda automaticamente e sem duplicidade;
- faturamento bruto, comissões, ajustes e líquido passam a aparecer corretamente nos relatórios após conciliação;
- o Zelinho responde sobre desempenho do canal iFood sem receber dados pessoais desnecessários;
- produtos simples, complementos, preços, disponibilidade e pausas podem ser publicados do ZeloPDV para o iFood;
- pizzas e sincronização estrutural bidirecional ficam para uma fase própria, porque têm risco de perda semântica e conflito.

Há, porém, duas dependências externas que impedem prometer uma data fechada agora: **aprovação/homologação do iFood** e esclarecimento do acesso ao módulo Financial. A engenharia pode começar com credenciais de teste, mas produção depende do processo de parceiro.

### Recomendação de decisão

Tratar a iniciativa como um produto em quatro entregas, não como uma única feature:

1. **Operação de pedidos:** receber e operar pedidos no ZeloPDV com confiabilidade.
2. **Venda e relatórios:** materializar venda bruta e depois conciliá-la com o Financial.
3. **Catálogo:** publicação unidirecional segura, começando por produtos simples.
4. **Inteligência:** métricas por canal e perguntas do Zelinho.

O maior WIN inicial é a primeira entrega junto com a venda automática. Cardápio bidirecional e financeiro completo aumentam o valor, mas não devem bloquear o piloto operacional.

## 14. Aderência à codebase atual

### 14.1 Motor canônico de pedidos: forte reaproveitamento

O agregado existente usa:

- `zelo_orders` para cabeçalho, estado, cliente, fulfillment, pagamento declarado, totais e vínculo com a venda;
- `zelo_order_items` para snapshots dos itens;
- `zelo_order_events` para trilha auditável;
- `zelo_order_outbox` para efeitos posteriores com idempotência e retry;
- `create_zelo_order`, `transition_zelo_order`, `close_zelo_order` e `ensure_zelo_order_sale` como contratos de mutação no banco.

As telas `/app/pedidos` e `/app/pedidos/cozinha` já leem `zelo_orders` e acompanham mudanças por Realtime. A impressão automática também observa o pedido canônico e usa `owner + zelo_orders.id + finalidade` como identidade. Portanto, o pedido iFood deve entrar nesse mesmo agregado com `source='ifood'`; não deve nascer em uma tabela paralela que obrigue cada tela, impressora e relatório a entender dois motores.

A mudança mínima no contrato canônico é:

- permitir `ifood` no `CHECK` de `zelo_orders.source`;
- preservar a origem real em `src/lib/onlineOrders.js`, que hoje projeta `origem: 'zelomenu'` de forma fixa;
- criar vínculo externo explícito, em vez de reaproveitar campos de ZeloMenu ou legado;
- importar o snapshot iFood mesmo quando um item externo ainda não possuir `product_id` local;
- separar transição aplicada por evento externo de comando solicitado por um operador.

O último ponto é crítico. Hoje a UI chama a transição local diretamente. No iFood, a maioria das mutações responde `202`: isso confirma a aceitação do comando, não a mudança final. O fluxo correto é **registrar intenção → enviar ao iFood → aguardar evento → projetar estado canônico**. Atualizar o pedido local otimisticamente produziria divergência quando o iFood recusasse ou demorasse a aplicar a ação.

### 14.2 Estados e estoque

O ZeloPDV já consome estoque quando o pedido é aceito e restaura no cancelamento. Para pedidos iFood, o motor deve manter exatamente uma autoridade para esse efeito:

- evento iFood que torna o pedido aceito dispara o compromisso de estoque uma vez;
- repetição do mesmo evento não altera estoque novamente;
- cancelamento restaura somente se o compromisso existir e ainda não tiver sido compensado;
- sincronização de inventário para o catálogo iFood é consequência do estoque Zelo, nunca um segundo livro-razão.

Não se deve executar uma transição local e depois aplicar novamente o evento correspondente vindo do iFood. O adaptador precisa correlacionar comando e evento, enquanto a função de projeção permanece idempotente.

### 14.3 Vendas, caixa e relatórios

Quando `zelo_orders` chega a `delivered`, o gatilho existente materializa `vendas` com chave `client_sale_id='zelo-order:<id>'`. Isso fornece a base da venda automática e impede duplicidade em replay.

O fechamento atual, contudo, não resolve sozinho a visão financeira do iFood:

- `/app/pedidos` hoje envia `taxasPlataforma: []`;
- `ensure_zelo_order_sale` registra a venda operacional, mas não conhece a composição financeira posterior do iFood;
- comissão, taxa de entrega, incentivos, ajustes, cancelamentos posteriores, antecipação e repasse pertencem ao módulo Financial;
- a taxa real não pode ser inferida por uma porcentagem fixa cadastrada manualmente.

A modelagem correta separa dois fatos:

1. **Venda operacional:** valor bruto e itens no momento em que o pedido é concluído.
2. **Liquidação financeira:** lançamentos e repasses confirmados posteriormente pelo iFood.

O ZeloPDV já possui `vendas_taxas_plataforma`, consumida em relatórios e em `src/lib/server/intelligence/metrics.js` como `custos_plataforma`. Logo, a conciliação pode alimentar essa estrutura para as taxas atribuíveis à venda, mantendo uma tabela própria para lançamentos, ajustes e repasses que não pertencem a uma única venda. Nunca se deve reescrever silenciosamente o valor bruto histórico para fazê-lo coincidir com o líquido.

É recomendável acrescentar um canal normalizado à venda, por exemplo `vendas.canal_origem`, preenchido com `ifood` a partir do pedido. Hoje a origem vive no pedido, enquanto os relatórios partem de `vendas`; sem essa dimensão, toda pergunta por canal dependerá de joins ou heurísticas.

### 14.4 Zelinho

Os snapshots e fetchers da inteligência já consomem `vendas`, itens, pagamentos e `vendas_taxas_plataforma`. Com a venda automática e a conciliação funcionando, grande parte dos números entra no Zelinho sem uma segunda integração de dados.

As extensões recomendadas são:

- métricas `por_canal.ifood`: quantidade, bruto, descontos, taxas, líquido confirmado e ticket médio;
- taxa de cancelamento e tempos de aceitação/preparo com dados do pedido;
- ranking de produtos iFood por mapeamento de item;
- distinção clara entre **líquido estimado** e **líquido conciliado**;
- ferramentas/perguntas como “quanto vendi no iFood esta semana?”, “quanto paguei em taxas?” e “qual produto performou melhor no iFood?”.

Dados pessoais, endereço, telefone, CPF e payload bruto do pedido não devem compor prompt, snapshot ou ferramenta do modelo. O Zelinho precisa apenas de fatos agregados e identificadores internos não pessoais.

### 14.5 Entitlements e permissões

Pedidos e Cozinha hoje são liberados por entitlements ligados ao ZeloMenu. Isso precisa ser desacoplado: iFood deve ser um entitlement próprio, e a fila canônica deve abrir quando a empresa possuir qualquer origem autorizada que a alimente.

Permissões operacionais existentes podem continuar protegendo ações de pedido, mas a configuração deve ganhar uma capacidade específica, como `integracoes.ifood.gerenciar`, restrita a titular/administrador. Ativar loja, alterar vínculo de merchant, publicar catálogo e ligar presença são ações mais sensíveis que aceitar um pedido.

## 15. Arquitetura proposta

### 15.1 O módulo profundo

A integração deve ser um módulo interno com uma interface pequena e implementação complexa. O restante do ZeloPDV não precisa conhecer OAuth, HMAC, rotas, rate limits nem códigos de evento iFood.

Interface conceitual:

```text
IfoodIntegration
  connectMerchant(empresaId, merchantId)
  receiveWebhook(rawBody, signature)
  reconcileEvents(cursor)
  requestOrderAction(orderId, action, payload)
  publishCatalog(changeSet)
  reconcileFinancial(period)
  getConnectionHealth(empresaId)
```

O adaptador de produção fala HTTP com o iFood. Um adaptador mock simula eventos repetidos, fora de ordem, atrasos, `429`, `5xx` e respostas `202` nos testes. São dois adaptadores reais e justificados: produção e teste; não há necessidade de uma hierarquia genérica de provedores neste momento.

### 15.2 Fluxo de entrada

```text
iFood webhook ──> verificação HMAC com corpo bruto ──> inbox durável ──> HTTP 202
                                                           │
iFood polling de reconciliação ─────────────────────────────┤
                                                           ▼
                                                   worker de eventos
                                                           │
                                 buscar detalhe + normalizar + deduplicar
                                                           │
                                                           ▼
                          external_order_ref ──> zelo_orders/items/events/outbox
                                                           │
                              Pedidos · Cozinha · impressão · estoque · venda
```

O endpoint web deve fazer pouco: verificar assinatura antes de parsear, validar limite de corpo, persistir a mensagem e responder rapidamente. A transformação fica no worker. Isso evita perder o evento quando uma consulta de detalhe ou o banco estiver lento.

Webhook é o caminho principal, mas polling é obrigatório como reconciliação. A API opera com entrega pelo menos uma vez e sem garantia de ordem; logo, `eventId` único, cursor, timestamp externo e regras monotônicas são requisitos, não otimizações.

### 15.3 Fluxo de comando

```text
operador no ZeloPDV ──> autorização por tenant ──> ifood_order_commands
                                                        │
                                                        ▼
                                                worker chama iFood
                                                        │
                          resposta 202 = enviado, não concluído
                                                        │
                                                        ▼
                                  evento posterior confirma/rejeita resultado
                                                        │
                                                        ▼
                                           projeção em zelo_orders
```

A UI mostra estados de sincronização separados do estado comercial: `a_enviar`, `enviado`, `confirmado`, `falhou`, `expirado`. Assim um pedido pode continuar `pending_review` enquanto a confirmação está `enviada`, sem mentir para o operador.

### 15.4 Processo sempre ativo

O frontend SvelteKit está na Vercel, mas cron diário não atende polling a cada dezenas de segundos, retentativas, presença e reconciliação. Recomenda-se um worker sempre ativo, implantado separadamente — podendo aproveitar a infraestrutura operacional já usada pelo ecossistema Zelo — com:

- leasing/lock para impedir dois workers processarem a mesma mensagem;
- backoff com jitter e respeito a `X-RateLimit-*`;
- circuit breaker por módulo/merchant;
- dead-letter/replay administrativo;
- métricas de atraso, erro e última sincronização;
- desligamento por merchant e kill switch global.

O endpoint Vercel pode continuar como ingresso público do webhook se a persistência síncrona cumprir a janela, mas toda lógica duradoura fica fora dele.

## 16. Modelo de dados recomendado

Os nomes abaixo são propostas; a migration definitiva deve seguir os padrões SQL e RLS do repositório.

| Estrutura | Responsabilidade | Restrições importantes |
|---|---|---|
| `ifood_connections` | Liga `empresa_id` a `merchant_id`, estado da autorização, módulos, presença e saúde. | `unique(merchant_id)` e tenant explícito; segredo global não fica aqui. |
| `ifood_event_inbox` | Payload bruto/normalizado recebido por webhook ou polling. | `unique(event_id)`; somente service role; retenção curta; status/attempts/erro. |
| `ifood_event_cursors` | Cursor/última reconciliação por aplicação ou conexão. | Lock e atualização transacional. |
| `ifood_order_refs` | Liga pedido iFood a `zelo_orders`. | `unique(merchant_id, external_order_id)` e `unique(zelo_order_id)`. |
| `ifood_order_commands` | Intenções de confirmar, preparar, pronto, despachar, retirar ou cancelar. | Chave idempotente por pedido/ação/revisão; trilha de resposta. |
| `ifood_catalog_mappings` | Liga categoria/item/produto/grupo/opção local ao ID/código externo. | Escopo por merchant, tipo de entidade, hash e versão sincronizada. |
| `ifood_catalog_jobs` | Publicações em lote e seus resultados. | Acompanha `batchId`, falha parcial e replay seletivo. |
| `ifood_financial_entries` | Lançamentos financeiros imutáveis importados. | Identidade externa única; referência opcional a venda; nunca sobrescrever histórico. |
| `ifood_settlements` | Repasse e reconciliação dos lançamentos. | Total, competência, pagamento e status auditáveis. |

Também serão necessárias alterações pequenas nos agregados existentes:

- `zelo_orders.source` aceita `ifood`;
- `zelo_orders` mantém apenas a projeção canônica; IDs externos ficam em `ifood_order_refs` para não poluir o domínio;
- `vendas.canal_origem` ou estrutura equivalente registra `ifood` de forma indexável;
- `vendas_taxas_plataforma` recebe taxas atribuíveis a uma venda via função service-role idempotente;
- eventos/auditoria registram `external_event_id`, sem expor o payload pessoal ao browser.

Todas as tabelas `ifood_*` operacionais devem ser service-role-only. O browser lê apenas views/RPCs owner-scoped necessárias à configuração e saúde. Esse desenho preserva a fronteira já adotada em `zelo_order_outbox`.

## 17. Mapeamento de estados e ações

O mapeamento exato precisa ser validado contra os códigos liberados ao app de homologação, mas o contrato desejado é:

| Evento/condição iFood | Estado ZeloPDV | Efeito |
|---|---|---|
| Pedido integrado aguardando decisão | `pending_review` | Cria pedido e itens de forma idempotente; alerta/impressão conforme configuração. |
| Confirmação efetivada | `accepted` | Compromete estoque uma vez. |
| Início de preparo | `preparing` | Atualiza fila de Cozinha. |
| Pronto para retirada | `ready` | Atualiza operação e envia ação iFood quando iniciada localmente. |
| Saiu para entrega própria | `out_for_delivery` | Somente quando o modelo logístico admitir ação do merchant. |
| Entregue/concluído | `delivered` | Materializa venda idempotente. |
| Cancelado | `cancelled` | Restaura estoque se aplicável; se já houve venda, cria compensação/estorno auditável. |

Regras adicionais:

- pedido agendado respeita `preparationStartDateTime` para SLA e exposição operacional;
- cancelamento sempre consulta motivos dinâmicos antes da solicitação;
- `202` nunca avança estado sozinho;
- evento antigo não regride um estado mais novo;
- detalhes com `404` inicial entram em retry exponencial por janela limitada;
- evento desconhecido é guardado e sinalizado, não descartado silenciosamente;
- cancelamento posterior à venda nunca apaga venda, itens ou taxas; produz compensação rastreável.

O `pending_payment` existente só deve ser usado se o contrato iFood produzir de fato um pedido ainda não pago que exija ação do lojista. Não se deve traduzir pagamento online/offline diretamente em status operacional.

## 18. Estratégia de catálogo

### 18.1 Fonte de verdade inicial

Na primeira versão, o **ZeloPDV deve ser a fonte de verdade** para entidades homologadas e publicadas no iFood. Isso significa sincronização estrutural Zelo → iFood, com importação inicial usada apenas para comparação/mapeamento assistido.

Sincronização bidirecional completa não é recomendada no início porque a documentação pública não oferece um contrato universal de eventos para toda edição manual no Portal do Parceiro. Sem versão comparável dos dois lados, “última gravação vence” apagaria trabalho sem aviso.

### 18.2 Escopo seguro da primeira publicação

Incluir:

- categorias;
- produtos simples;
- nome, descrição e foto quando suportados;
- preço base;
- grupos de complementos e opções representáveis sem perda;
- disponibilidade, pausa e inventário controlado;
- `externalCode` estável derivado do ID Zelo, nunca do nome mutável.

Adiar ou homologar separadamente:

- pizzas com tamanho, massa, borda e sabores;
- promoções complexas e preços dependentes de contexto;
- itens existentes no iFood sem correspondência inequívoca;
- merge automático de mudanças feitas simultaneamente nos dois lados.

A modelagem atual de `produtos`, publicações ZeloMenu, grupos e opções oferece boa base para produtos simples. Pizza exige um tradutor dedicado porque a taxonomia iFood e `pizza_config` não são comprovadamente isomórficas.

### 18.3 Preview, conflito e publicação

Antes de cada publicação estrutural, mostrar um diff:

- criar, atualizar, pausar, reativar e não mapeado;
- campos que perderiam informação;
- referências quebradas;
- itens que o iFood rejeitará por regra obrigatória.

Cada mapping guarda o hash da última versão enviada. Se o remoto divergir desse hash e o local também mudou, marcar `conflict` e exigir decisão humana. Não sobrescrever automaticamente.

Preço, status e estoque podem usar endpoints parciais/lote e outbox rápida. Mudança estrutural completa usa PUT idempotente e job acompanhado até conclusão. Falhas parciais precisam aparecer na configuração da integração, com replay apenas dos itens afetados.

O inventário publicado representa disponibilidade vendável no iFood, não o estoque contábil. O ledger continua no ZeloPDV.

## 19. Segurança, privacidade e operação multi-tenant

### Credenciais e autorização

- `clientId` e `clientSecret` ficam somente no ambiente secreto do servidor/worker;
- token centralizado é mantido em cache compartilhado, renovado com base em `expiresIn` e nunca enviado ao browser;
- não registrar Authorization, segredo ou payload sensível em logs;
- vínculo `empresa_id ↔ merchant_id` é explícito e único;
- toda ação valida tenant, conexão ativa e permissão do ator antes de criar comando;
- rotação de segredo deve suportar sobreposição controlada para não interromper webhooks.

### Webhook

- verificar `X-IFood-Signature` em tempo constante sobre os bytes exatos recebidos;
- rejeitar assinatura inválida antes de JSON parse e antes de qualquer escrita de domínio;
- aplicar limite de tamanho, content type e rate limiting defensivo;
- persistir antes de responder `202`;
- deduplicar por ID externo e tornar o processamento reentrante;
- manter payload bruto apenas pelo prazo necessário a auditoria/replay, com política de expurgo.

### LGPD e Zelinho

- armazenar apenas campos necessários à execução, suporte, fiscal e conciliação;
- CPF somente para emissão fiscal, conforme a finalidade declarada pelo iFood;
- não criar automaticamente cadastro em `pessoas` a partir de um comprador iFood sem regra jurídica e de identidade aprovada;
- mascarar telefone/endereço em suporte e logs;
- excluir campos pessoais de snapshots e prompts do Zelinho;
- definir retenção e procedimento de atendimento a titular antes do piloto;
- obter validação jurídica e confirmação do iFood sobre uso de dados agregados em recurso de IA.

### Presença e fail-safe

Ligar presença pode abrir a loja para pedidos. Portanto, a presença deve ser calculada por merchant e permanecer desligada quando conexão, worker, assinatura, configuração obrigatória ou saúde do processamento estiverem inválidos. Nunca alterar presença de todos os merchants por acidente ou por uma credencial global.

## 20. Plano recomendado, dependências e esforço

As estimativas abaixo são de **engenharia para uma pessoa experiente**, não incluem o prazo externo de aprovação do iFood e devem ser recalibradas após o spike com credenciais reais.

| Fase | Entrega | Esforço indicativo | Gate de saída |
|---|---|---:|---|
| 0. Partner & spike | Conta profissional, app de teste, autorização de merchant, coleção real, respostas às 13 lacunas, protótipo de token/webhook/poll. | 1–2 semanas | Pedido de teste recebido, assinado, deduplicado e detalhado. |
| 1. Fundação de pedidos | Conexão, inbox, worker, polling, referências externas, health, métricas e replay. | 2–3 semanas | Replay/out-of-order/429/5xx passam em testes; nenhum pedido duplicado. |
| 2. Operação no PDV | Importação canônica, ações assíncronas, estados de sync, Cozinha, impressão, estoque, cancelamentos, presença e permissões. | 3–4 semanas | Homologação Order/Events/Merchant e piloto shadow. |
| 3. Venda automática | Venda no `delivered`, canal, pagamento, estornos pós-venda, relatórios brutos e alertas de divergência. | 1–2 semanas | Um replay não duplica pedido, estoque nem venda. |
| 4. Catálogo simples | Mappings, preview, diff, produtos/complementos/preços/status/inventário, jobs em lote. | 4–6 semanas | Homologação Catalog e publicação segura em merchant piloto. |
| 5. Financial | Lançamentos, taxas, ajustes, settlement, reconciliação, líquido confirmado e fechamento por período. | 3–5 semanas | Homologação Financial e diferença explicável por pedido/repasse. |
| 6. Zelinho | Métricas por canal, ferramentas e respostas agregadas; guardrails de privacidade. | 1–2 semanas | Respostas batem com relatórios e não expõem PII. |
| 7. Pizzas/expansões | Tradução específica de pizza; Analytics D-1, Shipping ou Review conforme produto. | 2–4+ semanas | Homologações específicas e piloto dedicado. |

Leitura prática:

- **MVP operacional + venda bruta:** aproximadamente 6–10 semanas de engenharia, mais homologação.
- **Visão completa sem expansões logísticas:** aproximadamente 12–20 semanas de engenharia, mais homologações e dependências comerciais.
- Catálogo pode avançar em paralelo a Financial depois que a fundação estiver estável, se houver duas frentes de engenharia.

### Sequência de rollout

1. Merchant de teste e tráfego sintético.
2. Shadow mode em uma loja amiga: recebe/compara, mas o gestor ainda opera pelo iFood.
3. Comandos no ZeloPDV com presença controlada e acompanhamento assistido.
4. Venda automática e relatórios brutos.
5. Catálogo simples em subconjunto de itens.
6. Conciliação financeira.
7. Liberação gradual por merchant, nunca ativação global.

Cada fase precisa de kill switch independente: recepção, comandos, presença, catálogo e financeiro.

## 21. Principais riscos e mitigação

| Risco | Impacto | Mitigação proposta |
|---|---|---|
| Aprovação ou escopo Financial não concedido | Visão líquida incompleta | Abrir ticket na fase 0; vender inicialmente bruto como bruto, nunca como líquido. |
| Evento duplicado, perdido ou fora de ordem | Pedido/estoque/venda incorretos | Inbox única, idempotência, regras monotônicas e polling de reconciliação. |
| `202` tratado como sucesso final | Tela diverge do iFood | Comando separado de estado; somente evento confirma transição. |
| Confirmação estoura SLA | Cancelamento e perda operacional | Worker sempre ativo, alertas de idade e fallback operacional documentado. |
| Presença abre loja indevidamente | Pedidos recebidos sem capacidade | Controle por merchant, fail-closed, health gate e kill switch. |
| Duplo desconto/devolução de estoque | Saldo corrompido | Efeito vinculado a evento idempotente e marcadores de compromisso/compensação. |
| Comissão estimada tratada como real | Relatórios e Zelinho errados | Separar bruto, estimado e conciliado; Financial é a autoridade. |
| Cancelamento após venda apaga histórico | Caixa/auditoria inconsistentes | Estorno/compensação imutável; nunca delete silencioso. |
| Catálogo bidirecional sobrescreve edição | Perda de cardápio | Fonte Zelo inicial, hashes, preview e conflito manual. |
| Pizza perde semântica | Pedido impossível de produzir | Deferir para tradutor e homologação próprios. |
| PII chega a logs ou IA | Incidente LGPD/contratual | Minimização, mascaramento, retenção e dados agregados no Zelinho. |
| Dependência só de função serverless/cron diário | Eventos atrasados e loja inconsistente | Worker sempre ativo com observabilidade, leasing e retry. |
| Entitlement acoplado ao ZeloMenu | Cliente iFood sem acesso ou acesso grátis indevido | Add-on iFood próprio e capability da fila independente da origem. |

## 22. Critérios de go-live

Não liberar produção até que todos os itens abaixo estejam comprovados:

### Confiabilidade

- assinatura inválida é sempre rejeitada;
- evento só recebe `202` depois de persistência durável;
- replay do mesmo evento não duplica pedido, item, estoque, impressão, venda ou taxa;
- eventos fora de ordem não regridem estado;
- polling recupera evento perdido dentro da meta acordada com o iFood;
- `429`, indisponibilidade e token expirado entram em retry controlado;
- dead-letter e replay administrativo funcionam sem edição direta de banco.

### Operação

- pedido novo aparece no ZeloPDV dentro da meta interna de latência;
- idade até confirmação é visível e alerta antes do SLA do iFood;
- operador vê se uma ação está pendente, confirmada ou falhou;
- cancelamento usa razões atuais e exibe desfecho real;
- presença é por merchant, fail-closed e tem kill switch;
- impressão e Cozinha mantêm uma única cópia do pedido.

### Financeiro

- conclusão cria exatamente uma venda;
- bruto do pedido, descontos, pagamento e canal são auditáveis;
- cancelamento posterior produz estorno/compensação, não exclusão;
- taxa estimada nunca é apresentada como conciliada;
- lançamentos Financial reconciliam com venda/repasse ou aparecem como pendência explicável;
- relatório e Zelinho devolvem os mesmos totais para o mesmo período/fuso.

### Catálogo e segurança

- todo item publicado possui mapping estável e diff revisável;
- falha parcial em lote não marca o restante como sincronizado;
- pizza não entra no escopo simples por acidente;
- credenciais e tokens nunca chegam ao browser/log;
- RLS e autorização cruzada entre duas empresas foram testadas;
- política de retenção, suporte, incidente e LGPD está aprovada;
- homologações aplicáveis do iFood estão concluídas.

## 23. Próximos passos imediatos

1. Criar/confirmar a conta profissional no Developer Portal e abrir o app de teste como solução PDV centralizada, pedindo confirmação formal desse enquadramento.
2. Abrir um ticket único com as perguntas da seção 12, destacando Financial, onboarding multi-merchant, catálogo e polling de reconciliação.
3. Escolher uma loja piloto e obter consentimento para shadow mode.
4. Produzir um ADR curto fixando três decisões: `zelo_orders` continua canônico; evento externo confirma estado; ZeloPDV é fonte inicial do catálogo.
5. Implementar um spike descartável de token + webhook assinado + polling + detalhe de pedido, sem ainda ligar presença ou aceitar pedidos reais.
6. Com os payloads reais, fechar schema, matriz de estados e estimativa final antes de iniciar a fase 1.

**Recomendação final:** avançar. A oportunidade é grande e a codebase está mais preparada do que parece, mas o caminho vencedor é lançar primeiro uma central operacional extremamente confiável e adicionar catálogo/financeiro em camadas. Tentar entregar sincronização bidirecional, conciliação total, pizzas e Zelinho de uma vez aumentaria o risco de homologação e atrasaria o primeiro valor percebido.
