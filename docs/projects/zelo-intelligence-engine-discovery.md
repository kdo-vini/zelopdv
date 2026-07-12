# Zelo Intelligence Engine — Discovery Técnico (V1)

> Criado em 2026-07-10. Investigação read-only do repo + migrations, sem alteração de código.
> Objetivo: servir de handoff para implementação da V1 do "gerente digital" — motor determinístico
> de métricas + detecção de sinais + narrativa via LLM.
> Referências: [[CLAUDE]] · [[CURRENT]] · [[CODE_REVIEW]] · [[TRADEOFFS]] · `docs/data/SCHEMA_RLS.md`

## Sumário executivo

- **~27 métricas** são calculáveis hoje sem nenhuma mudança de schema (§2).
- **~18 sinais** são detectáveis hoje; 3 dos exemplos da tese precisam de ajuste (§3).
- A arquitetura proposta pelo produto (dados → motor determinístico → sinais → LLM → narrativa)
  **é compatível com o que existe** e reaproveita quase toda a infraestrutura atual (§6).
- As 5 lacunas mais importantes: sem custo de produto (margem real impossível), fronteira de
  "dia" sem timezone canônico, hard delete de vendas, fiado sem ledger (só saldo acumulado),
  estoque sem histórico de movimentações (§4).
- Escopo V1 recomendado: 1 cron diário, 2 tabelas novas (`business_daily_snapshots`,
  `business_signals`), módulo puro de métricas no padrão de `src/lib/finance/caixa.js`,
  1 chamada de LLM por empresa/dia (opcional, com fallback em template), entrega in-app
  simples + WhatsApp opt-in reaproveitando `src/lib/server/whatsapp.js` (§6–§7).

## Nota metodológica (leia antes de confiar em qualquer coluna)

`.ai/migrations/` **não contém `CREATE TABLE` das tabelas operacionais centrais** (`vendas`,
`vendas_itens`, `produtos`, `categorias`, `pessoas`, `mesas`, `comandas`, `pedidos`, `caixas`,
`empresa_perfil`, `expenses`). As migrations versionadas são patches incrementais (ALTER, índices,
RLS, functions). O schema base foi criado direto no Supabase e não está versionado — confirmado
por `docs/data/SCHEMA_RLS.md:8` e pelo finding P2 em `docs/CODE_REVIEW.md:59-63`.

Portanto: as colunas listadas abaixo foram **inferidas de queries reais do código e das RPCs
versionadas**, não presumidas por nome de tela. Onde só existe inferência, está marcado. Antes de
criar FKs/joins novos na V1, validar tipos no banco real (`npx supabase db query --linked` já
funciona, ver [[CURRENT]] 2026-07-06).

Existe em produção uma view `v_daily_metrics` (citada nos advisors em `docs/CODE_REVIEW.md:39`)
que **não é referenciada por nenhum código deste repo** — provavelmente resíduo do leadbot ou do
admin. Não reutilizar nem colidir com esse nome sem inspecionar a definição no banco.

---

## 1. Quais dados realmente existem hoje

Fonte primária: RPC `criar_venda_completa` em `.ai/migrations/offline_sales_idempotency_2026_05_12.sql:17-244`
(única DDL rica versionada) + queries em `src/routes/relatorios/+page.svelte`,
`src/routes/gestao/*`, `src/routes/app/*`, `src/lib/finance/*`.

### 1.1 Núcleo de vendas

**`vendas`** (sem DDL versionada; colunas da RPC `offline_sales_idempotency_2026_05_12.sql:82-102`):

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `numero_venda` | integer | gerado no banco |
| `id_usuario` | uuid | tenant = owner (subusuário grava com id do owner) |
| `id_caixa` | integer FK → `caixas.id` | nullable; RPC cai no caixa aberto mais recente |
| `id_cliente` | uuid FK → `pessoas.id` | nullable; obrigatório em fiado |
| `client_sale_id` | text | idempotência offline; índice único parcial `(id_usuario, client_sale_id)` |
| `valor_total` | numeric | total cobrado (inclui vendas fiado!) |
| `forma_pagamento` | text | `dinheiro`, `pix`, `cartao_debito`, `cartao_credito`, `cartao` (legacy), `fiado`, `multiplo`, ou id de plataforma (`src/lib/finance/caixa.js:13-21`) |
| `valor_recebido` / `valor_troco` | numeric | dinheiro |
| `valor_desconto` / `desconto_tipo` | numeric / text | |
| `tipo_pedido` | text | `retirada` / `delivery` / `mesa` |
| `taxa_entrega` | numeric | |
| `created_at` | **timestamptz** | `coalesce(payload, now())` — vendas offline preservam o horário original do dispositivo (`src/lib/offlineDb.js:240-241`) |

**`vendas_itens`** (`offline_sales...:106-121`): `id_venda`, `id_produto` (nullable), `quantidade`,
`nome_produto_na_venda` (snapshot), `preco_unitario_na_venda` (**snapshot do preço praticado** —
isto é ouro: histórico de preço efetivo por venda existe). Sem timestamp próprio; junta por `id_venda`.

**`vendas_pagamentos`** (`offline_sales...:127-135`): `id_venda`, `forma_pagamento`, `valor` —
uma linha por forma em vendas `multiplo`. Regra crítica de dedup: nunca somar `vendas.valor_total`
de uma venda que tenha linhas aqui (`src/lib/finance/caixa.js:120-121`).

**`vendas_taxas_plataforma`** (`offline_sales...:220-231`): `plataforma_id`, `plataforma_nome`,
`taxa_pct` (snapshot), `valor_bruto`, `valor_taxa` — comissões de iFood etc. por venda.

**Exclusão de venda é HARD DELETE.** `supabase.from('vendas').delete()` em
`src/routes/gestao/+page.svelte:189`, `src/routes/gestao/fichario/+page.svelte:172` e
`src/routes/app/mesas/[id]/+page.svelte:764`, com estorno prévio de fiado via
`revertFiadoDebtForVenda` (`src/lib/finance/saleOps.js:16-59`). Não há `status`, `cancelada`
nem `deleted_at`. Implicação: o histórico pode mudar retroativamente e não existe trilha de
cancelamento.

### 1.2 Produtos, categorias e estoque

