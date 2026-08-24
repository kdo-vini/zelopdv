# Zelo SmartPOS — plano estratégico para maquininhas e pagamentos presenciais

> **Status:** plano futuro; não representa funcionalidade disponível nem compromisso comercial.
>
> **Última revisão:** 20 de agosto de 2026.
>
> **Regra de atualização:** SDKs, modelos de terminal, exigências de homologação, preços e condições comerciais mudam sem aviso. Revalidar tudo com a adquirente antes de iniciar cada integração.

## Resumo executivo

É tecnicamente possível levar o ZeloPDV às principais maquininhas SmartPOS do Brasil, inclusive permitindo que o garçom abra uma mesa, lance itens, divida a conta, cobre e feche a comanda no próprio terminal. Não existe, porém, um APK universal instalável em qualquer maquininha. Cada ecossistema controla seus terminais, SDK, permissões, loja, homologação, distribuição e versão do Android.

A arquitetura correta para uma oferta multimarca seria uma plataforma **Zelo SmartPOS** composta por:

1. um domínio de pagamentos no backend do Zelo, independente de adquirente;
2. conectores remotos para enviar cobranças a terminais vinculados;
3. um núcleo Android compartilhado para a experiência de Mesas/Pedidos;
4. um aplicativo e um adaptador separados por adquirente;
5. webhooks, reconciliação, auditoria e uma máquina de estados que trate resultado incerto como `UNKNOWN`, nunca como falha presumida;
6. o backend atual como fonte oficial de mesas, comandas, vendas, estoque, caixa, usuários e permissões.

O veredito para o estágio atual do Zelo é direto:

> **Como solo founder, não vale perseguir SmartPOS nativo multimarca agora. Vale construir primeiro a integração 80/20: “Cobrar na maquininha” com uma única adquirente, sem redigitar o valor, e validar uso e disposição a pagar em clientes reais.**

O primeiro piloto sugerido é uma integração remota, preferencialmente Mercado Pago Point via Orders API pela abertura da documentação atual, ou Stone Connect/Cielo Remota se a base real de clientes estiver concentrada nelas. A escolha final deve ser feita pela quantidade de clientes dispostos a pilotar, e não por preferência técnica abstrata.

O SmartPOS nativo deve ser reavaliado somente após prova comercial: demanda repetida, base concentrada numa adquirente, acesso formal ao programa de parceiros, terminal de desenvolvimento, processo de homologação conhecido e receita incremental capaz de pagar desenvolvimento e manutenção.

---

## 1. Veredito de viabilidade para solo founder

### O que parece simples, mas não é

Empacotar uma aplicação web para Android não resolve o problema principal. A tela é apenas uma parte. A complexidade real está em:

- credenciamento e contrato de parceria;
- SDK proprietário e diferenças por modelo de terminal;
- homologação de cada versão;
- callbacks, webhooks e consultas de reconciliação;
- pagamento aprovado quando o aplicativo perdeu conexão;
- duplicidade por toque repetido, retry ou webhook reenviado;
- cancelamento, estorno, reembolso parcial e chargeback;
- impressão, Pix, voucher, gorjeta e parcelamento com capacidades diferentes;
- Android antigo/AOSP, sem Google Play Services;
- restrições de WebView, permissões e bibliotecas concorrentes;
- suporte ao hardware que está fisicamente no restaurante;
- manutenção contínua por adquirente, SDK, firmware e terminal.

### Veredito agora

Considerando o contexto registrado na conversa de origem — cerca de cinco clientes e aproximadamente R$ 500 de MRR — desenvolver quatro ou cinco variantes nativas seria investimento desproporcional. O gargalo mais provável hoje é distribuição, retenção e expansão de ARPU, não a ausência de uma plataforma SmartPOS multimarca.

Isso não torna a ideia ruim. Significa que ela está algumas etapas à frente do estágio da empresa.

### O que vale agora

Uma versão de menor risco entrega grande parte do valor percebido:

```text
Mesa no Zelo
  → Cobrar
  → selecionar terminal
  → valor aparece na maquininha
  → cliente paga
  → Zelo confirma no servidor
  → pagamento parcial é registrado
  → mesa fecha quando o saldo chega a zero
```

Essa experiência elimina redigitação e divergência de caixa sem exigir que todo o módulo Mesas rode no terminal. Para o cliente, pode entregar 70–80% do benefício percebido do projeto original com uma fração do risco.

---

## 2. Os quatro modelos possíveis

| Modelo | Como funciona | Melhor uso | Limitação principal | Complexidade |
|---|---|---|---|---:|
| **SmartPOS nativo** | O Zelo roda na maquininha Android e chama o SDK local | Atendimento completo na mesa | Um app/homologação por ecossistema | Alta |
| **Pagamento remoto** | O backend envia a cobrança a um terminal vinculado | Eliminar redigitação mantendo o Zelo no tablet/PC | Ainda exige outro dispositivo para operar a mesa | Média |
| **Deeplink / Tap to Pay** | O Zelo abre o app do provedor no celular e recebe retorno | Piloto móvel e fallback de baixo custo | Handoff entre apps; não é app dentro da maquininha | Baixa |
| **TEF / POS TEF** | Uma camada especializada conecta PDV, terminais e várias adquirentes | Redes, varejo maior e neutralidade de adquirente | Contrato, topologia e homologação mais pesados | Muito alta |

### 2.1 SmartPOS nativo

O garçom opera tudo no terminal: autenticação, mesas, catálogo, itens, cozinha, divisão, pagamento e recibo. A experiência é a melhor, mas o produto deixa de ser apenas web/PWA e passa a ter uma frente Android industrial.

Não se deve criar um APK com todos os SDKs. Mercado Pago e Getnet, por exemplo, documentam restrições a permissões/bibliotecas de concorrentes; SDKs também podem conflitar entre si. A unidade de distribuição deve ser um APK por adquirente, com núcleo compartilhado.

### 2.2 Pagamento remoto

O Zelo permanece no navegador. O backend cria uma ordem para um terminal cadastrado, acompanha o resultado por webhook/consulta e registra o pagamento somente depois de confirmação autoritativa. Mercado Pago Point Orders, Stone Connect 2.0, Cielo Smart remota e SumUp Cloud API demonstram publicamente esse modelo.

É a melhor primeira aposta porque valida o domínio mais perigoso — estados financeiros distribuídos — antes do custo de UI Android e homologação de loja.

### 2.3 Deeplink e Tap to Pay

O app do Zelo inicia um handoff com valor, referência e URL de retorno. InfinitePay documenta o InfiniteTap por deeplink; Cielo, Getnet e SumUp também possuem modalidades de deeplink/handoff em partes de seus ecossistemas. O callback melhora a experiência, mas não deve ser a única prova de pagamento: sempre que possível, o servidor precisa consultar ou receber confirmação do provedor.

