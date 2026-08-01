# Complementos e opções — redesign mobile-first

> Status: definição fechada, pronta pra implementar.
>
> Data: 2026-07-31
>
> Escopo: só a UI/UX de configuração de grupos e opções em Gestão → Produtos
> (`ModalModificadores.svelte`). Não muda o schema (`zelomenu_modifier_groups`,
> `zelomenu_modifier_options`, `zelomenu_modifier_option_products`), nem o
> domínio (`src/lib/zelomenuModifiers.js`), nem o modal do Frente de Caixa
> (`ModalProdutoMontavel.svelte`), nem a RPC de comanda. Isso já existe, já foi
> corrigido e testado — ver [[produtos-montaveis-pdv]].

## 1. Por que mexer de novo

O primeiro ciclo (`produtos-montaveis-pdv.md`) entregou a funcionalidade
funcionando, mas o teste ao vivo com um usuário leigo (2026-07-31) mostrou que
a tela de configuração continua confusa:

- **`Tipo` (Variação/Adicional) e `Preço` (Acréscimo/Preço da opção) são dois
  campos técnicos desacoplados.** O usuário marcou "Tipo: Variação" pra um
  grupo de Tamanho e não percebeu que precisava *também* trocar "Preço" pra
  "Preço da opção" — sem isso, o Tamanho soma ao preço em vez de substituir.
  Nada na tela avisa que essas duas escolhas andam juntas.
- **Nenhum preview concreto.** Os campos são abstratos; o lojista não vê o
  efeito real (`R$ X,XX`) até salvar e testar no PDV.
