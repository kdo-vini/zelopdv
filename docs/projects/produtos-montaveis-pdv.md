# Produtos montáveis no ZeloPDV

> Status: implementada no ZeloPDV; migration `produtos_montaveis_pdv_2026_07_31.sql` aplicada no projeto Supabase vinculado em 2026-07-31. O frontend ainda precisa ser publicado.
>
> Correção pós-revisão (2026-07-31): a venda de balcão (online e replay offline) descartava o snapshot `modifiers` e não baixava estoque dos produtos vinculados às opções, porque `criar_venda_completa` não tinha sido atualizada e `buildVendaPayload` não expandia o estoque das opções vinculadas. Ver [[CURRENT]] para o detalhe da correção. A migration `criar_venda_completa_persistir_modifiers_2026_07_31.sql` ainda precisa ser aplicada no Supabase vinculado antes do deploy.
>
> Redesign em andamento (2026-07-31): a seção 5 abaixo (jornada de cadastro em `ModalModificadores.svelte`) está sendo substituída por um fluxo mobile-first — ver [[complementos-opcoes-redesign-mobile-first]] pra decisão e critérios de aceite atuais. Schema, domínio e o modal do Frente de Caixa (`ModalProdutoMontavel.svelte`) não mudam.
>
> Data: 2026-07-31
>
> Escopo: cadastro de produtos, Frente de Caixa, Mesas/comandas, estoque,
> impressão e compatibilidade com o modelo de grupos já usado pelo ZeloMenu.

## 1. Resumo da decisão

O ZeloPDV deve consumir no caixa os mesmos grupos de opções já configurados no
ZeloMenu. Não devemos criar uma segunda modelagem para “produtos compostos” ou
“complementos”. O catálogo comum já possui a estrutura; falta conectá-la às
superfícies nativas de operação.

O primeiro caso de aceite é um produto como **Monte sua Massa** ou o futuro
**Guaraná da Amazônia**:

```text
Guaraná da Amazônia — 500 ml
  Calda: leite condensado
  Confeitos: granulado
```

O produto continua sendo uma única linha da venda, mas a montagem fica
preservada e visível para quem atende, produz, imprime e analisa a operação.

## 1.1. To-do operacional

Esta é a lista de execução do primeiro ciclo. O agente responsável deve marcar
os itens concluídos somente depois de implementar e validar cada um.

- [x] Confirmar o contrato atual dos grupos e opções no ZeloMenu e manter a mesma regra de preço, seleção e quantidade.
- [x] Portar para o ZeloPDV apenas o domínio necessário: normalização, validação, preço final e assinatura da combinação.
- [x] Adaptar o cadastro de produtos para configurar complementos e opções a partir da tela de Produtos, sem exigir uma coluna ou tipo novo.
- [x] Fazer produtos simples continuarem entrando na comanda com um toque.
- [x] Abrir modal de montagem para produtos com grupos, com obrigatoriedade, limites, quantidade e total atualizado.
- [x] Exibir o resumo das opções escolhidas na comanda, pedido e cozinha sem perder a identificação.
- [x] Persistir a montagem no payload da venda e no caminho offline, preservando o snapshot no momento da venda.
- [x] Garantir que combinações diferentes do mesmo produto formem linhas distintas e que a alteração de quantidade seja segura.
- [x] Integrar Mesas/comandas e validar a reserva/devolução de estoque dos produtos vinculados usando a mesma regra do produto-base.
- [x] Criar testes para produto simples, grupo obrigatório, múltipla escolha, adicional por quantidade, preço substituto, assinatura e venda offline.
- [x] Rodar `npm run check` e os testes focados; registrar qualquer limitação em `docs/CURRENT.md`.
- [x] Fazer revisão de correção/arquitetura/segurança e revisão Ponytail para remover complexidade que não seja necessária ao MVP.

## 1.2. Status do primeiro ciclo