**`produtos`** (inferida de `src/routes/gestao/produtos/+page.svelte:55-66`): `nome`, `preco`,
`preco_2`, `preco_3` (tabelas de preço com fallback, `src/lib/finance/caixa.js:7-11`),
`id_categoria`, `id_subcategoria`, `eh_item_por_unidade`, `ocultar_no_pdv`, `controlar_estoque`
(default false), `estoque_atual`.

- **Não existe coluna de custo** (`preco_custo`/`custo`). O único cálculo de margem no produto é
  a calculadora standalone (`PricingCalculator.svelte` / `/ferramentas/precificacao`), sem persistência.
- **Não existe `estoque_minimo`** nem qualquer limiar configurável.

**`categorias`**: `nome`, `ordem`, `controlar_estoque_compartilhado`, `estoque_compartilhado_atual`
(estoque compartilhado por categoria, `offline_sales...:154-178`). `subcategorias` relacionada.

**Estoque é saldo simples mutado in-place, sem histórico.** A baixa acontece só dentro da RPC
`criar_venda_completa` (`offline_sales...:139-205`, com `raise exception 'Estoque insuficiente'`)
e nas funções de comanda (`mesas_stock_realtime_hotfix_2026_05_01.sql`). Não há tabela de
movimentações de estoque; entradas de compra são updates manuais em
`src/routes/gestao/estoque/+page.svelte:179,220`. O card de estoque do dashboard é **placeholder
hardcoded** (`criticos:0, rupturas:0` em `src/routes/gestao/+page.svelte:19,150`).

### 1.3 Despesas

A tabela chama-se **`expenses`** (inglês) e usa **`user_id`** (não `id_usuario`) — única tabela
operacional com essa convenção. Colunas (de `src/routes/gestao/despesas/+page.svelte:126-140`):
`description`, `amount`, `category` (categorias fixas na UI), `date` (ISO com hora),
`user_id`, `id_operador`. Preenchimento depende inteiramente da disciplina do usuário.

### 1.4 Caixa

**`caixas`** (de `src/lib/finance/caixaOps.js` + `src/routes/gestao/caixa/+page.svelte:137-143`):
`id` integer, `id_usuario`, `id_operador`, `data_abertura`, `valor_inicial`,
`data_fechamento` (**NULL = aberto**; índice único parcial garante 1 aberto por empresa,
`caixas_one_open_per_user_2026_07_06.sql:67-69`), `valor_fechamento` (contado),
`diferenca_fechamento` (contado − esperado).

**`caixa_fechamentos`** (histórico, `gestao/caixa/+page.svelte:148-162`): `total_dinheiro`,
`total_cartao`, `total_pix`, `total_geral`, `valor_inicial`, `valor_esperado_em_gaveta`,
`valor_contado_em_gaveta`, `diferenca`, `quantidade_vendas` — **a série histórica de diferenças
de caixa já existe pronta**.

**`caixa_movimentacoes`**: `tipo` (`sangria`/`suprimento`), `valor`, `motivo`, `id_caixa`,
`created_at`. Recebimento de fiado "adicionado ao caixa" vira suprimento
(`src/routes/gestao/fichario/+page.svelte:80-91`).

### 1.5 Fiado

**Não há tabela de lançamentos de fiado.** O modelo é:

1. Venda com `forma_pagamento='fiado'` (ou linha fiado em `multiplo`) com `id_cliente` obrigatório.
2. A RPC incrementa `pessoas.saldo_fiado` (`offline_sales...:207-215`).
3. Quitação/estorno decrementa via RPC `fiado_registrar_pagamento` (**definição não versionada
   no repo** — só chamadas em `src/lib/finance/saleOps.js:50-53` e `fichario/+page.svelte:77`).

`pessoas.saldo_fiado` é a fonte de verdade do saldo. Consequência: **a evolução do saldo de fiado
ao longo do tempo não é reconstruível** — pagamentos não deixam trilha própria (só opcionalmente
um suprimento de caixa). O fiado *emitido* por período é reconstruível pelas vendas.

### 1.6 Mesas, comandas e pedidos

- `mesas`: `numero`, `status` (`livre`/`ocupada`).
- `comandas`: `id_mesa`, `id_operador`, `status` (`aberta`/`cancelada`/fechada), `num_pessoas`,
  `fechada_em`, `id_venda`, `total_calculado`, `desconto`, `couvert_valor`. A comanda é efêmera:
  no fechamento vira uma linha de `vendas` com `tipo_pedido='mesa'`
  (`src/routes/app/mesas/[id]/+page.svelte:605-878`). **A venda canônica é sempre `vendas`.**
- `comanda_itens`: `preco_unitario`, `quantidade`, `estoque_baixado` (única DDL versionada,
  `mesas_stock_realtime_hotfix_2026_05_01.sql:6-7`).
- `pedidos` (ticket de cozinha/KDS, **separado do financeiro**): `numero_pedido`, `status`
  (CHECK `aberto|preparando|pronto|fechado`, `pedidos_preparando_status_2026_06_25.sql:10-11`),
  `origem` (CHECK `balcao|comanda|zelochat|zelomenu`, `pedidos_origem_zelomenu_2026_06_23.sql:15-17`),
  `criado_em`, `id_comanda`, `nome_cliente`. `pedido_itens` com `status_cozinha`.
  **Transições de status não têm timestamp** → tempo de preparo não é calculável.

### 1.7 Perfil e entitlement

- `empresa_perfil`: chave `user_id` (owner). **Não existe coluna de timezone** em nenhuma tabela —
  grep por `timezone`/`America/Sao_Paulo` em `src/` retorna zero para lógica de negócio.
- `subscriptions`: `plan_tier` (`pdv|chat|bundle`), `status`, `current_period_end`,
  `manually_extended_until`, flags `has_mesas_addon`, `has_pedidos_addon`, `has_acessos_addon`,
  `has_zelo_menu` — o molde de gating para uma feature nova (`src/lib/pricing.js:7-96`,
  `src/lib/guards.js:238-393`).
- `ai_usage_logs`: log de tokens/custo do chat (gravado em `api/chat/assistant/+server.js:435-440`,
  lido no admin `admin-dashboard/src/routes/ai-usage/+page.svelte`) — reutilizável pelo engine.

