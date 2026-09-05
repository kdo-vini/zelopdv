# Pizzas montáveis

> Implementação local, 2026-09-05. A migration compartilhada foi aplicada e
> registrada no Supabase vinculado; os consumidores permanecem nesta branch até
> a publicação. Evidências abaixo.

## Produto e cadastro

Pizza usa o mesmo cadastro de qualquer produto. Em Gestão > Produtos, o
operador cria o produto, salva e segue para **Complementos e opções**. Dentro
de **Adicionar grupo**, o modelo **Montagem de pizza** abre a configuração
especializada. Não há seletor de tipo nem uma segunda ação “Nova pizza”. O
campo técnico `tipo_produto` só separa contratos de cálculo e persistência.

Um produto representa uma linha de pizzas, por exemplo “Pizzas tradicionais”.
O editor segue a ordem de trabalho do operador: regra de cobrança, tamanhos,
sabores e preços, apresentação no ZeloMenu e prévia. Cada tamanho aceita de
1 a 4 sabores. Sabores têm descrição e foto opcionais, disponibilidade manual
e uma matriz de preços. O valor informado é o da pizza inteira; uma célula
vazia torna o sabor indisponível naquele tamanho.

Ao transformar um produto antigo que pode ter vendas, o sistema cria uma
identidade técnica protegida, clona seus complementos e substitui o item
visível em uma única transação no banco. Se qualquer etapa falhar, nada é
substituído. O produto anterior recebe o sufixo “anterior”, sai do PDV e do
ZeloMenu, enquanto o novo preserva a visibilidade que existia. Isso evita
reclassificar vendas históricas. Importar sabores copia dados de produtos
existentes sem alterar os originais.

A loja escolhe maior sabor (`highest`, padrão) ou média (`average`). Massa,
borda e extras usam complementos existentes em modo somar. Grupos de preço
substituto e pizzas como produtos vinculados a complementos são recusados.
Massa/borda podem ser opcionais ou obrigatórias conforme os limites do grupo.
O simulador de cadastro mostra a base antes de extras; o montador de venda
mostra o total completo. A edição do carrinho do PDV preserva quantidade,
extras e observação de até 200 caracteres, revalidando a montagem.

Exemplo: sabores inteiros de R$40/R$60 custam R$60 pelo maior ou R$50 pela
média; borda de R$8 resulta em R$68/R$58. A base é arredondada uma única vez
em centavos; extras são somados depois, antes de multiplicar a quantidade.

## Contrato

- `produtos.tipo_produto`: `simples` ou `pizza`; legado permanece simples.
- `produtos.pizza_config`: configuração completa com revisão UUID, tamanhos,
  sabores e matriz. Armazenamento JSON mantém edição atômica sem uma tabela
  de produtos para cada combinação possível.
- `save_pizza_config(p_product_id,p_expected_revision,p_config)`: gravação
  atômica com controle concorrente e revisão nova. Revisões históricas
  preservam configuração e dependências dos complementos/estoque.
- `replace_product_with_pizza(...)`: converte com segurança um produto que já
  pode ter vendas; configuração, complementos, publicação e troca de
  visibilidade pertencem à mesma transação.
- Catálogo público: `productType` e `pizza`; entrada do carrinho:
  `pizzaSelection = {revision,sizeId,flavorIds}`.
- Snapshot `pizza` em carrinho, itens de pedido, venda e comanda: versão,
  revisão, tamanho, sabores/frações, regra, preço base e origem de estoque.
- `src/lib/pizza.js` é o módulo puro, espelhado literalmente em
  `zelomenu/src/domain/pizza.js`; fixtures verificam cálculo e identidade.
- Grupos `__pizza_size` e `__pizza_flavors` são projeções para apresentação,
  sem vínculos de estoque. Nunca são entradas de extras para o resolvedor.

O servidor resolve IDs, preços e disponibilidade. O carrinho público conserva
escolhas e solicita aceite quando o preço muda; escolhas indisponíveis não
são substituídas automaticamente. O backend recusa pizza sem composição,
inclusive consumidores conversacionais antigos. A montagem conversacional
do ZeloChat não faz parte desta entrega.