O ciclo está implementado localmente. A tela de Produtos configura grupos e
opções, o PDV abre a montagem para produtos montáveis, Mesas/comandas preserva
o resumo e a venda mantém o snapshot estruturado online e offline. Produtos
simples continuam no fluxo de um toque.

A migration `.ai/migrations/produtos_montaveis_pdv_2026_07_31.sql` foi aplicada
no projeto Supabase vinculado e adiciona o
snapshot em `comanda_itens` e `vendas_itens`, amplia as RPCs de comanda e faz a
baixa/devolução dos produtos vinculados às opções. Ela é aditiva e mantém a
assinatura antiga de `comanda_aplicar_delta_item` para clientes legados. Antes
do deploy, conferir o frontend e os grants; nenhum dado de teste foi inserido.

## 2. Evidência que originou a proposta

No Supabase, a empresa **Bem Servido** (`slug = bemservido`) já possui o
produto `Monte sua Massa` (`produtos.id = 843`, preço-base de R$ 20,00) com
grupos ativos no modelo do ZeloMenu:

- `Escolha sua massa`: variação, obrigatória, escolha única, preço substituído;
- `Molho`: variação, obrigatória, escolha única;
- `Turbine com Proteínas`: adicional, até duas opções;
- `Finalize com Acompanhamentos`: adicional, até três opções;
- `Adicional para sua massa`: adicional com quantidade e preço próprio.

Pedidos reais recentes da Bem Servido já gravam em
`zelo_order_items.modifiers` o snapshot estruturado de cada grupo e opção,
incluindo nome, preço e quantidade.

O defeito atual é que o produto aparece no PDV como uma venda simples de R$
20,00. O operador não consegue escolher a massa, o molho ou os adicionais.
Isso permite uma venda incompleta e pode gerar divergência de produção, preço,
estoque e histórico.

## 3. Nomenclatura canônica

A nomenclatura precisa distinguir o conceito de produto da estrutura que o
compõe, sem expor o termo técnico “modifier” ao operador.

| Conceito | Termo recomendado | Uso |
| --- | --- | --- |
| Produto que exige ou permite montagem | **Produto montável** | Badge, documentação e lógica de produto |
| Área de configuração do produto | **Complementos e opções** | Título da seção em Gestão → Produtos |
| Conjunto de escolhas do produto | **Grupo de complementos** | Título do editor e ação “Adicionar grupo” |
| Item selecionável dentro do grupo | **Opção** | Ex.: Penne, 500 ml, Granulado |
| Escolha que substitui a configuração-base | **Variação** | Ex.: tamanho ou massa |
| Escolha somada ao produto | **Adicional** | Ex.: calda extra ou proteína |
| Texto curto com a seleção realizada | **Resumo da montagem** | Comanda, recibo e cozinha |

“Produto composto” pode continuar aparecendo em documentação técnica quando
for necessário falar de estoque ou decomposição, mas não deve ser o principal
termo da interface: pode sugerir kit/BOM e não comunica bem uma escolha feita no
atendimento.

“Modificador” permanece aceitável em nomes técnicos, adapters e payloads, mas
fica fora da linguagem visível ao usuário.

## 4. Modelo funcional

Um produto montável é um produto comum que possui pelo menos um grupo ativo.
Não é necessário criar um novo tipo de produto nem uma coluna booleana apenas
para marcar o conceito; o estado pode ser derivado da existência de grupos
ativos.

Cada grupo possui:

- nome definido pelo operador;
- tipo lógico: `variacao` ou `adicional`;
- mínimo e máximo de escolhas;
- modo de preço: somar ao produto ou substituir o preço-base;
- possibilidade opcional de permitir quantidade por opção;
- limite opcional por opção;
- ordem e estado ativo/inativo.

Cada opção possui:

- nome ou produto vinculado;
- preço adicional ou preço resolvido do produto vinculado;
- estado ativo/inativo;
- ordem;
- vínculo opcional com um produto real do catálogo para estoque e custo.