### 1.8 Timestamps e timezone (transversal, crítico)

- Todas as colunas datetime versionadas são `timestamptz` (UTC no banco).
- A fronteira de "dia" hoje é calculada **no browser, no fuso local do dispositivo**
  (`isoStart/isoEnd` em `src/routes/relatorios/+page.svelte:723-724`;
  `localDateInputToIso` em `src/lib/dateRange.js:14`).
- **Inconsistência real já existente**: os filtros de período usam meia-noite local, mas a série
  diária e o export agrupam por `toISOString().slice(0,10)` = **UTC**
  (`relatorios/+page.svelte:559,1015`). Perto da meia-noite BRT a mesma venda cai em dias
  diferentes entre filtro e gráfico.
- Vendas offline sincronizadas depois preservam `created_at` original do dispositivo
  (`src/lib/offlineDb.js:240-241` + `offline_sales...:100`) — podem "chegar" em um dia já processado.
- Não há nenhuma lib de datas no runtime (`package.json`: sem dayjs/date-fns/luxon). Node 20 tem
  `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'`, suficiente para o engine.

---

## 2. Métricas calculáveis HOJE (sem mudança de schema)

Convenções para todas: escopo por empresa = `id_usuario = ownerUserId` (`user_id` em `expenses`);
janela diária deve ser computada **pelo engine em America/Sao_Paulo** (nada de reutilizar a
fronteira do client); paginação de 1000 em 1000 obrigatória em `vendas`/`expenses`
(padrão em `relatorios/+page.svelte:740-759,846-869`); dedup simples-vs-múltiplo obrigatória
(`caixa.js:120-121`).

| # | Métrica | Definição | Tabelas | Campos | Fórmula | Limitações |
|---|---|---|---|---|---|---|
| 1 | Faturamento bruto diário | Total cobrado no dia | `vendas` | `valor_total`, `created_at` | `Σ valor_total` no dia local | Inclui fiado (a receber); muda se venda for hard-deleted |
| 2 | Receita realizada | Bruto menos fiado emitido | `vendas`, `vendas_pagamentos` | `valor_total`, `forma_pagamento`, `valor` | `bruto − Σ fiado` (venda fiado pura + linhas fiado de múltiplo) | Convenção do app (`caixa.js:145-148`); manter alinhado aos relatórios |
| 3 | Quantidade de vendas | Cupons no dia | `vendas` | `id`, `created_at` | `count(*)` | Venda excluída some |
| 4 | Ticket médio | Receita por cupom | `vendas` (+`vendas_pagamentos`) | acima | `receita_realizada / qtd` (definição dos relatórios: `relatorios:393`) ou `bruto / qtd` — **escolher e documentar uma** | Duas convenções coexistem no app (dashboard usa "sem fiado": `gestao/+page.svelte:86-92`) |
| 5 | Mix por forma de pagamento | % de cada forma | `vendas`, `vendas_pagamentos` | `forma_pagamento`, `valor_total`, `valor` | `calculatePaymentSummary` (`caixa.js:111`) → share por forma | `cartao` legacy precisa ser agrupado com débito/crédito |
| 6 | Share de PIX | % do bruto em pix | idem | idem | `pix / totalBruto` | idem |
| 7 | Baseline por dia da semana | Média histórica do mesmo weekday | `vendas` | `valor_total`, `created_at` | média de (1) sobre as últimas N ocorrências do weekday | Precisa ≥4 ocorrências; dias sem venda ≠ dias fechados (não distinguível hoje) |
| 8 | Curva horária | Distribuição de vendas por hora | `vendas` | `created_at`, `valor_total` | histograma por hora local (padrão em `gestao/+page.svelte:95-130`) | Hora local deve ser America/Sao_Paulo no engine, não do browser |
| 9 | Top produtos por quantidade | Ranking por unidades | `vendas_itens` | `id_produto`, `nome_produto_na_venda`, `quantidade` | `Σ quantidade` agrupado por produto | Itens sem `id_produto` agrupam por nome; renomear produto quebra série (usar `id_produto` como chave primária do agrupamento) |
| 10 | Top produtos por receita | Ranking por R$ | `vendas_itens` | + `preco_unitario_na_venda` | `Σ qtd × preco_unitario_na_venda` | Usar **sempre** o preço snapshot (modo caixa dos relatórios usa preço atual — não copiar: `relatorios:519` vs `:1056`) |
| 11 | Receita por categoria | R$ por categoria | `vendas_itens`, `produtos`, `categorias` | `id_produto`, `id_categoria` | join item→produto→categoria | Categoria é a atual, não a da época da venda |
| 12 | Vendas diárias por produto | Série para detectar queda/pico | `vendas_itens`, `vendas` | `quantidade`, `created_at` (via `id_venda`) | `Σ quantidade` por produto por dia | `vendas_itens` não tem timestamp próprio — sempre join com `vendas` |
| 13 | Preço médio praticado por produto | Preço efetivo (com variação) | `vendas_itens` | `preco_unitario_na_venda`, `quantidade` | média ponderada por qtd | Não captura desconto de cupom (que fica em `vendas.valor_desconto`, não no item) |
| 14 | Descontos | Total e % do bruto | `vendas` | `valor_desconto` | `Σ valor_desconto`; `/ bruto` | Desconto de comanda também existe em `comandas.desconto` (add-on mesas) |
| 15 | Mix por tipo de pedido | Balcão vs delivery vs mesa | `vendas` | `tipo_pedido`, `valor_total` | share por `tipo_pedido` | |
| 16 | Taxa de entrega | R$ de entrega | `vendas` | `taxa_entrega`, `tipo_pedido` | `Σ taxa_entrega where tipo_pedido='delivery'` (`relatorios:413`) | |
| 17 | Comissões de plataforma | Custo iFood etc. e % da receita | `vendas_taxas_plataforma` | `valor_taxa`, `plataforma_id` | `calculatePlatformFees` (`caixa.js:191`) | Só o que o usuário configurou; snapshot confiável |
| 18 | Despesas do período | Total e por categoria | `expenses` | `amount`, `category`, `date` | `Σ amount` | Dado esparso — muitos usuários não lançam; ausência ≠ zero custo |
| 19 | Resultado operacional aproximado | Receita − despesas − comissões | `vendas`, `expenses`, `vendas_taxas_plataforma` | acima | `calculateRevenue` (`caixa.js:175`) | **Não é lucro**: sem CMV/custo de produto. Nomear com honestidade |
| 20 | Fiado emitido no período | Novo crédito concedido | `vendas`, `vendas_pagamentos` | `forma_pagamento`, `valor_total`, `valor` | `Σ` vendas fiado + linhas fiado | Reconstruível do histórico ✔ |
| 21 | Saldo total de fiado em aberto | Exposição atual | `pessoas` | `saldo_fiado` | `Σ saldo_fiado where > 0` | **Snapshot-only**: sem série histórica até o engine acumular snapshots |
| 22 | Top devedores de fiado | Clientes com maior saldo | `pessoas` | `nome`, `saldo_fiado` | order by desc, limit N | idem |
| 23 | Diferença de fechamento de caixa | Contado − esperado, por fechamento | `caixa_fechamentos` | `diferenca`, `data_fechamento`, `valor_esperado_em_gaveta` | série pronta no banco | Depende do operador contar a gaveta; caixas antigos podem não ter fechamento registrado |
| 24 | Sangria / suprimento | Movimentações por caixa/dia | `caixa_movimentacoes` | `tipo`, `valor`, `created_at` | `calculateMovementSummary` (`caixa.js:164`) | Suprimento inclui recebimento de fiado (semântica dupla) |
| 25 | Duração do caixa | Horas aberto; caixa esquecido | `caixas` | `data_abertura`, `data_fechamento` | `fechamento − abertura`; aberto se NULL | Alerta de >10h já existe no dashboard (`gestao/+page.svelte:142-145`) |
| 26 | Cobertura de estoque (dias até ruptura) | `estoque_atual / consumo médio diário` | `produtos`, `vendas_itens`, `vendas` | `estoque_atual`, `controlar_estoque`, `quantidade` | consumo médio dos últimos N dias com venda; `estoque / consumo` | Só para `controlar_estoque=true`; entradas de compra invisíveis (saldo pode subir sem explicação); estoque compartilhado por categoria precisa da mesma conta em `categorias` |
| 27 | Produtos zerados/negativos com demanda | Ruptura efetiva | `produtos`, `vendas_itens` | `estoque_atual`, consumo | `estoque_atual <= 0` e consumo médio > 0 | idem |

