# Design do MVP de integração iFood no ZeloPDV

**Data:** 15 de setembro de 2026

**Status:** aprovado em entrevista; aguardando revisão do documento

**Relatório de viabilidade:** [IFOOD_INTEGRATION_REPORT.md](../../projects/IFOOD_INTEGRATION_REPORT.md)
**Decisão arquitetural:** [ADR-0001](../../adr/0001-ifood-worker-dedicado.md)

## 1. Objetivo

O MVP permite que uma loja receba e opere seus pedidos iFood no ZeloPDV e que pedidos concluídos gerem vendas operacionais automaticamente. As vendas entram nos relatórios gerais e fornecem ao Zelinho consciência mínima do canal de origem.

A promessa ao cliente é:

> Operar pedidos iFood no ZeloPDV sem redigitar pedidos ou vendas.

O MVP não promete sincronização de cardápio, conciliação financeira líquida ou substituição de todas as ocorrências extraordinárias tratadas pelo Portal do Parceiro.

## 2. Decisões de produto

- O ZeloPDV será a interface operacional principal; o Gestor de Pedidos será contingência.
- Entram pedidos de entrega iFood, entrega própria, retirada, imediatos e agendados.
- O operador confirma manualmente no ZeloPDV.
- O fluxo operacional inclui confirmação, início de preparo, pronto, despacho, cancelamento e códigos de retirada/entrega quando aplicáveis.
- A venda nasce somente após o evento externo `CONCLUDED`.
- Toda venda iFood aparece nos relatórios, mas nenhuma altera o caixa físico no MVP.
- Produto mapeado pode movimentar estoque; produto não mapeado não bloqueia o pedido e não movimenta estoque.
- Os pedidos aparecem nas filas existentes de Pedidos e Cozinha, identificados por badge textual `iFood`.
- O cardápio não faz parte do MVP.
- A integração será incluída no ZeloPDV padrão de R$59 e planos superiores, inclusive durante trial elegível, sem add-on separado.
- O onboarding final será self-service para todos os clientes elegíveis.
- O Zelinho entra com consciência geral de canal, não como assistente separado do iFood.
- Compradores iFood não viram Pessoas automaticamente.
- A integração opera em fail-closed quando não consegue garantir recepção e processamento.
- A loja escolhe um único responsável por impressão: ZeloPDV ou sistema externo.
- O alerta sonoro é uma capacidade genérica do ZeloPDV e será desenvolvido em frente separada.
- O logotipo oficial do iFood só poderá substituir a badge textual após autorização formal.

## 3. Escopo funcional

### 3.1 Conexão self-service

O titular acessa `Perfil > Integrações` e encontra um card iFood com um destes estados:

- Não conectado;
- Aguardando autorização no iFood;
- Configuração necessária;
- Ativo;
- Atenção necessária;
- Pausado.

O wizard:

1. explica requisitos e impactos;
2. identifica a loja no iFood;
3. conduz a autorização obrigatória no ambiente externo;
4. acompanha a autorização sem prometer ativação instantânea;
5. testa autenticação, merchant e saúde do worker;
6. permite escolher o responsável pela impressão;
7. sugere vínculos exatos de produto já reconhecidos;
8. orienta ativar sem pedidos em andamento;
9. habilita a conexão somente quando todos os gates obrigatórios estiverem verdes.

O fluxo deve continuar self-service mesmo que a autorização dependa de uma etapa no Portal do Parceiro. Se o iFood exigir uma ação manual exclusiva do integrador para cada merchant, o wizard explicará o estado pendente e o produto não prometerá ativação imediata; essa limitação é um gate externo a ser confirmado antes do desenvolvimento definitivo do onboarding.

Pedidos já em andamento no momento da ativação continuam no Gestor de Pedidos. O ZeloPDV assume apenas eventos novos após a ativação. Não há backfill de vendas ou pedidos históricos no MVP.

### 3.2 Recepção do pedido

O webhook é o caminho principal. O endpoint:

1. lê os bytes brutos;
2. valida `X-IFood-Signature` em tempo constante;
3. rejeita corpo, assinatura ou formato inválido;
4. persiste o evento na inbox durável;
5. responde `202` somente após o commit.

O processamento do domínio nunca ocorre dentro da requisição do webhook.

O polling funciona como reconciliação. Seu intervalo é configurável e deve usar o valor formalmente aceito na homologação; o sandbox começa com 300 segundos. A integração não fixa em código uma frequência que contrarie a política vigente do iFood.

Eventos podem duplicar, chegar fora de ordem ou depois de um comando. O processamento é reentrante e monotônico:

- o mesmo evento não produz dois efeitos;
- um evento antigo não regride estado;
- um código desconhecido fica preservado e gera alerta;
- detalhe de pedido indisponível com `404` entra em backoff por até dez minutos;
- nenhuma consulta repetitiva ultrapassa limites ou vira loop infinito.

### 3.3 Operação do pedido

Pedidos iFood entram em `zelo_orders` com `source='ifood'`. Pedidos e Cozinha continuam consumindo apenas o agregado canônico.

Mapeamento de estados:

| iFood | ZeloPDV | Efeito principal |
|---|---|---|
| Pedido aguardando decisão | `pending_review` | Exibição, SLA e alerta. |
| Confirmação efetivada | `accepted` | Compromisso de estoque para itens mapeados. |
| Preparo iniciado | `preparing` | Entrada/avanço na Cozinha. |
| Pronto | `ready` | Atualização operacional. |
| Despachado pela loja | `out_for_delivery` | Acompanhamento da entrega própria. |
| Concluído | `delivered` | Venda operacional idempotente. |
| Cancelado | `cancelled` | Compensação de estoque; eventual estorno. |

O mapeamento final de códigos será congelado a partir da coleção e dos eventos efetivamente liberados ao app de teste.

### 3.4 Comandos assíncronos

Uma ação do operador não chama `transition_zelo_order` diretamente para pedidos iFood. Ela cria um Comando iFood com identidade idempotente.

Estados do comando:

- `queued`;
- `sending`;
- `accepted_http`;
- `confirmed_event`;
- `failed_retryable`;
- `failed_terminal`;
- `expired`.

Uma resposta HTTP `202` muda o comando para `accepted_http`; não muda o estado comercial do pedido. Apenas o evento externo confirmado projeta a transição em `zelo_orders`.

A interface mostra separadamente o estado comercial e o estado de sincronização:

- Aguardando envio;
- Enviado ao iFood;
- Confirmado pelo iFood;
- Falha — tentar novamente;
- Requer ação no Portal do Parceiro.

### 3.5 Ações suportadas

- confirmar manualmente;
- iniciar preparo;
- marcar pronto para retirada;
- despachar quando a modalidade permitir;
- consultar motivos dinâmicos de cancelamento;
- solicitar cancelamento com o motivo escolhido;
- exibir/validar códigos de retirada ou entrega quando exigidos;
- refletir cancelamentos ou conclusões iniciados fora do ZeloPDV.

Negociação pós-entrega, alteração parcial complexa ou ocorrência sem contrato inequívoco vira pendência administrativa com direcionamento ao Portal do Parceiro.

### 3.6 Pedidos agendados

Pedidos agendados ficam visíveis imediatamente em uma seção própria. O alerta operacional, impressão e entrada na Cozinha respeitam `preparationStartDateTime` ou a recomendação de início de preparo fornecida pelo iFood.

O cronômetro de confirmação usa a regra oficial adequada a pedidos agendados, não o momento arbitrário em que a tela foi aberta.

### 3.7 Produtos e estoque

Não há sincronização de catálogo no MVP.

Quando um item externo é visto:

- correspondência exata por `externalCode` pode ser sugerida;
- nome semelhante é somente sugestão visual;
- nenhum vínculo por similaridade é criado automaticamente;
- vínculo confirmado passa a valer para pedidos posteriores da mesma loja;
- item não mapeado mantém nome, quantidade, preço, complementos e observações no snapshot;
- item não mapeado não altera estoque e recebe indicador operacional.