## Estoque e contingência

O fluxo atual não pede estoque de sabores, ingredientes ou tamanhos. Tamanhos
novos são gravados sem vínculo de estoque, e sabores nunca baixam estoque.
Vínculos históricos de tamanho continuam legíveis para não quebrar pedidos já
registrados. O controle genérico do produto e de adicionais vinculados mantém
o contrato existente do PDV; ficha técnica, frações livres e extras por parte
ficam fora desta versão.
O destino de estoque (produto ou categoria compartilhada) é preservado na
revisão histórica. Cancelar pedido canônico ou comanda restaura esse destino.
Excluir uma venda mantém a semântica preexistente, sem nova reposição automática.
Excluir pizza pelo cadastro arquiva; dependências históricas de estoque não
podem ser apagadas fisicamente fora da exclusão autorizada da conta inteira.

O catálogo offline guarda a configuração completa e os produtos de estoque
ocultos necessários por titular. Uma venda enfileirada leva `pizza_offline`
para validar pela revisão histórica e preservar o valor cobrado. O replay
mantém `client_sale_id`; falha de estoque/autorização conserva a pendência.
Pizzas pendentes reservam estoque na validação local sem reescrever o cache
canônico. Confirmação incerta pode reservar conservadoramente até reconciliar.
Isso não transforma Mesas em módulo offline nem remove limitações gerais
de contingência descritas em [OFFLINE](../operations/OFFLINE.md).

## Verificação e liberação

- PDV: `npm test`, `npm run check`, `npm run build`,
  `node tests/browser/pizza/run.mjs`, `npm run verify:migrations`.
- Menu: unitários, tipos frontend/backend, build e E2E de pizza em desktop/mobile.
- PostgreSQL descartável: migration + fixture de configuração/CAS, permissões,
  cálculo, offline/retry, estoque, comanda, aceite/cancelamento/conversão.
- Conferir papel em hardware antes de afirmar impressão física validada.

Runner SQL reproduzível (PowerShell, banco descartável gerenciado pelo script):

```powershell
./scripts/verify-supabase-baseline.ps1 -ApplyForwardMigrations -ExcludeTenantDataSeeds -PostMigrationVerification @('supabase/verification/pizza_composition_runtime.sql','supabase/verification/create_sale_owner_operator_runtime.sql','supabase/verification/customer_order_links_authz.sql','supabase/verification/whatsapp_atomic_confirmation_v1_runtime.sql')
```

Evidência local mais recente: 1.141 unitários PDV/3 skips e 674 unitários Menu;
check PDV 0/0 e typechecks frontend/backend Menu passaram. Fluxo real do modal em Chromium 390/1280 (montagem, borda,
observação, edição, reset e bloqueios); quatro E2E Menu desktop/mobile;
matriz SQL com configuração/CAS, ACL, preço, filas/retry, estoque histórico,
mesas/cozinha, aceite, cancelamento, fechamento e purge. Não foram criados
pedidos reais nem usados testes destrutivos no banco compartilhado.
O build do Menu passou. No Windows, o PDV passou em `npm run check` e no
harness de navegador; o adapter Vercel encontra o EPERM de symlink já conhecido
na etapa de adaptação. A jornada de pizza também passou em navegador mobile.
Papel físico não foi testado.

Auditoria visual: nenhum apontamento determinístico no novo editor de pizza do
PDV nem na montagem pública do ZeloMenu. Alertas das páginas operacionais/grade são preexistentes:
cores de estados diferentes detectadas como simultâneas e valores CSS
históricos fora da escala. Não houve supressão nem certificação WCAG geral.

Publicar schema compatível antes do backend Menu e interfaces; ativar
cadastro/publicação numa loja piloto apenas após todos os consumidores estarem
compatíveis. Monitorar erros de configuração, alteração de preço, confirmação
e fila offline. Para suspender novas montagens, arquivar a configuração/pausar
a publicação sem apagar histórico nem impedir a conclusão de pedidos existentes.

Referência de pesquisa: [Anota AI — categoria de pizzas, tamanhos e cobrança](https://anota.ai/ajuda/cardapio/).