Métricas **não** calculáveis hoje (ver §4): margem/lucro real por produto, CMV, tempo de preparo
de pedido, evolução histórica do saldo de fiado, taxa de cancelamento de vendas, "novos clientes"
(depende de `pessoas.created_at`, não confirmado no código — validar no banco).

---

## 3. Sinais detectáveis com os dados atuais

Formato: definição / cálculo / threshold inicial / amostra mínima. Thresholds são chutes
calibráveis — devem viver em um único módulo de configuração, não espalhados. Todos os sinais
devem ser suprimidos quando a amostra mínima não existe (empresa nova ou sem o dado).

Regra transversal para empresas que fecham em certos dias: antes de qualquer comparação com
baseline de weekday, classificar o dia como "provável dia fechado" se ≥50% das últimas N
ocorrências daquele weekday tiveram 0 vendas — nesse caso não disparar sinais de queda.

### Receita e volume

1. **`REVENUE_BELOW_WEEKDAY_AVG`** — faturamento do dia significativamente abaixo da média do
   mesmo dia da semana. Cálculo: `receita_dia` vs média das últimas 4–8 ocorrências do weekday
   (excluindo dias com 0 vendas). Threshold: queda ≥15%. Amostra mínima: 4 ocorrências com venda.
2. **`REVENUE_ABOVE_WEEKDAY_AVG`** — espelho positivo (recorde/dia forte). Threshold: alta ≥20%.
   Amostra mínima: 4. Sinais positivos importam para engajamento — não construir só alarmes.
3. **`SALES_COUNT_DOWN_TICKET_STABLE`** — qtd de vendas caiu com ticket estável (problema é
   fluxo, não preço). Cálculo: decompor variação de receita em Δqtd × Δticket. Threshold:
   qtd ≥15% abaixo do baseline e |Δticket| <5%. Amostra: 4 weekdays.