### 2.4 TEF

TEF é a alternativa mais próxima de neutralidade entre adquirentes, mas não significa instalar o Zelo em qualquer terminal que o cliente já tenha. Normalmente envolve integradora, licenciamento, terminal/pinpad compatível, ativação, rede, configuração e certificação. Auttar e SiTef publicam soluções para POS Android, SmartPOS e pinpad, com ampla matriz de instituições e hardwares.

TEF deve ficar para redes, múltiplas lojas e clientes que valorizem troca de adquirente sem trocar o PDV. Não é o MVP de uma empresa pequena.

---

## 3. Panorama por adquirente/ecossistema

> A classificação abaixo mede acessibilidade técnica e adequação ao Zelo, não participação de mercado.

| Ecossistema | Rotas relevantes | Situação pública observada | Recomendação |
|---|---|---|---|
| **Cielo** | App nativo, deeplink e integração remota; loja pública/privada | A Cielo Smart é plataforma Android aberta a parceiros, com Store, sandbox/certificação e modelos públicos/privados | Melhor candidata inicial para app nativo, condicionada a parceiro + terminal |
| **Stone** | SDK Android POS e Connect 2.0 remoto | SDK por modelo; artefatos dependem de credenciamento. Connect liga software de gestão ao POS via API | Alta prioridade; abrir parceria em paralelo, mas não começar sem matriz de terminais e SDK confirmada |
| **Mercado Pago** | Point Orders API e SmartApps | Orders oferece terminal remoto, idempotência, consulta, cancelamento, reembolso e notificações. SmartApps exige contato comercial, terminal debug, sandbox e homologação | Melhor candidata padrão para primeiro conector remoto; nativo depois |
| **PagBank** | SmartPOS/PlugPagService e PlugPag | Java/Kotlin recomendado; transação, estorno, impressão e eventos. PlugPag também integra automação e terminal | Segunda onda, sobretudo se a base usar Moderninha Smart |
| **Getnet** | Get Smart/Getstore, SDK/deeplink e TEF | Portal, certificação, pilotos, cobrança e repasse de licença; suporta vários Android e proíbe WebView/Google Play/concorrentes | Forte oportunidade nativa/comercial, mas exige disciplina de compatibilidade |
| **Rede** | Parceiros, TEF e ecossistema Laranjinha Smart | Portal público é mais concentrado em TEF; há evidência pública de store/apps, mas menos detalhe técnico aberto para terceiros | Conversa comercial cedo; engenharia só após documentação e terminal |
| **InfinitePay** | InfiniteTap e Checkout | Integrações públicas atuais são Tap por deeplink e checkout. Não há programa público equivalente de app embarcado encontrado | Usar como deeplink/Tap; não prometer app na maquininha |
| **SumUp** | Cloud API, SDK Android/iOS, Tap to Pay e handoff | Cloud API inicia pagamento em leitor Solo a partir de qualquer plataforma; disponibilidade varia por mercado/modelo | Boa alternativa remota/móvel; confirmar operação e condições no Brasil antes do piloto |
| **Ton** | T3 Smart Android e TapTon | Terminal Android é público, mas não foi encontrado programa aberto de publicação de app terceiro | Tratar como negociação privada, apesar da relação societária com Stone |
| **SafraPay** | SafraPay Smart/Store | Store pública com apps para gestão, mesas e restaurantes; portal técnico SmartPOS existe, mas acesso/detalhe exige validação | Expansão de segunda/terceira onda orientada por clientes |
| **Sicredi** | SmartPOS, portal de desenvolvedores e apps homologados | Ecossistema de parceiros existe, com SmartPOS e aplicativos homologados | Expansão regional após demanda comprovada |
| **Sipag/Sicoob** | SmartPOS e automações integradas | SmartPOS e integrações de gestão são divulgadas; caminho técnico público para publicar app é menos claro | Prospecção comercial regional; não estimar antes de receber kit |

### Observações importantes por provedor

#### Cielo

- A documentação atual descreve Cielo Smart como plataforma Android com aplicações públicas/privadas, certificação, sandbox, integração remota e deep link.
- A própria Cielo Store confirma apps instalados no terminal e integração local/remota.
- O portal migrou em junho de 2026; referências antigas a LIO devem ser reconfirmadas no novo portal.
- Mesmo havendo caminhos híbridos por deep link, o núcleo operacional deve ser nativo para previsibilidade em terminais limitados.