Estoque é comprometido apenas uma vez quando a confirmação é efetivada. Cancelamento restaura somente compromissos efetivamente realizados e ainda não compensados.

### 3.8 Impressão e alertas

O ZeloPDV sempre apresenta alerta visual persistente enquanto o pedido exigir decisão. A capacidade sonora é genérica, reutilizável por todas as origens e é uma dependência do rollout, não parte interna do módulo iFood.

Cada conexão escolhe um responsável pela impressão:

- ZeloPDV; ou
- iFood/outro sistema.

Se existir estação Zelo Impressão pronta, o wizard sugere ZeloPDV. Sem estação, sugere impressão externa. A integração nunca habilita os dois intencionalmente.

Quando o ZeloPDV for responsável, a comanda respeita o contrato oficial, a política de PII e a deduplicação existente. Resultado incerto de impressão não provoca repetição automática.

### 3.9 Venda operacional

O evento `CONCLUDED` cria exatamente uma venda com chave idempotente derivada de `zelo_orders.id`.

A venda preserva:

- canal `ifood`;
- itens e complementos históricos;
- descontos;
- taxa de entrega informada;
- total do pedido;
- forma de pagamento declarada;
- modalidade e horário de conclusão;
- referência ao pedido canônico.

No MVP, `id_caixa` fica vazio para toda venda iFood. Mesmo pagamento declarado como dinheiro não altera o esperado em gaveta. A forma de pagamento continua visível nos relatórios.

Cancelamento integral inequívoco depois da conclusão cria Estorno iFood auditável. A venda original nunca é apagada. Evento parcial ou ambíguo vira pendência administrativa em vez de alterar números silenciosamente.

### 3.10 Relatórios e Zelinho

Os relatórios existentes ganham:

- filtro por canal;
- badge/origem iFood;
- quantidade de vendas;
- receita bruta operacional;
- ticket médio;
- cancelamentos e estornos;
- métodos de pagamento;
- comparação com outros canais.

Comissão, líquido e repasse aparecem como indisponíveis até a integração Financial. Nenhuma taxa estimada será apresentada como fato.

O Zelinho usa a mesma dimensão de canal e os mesmos agregados dos relatórios. Ele pode responder sobre vendas gerais e comparar canais, inclusive iFood. Dados pessoais e payload bruto não entram em snapshot, prompt ou ferramenta do modelo.

## 4. Arquitetura

### 4.1 Decisão

O MVP usa um worker Node sempre ativo no Dokploy, implantado separadamente do ZeloPDV e do ZeloChat. O código permanece neste repositório e possui deploy independente.

```text
iFood webhook ──> ingresso HTTPS ──> inbox Supabase ──> worker dedicado
                                               │              │
iFood polling de reconciliação ────────────────┘              │
                                                              ▼
                                                   IfoodIntegration
                                                              │
                           ┌──────────────────────────────────┼──────────────┐
                           ▼                                  ▼              ▼
                    zelo_orders                           vendas      saúde/comandos
                           │                                  │
                   Pedidos/Cozinha                    Relatórios/Zelinho
```

### 4.2 Módulo profundo

O módulo `IfoodIntegration` esconde OAuth, HMAC, rotas, códigos externos, retry, rate limits, deduplicação e ordenação.

Interface conceitual:

```text
connectMerchant(input) -> ConnectionResult
receiveEvent(rawEvent) -> ReceiptResult
requestOrderAction(input) -> CommandResult
reconcileEvents(input) -> ReconciliationResult
getConnectionHealth(empresaId) -> ConnectionHealth
```

O iFood é uma dependência externa verdadeira. Há dois adapters reais no seam:

- adapter HTTP de produção;
- adapter mock de teste.

O restante do sistema não importa contratos do iFood diretamente.

### 4.3 Persistência

Estruturas privadas mínimas:

| Estrutura | Identidade/invariante |
|---|---|
| `ifood_internal.connections` | Um `merchant_id` pertence a uma única empresa conectada. |
| `ifood_internal.event_inbox` | `event_id` externo é único e imutável. |
| `ifood_internal.order_refs` | Um pedido externo liga a exatamente um `zelo_orders`. |
| `ifood_internal.order_commands` | Chave idempotente impede repetição da mesma intenção/revisão. |
| `ifood_internal.product_mappings` | Mapping único por merchant e item externo. |

Campos operacionais incluem tentativas, próximo retry, erro sanitizado, timestamps externos, lease e estado de processamento.

Alterações públicas:

- `zelo_orders.source` aceita `ifood`;
- a projeção de UI preserva `row.source`, removendo o hardcode atual de `zelomenu`;
- `vendas` recebe canal de origem indexável;
- funções service-role-only criam venda e estorno iFood sem caixa;
- views/RPCs expõem somente configuração e saúde autorizadas.

Tabelas privadas não recebem grants de browser. Toda interface server-side valida sessão, owner e capacidade antes de usar credenciais privilegiadas.

## 5. Saúde, SLA e contingência

Metas internas:

| Indicador | Meta |
|---|---|
| Evento via webhook visível | p95 até 10 segundos |
| Comando registrado até envio | p95 até 2 segundos |
| Primeiro alerta de confirmação | 4 minutos |
| Alerta crítico | 6 minutos |
| SLA externo | 8 minutos |
| Perda de saúde até fail-closed | 90 segundos por padrão |

A janela de fail-closed é configurável, com 90 segundos como padrão inicial.

Quando a conexão perde saúde:

1. fica degradada;
2. o worker tenta retirar a presença somente daquele merchant;
3. o titular recebe alerta;
4. pedidos já recebidos continuam visíveis;
5. ações impossíveis de enviar ficam bloqueadas;
6. a UI apresenta a contingência do Portal do Parceiro.

Recuperação exige autorização válida, worker saudável e configuração completa. Kill switches existem para:

- aplicação inteira;
- merchant;
- recepção;
- comandos;
- impressão.

## 6. Segurança e privacidade

- `clientId`, `clientSecret` e access tokens nunca chegam ao browser.
- Token usa `expiresIn`; não existe constante local de três ou seis horas.
- HMAC usa os bytes exatos e comparação em tempo constante.
- Logs não registram Authorization, segredo, corpo integral, telefone, endereço ou CPF.
- CPF só pode ser usado para finalidade fiscal admitida pelo contrato.
- Payload bruto tem retenção curta, definida no runbook, e acesso administrativo auditado.
- Comprador iFood não cria Pessoa no MVP.
- Dados pessoais não chegam ao Zelinho.
- Toda operação valida `empresa_id ↔ merchant_id` no servidor.
- Testes de autorização usam duas empresas distintas.
- Funções privilegiadas revogam `EXECUTE` de `PUBLIC` e recebem apenas os grants necessários.
- Nenhum objeto é criado ou alterado nos schemas internos `auth`, `storage` ou `realtime`.

## 7. Observabilidade e suporte

O suporte precisa consultar sem acessar payload pessoal:

- estado e módulos autorizados;
- última recepção por webhook;
- último polling bem-sucedido;
- atraso da inbox;
- comandos pendentes/falhos;
- rate limit observado;
- última renovação de token;
- estado da presença;
- impressão configurada;
- quantidade de itens não mapeados.

O painel administrativo permite pausar, reprocessar dead-letter e orientar reconexão. Replay é uma nova tentativa do mesmo fato, não criação manual de outro pedido.

## 8. Estratégia de entrega

### Etapa 0 — acesso e prova técnica

- conta profissional e app de teste;
- confirmação do modelo de autenticação centralizada;
- confirmação do onboarding por merchant;
- token, webhook, polling e detalhe de pedido sintético;
- confirmação formal do intervalo de reconciliação;
- solicitação de autorização de uso da marca.

### Etapa 1 — fundação durável

- schema privado;
- worker;
- inbox, commands, refs e leases;
- adapter HTTP e mock;
- métricas, retry, dead-letter e kill switch.

### Etapa 2 — shadow mode

- importação canônica sem comandos externos;
- comparação contra Gestor de Pedidos;
- modalidades, agendados, pagamentos e cancelamentos;
- validação de PII e printing payload.