O contrato real do ZeloMenu já contempla, além das tabelas básicas,
`modo_preco`, `permite_quantidade`, `maximo_por_opcao` e
`zelomenu_modifier_option_products`. O PDV deve consumir esse contrato atual,
sem voltar ao modelo antigo que só conhecia `price_delta` como acréscimo.

## 5. Jornada de cadastro de produto

### 5.1. Criar produto simples

O caminho rápido continua existindo:

1. Operador clica em **Novo produto**.
2. Informa nome, categoria e preço-base.
3. Salva.
4. O produto fica disponível imediatamente como produto simples e a tela abre
   **Complementos e opções** para quem quiser continuar configurando.

O editor de complementos aparece automaticamente apenas após o cadastro de um
produto novo; nos demais casos, a configuração fica atrás da ação explícita
**Complementos e opções**. Isso preserva a velocidade do cadastro de itens que
não têm escolhas.

### 5.2. Transformar em produto montável

Depois de salvar o produto, a tela deve oferecer uma ação clara:

> **Configurar complementos e opções**

Ao iniciar essa configuração, o produto passa a ser apresentado como
**Produto montável** e a tela abre a área **Complementos e opções**.

Alternativa equivalente para a edição: exibir a seção diretamente na página de
produto, abaixo dos dados básicos, com estado vazio e CTA:

> Este produto ainda não tem grupos de complementos. Adicione tamanho,
> cobertura, molho, confeito ou outras opções.

### 5.3. Criar um grupo

O formulário de grupo deve pedir primeiro o que o operador entende:

1. **Nome do grupo** — ex.: `Tamanho`, `Calda`, `Confeitos`, `Escolha sua massa`.
2. **Como escolher** — uma opção ou várias opções.
3. **Obrigatoriedade** — opcional ou obrigatório.
4. **Quantidade por opção** — ativada apenas para adicionais que podem se repetir.
5. **Preço** — incluso, acréscimo ou preço próprio da opção.
6. **Opções** — nome, preço, ordem e eventual vínculo com produto do catálogo.

O sistema deve traduzir essas escolhas para `min_selecoes`, `max_selecoes`,
`tipo`, `modo_preco`, `permite_quantidade` e `maximo_por_opcao`. O operador não
precisa conhecer os nomes das colunas.

### 5.4. Exemplos orientados

O estado vazio pode apresentar exemplos clicáveis ou textos de ajuda:

- `Tamanho`: obrigatório, uma escolha, preço substituído;
- `Calda`: opcional, até uma escolha, acréscimo;
- `Confeitos`: opcional, várias escolhas, incluso;
- `Adicionais`: opcional, permite quantidade, acréscimo.

Esses exemplos devem orientar, não criar grupos automaticamente sem uma ação
explícita do usuário.

### 5.5. Edição e leitura do estado

Na listagem de produtos, um produto montável deve mostrar um resumo como:

```text
Monte sua Massa
Produto montável · 5 grupos ativos
```

O operador deve conseguir editar, desativar ou reordenar grupos e opções sem
precisar apagar o produto-base.

## 6. Jornada no Frente de Caixa

### 6.1. Clique no produto

- Produto sem grupos ativos: adiciona em um toque, como hoje.
- Produto com grupos ativos: abre o modal de montagem.

O modal é preferível a um dropdown porque os grupos podem ser numerosos, há
regras de seleção e o PDV precisa funcionar bem em celular e tablet.

### 6.2. Modal de montagem

O modal deve:

- exibir o nome do produto e o preço atual;
- renderizar grupos na ordem configurada;
- usar rádio para escolha única;
- usar checkbox para múltiplas opções;
- usar stepper para opções com quantidade;
- indicar `Obrigatório`, `Opcional`, `mínimo` e `máximo` em linguagem simples;
- atualizar o preço em tempo real;
- impedir confirmação enquanto um grupo obrigatório estiver incompleto;
- permitir observação livre apenas como complemento, nunca como substituto da
  seleção estruturada;
- terminar com uma ação explícita, como **Adicionar à comanda — R$ X,XX**.

### 6.3. Linhas da comanda