4. **`AVG_TICKET_DOWN`** — ticket médio caiu com volume estável (o exemplo da tese: "vendas
   iguais, ticket −12%"). Threshold: ticket ≥10% abaixo da média das últimas 4 semanas do mesmo
   weekday e |Δqtd| <10%. Amostra: 4.
5. **`NO_SALES_STREAK`** — empresa que vendia regularmente ficou N dias sem nenhuma venda.
   Cálculo: dias consecutivos com 0 vendas vs frequência histórica (ex.: vendeu em ≥80% dos
   últimos 28 dias). Threshold: 2 dias úteis do padrão dela. Amostra: 14 dias de histórico.
   Cuidado: pode ser férias/fechamento — tom de pergunta, não de alarme.

### Produtos

6. **`PRODUCT_SALES_DROP`** — produto relevante vendendo bem abaixo do normal. Cálculo: qtd do
   produto no dia/semana vs média das últimas 4 semanas (mesma janela). Elegibilidade: produto no
   top 10 de receita dos últimos 30 dias (evita ruído de cauda longa). Threshold: queda ≥30%.
   Amostra: produto vendido em ≥8 dos últimos 28 dias. Chave por `id_produto` (nome muda).
7. **`PRODUCT_SALES_SPIKE`** — espelho positivo. Threshold: alta ≥50%. Mesma elegibilidade.
8. **`TOP_PRODUCT_CONCENTRATION`** — 1 produto com >50% da receita de 30 dias (risco de
   dependência — heurística já sugerida no prompt do assistente,
   `api/chat/assistant/+server.js:259`). Amostra: ≥50 vendas em 30 dias.
9. **`PRODUCT_EXPLAINS_REVENUE_DROP`** — sinal composto: quando (1) dispara, calcular quanto da
   queda em R$ é atribuível aos top produtos em queda (ex.: "o X-Bacon explica 60% da queda").
   Puramente aritmético: `Δreceita_produto / Δreceita_total`. Só emitir se atribuição ≥30%.

### Estoque

10. **`STOCK_COVERAGE_LOW`** (proposto originalmente como `LOW_STOCK_RUNOUT_PREDICTED`; renomeado em code review 2026-07-10 porque o cálculo é cobertura ao ritmo médio, não previsão de ruptura) — `estoque_atual / consumo_medio_diario ≤ 2 dias`.
    Só para `controlar_estoque=true` (ou categoria com compartilhado). Amostra: consumo em ≥7
    dos últimos 14 dias. Limitação honesta: cobertura restrita a quem usa controle de estoque.
11. **`STOCK_ZERO_WITH_DEMAND`** — produto zerado/negativo que vendeu na última semana.
    Threshold: `estoque_atual ≤ 0` e consumo ≥1/dia. Amostra: 7 dias.

### Fiado

12. **`FIADO_ISSUED_SHARE_HIGH`** — fiado emitido ≥15% do bruto dos últimos 30 dias (benchmark
    que o prompt do assistente já usa, `assistant/+server.js:255`). Amostra: ≥20 vendas em 30d.
13. **`FIADO_BALANCE_GROWTH`** — saldo total de fiado crescendo (o exemplo "fiado +22% em 30
    dias"). **Só possível depois que os snapshots diários acumularem ≥30 dias** — o saldo
    histórico não é reconstruível hoje (§1.5). V1: emitir versão baseada em *fiado emitido vs
    quitado no caixa* não é confiável (quitação sem trilha própria); usar snapshots forward.
    Threshold: +20% em 30 dias com saldo ≥ R$ 200. Amostra: 30 snapshots.

### Caixa

14. **`CASH_DIFFERENCE_RECURRING`** — diferença de fechamento ≠ 0 com frequência. Cálculo: dos
    últimos 10 fechamentos em `caixa_fechamentos`, quantos têm `|diferenca| > R$ 5`. Threshold:
    ≥4 de 10. Amostra: 5 fechamentos. Dado já existe pronto no banco (§1.4).
15. **`CASH_DIFFERENCE_LARGE`** — diferença única grande: `|diferenca| ≥ max(R$ 50, 5% do
    total_geral do caixa)`. Amostra: 1 (sinal pontual).
16. **`CAIXA_LEFT_OPEN`** — caixa aberto há mais de 16h (o dashboard já alerta com 10h em
    sessão; o engine pode ser mais conservador). Amostra: 1.

### Padrões e mix

17. **`PAYMENT_MIX_SHIFT`** — share de uma forma (ex.: PIX) deslocou ≥10 pontos percentuais vs
    média das 4 semanas anteriores (ex.: "PIX passou a representar 63%"). Amostra: ≥30 vendas
    em cada janela comparada. Informativo, baixa severidade.
18. **`PEAK_HOURS_PATTERN`** — informativo, 1x/mês: janelas de 2h com maior receita ("seu
    movimento aumenta entre 19h e 21h"). Cálculo: curva horária de 28 dias em
    America/Sao_Paulo. Amostra: ≥100 vendas em 28 dias.

Sinais viáveis mas de menor prioridade (deixar catalogado, não implementar na V1):
`DISCOUNT_SHARE_UP`, `PLATFORM_FEE_SHARE_HIGH`, `DELIVERY_SHARE_SHIFT`,
`EXPENSES_NOT_LOGGED` (higiene: vendas > 0 e 0 despesas em 30d — o lucro mostrado está
superestimado), `EXPENSE_SPIKE` (frágil: despesas esparsas geram falso positivo).

### Onde a tese precisa de ajuste

- **"Fiado cresceu 22% nos últimos 30 dias"** — não computável retroativamente hoje (sem ledger).
  Vira verdade ~30 dias depois do engine entrar no ar, via snapshots. Alternativa dia-1: reportar
  fiado *emitido* e saldo *atual*, sem taxa de crescimento.
- **"Estoque pode acabar amanhã"** — só para produtos com `controlar_estoque=true`. Parcela
  relevante dos usuários não usa controle de estoque; o sinal terá cobertura parcial e o produto
  pode usar isso como nudge ("ative o controle de estoque para receber este alerta").
- **Margem/lucro real** — impossível sem custo de produto (§4). Qualquer "lucro" da V1 é
  resultado operacional aproximado e deve ser rotulado assim.
- Todos os sinais de baseline precisam de ≥4 semanas de histórico. Empresas em trial (o público
  dos crons de onboarding) não terão baseline — o engine precisa de um modo degradado com sinais
  absolutos/higiene (caixa aberto, fiado alto, estoque zerado, recorde absoluto) para gerar valor
  no dia 1.

---

## 4. Lacunas de dados

| Severidade | Lacuna | Evidência | Impacto | Caminho (fora do escopo V1, exceto onde indicado) |
|---|---|---|---|---|
| **CRITICAL** | Sem custo de produto (`preco_custo`) | `gestao/produtos/+page.svelte:55-66` sem campo de custo | Margem real, CMV e lucro por produto impossíveis. **Não aproximar silenciosamente** — usar "resultado operacional" com rótulo honesto | Coluna `preco_custo` nullable + UI de cadastro; enquanto NULL, sinais de margem ficam mudos |
| **CRITICAL** | Sem timezone canônico; fronteira de dia inconsistente (local vs UTC) | `relatorios:723-724` vs `:559,1015`; nenhuma coluna de timezone | Toda métrica diária depende de "que dia é". Baselines erradas perto da meia-noite | **Resolver na V1 dentro do engine**: fixar `America/Sao_Paulo` via `Intl` (Brasil não tem DST desde 2019; empresas fora desse fuso ficam com corte deslocado — tradeoff aceito e documentado) |
| **HIGH** | Hard delete de vendas | `gestao/+page.svelte:189` etc. (§1.1) | Snapshots divergem do recálculo; sem métrica de cancelamento; auditoria impossível | V1 mitiga com janela de recompute (§6). Solução real: soft delete (`cancelada_em`) — mudança de produto, não do engine |
| **HIGH** | Fiado sem ledger de pagamentos | §1.5; RPC `fiado_registrar_pagamento` só muta saldo | Evolução do saldo não reconstruível; inadimplência/aging impossível | Snapshots diários resolvem a série total. Aging por cliente exigiria tabela de lançamentos |
| **HIGH** | Estoque sem histórico de movimentações nem `estoque_minimo` | §1.2; `gestao/+page.svelte:19,150` placeholder | Cobertura de estoque só por proxy de vendas; entradas de compra invisíveis; sem limiar por produto | Proxy de consumo é aceitável na V1; `estoque_minimo` é coluna barata se o sinal engajar |
| **MEDIUM** | `expenses` esparsa e com janela inconsistente no app | §1.3; assistente mistura 30d rolling com mês corrente (§5) | Sinais de despesa geram falso positivo; "lucro" superestimado | Sinal de higiene `EXPENSES_NOT_LOGGED` + rótulos honestos |
| **MEDIUM** | Pedidos sem timestamps de transição de status | §1.6 | Tempo de preparo/cozinha não calculável | Colunas `preparando_em`/`pronto_em` se a métrica for desejada |
| **MEDIUM** | Sem central de notificação in-app | Investigação: só toasts efêmeros (`src/lib/stores/ui.js`), email (`email.js`), WhatsApp (`whatsapp.js`) | Não há onde o usuário *ver* os insights | **Parte do escopo V1**: a tabela `business_signals` lida via RLS é a fonte de um feed simples |
| **LOW** | `pessoas.created_at` não confirmado | Nenhum select usa | Métrica "novos clientes" bloqueada até validar no banco | Checar no schema real; provavelmente existe |
| **LOW** | DDL base não versionada; tipos de `id` divergentes entre migrations | `offline_sales...:113` (`::integer`) vs `zelomenu_publication_schema...:13` (`bigint`) | Risco em FKs novas das tabelas do engine | Validar tipos no banco antes da migration da V1; considerar snapshot de schema (já é finding P2 do CODE_REVIEW) |

---

## 5. Avaliação do assistente atual (`src/routes/api/chat/assistant/+server.js`)

### O que ele busca e como monta contexto

`buildBusinessContext(userId)` (`:9-134`) roda **a cada mensagem** do usuário, com `supabaseAdmin`
escopado por `eq('id_usuario', userId)`:

- `empresa_perfil` (nome, contato) + catálogo de 40 produtos (`:18-21`);
- vendas dos últimos 30 dias — **duas vezes** (`:24-35`: uma query para valores, outra idêntica
  só para ids);
- `vendas_itens` via `.in('id_venda', ids)` limitado a 500 ids (`:40-44`);
- `expenses` do mês corrente (`:61-65`);
- último caixa (`:68-74`);
- top 5 devedores de fiado (`:77-83`).

`buildSystemPrompt` (`:136-284`) pré-calcula métricas no prompt (receita, ticket médio, % de
despesas, margem, método dominante, fiado total, `:140-163`) e injeta benchmarks de food service
hardcoded + blocos de foco por `context_type`.

### O que ele calcula vs o que delega ao modelo

Calculado no backend (bom): totais, ticket médio, % despesas/receita, "lucro estimado", método
dominante, top produtos. Delegado ao modelo (arriscado): **toda comparação e julgamento** —
"o ticket parece adequado?", "a quantidade parece consistente com o período?" (`:171`), avaliação
contra benchmarks. O modelo não recebe nenhuma baseline histórica (não sabe quanto a empresa
vendia semana passada), então qualquer afirmação de tendência que ele fizer é invenção.

### Problemas concretos encontrados

1. **Janelas mistas**: `receita_total` é 30 dias rolling; `despesas` é mês-calendário corrente
   (em UTC, `:13-15`); `lucro_estimado = receita − despesas` subtrai janelas diferentes (`:126`).
   No dia 5 do mês, o "lucro" compara 30 dias de receita com 5 dias de despesa.
2. **Fiado dentro da "receita"**: `receita_total` soma `valor_total` de tudo, incluindo vendas
   fiado (`:87`) — divergente da convenção dos relatórios (`totalGeral` exclui fiado). O mesmo
   número tem dois valores dependendo da tela.
3. **Truncamentos silenciosos**: sem paginação, o select de vendas fica no default de 1000 rows
   do Supabase; o lookup de itens corta em 500 vendas (`:40`). Empresa movimentada tem contexto
   subcontado sem aviso.
4. **Subusuário quebrado**: usa `user.id` direto sem `resolveOwnerUserId`
   (`src/lib/server/accessControl.js:82-93`). Um subusuário que abrir o chat recebe contexto
   vazio (as vendas estão no id do owner).
5. **Fronteira temporal em UTC do servidor** para "mês atual" e "30 dias" — o mesmo problema de
   timezone do resto do app.
6. **Custo**: `gpt-4.1` a $2/M input + $8/M output (`:434`). O prompt de sistema (contexto JSON +
   benchmarks + regras) roda ~2-4k tokens **por mensagem**, sem cache. 6 queries Supabase por
   mensagem. Rate limit de 60 msg/h/usuário (`:299-305`) limita o estouro, mas o custo é linear
   por mensagem, não por sessão.
7. **Escala**: aceitável para chat (interativo, volume baixo). Inadequado como base do engine
   proativo — recomputar contexto por request é o oposto de snapshot + sinais.
8. **Segurança/multi-tenancy**: o escopo por `eq(user.id)` está correto (fora o bug de
   subusuário). As defesas anti-injection são só prompt (`:263-284`). A tool
   `send_whatsapp_summary` (`:342-360`) envia para o telefone do perfil — superfície pequena,
   mas é o modelo decidindo disparar comunicação externa; o engine novo não deve dar tools de
   side-effect ao LLM.
9. **Hallucination residual**: os números pré-calculados reduzem erro aritmético (a instrução
   "use exatamente estes valores" ajuda, `:155`), mas o modelo é convidado a julgar adequação
   sem baseline e a citar benchmarks genéricos como se fossem da empresa. É exatamente o
   anti-padrão que a tese quer eliminar — a tese está certa nesse ponto.

Veredito: o assistente é um bom chat reativo e `buildBusinessContext` prova que a agregação por
empresa é viável — mas ele **não** é a fundação do engine. O engine inverte o fluxo: calcula 1x
por dia, persiste, e o LLM só narra sinais já prontos.

---

## 6. Arquitetura proposta — Zelo Intelligence Engine V1

### Avaliação dos nomes/schemas sugeridos

`daily_business_snapshots` e `business_signals` estão **conceitualmente corretos** (snapshot
diário + fatos detectados). Ajustes propostos:

- Nomear `business_daily_snapshots` e `business_signals` (prefixo comum `business_` agrupa no
  schema; evitar `daily_*` como prefixo porque pode haver janelas semanais depois). Evitar
  qualquer colisão com a view `v_daily_metrics` existente em produção (§ nota metodológica).
- Snapshot com **JSONB para o corpo das métricas + poucas colunas promovidas** para as queries
  dos detectores (receita, qtd, ticket, fiado_saldo). Não criar 30 colunas numéricas: o conjunto
  de métricas vai evoluir e migrations aqui não são versionadas com disciplina (§ nota).
- Sinais precisam de `dedupe_key` (ex.: `PRODUCT_SALES_DROP:produto_123`) para idempotência por
  dia, seguindo o padrão `UNIQUE` de `email_onboarding_logs` (`onboarding-emails/+server.js:96-110`).

### Schema proposto (2 tabelas, validar tipos no banco real antes)

```sql
create table business_daily_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null,                -- owner (mesmo tenant de empresa_perfil.user_id)
  snapshot_date date not null,          -- dia local America/Sao_Paulo
  metrics jsonb not null,               -- corpo completo (§2), versionado por engine_version
  receita_bruta numeric not null default 0,   -- promovidas p/ queries dos detectores
  receita_realizada numeric not null default 0,
  qtd_vendas integer not null default 0,
  ticket_medio numeric,
  fiado_saldo_total numeric,            -- Σ pessoas.saldo_fiado no momento do cálculo
  engine_version text not null,
  computed_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create table business_signals (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  signal_date date not null,
  type text not null,                   -- REVENUE_BELOW_WEEKDAY_AVG, ...
  dedupe_key text not null,             -- type + entidade (produto/caixa) quando aplicável
  severity text not null,               -- info | attention | critical
  score numeric not null,               -- ranking determinístico
  evidence jsonb not null,              -- números, baseline, janela, amostra — TUDO que o LLM pode citar
  narrative text,                       -- preenchido pelo passo LLM (ou template fallback)
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, signal_date, dedupe_key)
);
```

RLS: leitura owner-scoped via `get_owner_user_id(auth.uid())` (mesmo padrão das tabelas
operacionais, `docs/data/SCHEMA_RLS.md`); escrita só service role (cron). Assim o feed in-app é
uma leitura direta do client com anon key — padrão dominante do app (§5 do relatório de infra).

### Componentes

1. **Cron `GET /api/cron/intelligence-daily`** — clone do esqueleto de
   `onboarding-emails/+server.js:47-54`: Bearer `CRON_SECRET` com `safeEqualString`
   (`src/lib/server/safeEqual.js:7-13`), `supabaseAdmin`, entrada em `vercel.json` num horário
   livre (sugestão: `0 7 * * *` UTC = 04:00 BRT, cobre fechamentos de madrugada e não colide com
   05:30/06:00/07:00 UTC já ocupados). Calcula o dia **D-1 local**.
2. **Universo de empresas**: `subscriptions` ativas/trial (mesmo filtro batch de
   `onboarding-emails:79-85`), com "gate barato" — pular empresa sem nenhuma venda nos últimos
   7 dias (1 query `.in()` agregada) para não desperdiçar compute em contas mortas.
3. **`src/lib/intelligence/metrics.js`** — módulo **puro** (arrays in, números out), no estilo e
   com a disciplina de testes de `src/lib/finance/caixa.js`. Reusar `calculatePaymentSummary`,
   `calculatePlatformFees`, `money` em vez de reimplementar. Toda fronteira de dia via helper
   `src/lib/intelligence/tz.js` com `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`
   (sem dependência nova).
4. **`src/lib/intelligence/signals.js`** — detectores puros: `(snapshotsHistóricos, métricasDoDia,
   dadosAuxiliares) → Signal[]`. Thresholds e amostras mínimas centralizados em um objeto de
   configuração único. Cada sinal carrega `evidence` completo (valor, baseline, janela, n da
   amostra) — o LLM nunca vê dados brutos.
5. **Ranking determinístico** — `score = pesoSeveridade × magnitudeNormalizada`, cap de N sinais
   por empresa/dia (sugestão: 3). Sem LLM aqui.
6. **Narrativa (LLM)** — 1 chamada por empresa/dia, **apenas se houver sinais**, recebendo
   somente o JSON dos sinais + nome do negócio. Saída: 1 parágrafo por sinal + 1 conexão entre
   sinais quando existir. Instrução dura: proibido citar números fora de `evidence`. Modelo
   barato (`gpt-4.1-mini` ou equivalente — o trabalho é redação, não raciocínio); logar custo em
   `ai_usage_logs` como o chat já faz (`assistant/+server.js:435-440`). **Fallback obrigatório**:
   template determinístico por tipo de sinal quando a chamada falhar — o pipeline nunca depende
   do LLM para completar.
7. **Entrega** — V1: feed in-app (client lê `business_signals` via RLS; badge de não-lidos via
   `read_at`). WhatsApp opt-in como fase 1.1, reaproveitando `sendWhatsAppText`
   (`src/lib/server/whatsapp.js`) e o padrão de idempotência de envio dos crons de onboarding.
   Sem email na V1.
8. **Gating por plano** — decidir com produto se Intelligence é core ou add-on. O molde técnico
   existe pronto: flag em `subscriptions` + entrada em `pricing.js` + helper `hasXxxAccess` em
   `guards.js` (padrão `has_zelo_menu`, `zelomenu_entitlement_and_slug_2026_06_23.sql`).

### Decisões que absorvem as restrições levantadas

- **Vendas excluídas (hard delete)**: recomputar sempre os **últimos 3 dias** a cada execução
  (upsert por `unique(user_id, snapshot_date)`). Deletes/chegadas tardias dentro da janela são
  absorvidos; fora dela, aceita-se drift (documentar como tradeoff em [[TRADEOFFS]]).
- **Vendas offline sincronizadas depois**: mesmo mecanismo — `created_at` preservado cai no dia
  correto se a sincronização ocorrer dentro da janela de 3 dias; o cenário dominante (sincroniza
  no mesmo dia) é coberto.
- **Timezone**: o engine é a primeira superfície com fuso canônico `America/Sao_Paulo`. Não
  herda a fronteira do client. Divergência com os relatórios (fuso do dispositivo) é conhecida e
  aceitável; a longo prazo os relatórios deveriam convergir para o mesmo helper.
- **Empresas com poucos dados / trial**: cada detector declara amostra mínima; sem baseline, só
  sinais absolutos/higiene rodam. O snapshot é gravado desde o dia 1 (constrói a baseline que os
  sinais de tendência vão consumir semanas depois — inclusive `FIADO_BALANCE_GROWTH`).
- **Empresas que ficam dias sem vender**: heurística de "dia fechado" (§3) + `NO_SALES_STREAK`
  calibrado pela frequência histórica da própria empresa, nunca por calendário fixo.
- **Custo Supabase**: ~8–12 queries por empresa/dia (com `.in()` em batch e paginação de 1000),
  1x/dia — ordens de magnitude abaixo do chat atual. Com o gate de atividade, o custo escala com
  empresas *ativas*, não cadastradas. Se o volume de empresas crescer além do timeout do cron
  (300s default na Vercel), particionar por hash de `user_id` em 2 execuções — não construir fila
  distribuída preventivamente.
- **Custo OpenAI**: ~600–900 tokens in / ~250 out por empresa/dia com sinais. Com modelo mini,
  centavos/mês por empresa ativa. Empresa sem sinal = zero chamada.
- **Falha por empresa isolada**: try/catch por empresa no loop (padrão dos crons de onboarding);
  uma empresa com dado podre não derruba o batch; contadores no JSON de resposta
  (`expire-trials/+server.js:77-87`).

## 7. Pipeline completo (responsabilidades)

```
runDailyIntelligence(date = ontem em America/Sao_Paulo)          [cron handler]
  └─ para cada empresa ativa (batch, isolamento de falha):
     1. fetchCompanyData(userId, janelaDias)                     [I/O — Supabase]
        vendas + itens + pagamentos + taxas (paginado, 3 dias p/ recompute
        + leitura dos snapshots das últimas 8 semanas), pessoas.saldo_fiado,
        produtos com controle de estoque, caixa_fechamentos recentes, expenses
     2. computeDailyMetrics(dados) → metrics                     [puro — §2]
     3. upsertSnapshots(userId, dias, metrics)                   [I/O — upsert 3 dias]
     4. detectSignals(snapshotHistory, metricsHoje, aux) → Signal[]  [puro — §3]
     5. rankSignals(signals) → top N com score                   [puro]
     6. persistSignals(userId, date, signals)                    [I/O — insert idempotente por dedupe_key]
     7. generateInsightNarrative(signals, perfil) → narrative    [LLM, opcional, com fallback template]
     8. updateSignalNarratives(...)                              [I/O]
```

Regras de fronteira: passos 2, 4 e 5 são funções puras com testes Vitest (mesma disciplina de
`tests/finance.caixaOps.test.js`); nenhum acesso a rede/banco dentro deles. O passo 7 recebe
apenas `evidence` — se ele for removido, o produto continua funcionando com templates.

## 8. O que NÃO construir na V1

- **Sem ML/forecasting** — médias por weekday e razões simples cobrem todos os sinais do §3.
- **Sem embeddings/vector DB** — não há problema de similaridade aqui.
- **Sem agentes autônomos / tools no LLM** — o LLM não consulta banco, não decide envio, não tem
  side-effects. Redige e só.
- **Sem tempo real** — nada de triggers/realtime por venda. 1 batch diário. (Único quase-tempo-real
  aceitável no futuro: alerta de estoque no fechamento de caixa — fora da V1.)
- **Sem arquitetura distribuída** — um cron Vercel serial com batching. Fila/worker só quando o
  timeout provar que precisa.
- **Sem recompute por request** — o feed lê `business_signals` pronto; não recalcular ao abrir a tela.
- **Sem backfill histórico longo** — começar snapshots do dia do deploy (recompute de 3 dias).
  Backfill de 90 dias de *métricas* (não de saldo de fiado, que é impossível) pode ser um script
  único posterior, se os sinais de baseline precisarem acelerar.
- **Sem central de notificação genérica** — o feed é do Intelligence; não projetar "sistema de
  notificações do app" agora.
- **Sem reescrever o assistente** — fase 2 natural: injetar os sinais do dia no contexto do chat
  (substituindo julgamentos soltos por fatos), mas fora da V1.
- **Sem novas dependências** — nada de lib de datas/cron/queue; `Intl` + padrões existentes bastam.

## 9. Riscos e pontos de atenção para quem implementar

1. Validar no banco real (CLI linkado já disponível): tipos de `produtos.id`/`vendas.id`
   (`integer` vs `bigint` divergem entre migrations, §4), existência de `pessoas.created_at`,
   definição de `fiado_registrar_pagamento` e da view `v_daily_metrics`.
2. Não copiar dos relatórios: o cálculo de top produtos do modo caixa usa preço *atual*
   (`relatorios:519`) — no engine, sempre `preco_unitario_na_venda`.
3. Decidir e fixar UMA definição de ticket médio (com ou sem fiado) e usar a mesma no feed e nos
   textos — hoje o app tem duas.
4. `expenses` usa `user_id`; todo o resto usa `id_usuario`. Fácil de errar em query batch.
5. O rate limit de `/api/*` em `hooks.server.js:67-89` é em memória por processo — irrelevante
   para o cron (1 chamada), mas lembrar ao criar endpoints de leitura do feed.
6. Registrar em [[TRADEOFFS]] os aceites: drift fora da janela de recompute, fuso fixo
   America/Sao_Paulo, cobertura parcial de estoque, "resultado operacional" ≠ lucro.
7. Atualizar [[CURRENT]] e `docs/data/SCHEMA_RLS.md` quando as tabelas novas forem criadas
   (migration em `.ai/migrations/`, RLS owner-scoped, grants mínimos — checklist igual ao de
   `zelomenu_publication_schema_2026_06_23.sql`).