- **Tudo empilhado, tudo aberto.** Produtos com vários grupos (ex.: "Monte sua
  Massa" no ZeloMenu tem 5) viram uma parede de formulário — ao rolar até o
  4º grupo, o lojista já perdeu de vista o que configurou no 1º.
- **O mesmo problema existe no ZeloMenu** (`docs/superpowers/specs/2026-07-22-*`
  no repo `zelomenu`), que usa exatamente os mesmos 4 campos crus. A ideia
  documentada aqui foi escrita também lá, adaptada à paleta clara/lilás
  daquele sistema — ver `zelomenu/docs/superpowers/specs/2026-07-31-complementos-opcoes-mobile-first-ideia.md`.

## 2. Decisão de design

Três peças, desenhadas mobile-first (a maioria do uso é celular) mas que
aproveitam bem a tela em desktop/tablet. Protótipos visuais gerados e
aprovados em 2026-07-31 (ver anexo de imagens na conversa que originou este
documento; não versionadas no repo).

### 2.1. Modelo do grupo em vez de campos crus

Em vez de 4 campos soltos (`Tipo`, `Preço`, `Mínimo`, `Máximo`), o lojista
escolhe um **cartão de modelo**: ícone + título + descrição curta + um
**exemplo didático** de um produto comum, sempre marcado com `Ex.:`. Os
cartões empilham em coluna única (mobile) e formam
grade (desktop) — mesmo componente, não muda de forma entre telas.

Os 4 modelos e o que cada um grava por baixo:

| Modelo (copy visível) | `tipo` | `modo_preco` | `permite_quantidade` | Exemplo mostrado no cartão |
| --- | --- | --- | --- | --- |
| Escolha que troca o preço | `variacao` | `substituir` | `false` | `Ex.: Suco de Laranja • 500ml — R$ 12,00` |
| Adicional que soma ao preço | `adicional` | `somar` | `false` | `Ex.: Suco de Laranja + Calda de Nutella — + R$ 3,00` |
| Opção incluída, sem custo extra | `adicional` | `somar` | `false` | `Ex.: Suco de Laranja • Sem açúcar — R$ 0,00` |
| Adicional com quantidade (pode repetir) | `adicional` | `somar` | `true` | `Ex.: Suco de Laranja • Queijo extra × 2 — + R$ 4,00` |

**Nota:** "Adicional que soma" e "Opção incluída" gravam o mesmo par técnico
(`adicional`/`somar`) — não existe um terceiro `modo_preco` no schema, e não
vamos criar um só por causa disso. A diferença entre os dois cartões é
puramente pedagógica (ajuda o lojista a pensar no cenário certo: "calda
extra" vs "sem cebola"), não uma ramificação de dado nova. Se isso confundir
na prática, dá pra fundir os dois cartões num só numa iteração futura — não
travar a implementação por causa disso agora.

Depois de escolher o modelo, os campos que continuam editáveis (fora do
"avançado") variam por modelo:

| Modelo | Campos visíveis abaixo do cartão |
| --- | --- |
| Troca o preço | `Obrigatório` (toggle → `min_selecoes` 0 ou 1). `max_selecoes` fixo em 1, não aparece como campo. |
| Soma ao preço / Incluída sem custo | `Obrigatório` (toggle) + `Quantas o cliente pode escolher` (`max_selecoes`, "sem limite" ou número) |
| Quantidade (pode repetir) | `Obrigatório` (toggle) + `Quantas opções distintas` (`max_selecoes`) + `Máximo por opção` (`maximo_por_opcao`, "sem limite" ou número) |

"Configurações avançadas" (link discreto) abre os 4 campos crus atuais pra
quem precisar fugir do padrão (ex.: variação com `max_selecoes` > 1, se algum
caso de uso real aparecer). Não remover essa via de escape.

### 2.2. Navegação em duas telas (não é wizard)

A tela principal do produto mostra a **lista de grupos** já criados, cada um
como uma linha compacta: nome + 1-2 tags de status (`Obrigatório`/`Opcional`,
`Troca o preço`/`Soma ao preço`) + contagem de opções. Tocar num grupo abre
uma **tela cheia só daquele grupo** (nome, modelo, regras, lista de opções,
formulário de nova opção), com seta de voltar no topo — mesmo padrão de
Ajustes do iOS/Android.

Isso **não é um wizard**: o lojista pode ir de qualquer grupo pra qualquer
grupo, em qualquer ordem, sem sequência forçada. Continua respeitando o
princípio do produto de "menos modais, menos wizards, menos surpresas"
(`docs/DESIGN_PATTERNS.md` / `DESIGN.md`).

- **Mobile (< 1024px):** duas telas de verdade — lista (tela 1) e detalhe do
  grupo (tela 2) — navegação por push, sem lista e detalhe visíveis ao mesmo
  tempo.
- **Desktop/tablet (≥ 1024px):** as duas telas aparecem lado a lado (lista à
  esquerda, detalhe à direita), mesmo conteúdo, sem duplicar nada.

Isso substitui o padrão atual (cartões de grupo todos abertos/fecháveis
dentro de uma lista rolável única) por uma separação real de contexto.

### 2.3. Resumo geral

Existe **só na tela 1** (lista), nunca na tela 2 (detalhe do grupo, que já
usa o rodapé pros botões `Salvar grupo`/`Cancelar` daquele grupo específico).

- **Mobile:** barra fina e recolhida no rodapé — `"5 grupos configurados · Ver
  como fica"` — que abre um bottom sheet com o resumo completo (nome, status,
  contagem de opções de cada grupo) só quando tocada.
- **Desktop:** mesma barra no rodapé da lista, expansível inline (sem
  precisar de bottom sheet, já tem espaço).

## 3. Fora de escopo deste redesign

- Mudança de schema ou de domínio (`zelomenuModifiers.js` continua igual).
- Mudança no `ModalProdutoMontavel.svelte` (modal do Frente de Caixa) — esse
  já foi corrigido/polido numa rodada anterior e não faz parte desta.
- Implementação no ZeloMenu — a ideia foi documentada lá (ver seção 1), mas a
  implementação de código fica pra quando alguém decidir priorizar naquele
  repo. Não fazer nesta rodada.
- Fundir os cartões "Soma ao preço" / "Incluída sem custo" em um só — deixado
  como nota de acompanhamento (seção 2.1), não decisão fechada.

## 4. Critérios de aceite

- Criar um grupo não pede mais os 4 campos crus como primeira tela; pede o
  modelo primeiro, com exemplo real do produto sendo editado.
- Escolher "Troca o preço" sempre grava `modo_preco='substituir'` junto —
  impossível reproduzir o bug original (Tipo e Preço desalinhados).
- Em viewport ≤ 390px, abrir um grupo existente não deixa o formulário de
  edição misturado com a lista dos outros grupos na mesma tela rolável.
- Em viewport ≥ 1024px, lista e detalhe aparecem lado a lado sem duplicar o
  resumo geral.
- O resumo geral nunca aparece dentro da tela de detalhe de um grupo.
- "Configurações avançadas" continua permitindo qualquer combinação que o
  schema já suporta hoje (não regride flexibilidade).
- Testes existentes de `ModalModificadores`/`zelomenuModifiers` continuam
  passando; novos testes cobrem o mapeamento modelo → campos técnicos da
  tabela da seção 2.1.