A chave da linha deve considerar produto, opções selecionadas, quantidade das
opções e observação relevante:

- mesma combinação: incrementa a quantidade;
- combinação diferente: cria outra linha;
- produto sem seleção: mantém o comportamento atual.

Exemplo:

```text
1x Guaraná da Amazônia — 500 ml                         R$ 12,00
   Calda: leite condensado · Confeitos: granulado

1x Guaraná da Amazônia — 700 ml                         R$ 16,00
   Calda: morango · Confeitos: granulado, paçoca
```

Não devemos criar linhas independentes chamadas apenas “Cobertura” ou
“Confeito”. Esses nomes precisam continuar vinculados ao produto principal.

## 7. Persistência, estoque e venda

### 7.1. Snapshot da venda

O preço e a seleção devem ser resolvidos no momento da inclusão e preservados
como snapshot. Alterações futuras no cadastro não podem modificar uma venda já
realizada.

O payload da venda precisa carregar, no mínimo:

- produto-base;
- nome exibido na venda;
- quantidade;
- preço unitário final;
- grupos selecionados;
- opções, quantidades e preços resolvidos.

O `buildVendaPayload` atual do ZeloPDV reduz o item a produto, quantidade, nome
e preço. Essa transformação precisa ser ampliada para não descartar a
montagem, inclusive durante replay offline.

### 7.2. Estoque

Há dois cenários distintos:

1. Opção textual sem produto vinculado: registra a escolha, mas não baixa um
   estoque específico.
2. Opção vinculada a produto real: a venda deve considerar esse produto para
   baixa, estoque compartilhado, custo e relatórios.

O segundo cenário é importante para ingredientes como massa, calda, confeito,
proteína e tamanho. A implementação deve reutilizar a semântica existente de
`zelomenu_modifier_option_products`, sem inventar uma segunda relação.

### 7.3. Mesas e comandas

O fluxo de Mesas hoje trabalha com produto e quantidade via
`comanda_aplicar_delta_item`. Para produtos montáveis, será necessário
preservar também a seleção, preço resolvido e resumo da montagem no item da
comanda.

O envio para a cozinha deve levar a identidade do item da comanda e seus grupos
selecionados, sem baixar estoque novamente quando o item já foi reservado.

### 7.4. Offline

O catálogo offline precisa carregar os grupos, opções e vínculos necessários
para montar um produto já conhecido pelo dispositivo. A venda offline deve
guardar o snapshot inteiro no payload pendente; o replay não pode depender de o
grupo ainda estar igual no cadastro atual.

## 8. Integração com o que já existe

O ZeloMenu já fornece os principais blocos reaproveitáveis:

- domínio de resolução em `src/domain/zelomenuModifiers.ts`;
- assinatura de combinação em `src/domain/zelomenuCartItemKey.ts`;
- modal de seleção em `src/components/zelomenu/ZeloMenuProductAddModal.tsx`;
- carrinho que diferencia combinações em `src/hooks/useStoreCart.ts`;
- revalidação server-side e snapshot em `server/zelomenuCartSessions.ts`;
- persistência canônica em `zelo_order_items.modifiers`.

No ZeloPDV, a implementação deve ser uma adaptação do contrato e da lógica para
Svelte, não uma cópia superficial da interface React. O componente legado
`src/lib/components/modals/ModalModificadores.svelte` deve ser revisado porque
não representa sozinho o contrato atual e não está conectado ao fluxo nativo do
PDV.

A fila de Pedidos/Cozinha do ZeloPDV já sabe exibir grupos de modificadores de
`zelo_order_items.modifiers`. Essa capacidade deve continuar sendo a referência
visual para o bilhete de produção.

## 9. Ordem recomendada de implementação

### Fase A — contrato e domínio

- criar adapter Svelte/JavaScript para o contrato atual dos grupos;
- portar a resolução de seleção, preço e assinatura;
- cobrir mínimo, máximo, substituição, acréscimo e quantidade;
- carregar grupos junto do catálogo do PDV;
- definir o snapshot comum usado por venda, comanda, recibo e offline.