### Etapa 3 — operação completa

- comandos assíncronos;
- fila, Cozinha, SLA e estados de sync;
- impressão configurável;
- mapping progressivo e estoque;
- fail-closed.

### Etapa 4 — venda, relatórios e Zelinho

- venda fora do caixa;
- estorno;
- canal indexável;
- relatórios;
- consciência de canal no Zelinho.

### Etapa 5 — self-service e rollout

- wizard;
- documentação e suporte;
- merchant piloto;
- soak monitorado;
- homologação;
- liberação gradual até todos os planos elegíveis.

## 9. Estratégia de testes

### Interface do módulo

- recebimento normal;
- duplicidade;
- inversão de eventos;
- atraso;
- código desconhecido;
- resposta `202` seguida de sucesso ou falha;
- `401`, `404`, `429`, timeout e `5xx`;
- renovação de token e alteração de escopos.

### Banco

- constraints e identidades externas;
- leases com dois workers;
- replay sem duplicidade;
- compromisso/restauração de estoque;
- venda e estorno idempotentes;
- ausência de vínculo com caixa;
- isolamento entre tenants;
- grants, RLS e funções privilegiadas.

### Interface do usuário

- wizard e estados de autorização;
- pedido imediato e agendado;
- cronômetro de SLA;
- estados de comando;
- cancelamento dinâmico;
- item não mapeado;
- impressão Zelo versus externa;
- relatórios por canal;
- perguntas básicas do Zelinho.

### Resiliência

- queda depois do commit e antes do processamento;
- queda durante chamada ao iFood;
- resultado de impressão incerto;
- fila acumulada;
- fail-closed e recuperação;
- webhook inválido ou grande demais;
- token revogado;
- merchant desconectado.

### Validação externa

- sandbox;
- shadow mode;
- sessão de homologação;
- uma loja piloto real;
- soak antes da liberação geral.

## 10. Gates de produção

O MVP não abre para todos até que:

- homologação Order/Events aplicável esteja aprovada;
- replay não duplique pedido, estoque, impressão, venda ou estorno;
- latência e alertas cumpram as metas;
- fail-closed seja comprovado;
- polling recupere perda de webhook;
- relatórios e Zelinho concordem para o mesmo período e fuso;
- impressão tenha um único responsável;
- RLS/autorização cruzada sejam verificadas;
- PII não apareça em logs, snapshots ou prompts;
- suporte possua painel, runbook, kill switch e replay seguro;
- o piloto tenha concluído o soak sem divergência financeira ou operacional crítica.

## 11. Fora do MVP

- sincronização de cardápio, preço, pausa ou inventário com o iFood;
- módulo Financial, comissões, ajustes e repasses;
- receita líquida conciliada;
- criação automática de Pessoas;
- aceite automático;
- movimentação do caixa físico;
- mapa em tempo real do entregador;
- Review;
- Shipping para pedidos externos;
- negociação pós-entrega completa;
- backfill histórico;
- logotipo oficial sem autorização;
- perguntas avançadas ou assistente específico do iFood.

## 12. Dependências e estimativa

Dependências externas:

- conta profissional/CNPJ e app de teste;
- merchant de teste;
- homologação;
- confirmação do fluxo self-service real;
- confirmação do intervalo de polling de reconciliação;
- autorização de marca, se desejada.

Dependência interna separada:

- alerta sonoro genérico do ZeloPDV, necessário antes do rollout operacional.

Estimativa de engenharia para uma pessoa experiente: **7–11 semanas**, sem incluir espera de aprovação/homologação do iFood.

## 13. Critério de conclusão do MVP

O MVP está concluído quando um cliente elegível consegue conectar sua loja, receber e operar novos pedidos iFood no ZeloPDV, imprimir por exatamente um sistema, materializar uma venda bruta fora do caixa no estado concluído, consultar essa venda nos relatórios e obter do Zelinho insights gerais que reconheçam o canal — com replay seguro, isolamento por empresa e contingência operacional comprovada.