Fontes: [Cielo Store](https://www.cielo.com.br/cielo-store/), [manual Cielo Smart/LIO](https://developercielo.github.io/manual/cielo-lio), [portal Cielo Smart](https://docs.cielo.com.br/cielo-smart/docs/conheca-a-cielo-smart).

#### Stone

- O SDK Android possui módulo específico de POS e bibliotecas por modelo de fabricante.
- O acesso ao repositório privado de artefatos depende de credenciamento.
- O Connect 2.0 cria ordens via integração de software de gestão e recebe o resultado do POS.
- Confirmar por escrito versões, Pix, cancelamento, impressão e modelos; changelogs recentes mostram alterações de toolchain e terminais.

Fontes: [DevCenter Stone](https://www.stone.com.br/devcenter), [SDK Android — getting started](https://sdkandroid.stone.com.br/reference/preparando-aplicacao), [Connect 2.0](https://ajuda.stone.com.br/connect-20/connect-20), [changelog do SDK](https://sdkandroid.stone.com.br/reference/changelog).

#### Mercado Pago

- A Orders API é adequada ao piloto remoto e exige `X-Idempotency-Key` na criação.
- O backend consegue consultar, cancelar e reembolsar uma order e vincular o terminal ao caixa.
- SmartApps possui Main Apps e Mini Apps com tecnologias e distribuição diferentes. A documentação atual exige contato formal com negócios, terminal debug, sandbox, envio de APK e aprovação.
- Point usa AOSP, com modelos em APIs Android distintas. Restrições proíbem WebView e namespaces/permissões de terceiros em determinados cenários; não misturar SDKs.

Fontes: [Point — visão geral](https://www.mercadopago.com.br/developers/pt/docs/mp-point/overview), [Orders API](https://www.mercadopago.com.br/developers/pt/reference/in-person-payments/point/overview), [criar order/idempotência](https://www.mercadopago.com.br/developers/pt/reference/in-person-payments/point/orders/create-order/post), [SmartApps](https://www.mercadopago.com.br/developers/pt/docs/smartapps/overview), [restrições](https://www.mercadopago.com.br/developers/pt/docs/smartapps/restrictions), [publicação](https://www.mercadopago.com.br/developers/pt/docs/smartapps/deployment).

#### PagBank

- PlugPagService expõe transação, eventos, cancelamento/estorno e impressão em Moderninha Smart.
- A documentação recomenda Java/Kotlin nativo para compatibilidade e desempenho.
- PlugPag também oferece comunicação da automação com terminais compatíveis; modelo e disponibilidade devem ser validados.

Fontes: [SmartPOS — desenvolvimento](https://developer.pagbank.com.br/docs/desenvolvimento-smartpos), [PlugPag](https://developer.pagbank.com.br/docs/plugpag), [referência PlugPagService](https://developer.pagbank.com.br/v1/reference/smart-pos-providers-classes).

#### Getnet

- A Getstore certifica, distribui e pode cobrar a licença nos recebíveis com repasse ao parceiro.
- A documentação exige funcionamento em todos os modelos suportados e Android 7.1, 10, 11 e 13; veda WebView e Google Play Services.
- Novas versões passam por certificação, e o piloto precede publicação definitiva.
- A própria documentação contempla integradoras TEF como Auttar, Software Express e PayGO.

Fontes: [programa POS Digital](https://site.getnet.com.br/parcerias/pos-digital/), [requisitos](https://getstore.getnet.com.br/docs/iniciando-integracao/requisitos-desenvolvimento/), [submissão/certificação](https://getstore.getnet.com.br/docs/iniciando-integracao/submetendo-app/), [Getstore](https://site.getnet.com.br/getstore/).

#### Rede, InfinitePay, SumUp, Ton, SafraPay, Sicredi e Sipag

- Rede: [Portal do Desenvolvedor](https://developer.userede.com.br/) e [sistema da Laranjinha Smart](https://www.itau.com.br/empresas/pagamentos-recebimentos/maquininha-cartao/sistema-operacional).
- InfinitePay: [integrações para desenvolvedores](https://www.infinitepay.io/desenvolvedores) e [InfiniteTap por deeplink](https://www.infinitepay.io/checkout-tap).
- SumUp: [pagamentos presenciais](https://developer.sumup.com/terminal-payments), [Cloud API](https://developer.sumup.com/terminal-payments/cloud-api) e [SDKs](https://developer.sumup.com/terminal-payments/sdks/). Disponibilidade varia por país e hardware.
- Ton: [T3 Smart](https://www.ton.com.br/maquininha/t3-smart). Android no terminal não implica SDK/loja aberta.
- SafraPay: [SafraPay Store](https://www.safrapay.com.br/safrapay-store.html) e [portal SmartPOS](https://developers.safrapay.com.br/smartpos?section=smartpos).
- Sicredi: [portal para desenvolvedores](https://developer.sicredi.com.br/api-portal/en/node/1). O acesso específico ao SmartPOS precisa ser negociado.
- Sipag/Sicoob: [SmartPOS e integrações](https://www.sicoob.com.br/web/sicoob/sipag).

---

## 4. Ordem de prioridade recomendada

| Onda | Prioridade | Objetivo |
|---|---|---|
| **0** | Pesquisa da base + credenciamento | Descobrir adquirente/modelo dos clientes e obter documentação/terminal |
| **1** | Mercado Pago remoto **ou** adquirente dominante nos pilotos | Entregar “Cobrar na maquininha” sem app embarcado |
| **1 paralela** | Cielo e Stone comercial | Abrir programa de parceiros e remover incertezas de acesso |
| **2** | Cielo nativo | Primeiro SmartPOS completo, se houver prova comercial |
| **2** | Stone, PagBank ou Getnet | Segundo provedor, escolhido pela demanda real |
| **3** | Rede, SafraPay, Sicredi e Sipag | Expansão regional/comercial |
| **3** | InfinitePay, SumUp e Ton | Deeplink, remoto ou parceria privada conforme disponibilidade |
| **4** | Auttar/SiTef/TEF | Oferta para operações maiores e multiadquirente |

Antes de fixar fornecedor, registrar para cada cliente/prospecto:

- adquirente e modelo exato;
- quantidade de terminais e lojas;
- uso atual de Mesas;
- volume e ticket de transações;
- necessidade de Pix, voucher, parcelamento, gorjeta e impressão;
- disponibilidade para trocar de adquirente;
- disposição a participar do piloto e pagar pelo recurso;
- requisitos fiscais por UF/município.

Dez restaurantes prontos para pilotar uma adquirente valem mais que a melhor documentação sem usuários.

---

## 5. O que o ZeloPDV já possui hoje

Esta seção foi conferida no repositório em 20 de agosto de 2026.

### Base reaproveitável

- Aplicação web/PWA em SvelteKit 2 + Svelte 5, com backend Supabase.
- Módulo Mesas com mapa, comanda, itens, impressão de pré-conta/recibo, transferência, pagamentos parciais por valor ou quantidade de item e fechamento em venda real.
- Tabelas `comanda_pagamentos` e `comanda_pagamento_itens`, preservando atribuição de itens a pagamentos parciais.
- Tabelas `vendas`, `vendas_itens` e `vendas_pagamentos`; uma venda pode ter múltiplas formas.
- `vendas_pagamentos.id_comanda_pagamento` e vínculos com itens para trilha de mesa → pagamento → venda.
- `vendas.client_sale_id` e índice único por usuário para replay idempotente.
- RPC `criar_venda_completa`, usada pelo PDV online e replay offline, centralizando venda, itens, pagamentos, estoque, fiado e taxas.
- IndexedDB/Dexie com catálogo e fila `vendas_pendentes`; retry periódico e sincronização ao voltar a rede.
- RBAC/capabilities para `pdv.vender`, `pdv.receber`, `mesas.acessar`, `mesas.fechar` e demais operações sensíveis.
- Backend já é a fonte da verdade para catálogo, estoque, vendas, caixa, usuários, pedidos e mesas.

Referências internas: `docs/modules/MESAS.md`, `docs/operations/OFFLINE.md`, `src/routes/app/+page.svelte`, `src/routes/app/mesas/[id]/+page.svelte`, `src/lib/offlineDb.js` e schema/migrations Supabase.

### Limites atuais relevantes

- Mesas não funciona offline hoje.
- O fechamento de mesa ainda executa uma sequência de gravações no cliente; a confirmação de um pagamento externo deve migrar para uma operação server-side atômica e idempotente.
- `forma_pagamento = cartao_credito/cartao_debito` registra uma declaração operacional, não uma transação confirmada por adquirente.
- Não há cadastro de terminais, credenciais OAuth de estabelecimentos, IDs de ordem externa, NSU/autorização, webhook inbox, reconciliação, reembolso ou chargeback.
- Não há máquina de estados financeira com `UNKNOWN`.
- Não há projeto Android nativo nem pipeline de builds/homologação por adquirente.

---

## 6. Arquitetura-alvo

```text
┌───────────────────────────────────────────────────────────────┐
│                         Backend Zelo                          │
│                                                               │
│ Mesas ─ Pedidos ─ Cozinha ─ Vendas ─ Caixa ─ Estoque ─ RBAC │
│                            │                                  │
│                  Payment Orchestrator                         │
│                            │                                  │
│ Terminal Registry ─ Intents ─ Events ─ Reconciliation        │
│                            │                                  │
│      ┌────────────┬──────────────┬────────────┬─────────┐     │
│      │ MP Orders  │ Stone Connect│ Cielo Remote│ SumUp  │     │
│      └────────────┴──────────────┴────────────┴─────────┘     │
└────────────────────────────┬──────────────────────────────────┘
                             │ API autenticada e versionada
┌────────────────────────────┴──────────────────────────────────┐
│                    Zelo SmartPOS Android                      │
│ Núcleo: login/PIN, mesas, pedidos, sync, auditoria, UI        │
│                                                               │
│ app-cielo  app-stone  app-mercadopago  app-pagbank  app-getnet│
│     │          │             │              │          │      │
│ provider-* isolado com apenas o SDK daquela adquirente       │
└───────────────────────────────────────────────────────────────┘
```

### Princípios

1. **Backend é a fonte da verdade.** O terminal guarda cache operacional, não uma segunda base independente.
2. **Pagamento é domínio próprio.** Não sobrecarregar `vendas.forma_pagamento` com status e IDs externos.
3. **Confirmação vem do servidor.** Callback do Android melhora UX, mas webhook/consulta do provedor é a autoridade final sempre que disponível.
4. **Um SDK por APK.** Evita conflito, reprovação e dependência cruzada.
5. **Estado incerto é explícito.** Timeout não autoriza nova cobrança automática.
6. **Entrega incremental.** O mesmo Payment Orchestrator serve primeiro ao remoto e depois aos apps nativos.

### Estrutura Android conceitual

```text
zelo-smartpos-android/
├── app-cielo/
├── app-stone/
├── app-mercadopago/
├── app-pagbank/
├── app-getnet/
├── core-domain/
├── core-ui/
├── core-network/
├── core-storage/
├── core-sync/
├── core-device-auth/
├── payment-contracts/
├── payment-testkit/
└── provider-*/
```

Recomendação: Kotlin, Coroutines/Flow, armazenamento local Room/SQLCipher quando justificável, Android Keystore para segredos de dispositivo e UI compatível com a menor API exigida pelo provedor. Jetpack Compose só deve ser adotado após prova nos terminais mais antigos; Views tradicionais continuam uma opção válida se reduzirem risco.

---

## 7. Escopo do aplicativo na maquininha

O SmartPOS deve ser um companheiro operacional de restaurante, não o painel administrativo inteiro.

### MVP embarcado

- pareamento do terminal por QR/código temporário;
- loja, terminal e operador identificados;
- PIN e troca rápida de funcionário;
- mapa/lista simplificada de mesas;
- abrir mesa e visualizar comanda;
- catálogo, categorias, busca, adicionais e observação;
- enviar itens à cozinha;
- subtotal, couvert, taxa de serviço e desconto autorizado;
- dividir por valor, pessoa ou item;
- pagamentos parciais e múltiplos meios;
- crédito, débito, Pix e parcelamento quando a capability permitir;
- pagamento, impressão e fechamento;
- cancelamento/estorno somente com permissão;
- fila de sincronização e diagnóstico simples.

### Fora do MVP

- gestão completa de produtos/estoque;
- relatórios avançados;
- billing/assinatura;
- configurações amplas da empresa;
- marketing, ZeloMenu e admin;
- emissão fiscal multi-estado/multi-município dentro do primeiro app;
- operação de pagamento offline inventada pelo Zelo;
- suporte simultâneo a vários SDKs no mesmo APK.

---

## 8. `PaymentAdapter` e modelo de capabilities

O domínio não deve espalhar `if (provider === ...)`. Cada conector implementa o mesmo contrato e declara o que realmente suporta.

```ts
type PaymentProvider =
  | 'mercado_pago'
  | 'stone'
  | 'cielo'
  | 'pagbank'
  | 'getnet'
  | 'rede'
  | 'sumup'
  | 'infinitepay'
  | 'tef';

interface PaymentAdapter {
  capabilities(context: MerchantContext): Promise<PaymentCapabilities>;
  listTerminals(context: MerchantContext): Promise<ProviderTerminal[]>;
  createPayment(input: CreatePaymentInput): Promise<ProviderPaymentResult>;
  getPayment(input: GetPaymentInput): Promise<ProviderPaymentResult>;
  cancelPayment(input: CancelPaymentInput): Promise<ProviderPaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<ProviderPaymentResult>;
  parseWebhook(request: SignedWebhookRequest): Promise<ProviderEvent>;
}
```

```ts
interface PaymentCapabilities {
  mode: Array<'remote' | 'native' | 'deeplink' | 'tef'>;
  methods: Array<'credit' | 'debit' | 'pix' | 'voucher'>;
  installments: { supported: boolean; max?: number };
  tips: boolean;
  partialRefund: boolean;
  cancelBeforeCapture: boolean;
  printMerchantReceipt: boolean;
  printCustomerReceipt: boolean;
  webhooks: boolean;
  statusQuery: boolean;
  providerIdempotency: boolean;
  offlineAcquiring: boolean;
  requiresTerminalOnline: boolean;
}
```

Capabilities devem ser calculadas por provedor, contrato, país, modelo, firmware e versão do SDK. Não assumir que “Stone suporta Pix” significa que todo terminal/SDK/conta do cliente suporta Pix.

---

## 9. Máquina de estados de pagamento

Estados canônicos sugeridos:

```text
CREATED
  → DISPATCHING
  → WAITING_TERMINAL
  → WAITING_CUSTOMER
  → PROCESSING
      ├─→ APPROVED
      ├─→ DECLINED
      ├─→ CANCELLED
      ├─→ EXPIRED
      ├─→ FAILED
      └─→ UNKNOWN ──reconciliação──┬─→ APPROVED
                                  ├─→ DECLINED
                                  ├─→ CANCELLED
                                  └─→ FAILED

APPROVED → PARTIALLY_REFUNDED → REFUNDED
APPROVED → REVERSED
```

### Regra mais importante: `UNKNOWN`

`UNKNOWN` significa que o Zelo perdeu a certeza, não que o cartão falhou. Exemplos:

- timeout após o cliente digitar a senha;
- terminal aprovou, mas o callback não voltou;
- webhook atrasou;
- app fechou durante `PROCESSING`;
- provedor respondeu 5xx depois de receber a ordem.

Enquanto estiver `UNKNOWN`:

- não registrar novo pagamento automaticamente;
- não liberar a mesma reserva de saldo sem investigação;
- bloquear ou alertar nova cobrança idêntica na mesma mesa/terminal;
- consultar o provedor com backoff;
- permitir resolução manual auditada apenas após consulta de comprovante/NSU;
- manter a mesa aberta até aprovação confirmada, mas mostrar “verificando pagamento”, não “falhou”.

`DECLINED`, `CANCELLED`, `EXPIRED` e `FAILED` só são terminais quando o provedor fornece evidência suficiente.

---

## 10. Modelo de dados sugerido

### `payment_provider_accounts`

Vincula uma empresa Zelo à conta do provedor.

- `id`, `owner_user_id`, `provider`;
- `provider_merchant_id`, `status`;
- credenciais/tokens cifrados ou referência a cofre;
- `capabilities_snapshot`, `connected_at`, `last_verified_at`;
- unique por empresa + provedor + merchant externo.

### `payment_terminals`

- `id`, `owner_user_id`, `provider_account_id`;
- `provider_terminal_id`, `serial_number_masked`, `model`;
- `store_id`, `pos_id`, `display_name`;
- `mode`, `status`, `last_seen_at`, `capabilities`;
- unique por conta do provedor + ID externo.

### `payment_intents`

- `id` UUID interno e `idempotency_key` criado pelo Zelo;
- `owner_user_id`, `operator_user_id`, `terminal_id`, `provider`;
- origem: `sale`, `comanda`, `comanda_partial`, `order`;
- `origin_id`, `amount_cents`, `currency`;
- método/parcelas solicitados;
- `status`, `status_reason`, `provider_order_id`, `provider_payment_id`;
- `provider_status`, `provider_payload_redacted`;
- `expires_at`, `approved_at`, `resolved_at`;
- versão para optimistic locking e timestamps.

Unique recomendado: `(owner_user_id, idempotency_key)`.

### `payment_attempts`

Uma intent pode exigir mais de uma tentativa deliberada, mas nunca por retry cego.

- `payment_intent_id`, `attempt_number`;
- chave de idempotência externa;
- request/response redigidos e hash;
- estado, timestamps, latência e erro normalizado.

### `payment_events`

Ledger append-only de transições.

- `payment_intent_id`, `source` (`api`, `webhook`, `poll`, `terminal`, `manual`);
- `provider_event_id`, `event_type`, `from_status`, `to_status`;
- payload redigido/hash, `occurred_at`, `received_at`;
- unique por provedor + evento externo quando existir.

### `payment_refunds`

- `payment_intent_id`, `amount_cents`, `reason`;
- chave idempotente, IDs externos, status e operador autorizador.

### Integração com venda/comanda

Adicionar `payment_intent_id` em `vendas_pagamentos` ou uma tabela de vínculo 1:N. Para Mesas, uma aprovação deve chamar uma RPC server-side que, numa transação:

1. bloqueia intent e comanda;
2. confirma que o evento ainda não foi aplicado;
3. registra `comanda_pagamentos` ou pagamento final;
4. vincula `payment_intent_id`;
5. recalcula saldo considerando pagamentos aprovados e reservas ativas;
6. fecha a mesa e cria a venda apenas se o saldo chegar a zero;
7. grava auditoria;
8. marca o evento como aplicado.

Isso evita dupla aplicação por callback + webhook e duas maquininhas cobrando o mesmo saldo.

---

## 11. Idempotência, webhooks e reconciliação

### Idempotência em camadas

1. **Ação do usuário:** um UUID por clique lógico; o botão não gera nova chave ao repetir a mesma ação.
2. **Banco Zelo:** unique por tenant + `idempotency_key`.
3. **Provedor:** enviar a mesma chave no header/campo suportado.
4. **Webhook:** inbox unique por `provider_event_id`; se não houver ID, usar hash canônico com cautela.
5. **Aplicação financeira:** RPC de confirmação registra uma única vez em `vendas_pagamentos`/comanda.

### Pipeline de webhook

- endpoint dedicado por provedor;
- validar assinatura, timestamp e origem conforme documentação;
- persistir evento rapidamente e responder 2xx;
- processar de forma idempotente fora da resposta quando possível;
- aceitar eventos repetidos e fora de ordem;
- consultar o provedor se o evento reduzir certeza ou contradizer estado final;
- nunca guardar PAN, CVV, trilha ou PIN;
- logar IDs e status, não segredos/payload integral sensível.

### Reconciliação

Webhooks não bastam. Manter jobs para:

- intents não terminais acima do prazo;
- `UNKNOWN` com backoff e alerta;
- aprovados sem `vendas_pagamentos` vinculado;
- pagamento registrado sem aprovação externa;
- reembolsos pendentes;
- divergência diária por terminal/provedor;
- chargeback/contestação quando API disponibilizar.

O operador deve ter uma tela simples: “pagamentos a verificar”, com consulta, comprovante, tentativa, mesa/venda e ação auditada.

---

## 12. Offline e sincronização

O Zelo já possui contingência offline para venda comum, mas isso não pode ser copiado ingenuamente para cartão.

### Regras

- Pagamento remoto exige terminal e provedor online.
- Pagamento nativo só pode operar offline se o SDK, contrato e adquirente oferecerem explicitamente store-and-forward; o Zelo não deve simular aprovação.
- Se a rede cair antes do envio confirmado, a intent pode permanecer `CREATED` e ser retomada com a mesma chave.
- Se cair depois do envio, usar `UNKNOWN` e reconciliar; não enfileirar uma nova cobrança.
- Catálogo/mesa podem ter cache local, mas pagamentos aprovados exigem resolução no backend antes de fechamento definitivo.
- A fila atual `vendas_pendentes` não deve carregar uma venda de cartão como se dinheiro tivesse sido confirmado.

### Estratégia nativa futura

- cache de mesas abertas, catálogo e permissões com versionamento;
- outbox local para ações operacionais idempotentes;
- sync incremental e conflitos resolvidos no servidor;
- pagamentos em fila separada de pedidos/vendas;
- bloqueio visual forte para `UNKNOWN`;
- relógio do servidor/provedor como referência, não apenas o do terminal.

---

## 13. Segurança, LGPD e PCI

### PCI e dados de cartão

O Zelo deve delegar captura de cartão e PIN ao SDK/app/terminal homologado e jamais receber ou persistir:

- PAN completo;
- CVV/CVC;
- trilha magnética/chip;
- PIN ou PIN block;
- imagem de cartão.

Guardar somente os identificadores e metadados permitidos: provider payment ID, NSU/autorização quando contratualmente permitido, bandeira, parcelas, últimos dígitos mascarados, valor, status e timestamps.

Usar SDK/P2PE pode reduzir escopo, mas não autoriza declarar o Zelo “fora de PCI” automaticamente. A elegibilidade do SAQ e responsabilidades devem ser confirmadas com adquirente e, se necessário, assessor/QSA. Fontes: [PCI DSS SAQ P2PE](https://www.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-P2PE.pdf), [visão P2PE do PCI SSC](https://www.pcisecuritystandards.org/standards/point-to-point-encryption-p2pe/).

### Controles mínimos

- OAuth/credenciais multi-tenant somente no servidor;
- criptografia de tokens em repouso e rotação/revogação;
- tokens curtos para terminal, vinculados a empresa/dispositivo;
- Android Keystore para segredo local;
- certificate pinning apenas se suportável operacionalmente, com plano de rotação;
- TLS, sem cleartext;
- least privilege e RLS/RBAC server-side;
- autorização adicional para estorno, cancelamento, desconto e resolução manual;
- logs redigidos e trilha append-only;
- SAST, SCA, análise de APK e teste de penetração proporcional ao risco;
- plano de incidente e revogação remota de terminal.

### LGPD

Definir Zelo, restaurante e adquirente como controlador/operador conforme o fluxo real; minimizar dados; estabelecer retenção; contrato com subprocessadores; canal do titular; controle de acesso; resposta a incidentes. A ANPD mantém [guia de segurança para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte) e [materiais orientativos](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes).

---

## 14. Fiscal

Pagamento e documento fiscal são domínios diferentes:

- comprovante da adquirente não é NFC-e/NFS-e;
- aprovação do cartão não implica autorização fiscal;
- estorno do pagamento não cancela automaticamente a nota;
- cancelamento fiscal possui prazos e regras próprias;
- contingência fiscal não é igual a contingência de pagamento;
- regras variam por UF, município, regime e natureza da operação.

Para o MVP remoto, manter a emissão fiscal no fluxo atual e apenas vincular pagamento confirmado à venda. Uma integração fiscal no SmartPOS deve ser projeto separado, com sequência explícita para aprovação, emissão, falha fiscal, cancelamento e reembolso.

O MOC nacional define NF-e/NFC-e e suas regras; em 2026 também existem mudanças de leiaute relacionadas a CBS/IBS. Revalidar na implementação: [Portal NF-e — manuais](https://www.nfe.fazenda.gov.br/PORTAl/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=ndIjl+iEFdE%3D), [orientações da Reforma Tributária para 2026](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026), [documentação técnica NFS-e](https://www.gov.br/nfse/pt-br/nfs-e-via/documentacao-tecnica/documentacao-tecnica).

Este plano não substitui validação contábil/fiscal por localidade.

---

## 15. Gaps a fechar

| Gap | Prioridade | Motivo |
|---|---:|---|
| Domínio `payment_intents/events/terminals` | P0 | Separar confirmação externa de forma declarada |
| RPC atômica de aplicar aprovação à Mesa | P0 | Evitar dupla cobrança/aplicação parcial |
| Estado `UNKNOWN` + reconciliação | P0 | Timeout financeiro não é falha |
| OAuth/cofre de credenciais por empresa | P0 | Integração SaaS multi-tenant segura |
| Webhook inbox e dedupe | P0 | Provedores reenviam e reordenam eventos |
| Tela de vincular terminal | P0 | Escolha correta do destino da cobrança |
| Auditoria e permissões de estorno | P0 | Operação financeira sensível |
| Observabilidade/runbook | P1 | Suporte em restaurante não pode depender de debug ad hoc |
| App Android e testkit | P2 | Necessários só após prova remota |
| Sync de Mesas offline | P3 | Projeto independente e arriscado |
| Fiscal embarcado | P3 | Escopo regulatório separado |

---

## 16. Roadmap por fases

### Fase 0 — prova comercial e acesso (1–3 semanas de trabalho; espera externa variável)

- entrevistar clientes/prospectos e mapear terminais;
- obter 3–5 design partners da mesma adquirente;
- pedir programa de parceiros, documentação, sandbox e terminal;
- validar custo, SLA, homologação, distribuição e suporte;
- escolher um provedor remoto;
- congelar critérios de go/no-go.

**Saída:** decisão informada, sem compromisso com Android.

### Fase 1 — fundação de pagamento remoto (4–8 semanas solo)

- migrations do domínio de pagamento;
- PaymentAdapter + testkit;
- primeiro adapter remoto;
- cadastro/vínculo de terminal;
- criação, consulta, cancelamento e webhook;
- `UNKNOWN`, reconciliação e painel de pendências;
- RPC idempotente para aplicar aprovação em pagamento parcial da mesa;
- métricas e logs.

**Escopo deliberadamente excluído:** app na maquininha, TEF, fiscal novo, offline de cartão, vários provedores.

### Fase 2 — piloto controlado (4–6 semanas de calendário)

- 3–5 restaurantes, 1–2 terminais por loja;
- valores reais e operação assistida;
- runbook e fallback para cobrança manual;
- correção de desconhecidos/duplicidades;
- medição de tempo, adoção, suporte e disposição a pagar.

**Saída:** manter, corrigir ou encerrar antes de Android.

### Fase 3 — núcleo Android e primeiro SmartPOS (3–6 meses solo, mais homologação)

- prova de terminal/API mínima;
- módulos Android compartilhados;
- login/pareamento/PIN;
- mesas, catálogo, itens, cozinha e pagamento;
- adapter nativo da adquirente escolhida;
- device lab, segurança, assinatura e homologação;
- piloto privado antes de loja pública.

### Fase 4 — segunda adquirente (2–4 meses por nova onda)

- conformance suite no novo adapter;
- novo APK/applicationId;
- matriz específica de terminais;
- homologação e operação separadas;
- só iniciar com clientes/receita identificados.

### Fase 5 — TEF/enterprise

- parceria Auttar/SiTef/PayGO;
- multi-loja, conciliação e SLAs;
- contrato, implantação e suporte enterprise;
- fiscal/ERP conforme projeto separado.

---

## 17. Testes e homologação

### Testes automatizados

- conformance suite que todo adapter deve passar;
- transições permitidas/proibidas da máquina de estados;
- idempotência concorrente;
- webhook repetido, inválido, atrasado e fora de ordem;
- callback + webhook simultâneos;
- aprovação seguida de timeout;
- cancelamento concorrendo com aprovação;
- refund total/parcial repetido;
- duas maquininhas cobrando a mesma mesa;
- fechamento de mesa com pagamentos parciais;
- RBAC de operador sem permissão;
- redaction de logs e payloads.

### Testes em sandbox

- aprovado, recusado, cancelado e expirado;
- terminal ocupado/offline/não vinculado;
- Pix expirado;
- parcelamento inválido;
- rate limit e 5xx;
- consulta após timeout;
- assinatura de webhook.

### Matriz em hardware real

Para cada modelo/firmware:

- chip, NFC, faixa quando aplicável;
- crédito, débito, Pix, voucher;
- uma e múltiplas parcelas;
- impressão e falta de papel;
- bateria baixa, 4G ruim, Wi-Fi trocando;
- app morto/reiniciado durante pagamento;
- atualização do SDK/firmware;
- reimpressão, cancelamento e estorno;
- resolução de tela, memória e tempo de cold start.

### Homologação

Manter por provedor:

- checklist oficial versionado;
- terminal debug e produção;
- contas/credenciais de teste;
- evidências e roteiro de telas;
- chave de assinatura e política de rotação;
- versionCode/versionName;
- contatos de certificação e escalonamento;
- prazo esperado e plano de rollback;
- changelog de SDK/firmware.

Homologação do provedor não substitui QA do produto; ela normalmente valida integração, segurança e requisitos mandatórios.

---

## 18. Manutenção operacional

Cada adquirente adiciona uma linha de produto permanente:

- acompanhar changelog e depreciações;
- atualizar SDK/toolchain sem quebrar Android antigo;
- recertificar versões;
- manter terminal de teste;
- reproduzir problemas por modelo/firmware;
- atender lojista e escalar ao provedor;
- renovar credenciais/certificados;
- monitorar webhooks e reconciliação;
- manter playbook de indisponibilidade;
- publicar e retirar versões por loja.

Reservar capacidade contínua de 20–35% do esforço inicial por ano, ou aproximadamente 0,25–0,75 FTE conforme quantidade de provedores e terminais. Não lançar integração sem dono operacional e rota de rollback.

---

## 19. Wins e losses

### Wins

- elimina redigitação de valor e divergência de caixa;
- acelera cobrança na mesa e giro de mesas;
- reduz treinamento e quantidade de dispositivos no nativo;
- aumenta diferenciação do módulo Mesas;
- cria add-on com ARPU e retenção potencialmente maiores;
- melhora conciliação e auditabilidade;
- abre canal de distribuição em stores de adquirentes;
- prepara base comum para Pix, Tap to Pay e TEF;
- aproxima o Zelo de restaurantes maiores.

### Losses e riscos

- grande custo de oportunidade para um solo founder;
- dependência de contratos, homologação e roadmap de terceiros;
- fragmentação por SDK, terminal e Android;
- suporte físico fora do controle do Zelo;
- risco financeiro de duplicidade ou status incorreto;
- escopo PCI/LGPD e segurança maior;
- lojas de apps podem pressionar preço e exigir comissão;
- adquirentes oferecem PDVs próprios, inclusive gratuitos;
- cliente pode não querer trocar de terminal;
- manutenção não termina após o primeiro lançamento;
- app embarcado pode desviar foco de distribuição do produto principal.

---

## 20. Estimativas de esforço e custo

> Faixas de planejamento, não orçamento. Excluem espera comercial, taxas do provedor, hardware, fiscal multi-UF e retrabalho de homologação.

| Entrega | Esforço solo provável | Faixa terceirizada indicativa |
|---|---:|---:|
| Descoberta + credenciamento | 1–3 semanas + espera | R$ 5 mil–15 mil se houver consultoria |
| Domínio + primeiro conector remoto | 6–12 semanas | R$ 40 mil–100 mil |
| Piloto e hardening remoto | 4–8 semanas | R$ 20 mil–60 mil |
| Núcleo Android + primeiro nativo | 4–7 meses | R$ 120 mil–300 mil |
| Nova adquirente nativa | 1,5–4 meses cada | R$ 30 mil–100 mil cada |
| Cinco ecossistemas maduros | 12–24+ meses | R$ 300 mil–700 mil+ |

O custo real para o founder inclui meses sem trabalhar em aquisição, onboarding, retenção e outras integrações. Espera de homologação não ocupa todas as horas, mas aumenta prazo de calendário e risco.

### Exemplo de payback

- 100 lojas a R$ 49/mês = R$ 4.900 MRR bruto;
- 100 lojas a R$ 79/mês = R$ 7.900 MRR bruto;
- um investimento de R$ 100 mil levaria aproximadamente 20 ou 13 meses de receita bruta, respectivamente, antes de suporte, impostos, churn e custo de capital;
- cinco clientes a R$ 49/mês adicionariam apenas R$ 245 de MRR.

Isso reforça a necessidade de piloto pago e distribuição antes do nativo multimarca.

### Modelos de monetização possíveis

1. **Add-on por loja:** R$ 49–99/mês para pagamento integrado.
2. **Por terminal:** R$ 15–39/mês/terminal, com mínimo por loja.
3. **Bundle Mesas + SmartPOS:** preço maior e narrativa única para restaurantes.
4. **Taxa de implantação:** R$ 299–1.499 para pareamento, treinamento e configuração.
5. **Plano rede/franquia:** mensalidade por loja + SLA e onboarding negociado.
6. **Marketplace da adquirente:** cobrança/repasse nos recebíveis quando disponível.
7. **Customização privada:** setup e manutenção separados para redes.

Evitar percentual sobre TPV no início: pode criar complexidade regulatória/comercial e alinhar o Zelo como intermediário financeiro sem necessidade. Confirmar contratos antes de qualquer revenue share.

---

## 21. Critérios de go/no-go

### Go para o primeiro remoto

- pelo menos 3–5 restaurantes confirmados na mesma adquirente;
- pelo menos 3 aceitam piloto real e preço futuro;
- documentação, sandbox e suporte do parceiro acessíveis;
- API oferece criação + consulta autoritativa; idealmente webhook, cancelamento e reembolso;
- IDs e idempotência permitem reconciliação;
- fallback manual existe;
- receita incremental ou valor estratégico justifica 6–12 semanas.

### No-go/adiar remoto

- valor só existe se duas adquirentes forem lançadas juntas;
- clientes não aceitam piloto pago nem trocar/configurar terminal;
- provedor não fornece consulta de estado confiável;
- contrato impede modelo SaaS multi-tenant;
- necessidade fiscal vira pré-requisito do MVP;
- payback conservador excede 18–24 meses.

### Go para SmartPOS nativo

- remoto provou uso recorrente e baixo suporte;
- 20–30 clientes/prospectos qualificados concentram-se no mesmo ecossistema, ou o provedor oferece canal/subsídio relevante;
- terminal debug, SDK e checklist de homologação estão em mãos;
- há receita esperada para financiar manutenção;
- suporte de Android/hardware tem responsável;
- aplicativo na maquininha resolve uma dor não coberta pelo remoto.

### No-go/adiar nativo

- pedido aparece ocasionalmente, sem concentração;
- provider exige exclusividade ou termos incompatíveis;
- operação depende de app web/WebView proibido;
- todos os clientes usam modelos diferentes/legados;
- founder não consegue reservar manutenção após lançamento.

---

## 22. Métricas do piloto

### Confiabilidade

- **0 cobranças duplicadas**;
- **0 pagamentos aprovados perdidos** após reconciliação;
- ≥ 99% das intents resolvidas tecnicamente em estado final em até 5 minutos, excluindo recusa legítima do emissor;
- `UNKNOWN` < 0,5% e 100% reconciliado em até 24 horas;
- webhook duplicado aplicado uma única vez;
- diferença entre provedor e Zelo = 0 após fechamento diário.

### Experiência

- p95 de ordem aparecer no terminal < 5 s em rede normal;
- redução ≥ 30% no tempo de cobrança/fechamento da mesa;
- redução de redigitação para zero no fluxo integrado;
- ≥ 70% das cobranças elegíveis usando integração após duas semanas;
- pareamento inicial concluído sem suporte em ≥ 90% dos casos.

### Negócio

- pelo menos 3 pilotos dispostos a continuar pagando;
- preço validado sem desconto permanente;
- tickets de suporte < 1 por loja/semana após estabilização;
- expansão de MRR projetada paga a fase em até 18 meses;
- evidência de menor churn ou maior conversão do add-on Mesas.

---

## 23. Perguntas para as adquirentes

### Produto e hardware

- Quais modelos e versões de Android/firmware são suportados?
- Há terminal de desenvolvimento? Qual custo e prazo?
- Quais métodos existem por modelo: crédito, débito, Pix, voucher, gorjeta e parcelas?
- Impressão, reimpressão, câmera e Bluetooth passam por qual SDK?
- Existe modo remoto, nativo, deeplink e/ou TEF?
- Pagamento offline/store-and-forward é permitido? Em quais regras?

### API/SDK

- Como criar, consultar, cancelar, estornar e reembolsar?
- Há reembolso parcial?
- Qual contrato de idempotência e por quanto tempo a chave é retida?
- Quais estados são finais? Como resolver timeout/estado desconhecido?
- Webhooks são assinados, repetidos e ordenados? Qual SLA/retry?
- Há sandbox, simulador e cartões/cenários de teste?
- Quais rate limits, SLAs e páginas de status?
- Como funciona OAuth para uma plataforma SaaS que integra vários lojistas?

### Aplicativo e homologação

- WebView, Flutter, React Native ou Compose são permitidos por tipo de app?
- Google Play Services/Firebase estão disponíveis?
- Bibliotecas de concorrentes são proibidas?
- Tamanho máximo, permissões, assinatura e minSdk?
- Toda nova versão é recertificada? Prazo médio?
- Loja pública, privada ou instalação por serial?
- Há rollout gradual, rollback e versão mínima obrigatória?

### Comercial e suporte

- Existe programa de parceiros, taxa, comissão ou volume mínimo?
- A loja cobra licença e repassa nos recebíveis?
- Quem atende falha de hardware, transação e integração?
- Há ambiente/canal de escalonamento de produção?
- O parceiro pode cobrar por loja/terminal?
- Há exclusividade, obrigação de marca ou restrição a outras adquirentes?
- Como funciona LGPD, PCI, retenção e compartilhamento de dados?

Solicitar respostas por escrito e anexar ao diretório da integração antes de estimar.

---

## 24. Estratégia 80/20 recomendada agora

### Produto

**Zelo Pay Integration v1 — “cobre a mesa sem redigitar o valor”.**

### Provedor

Padrão técnico: Mercado Pago Point Orders API. Exceção: usar Stone Connect ou Cielo Remota se a pesquisa de clientes mostrar concentração significativamente maior e o acesso de parceiro já estiver disponível.

### Fluxo

1. operador abre a mesa no Zelo;
2. toca em `Cobrar na maquininha`;
3. seleciona terminal, método e valor/split;
4. backend cria `payment_intent` com reserva do saldo;
5. adapter envia a ordem com chave idempotente;
6. UI acompanha sem bloquear o restante do salão;
7. webhook/consulta confirma resultado;
8. RPC aplica pagamento parcial uma vez;
9. saldo zero habilita fechamento da mesa;
10. divergências vão para “Pagamentos a verificar”.

### Escopo fechado do v1

- uma adquirente;
- pagamento remoto;
- Mesas e, se barato, venda comum;
- um pagamento ativo por terminal;
- crédito/débito e Pix apenas se o contrato já suportar;
- consulta, cancelamento antes da captura e reembolso conforme API;
- webhooks, `UNKNOWN`, reconciliação e auditoria;
- sem app Android;
- sem TEF;
- sem novo motor fiscal;
- sem promessa de pagamento offline;
- sem segunda adquirente antes das métricas.

### Fallback operacional

Se a integração estiver indisponível, o restaurante cobra manualmente na maquininha e registra a forma no Zelo como hoje. Pagamentos `UNKNOWN` exigem consulta antes de repetir; o fallback não pode transformar incerteza em segunda cobrança.

---

## 25. Decisões recomendadas

1. **Não construir SmartPOS multimarca agora.**
2. **Validar primeiro pagamento remoto em uma adquirente.**
3. **Escolher adquirente pela base de clientes; usar Mercado Pago Orders como default técnico.**
4. **Criar o domínio provider-agnostic antes do primeiro adapter.**
5. **Tratar `UNKNOWN` e reconciliação como requisitos P0, não edge cases.**
6. **Aplicar confirmação à Mesa por RPC server-side atômica e idempotente.**
7. **Não armazenar dados de cartão e confirmar escopo PCI com o parceiro.**
8. **Manter pagamento e fiscal desacoplados no MVP.**
9. **Só iniciar Android após piloto pago e concentração comercial.**
10. **No nativo, manter um APK/SDK por adquirente e núcleo compartilhado.**
11. **Adicionar uma adquirente por vez, com conformance suite, hardware real e homologação própria.**
12. **Tratar TEF como oferta enterprise futura.**

### Sequência empresarial recomendada

```text
Distribuição e retenção do Zelo
  → Mesas mais forte
  → pagamento remoto com uma adquirente
  → piloto pago e métricas
  → primeiro SmartPOS nativo
  → segunda adquirente por demanda
  → TEF/enterprise
```

O objetivo não é transformar o Zelo numa empresa de infraestrutura de pagamentos cedo demais. É usar integração de pagamento para tornar o ZeloPDV mais valioso para restaurantes, com risco e manutenção proporcionais à receita comprovada.

---

## 26. Fontes públicas principais

As fontes estão linkadas nas seções correspondentes. Referências complementares:

- [Auttar — captura de pagamentos e POS TEF](https://auttar.com.br/captura-de-pagamentos/)
- [Auttar — downloads e SDK Android](https://auttar.com.br/downloads/)
- [Software Express — instituições e hardwares SiTef](https://www.softwareexpress.com.br/pt/solucoes/SiTef/principais-instituicoes/)
- [Software Express — POS-SiTef](https://www.softwareexpress.com.br/pt/blog/como-o-pos-sitef--pode-ajudar-comercios-e-varejistas-a-proporcio/)
- [PCI SSC — critérios de SAQ](https://www.pcisecuritystandards.org/faqs/1443/)
- [ANPD — agentes de tratamento](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1)

Nenhum link público substitui contrato, kit de parceiro, documentação autenticada, matriz de terminais ou checklist de homologação recebido diretamente da adquirente.