### Fase B — cadastro

- adicionar seção **Complementos e opções** em Gestão → Produtos;
- criar/editar/reordenar grupos e opções;
- suportar vínculo opcional com produto real;
- mostrar o estado “Produto montável” na listagem;
- manter o cadastro simples rápido para produtos sem montagem.

### Fase C — Frente de Caixa

- abrir modal ao clicar em produto montável;
- adicionar resumo da montagem nas linhas da comanda;
- calcular preço final;
- impedir grupos obrigatórios incompletos;
- persistir seleção na venda online e offline;
- imprimir seleção no recibo.

### Fase D — Mesas e produção

- preservar montagem em `comanda_itens`;
- permitir envio do item montado para a cozinha;
- exibir grupos no bilhete;
- evitar baixa dupla de estoque;
- fechar a mesa mantendo o snapshot da montagem.

### Fase E — estoque e relatórios

- atribuir opções vinculadas a produtos reais;
- validar baixa de produto e estoque compartilhado;
- decidir como linhas de container e subitens aparecem nos relatórios;
- cobrir custo e análise de venda por opção.

## 10. Critérios de aceite do MVP

- Produto simples ainda entra em um toque.
- Produto montável abre a montagem ao ser selecionado.
- Grupos obrigatórios bloqueiam confirmação quando incompletos.
- O preço final reflete substituições, acréscimos e quantidade.
- Duas combinações diferentes não são agrupadas na mesma linha.
- A comanda exibe nome do produto e resumo da montagem.
- O recibo exibe as opções selecionadas.
- O item enviado à cozinha exibe os grupos e opções.
- Venda feita sem internet preserva os grupos no replay.
- Opção vinculada a produto não é ignorada na regra de estoque.
- Alterar o cadastro depois da venda não altera o snapshot histórico.
- Produto sem grupos não sofre regressão de velocidade.

## 11. Fora do MVP

- regras condicionais entre grupos, como “se escolheu X, mostrar Y”;
- preços por canal independentes do catálogo comum;
- limites agregados complexos entre opções;
- impressão separada por setor;
- ficha técnica completa de receita e custo;
- edição de uma montagem já adicionada à comanda, caso o MVP possa removê-la
  e adicioná-la novamente.

## 12. Decisões ainda necessárias de engenharia

1. Onde guardar o JSON estruturado da montagem nas vendas nativas: nova coluna
   de snapshot ou expansão apenas do payload para uma representação histórica
   equivalente.
2. Onde guardar o JSON da montagem em `comanda_itens` e como atualizar a RPC
   `comanda_aplicar_delta_item` sem quebrar comandas existentes.
3. Se grupos devem estar disponíveis para qualquer plano ZeloPDV ou se a
   criação/publicação online continua condicionada ao entitlement ZeloMenu.
   Proposta: grupos necessários para vender no PDV são capacidade do catálogo
   operacional; publicação online continua dependendo do ZeloMenu.
4. Se opção vinculada baixa estoque no momento da inclusão na comanda ou no
   aceite/envio, respeitando a separação atual entre comanda e pedido canônico.
5. Se o operador poderá trocar a montagem de uma linha existente ou somente
   remover e adicionar novamente no primeiro release.

## 13. Conclusão

O ZeloPDV não precisa inventar “produtos compostos”. Precisa reconhecer que um
produto com grupos ativos é montável e conduzir o operador por uma seleção
estruturada antes de concluir a venda.

A nomenclatura recomendada é:

```text
Produto montável
└── Complementos e opções
    └── Grupo de complementos
        └── Opção
```

O investimento inicial é principalmente de integração: adaptar o domínio e a
UI React do ZeloMenu para Svelte, conectar o cadastro de produtos e impedir que
a camada de venda/comanda descarte os modificadores. O benefício é corrigir uma
falha funcional existente e tornar o mesmo catálogo operacionalmente coerente
no ZeloMenu, no PDV, nas Mesas e na cozinha.
