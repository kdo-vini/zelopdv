# Zelo Intelligence Engine V1 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar fase a fase. Passos usam checkboxes (`- [ ]`).
>
> Criado em 2026-07-10 a partir de [[zelo-intelligence-engine-discovery]] (ler antes — todas as
> decisões daqui derivam de lá). Veredito da review: **GO WITH RESTRICTIONS** — as restrições
> viraram requisitos deste plano (timezone canônico, janela de recompute, sem a palavra "lucro",
> modo degradado para empresa nova, validação do banco real antes da migration).

**Goal:** provar que o Zelo detecta fatos úteis automaticamente: um job diário calcula métricas determinísticas por empresa, persiste snapshots, detecta 11 sinais estruturados confiáveis e (fase final) gera narrativa em linguagem simples. Sem push/WhatsApp/email na V1.

**Architecture:** cron Vercel → endpoint SvelteKit server-side → fetchers Supabase (service role) → módulos puros de métricas/sinais/ranking (testáveis sem I/O) → upsert em `business_daily_snapshots` / insert idempotente em `business_signals` → narrativa LLM opcional com fallback em template.

**Tech Stack:** SvelteKit 2 (rotas server), Supabase (Postgres + RLS), Vercel Cron, Vitest, `openai@^6` (já instalado), `Intl` nativo para timezone (zero dependências novas).

## Global Constraints

- Fuso canônico do engine: `America/Sao_Paulo`. Nenhuma fronteira de dia vinda do client.
- Recompute obrigatório dos últimos **3 dias** a cada execução (absorve hard delete e vendas offline tardias).
- Proibido usar "lucro"/"margem" em qualquer copy ou nome de métrica — usar `resultado_operacional_aproximado` quando aplicável (não há custo de produto no schema).
- Toda comparação usa **sempre** `preco_unitario_na_venda` (snapshot), nunca `produtos.preco` atual.
- Ticket médio na V1 = `receita_bruta / qtd_vendas` (ticket **comercial**: venda fiada é venda; forma de recebimento é outra dimensão). *(Corrigido em code review 2026-07-10: a definição anterior, `receita_realizada / qtd`, fazia aumento de fiado parecer queda de ticket e contaminava `AVG_TICKET_DOWN`.)* Diverge de propósito do "ticket médio" de `/relatorios` (`relatorios/+page.svelte:393`), que é visão de caixa; `receita_realizada` continua existindo como métrica separada para essa dimensão.
- Dedup simples-vs-múltiplo obrigatória: nunca somar `vendas.valor_total` de venda com linhas em `vendas_pagamentos` (`src/lib/finance/caixa.js:120-121`).
- Paginação de 1000 em 1000 em `vendas`/`expenses` (padrão de `relatorios/+page.svelte:740-759`).
- `expenses` usa `user_id`; todo o resto usa `id_usuario`.
- Módulos puros (`tz.js`, `metrics.js`, `signals.js`, `ranking.js`) não importam `$env`, Supabase nem fazem I/O.
- Migrations em `.ai/migrations/`, RLS owner-scoped via `get_owner_user_id`, grants mínimos (checklist de `zelomenu_publication_schema_2026_06_23.sql`).
- LLM nunca é dependência do pipeline: falha de LLM ⇒ template determinístico.
- O LLM só pode citar números presentes em `evidence` — nada de dado bruto no prompt.

---

## 1. Sinais selecionados para a V1 (11)

Critérios aplicados: dado já existe, cálculo confiável, valor claro, baixo risco de má interpretação, baixo custo. Descartados da V1 (e por quê): `FIADO_BALANCE_GROWTH` (sem série histórica até snapshots acumularem 30 dias — reavaliar V1.1), `NO_SALES_STREAK` (alto risco de falso positivo férias/fechamento — precisa de tom e UX próprios), `PEAK_HOURS_PATTERN` (informativo mensal, baixa ação), `EXPENSE_SPIKE`/`EXPENSES_NOT_LOGGED` (dado esparso), `PRODUCT_EXPLAINS_REVENUE_DROP` (composto — V1.1, depende de `PRODUCT_SALES_DROP` estabilizar), `DELIVERY_SHARE_SHIFT`, `DISCOUNT_SHARE_UP`, `PLATFORM_FEE_SHARE_HIGH` (cauda; catalogados no discovery §3).

Campos comuns a todo `evidence` (além dos específicos): `{ window: {start, end, days}, sample_size, baseline_kind, computed_at, engine_version }`. Valores monetários em número (2 casas via `money()` de `src/lib/finance/caixa.js:23`), percentuais em fração (0.18 = 18%).

**Fórmula de confiança (padrão, usada por todos os sinais de baseline):**

```
confidence = sampleFactor × stabilityFactor
sampleFactor = min(1, n_baseline / n_alvo)          // n_alvo definido por sinal
stabilityFactor = 1 − min(0.5, cv)                  // cv = desvio-padrão/média da baseline
```

Sinais absolutos (sem baseline) usam `confidence` fixa documentada no sinal. Sinal só é emitido se `confidence ≥ 0.5`.

**Cooldown (padrão de implementação):** antes de inserir, consultar o último `business_signals` do mesmo `user_id` + mesmo prefixo de `dedupe_key` dentro da janela de cooldown; se existir, descartar (contabilizar como `suppressed_cooldown`).

---

### S1 — `REVENUE_BELOW_WEEKDAY_AVG`

| Campo | Valor |
|---|---|
| Descrição | Faturamento bruto do dia significativamente abaixo da média histórica do mesmo dia da semana. |
| Data source | `business_daily_snapshots` (dia atual + histórico do mesmo weekday, 8 semanas). Origem primária: `vendas.valor_total/created_at`. |
| Fórmula | `delta = (receita_dia − média) / média`, média sobre ocorrências do mesmo weekday com `receita > 0`. |
| Baseline | Média das últimas 8 ocorrências do mesmo weekday (mín. 4), excluindo dias com 0 vendas. |
| Minimum sample | 4 ocorrências com venda. **Heurística de dia fechado:** se ≥50% das ocorrências do weekday tiveram 0 vendas, não emitir. |
| Threshold | `delta ≤ −0.15`. |
| Confidence | Padrão, `n_alvo = 8`. |
| Evidence | `{ revenue_today, weekday, baseline_avg, baseline_values: number[], delta_pct, n_baseline }` |
| Dedup | `REVENUE_BELOW_WEEKDAY_AVG` (1 por dia — `unique(user_id, signal_date, dedupe_key)` já garante). |
| Cooldown | 3 dias (queda sustentada não vira spam diário). |
| Severity | `attention`; `critical` se `delta ≤ −0.30`. |
| Falsos positivos | Feriado/chuva (dia legitimamente fraco); empresa fechou mais cedo; venda grande atípica inflando a baseline (mitigado por cv na confiança); dia ainda em andamento — **por isso o engine só processa D-1 fechado, nunca o dia corrente**. |

### S2 — `REVENUE_ABOVE_WEEKDAY_AVG`

| Campo | Valor |
|---|---|
| Descrição | Dia forte: faturamento bem acima da média do mesmo weekday (sinal positivo, engajamento). |
| Data source | Idem S1. |
| Fórmula | Idem S1. |
| Baseline | Idem S1. |
| Minimum sample | Idem S1. |
| Threshold | `delta ≥ +0.20`. |
| Confidence | Padrão, `n_alvo = 8`. |
| Evidence | Idem S1 + `is_record: boolean` (maior valor da janela de 8 semanas). |
| Dedup | `REVENUE_ABOVE_WEEKDAY_AVG`. |
| Cooldown | 3 dias. |
| Severity | `info`. |
| Falsos positivos | Evento pontual (festa/encomenda); baseline deprimida por semanas fracas. Risco de interpretação é baixo (mensagem positiva). |

### S3 — `AVG_TICKET_DOWN`

| Campo | Valor |
|---|---|
| Descrição | Ticket médio caiu com volume de vendas estável — o problema é valor por cliente, não fluxo. |
| Data source | `business_daily_snapshots` (`ticket_medio`, `qtd_vendas` do dia + histórico do weekday). |
| Fórmula | `delta_ticket = (ticket_dia − média_ticket_weekday) / média`; `delta_qtd` análogo. |
| Baseline | Média de ticket e de qtd das últimas 8 ocorrências do weekday com venda. |
| Minimum sample | 4 ocorrências; `qtd_vendas ≥ 10` no dia (ticket com poucas vendas é ruído). |
| Threshold | `delta_ticket ≤ −0.10` **e** `|delta_qtd| < 0.10`. |
| Confidence | Padrão, `n_alvo = 8`, cv sobre a série de tickets. |
| Evidence | `{ ticket_today, ticket_baseline, delta_ticket_pct, qtd_today, qtd_baseline, delta_qtd_pct }` |
| Dedup | `AVG_TICKET_DOWN`. |
| Cooldown | 3 dias. |
| Severity | `attention`. |
| Falsos positivos | Mix do dia (dia de salgados vs dia de combos); promoção intencional; poucos cupons. Mitigação: piso de 10 vendas + narrativa em tom de observação, não de alarme. |

### S4 — `PRODUCT_SALES_DROP`

| Campo | Valor |
|---|---|
| Descrição | Produto relevante vendendo bem abaixo do padrão nas últimas semanas. |
| Data source | `business_daily_snapshots.metrics.por_produto` (últimos 35 dias). Origem: `vendas_itens.quantidade` join `vendas.created_at`, chave `id_produto`. |
| Fórmula | `qtd_7d` (janela D-7..D-1) vs `média das 4 janelas de 7 dias anteriores`; `delta = (qtd_7d − média)/média`. |
| Baseline | 4 blocos de 7 dias imediatamente anteriores. |
| Minimum sample | Elegibilidade: produto no top 10 de receita dos últimos 28 dias **e** vendido em ≥8 dos últimos 28 dias. |
| Threshold | `delta ≤ −0.30`. |
| Confidence | Padrão, `n_alvo = 4` (blocos), cv sobre os 4 blocos. |
| Evidence | `{ id_produto, nome_produto, qty_last7, baseline_avg_7d, delta_pct, revenue_share_28d, blocks: number[] }` |
| Dedup | `PRODUCT_SALES_DROP:<id_produto>`. |
| Cooldown | 7 dias por produto. |
| Severity | `attention`. |
| Falsos positivos | Produto sazonal; ficou fora de estoque (cruzar: se `STOCK_ZERO_WITH_DEMAND` ativo para o mesmo produto, suprimir este e deixar o de estoque falar); produto renomeado — **por isso a chave é `id_produto`, nunca nome**; item vendido sem `id_produto` (avulso) fica fora. |

### S5 — `TOP_PRODUCT_CONCENTRATION`

| Campo | Valor |
|---|---|
| Descrição | Um único produto concentra mais da metade da receita — risco de dependência. |
| Data source | `business_daily_snapshots.metrics.por_produto` agregado 30 dias. |
| Fórmula | `share = receita_produto_30d / receita_bruta_30d` do maior produto. |
| Baseline | Nenhuma (absoluto). |
| Minimum sample | ≥50 vendas nos 30 dias. |
| Threshold | `share > 0.50`. |
| Confidence | Fixa 0.9 (aritmética direta sobre janela grande). |
| Evidence | `{ id_produto, nome_produto, share_pct, revenue_product_30d, revenue_total_30d, qtd_vendas_30d }` |
| Dedup | `TOP_PRODUCT_CONCENTRATION:<id_produto>`. |
| Cooldown | 30 dias. |
| Severity | `info`. |
| Falsos positivos | Negócio mono-produto por design (açaí, pastel) — narrativa deve reconhecer isso ("se for intencional, ok — mas um plano B ajuda"). |

### S6 — `PAYMENT_MIX_SHIFT`

| Campo | Valor |
|---|---|
| Descrição | O share de uma forma de pagamento deslocou de forma relevante (ex.: "PIX passou a ser 63% das vendas"). |
| Data source | `business_daily_snapshots.metrics.mix_pagamentos` (7 dias recentes vs 28 anteriores). Origem: `calculatePaymentSummary` sobre `vendas`+`vendas_pagamentos`. |
| Fórmula | Para cada forma em `{pix, dinheiro, cartao (débito+crédito+legacy), fiado}`: `shift = share_7d − share_28d_anteriores` (pontos percentuais). |
| Baseline | Share da mesma forma nos 28 dias anteriores à janela de 7. |
| Minimum sample | ≥30 vendas em cada janela. |
| Threshold | `|shift| ≥ 0.10` (10 p.p.). Emitir só o maior shift do dia. |
| Confidence | Padrão com `n_alvo = 30` vendas na janela curta; cv não se aplica → `stabilityFactor = 1`. |
| Evidence | `{ forma, share_recent, share_previous, shift_pp, n_recent, n_previous }` |
| Dedup | `PAYMENT_MIX_SHIFT:<forma>`. |
| Cooldown | 14 dias por forma. |
| Severity | `info`. |
| Falsos positivos | Semana atípica (evento); maquininha quebrada (que na verdade é exatamente o que o dono quer saber). Baixo risco: sinal descritivo. |

### S7 — `FIADO_ISSUED_SHARE_HIGH`

| Campo | Valor |
|---|---|
| Descrição | Fiado emitido representa fatia perigosa do faturamento (benchmark que o app já usa: 15%, `api/chat/assistant/+server.js:255`). |
| Data source | `business_daily_snapshots` (`fiado_emitido`, `receita_bruta`) agregado 30 dias + `pessoas.saldo_fiado` atual (contexto no evidence). |
| Fórmula | `share = Σ fiado_emitido_30d / Σ receita_bruta_30d`. Fiado emitido = vendas `forma_pagamento='fiado'` (valor_total) + linhas fiado de `vendas_pagamentos`. |
| Baseline | Nenhuma (absoluto contra benchmark). |
| Minimum sample | ≥20 vendas nos 30 dias e `fiado_emitido_30d ≥ R$ 100`. |
| Threshold | `share ≥ 0.15`. |
| Confidence | Fixa 0.9. |
| Evidence | `{ fiado_issued_30d, revenue_30d, share_pct, saldo_fiado_total_atual, top_devedores: [{nome, saldo}] (máx 3) }` |
| Dedup | `FIADO_ISSUED_SHARE_HIGH`. |
| Cooldown | 7 dias. |
| Severity | `attention`; `critical` se `share ≥ 0.30`. |
| Falsos positivos | Negócio B2B de marmita com acerto mensal combinado (fiado intencional). Narrativa deve oferecer o contexto, não acusar. Nomes de devedores no evidence: ok — o feed é owner-scoped por RLS e o dado já é visível no fichário. |

### S8 — `CASH_DIFFERENCE_RECURRING`

| Campo | Valor |
|---|---|
| Descrição | Diferença de fechamento de caixa acontecendo com frequência — dinheiro sumindo ou processo quebrado. |
| Data source | `caixa_fechamentos` direto (`diferenca`, `data_fechamento`, `total_geral`) — série já existe pronta (discovery §1.4). Não passa por snapshot. |
| Fórmula | Dos últimos 10 fechamentos: `n_diff = count(|diferenca| > 5)`. |
| Baseline | Nenhuma (contagem absoluta). |
| Minimum sample | ≥5 fechamentos registrados. |
| Threshold | `n_diff ≥ 4`. |
| Confidence | `min(1, n_fechamentos/10)` (0.5 com 5 fechamentos, 1.0 com 10). |
| Evidence | `{ n_closures_checked, n_with_difference, sum_differences, avg_difference, worst: {date, diferenca}, last_dates: string[] }` |
| Dedup | `CASH_DIFFERENCE_RECURRING`. |
| Cooldown | 7 dias. |
| Severity | `critical`. |
| Falsos positivos | Operador que arredonda contagem; fundo de troco não padronizado. É o sinal mais sensível (implica dinheiro/pessoas) — narrativa factual, sem sugerir desonestidade, apontar processo. |

### S9 — `STOCK_COVERAGE_LOW`

> Renomeado em code review 2026-07-10 (era `LOW_STOCK_RUNOUT_PREDICTED`): o algoritmo é
> `estoque / consumo médio de 14 dias corridos` — cobertura ao ritmo médio recente, sem
> componente weekday e sem forecast. "Runout predicted" prometia previsão que a matemática
> não sustenta. O fato suportado é "o estoque representa ~N dias do ritmo médio recente";
> nenhuma camada futura (narrativa/UI) deve traduzir como "vai acabar amanhã".

| Campo | Valor |
|---|---|
| Descrição | Pelo ritmo de venda, o estoque do produto acaba em ≤2 dias ("sua Coca 2L acaba amanhã"). |
| Data source | `produtos.estoque_atual/controlar_estoque` (leitura no momento do run) + consumo de `business_daily_snapshots.metrics.por_produto` (14 dias). |
| Fórmula | `consumo_diario = média de quantidade nos dias com venda dos últimos 14`; `coverage_days = estoque_atual / consumo_diario`. |
| Baseline | Consumo médio próprio (14 dias). |
| Minimum sample | Produto com `controlar_estoque = true`, venda em ≥7 dos últimos 14 dias, `consumo_diario ≥ 1`. |
| Threshold | `0 < coverage_days ≤ 2`. |
| Confidence | Padrão, `n_alvo = 10` dias com venda, cv sobre consumo diário. |
| Evidence | `{ id_produto, nome_produto, estoque_atual, consumo_diario_medio, coverage_days, dias_com_venda_14d }` |
| Dedup | `STOCK_COVERAGE_LOW:<id_produto>`. |
| Cooldown | 3 dias por produto. |
| Severity | `attention`. |
| Falsos positivos | Reposição já encomendada (invisível — não há histórico de entradas); estoque compartilhado por categoria (V1 cobre só produto individual; compartilhado fica para V1.1); consumo irregular (mitigado por cv). Cobertura restrita a quem usa controle de estoque — é nudge de adoção, documentado no discovery §3. |

### S10 — `STOCK_ZERO_WITH_DEMAND`

| Campo | Valor |
|---|---|
| Descrição | Produto com demanda comprovada está zerado/negativo — venda sendo perdida agora. |
| Data source | Idem S9. |
| Fórmula | `estoque_atual ≤ 0` e `consumo_diario ≥ 1` (7 dias). |
| Baseline | Consumo 7 dias. |
| Minimum sample | `controlar_estoque = true`, venda em ≥3 dos últimos 7 dias. |
| Threshold | Booleano (condições acima). |
| Confidence | Fixa 0.9 (estado observado, não previsão). |
| Evidence | `{ id_produto, nome_produto, estoque_atual, consumo_diario_medio_7d, dias_com_venda_7d }` |
| Dedup | `STOCK_ZERO_WITH_DEMAND:<id_produto>`. |
| Cooldown | 3 dias por produto. |
| Severity | `critical`. |
| Falsos positivos | Estoque negativo por erro de cadastro/oversell offline (o número em si já é informação útil); produto descontinuado de propósito (cooldown limita o ruído a 2 avisos/semana). Suprime S4 do mesmo produto (ver S4). |

### S11 — `CAIXA_LEFT_OPEN`

| Campo | Valor |
|---|---|
| Descrição | Caixa aberto há tempo demais — fechamento esquecido compromete o controle de gaveta. |
| Data source | `caixas` (`data_fechamento IS NULL`, `data_abertura`) no momento do run. |
| Fórmula | `horas_aberto = now − data_abertura`. |
| Baseline | Nenhuma (absoluto). |
| Minimum sample | 1 (funciona no dia 1 — sinal do modo degradado para empresa nova, junto com S7/S10). |
| Threshold | `horas_aberto ≥ 16` (dashboard já alerta 10h em sessão, `gestao/+page.svelte:142-145`; o engine é mais conservador). |
| Confidence | Fixa 1.0. |
| Evidence | `{ id_caixa, data_abertura, horas_aberto, valor_inicial }` |
| Dedup | `CAIXA_LEFT_OPEN:<id_caixa>`. |
| Cooldown | 1 dia (o unique por `signal_date` + dedupe_key já limita a 1/dia por caixa). |
| Severity | `attention`. |
| Falsos positivos | Operação 24h ou madrugada (raro no ICP; 16h tolera turno longo). |

---

## 2. Schema SQL mínimo

Uma migration: `.ai/migrations/intelligence_engine_v1_2026_07_XX.sql`. **Pré-requisito: Phase 0
(validação do banco real) concluída** — tipos de `produtos.id`/`vendas.id`, existência de índices
nas tabelas-fonte, `pessoas.created_at`, view `v_daily_metrics`.

```sql
-- ============================================================
-- Zelo Intelligence Engine V1 — snapshots, sinais, runs, flag
-- ============================================================

-- 1) Snapshot diário de métricas por empresa
create table if not exists public.business_daily_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null,                       -- owner (mesmo tenant de empresa_perfil.user_id)
  snapshot_date date not null,                 -- dia local America/Sao_Paulo
  metrics jsonb not null,                      -- corpo completo (contrato DailyMetrics)
  receita_bruta numeric(12,2) not null default 0,
  receita_realizada numeric(12,2) not null default 0,
  qtd_vendas integer not null default 0,
  ticket_medio numeric(12,2),                  -- null quando qtd_vendas = 0
  fiado_saldo_total numeric(12,2),             -- null em snapshots de backfill
  engine_version text not null,
  computed_at timestamptz not null default now(),
  constraint business_daily_snapshots_user_date_uniq unique (user_id, snapshot_date)
);

-- 2) Sinais detectados
create table if not exists public.business_signals (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  signal_date date not null,
  type text not null,
  dedupe_key text not null,                    -- type ou type:<entidade>
  severity text not null check (severity in ('info','attention','critical')),
  score numeric(8,4) not null,
  confidence numeric(4,3) not null,
  evidence jsonb not null,
  narrative text,                              -- preenchido na Phase 5 (LLM ou template)
  narrative_source text check (narrative_source in ('llm','template')),
  read_at timestamptz,
  engine_version text not null,
  created_at timestamptz not null default now(),
  constraint business_signals_user_date_key_uniq unique (user_id, signal_date, dedupe_key)
);

-- 3) Observabilidade de execução
create table if not exists public.business_intelligence_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  target_date date not null,                   -- D-1 processado
  companies_scanned integer not null default 0,
  companies_processed integer not null default 0,
  companies_skipped integer not null default 0,   -- flag off / sem venda em 7d
  companies_failed integer not null default 0,
  signals_created integer not null default 0,
  signals_suppressed integer not null default 0,  -- min sample + cooldown + cap
  llm_calls integer not null default 0,
  llm_tokens_in integer not null default 0,
  llm_tokens_out integer not null default 0,
  llm_cost_usd numeric(10,6) not null default 0,
  errors jsonb not null default '[]'::jsonb,      -- [{user_id, step, message}]
  engine_version text not null
);

-- 4) Feature flag de rollout (piloto por empresa)
alter table public.empresa_perfil
  add column if not exists intelligence_enabled_at timestamptz;

-- ============================================================
-- RLS: leitura owner-scoped; escrita só service role
-- ============================================================
alter table public.business_daily_snapshots enable row level security;
alter table public.business_signals enable row level security;
alter table public.business_intelligence_runs enable row level security;

-- Owner e subusuários da empresa leem (mesmo padrão das tabelas operacionais)
create policy business_snapshots_select_owner on public.business_daily_snapshots
  for select to authenticated
  using (user_id = public.get_owner_user_id(auth.uid()));

create policy business_signals_select_owner on public.business_signals
  for select to authenticated
  using (user_id = public.get_owner_user_id(auth.uid()));

-- marcar como lido (única escrita permitida ao client)
create policy business_signals_update_read on public.business_signals
  for update to authenticated
  using (user_id = public.get_owner_user_id(auth.uid()))
  with check (user_id = public.get_owner_user_id(auth.uid()));

-- runs: só service role (nenhuma policy para authenticated)

revoke all on public.business_daily_snapshots from anon;
revoke all on public.business_signals from anon;
revoke all on public.business_intelligence_runs from anon, authenticated;
grant select on public.business_daily_snapshots to authenticated;
grant select, update (read_at) on public.business_signals to authenticated;
```

Notas:
- `update (read_at)` com grant por coluna impede o client de reescrever `evidence`/`narrative`.
- Tipos `numeric(12,2)` seguem `admin_finance_fixed_expenses_2026_05_13.sql`. Validar na Phase 0
  se `user_id` deve ganhar FK para `auth.users` (padrão das tabelas existentes — provável que não
  tenham FK; seguir o que o banco real fizer).
- Sem trigger, sem função nova, sem view.

## 3. Índices

```sql
-- Feed in-app: sinais mais recentes primeiro
create index if not exists business_signals_user_date_idx
  on public.business_signals (user_id, signal_date desc);

-- Cooldown lookup: último sinal do mesmo tipo
create index if not exists business_signals_user_type_date_idx
  on public.business_signals (user_id, type, signal_date desc);

-- (o unique de snapshots já cobre user_id+snapshot_date; nenhum índice extra)
```

Tabelas-fonte — **verificar na Phase 0 com `select * from pg_indexes where tablename in (...)`**
e criar apenas o que faltar (FKs não criam índice automático em Postgres):

```sql
-- candidatos, só se ausentes no banco real:
create index if not exists vendas_usuario_created_idx on public.vendas (id_usuario, created_at desc);
create index if not exists vendas_itens_venda_idx on public.vendas_itens (id_venda);
create index if not exists vendas_pagamentos_venda_idx on public.vendas_pagamentos (id_venda);
create index if not exists caixa_fechamentos_usuario_data_idx on public.caixa_fechamentos (id_usuario, data_fechamento desc);
```

## 4. Estratégia de execução — decisão

| Opção | Avaliação |
|---|---|
| **Endpoint SvelteKit + Vercel Cron** ✅ | **Escolhida.** Idêntico aos 3 crons existentes (`vercel.json`, `CRON_SECRET` + `safeEqualString`, `supabaseAdmin`). Compartilha `src/lib` (reusa `caixa.js`), mesmo deploy, mesmos secrets, mesmo padrão de teste. Custo zero de infra nova. |
| Supabase Cron (pg_cron) | Rejeitada: lógica teria que virar SQL/PLpgSQL — perde os módulos puros testáveis em Vitest, e migrations aqui não têm disciplina de versionamento (discovery, nota metodológica). |
| Supabase Edge Function | Rejeitada: segundo artefato de deploy, toolchain Deno, secrets duplicados, sem acesso a `src/lib/finance`. Nada que o endpoint não faça. |
| Lazy ao abrir o app | Rejeitada como principal: compute no hot path de login, concorrência entre abas/dispositivos duplicando trabalho, empresas que não abrem o app nunca são analisadas, latência imprevisível. Pode virar complemento em versão futura ("recalcular agora"), não na V1. |

Configuração: entrada em `vercel.json` — `{ "path": "/api/cron/intelligence-daily", "schedule": "0 7 * * *" }`
(04:00 BRT; livre — 08:30/09:00/10:00 UTC já ocupados). No handler,
`export const config = { maxDuration: 300 }`. Processamento serial por empresa com try/catch
individual; se o piloto crescer além do timeout, particionar por hash de `user_id` (fora da V1).

## 5. Estrutura de arquivos

```
src/lib/server/intelligence/
  config.js        # ENGINE_VERSION, thresholds, min samples, cooldowns, cap — TUDO num lugar
  tz.js            # PURO: fronteira de dia America/Sao_Paulo (Intl, zero deps)
  metrics.js       # PURO: (vendas, itens, pagamentos, taxas, pessoas) → DailyMetrics
  signals.js       # PURO: registry de 11 detectores (ctx → BusinessSignal[])
  ranking.js       # PURO: confidence gate + score + cap de 3/dia
  narrative.js     # Phase 5: templates determinísticos + chamada LLM opcional
  fetchers.js      # I/O: queries Supabase paginadas, escopo id_usuario/user_id
  engine.js        # orquestrador: runForCompany(), runDaily() — usa tudo acima

src/routes/api/cron/intelligence-daily/+server.js   # auth CRON_SECRET → engine.runDaily()

tests/
  intelligence.tz.test.js
  intelligence.metrics.test.js
  intelligence.signals.test.js
  intelligence.ranking.test.js
  intelligence.narrative.test.js
  helpers/intelligenceFixtures.js   # makeVenda(), makeSnapshot(), makeFechamento()

.ai/migrations/intelligence_engine_v1_2026_07_XX.sql
vercel.json                          # + 1 cron

src/routes/gestao/insights/+page.svelte             # Phase 6: feed mínimo
src/lib/components/Sidebar(.../nav)                  # Phase 6: link gated por flag
```

Racional vs o exemplo do pedido: `server/` porque nada disso pode ir ao bundle do client
(service role); `types.js` não existe — o repo é JS puro, contratos viram JSDoc `@typedef` em
`config.js`/`metrics.js` (padrão do repo, ex. `saleOps.js:91-111`); `fetchers.js` separado para
os módulos puros nunca tocarem I/O (regra global).

## 6. Contratos internos (JSDoc)

```js
/**
 * @typedef {Object} DailyMetrics — corpo de business_daily_snapshots.metrics
 * @property {number} receita_bruta          // Σ valor_total (inclui fiado)
 * @property {number} receita_realizada      // bruto − fiado emitido (dimensão de caixa)
 * @property {number} qtd_vendas
 * @property {number|null} ticket_medio      // receita_bruta/qtd (ticket comercial); null se qtd=0
 * @property {number} fiado_emitido
 * @property {number|null} fiado_saldo_total // Σ pessoas.saldo_fiado no run; null em backfill
 * @property {number} descontos
 * @property {number} taxa_entrega
 * @property {number} custos_plataforma
 * @property {Object<string, number>} mix_pagamentos  // {pix, dinheiro, cartao, fiado, outros} em R$
 * @property {Array<{id_produto: number|null, nome: string, qtd: number, receita: number}>} por_produto
 * @property {number[]} por_hora              // 24 posições, R$ por hora local
 * @property {boolean} backfilled
 */

/**
 * @typedef {Object} SnapshotRow — linha de business_daily_snapshots (I/O)
 * @property {string} user_id
 * @property {string} snapshot_date          // 'YYYY-MM-DD'
 * @property {DailyMetrics} metrics
 * @property {number} receita_bruta @property {number} receita_realizada
 * @property {number} qtd_vendas @property {number|null} ticket_medio
 * @property {number|null} fiado_saldo_total
 * @property {string} engine_version
 */

/**
 * @typedef {Object} BusinessSignal — saída dos detectores, linha de business_signals
 * @property {string} type                    // 'REVENUE_BELOW_WEEKDAY_AVG' | ... (11)
 * @property {string} dedupe_key              // type ou `${type}:${entidade}`
 * @property {'info'|'attention'|'critical'} severity
 * @property {number} confidence              // 0..1
 * @property {number} score                   // preenchido por ranking.js
 * @property {Object} evidence                // payload por sinal (§1) + campos comuns
 * @property {string} signal_date
 * @property {number|null} cooldown_days      // consultado antes do insert
 */

/**
 * @typedef {Object} DetectorContext — entrada única dos detectores (signals.js)
 * @property {string} targetDate              // D-1 local
 * @property {DailyMetrics} today             // métricas do targetDate
 * @property {SnapshotRow[]} history          // até 56 snapshots anteriores, desc
 * @property {Array<{data_fechamento: string, diferenca: number, total_geral: number}>} fechamentos // últimos 10
 * @property {Array<{id: number, nome: string, estoque_atual: number, controlar_estoque: boolean}>} produtosEstoque
 * @property {Array<{id: number, data_abertura: string}>} caixasAbertos
 * @property {Array<{nome: string, saldo_fiado: number}>} topDevedores  // top 3
 * @property {string} nowIso                  // injetado (nunca Date.now() dentro do detector)
 */

/**
 * @typedef {Object} CompanyRunResult — retorno de engine.runForCompany
 * @property {string} userId
 * @property {'processed'|'skipped_flag'|'skipped_inactive'|'failed'} status
 * @property {number} signalsCreated @property {number} signalsSuppressed
 * @property {{step: string, message: string}|null} error
 */
```

Assinaturas que as fases consomem entre si (fonte da verdade — não renomear):

```js
// tz.js
export function localDateOf(isoTimestamp)            // → 'YYYY-MM-DD' em America/Sao_Paulo
export function dayRangeUtc(localDate)               // → {startIso, endIso} instantes UTC do dia local
export function addDays(localDate, n)                // → 'YYYY-MM-DD'
export function weekdayOf(localDate)                 // → 0..6 (domingo=0)

// metrics.js
export function computeDailyMetrics({vendas, itens, pagamentos, taxas, saldoFiadoTotal}) // → DailyMetrics

// signals.js
export function detectSignals(ctx /* DetectorContext */) // → BusinessSignal[] (sem score)

// ranking.js
export function rankSignals(signals, {maxPerDay = 3} = {}) // → {selected: BusinessSignal[], suppressed: number}

// narrative.js
export function templateNarrative(signal)             // → string (determinístico, pt-BR)
export async function generateNarratives(signals, perfil, {openai}) // → Map<dedupe_key, {text, source, usage}>

// fetchers.js  (todas recebem supabaseAdmin como 1º arg — injetável em teste)
export async function fetchEligibleCompanies(db)              // flag on + subscription ativa/trial + venda em 7d
export async function fetchCompanyWindow(db, userId, startDate, endDate) // vendas+itens+pagamentos+taxas paginados
export async function fetchAuxData(db, userId)                // fechamentos, produtos estoque, caixas abertos, saldo fiado
export async function fetchSnapshots(db, userId, sinceDate)   // histórico p/ DetectorContext
export async function upsertSnapshots(db, rows)               // onConflict user_id,snapshot_date
export async function insertSignals(db, rows)                 // ignora 23505; retorna {inserted, deduped}
export async function fetchLastSignalDates(db, userId, types) // p/ cooldown

// engine.js
export async function runForCompany(db, userId, targetDate, options) // → CompanyRunResult
export async function runDaily(db, {targetDate, now} = {})           // → resumo p/ resposta do cron + row em runs
```

## 7. Estratégia de testes (determinísticos)

Princípios: módulos puros testam sem mock de rede; datas sempre literais fixas; `now` sempre
injetado; fixtures em `tests/helpers/intelligenceFixtures.js`:

```js
export function makeVenda({ id = 1, valorTotal = 50, forma = 'pix', createdAt, idUsuario = 'u1', ...rest })
export function makeItem({ idVenda = 1, idProduto = 10, nome = 'X-Bacon', qtd = 1, preco = 25 })
export function makeSnapshot({ date, receitaBruta = 1000, qtd = 40, weekdayFixture })
export function makeFechamento({ date, diferenca = 0, totalGeral = 1500 })
```

Casos obrigatórios (mapeados aos pedidos):

| Caso | Arquivo | Asserção |
|---|---|---|
| Quinta 20% abaixo da média de 6 quintas | `signals.test.js` | S1 emite; `delta_pct ≈ −0.20`; `confidence = (6/8) × (1−cv)`; severity `attention` |
| Só 2 quintas históricas | `signals.test.js` | S1 **não** emite (min sample); contabiliza suppressed |
| Zero vendas no dia | `metrics.test.js` + `signals.test.js` | `ticket_medio === null`, nenhum NaN/Infinity em campo algum; S1 não emite para dia zero se heurística de dia fechado ativa |
| Venda excluída (hard delete) | `engine` (integração leve com fetchers mockados) | recompute de D-2: upsert sobrescreve snapshot antigo com valor menor |
| Venda offline sincronizada depois | idem | venda com `created_at` de D-2 entra no snapshot de D-2 (não no de hoje) via janela de 3 dias |
| Produto novo (sem histórico) | `signals.test.js` | S4 não emite (elegibilidade: 8 dias de venda em 28) |
| Produto sem venda na janela | `signals.test.js` | S9/S10 não emitem (consumo 0 → sem divisão por zero) |
| Divisão por zero | `metrics.test.js` | `receita_bruta = 0` → shares null/0 documentado; `qtd = 0` → ticket null; baseline média 0 → S1/S2 não emitem |
| Timezone America/Sao_Paulo | `tz.test.js` | `localDateOf('2026-07-09T02:30:00Z') === '2026-07-08'`; `dayRangeUtc('2026-07-08').startIso === '2026-07-08T03:00:00.000Z'`; virada de ano; `weekdayOf` |
| Dedup simples vs múltiplo | `metrics.test.js` | venda `multiplo` com linhas em `vendas_pagamentos` não soma `valor_total` duas vezes no mix |
| Fiado fora da receita realizada | `metrics.test.js` | venda fiado entra em `receita_bruta` e `fiado_emitido`, não em `receita_realizada` |
| Cooldown | `ranking`/`engine` | S1 emitido em D-1 → não re-emitido em D com `fetchLastSignalDates` mockado |
| Cap de 3 sinais | `ranking.test.js` | 5 sinais candidatos → 3 selecionados por score desc, `suppressed = 2` |
| Heurística dia fechado | `signals.test.js` | 4 de 8 domingos com 0 vendas → S1 mudo no domingo |
| S10 suprime S4 | `signals.test.js` | produto zerado com queda de venda → só `STOCK_ZERO_WITH_DEMAND` |
| Template fallback | `narrative.test.js` | todo sinal tem `templateNarrative` não-vazio em pt-BR, sem "lucro"/"margem", valores formatados R$ 1.234,56 |

Exemplo concreto (S1) para calibrar o estilo — este teste entra literalmente na Phase 3:

```js
import { describe, it, expect } from 'vitest';
import { detectSignals } from '../src/lib/server/intelligence/signals.js';
import { makeSnapshot } from './helpers/intelligenceFixtures.js';

describe('REVENUE_BELOW_WEEKDAY_AVG', () => {
  // 6 quintas históricas de R$ 1.000; hoje (quinta 2026-07-09) R$ 800 → −20%
  const thursdays = ['2026-05-28','2026-06-04','2026-06-11','2026-06-18','2026-06-25','2026-07-02'];

  it('emite com queda de 20% sobre 6 quintas', () => {
    const ctx = baseCtx({
      targetDate: '2026-07-09',
      today: { ...zeroMetrics(), receita_bruta: 800, qtd_vendas: 30, ticket_medio: 26.67 },
      history: thursdays.map((date) => makeSnapshot({ date, receitaBruta: 1000, qtd: 40 })),
    });
    const s = detectSignals(ctx).find((x) => x.type === 'REVENUE_BELOW_WEEKDAY_AVG');
    expect(s).toBeDefined();
    expect(s.evidence.delta_pct).toBeCloseTo(-0.2, 5);
    expect(s.evidence.n_baseline).toBe(6);
    expect(s.confidence).toBeCloseTo(0.75, 2); // (6/8) × 1.0 (cv=0 na fixture)
    expect(s.severity).toBe('attention');
  });

  it('não emite com apenas 2 quintas históricas', () => {
    const ctx = baseCtx({
      targetDate: '2026-07-09',
      today: { ...zeroMetrics(), receita_bruta: 800, qtd_vendas: 30 },
      history: thursdays.slice(0, 2).map((d) => makeSnapshot({ date: d, receitaBruta: 1000 })),
    });
    expect(detectSignals(ctx).find((x) => x.type === 'REVENUE_BELOW_WEEKDAY_AVG')).toBeUndefined();
  });
});
```

## 8. Rollout

- **Flag por empresa:** `empresa_perfil.intelligence_enabled_at timestamptz` (null = off).
  Habilitação do piloto por SQL manual (`update empresa_perfil set intelligence_enabled_at = now()
  where user_id in (...)`). Sem UI de admin na V1. Escolhida coluna em `empresa_perfil` (e não
  add-on em `subscriptions`) porque rollout ≠ billing; se virar add-on pago depois, o molde
  `has_*` + `pricing.js` + `guards.js` já existe (discovery §6).
- **Kill switch global:** env `INTELLIGENCE_ENGINE_ENABLED` — se ausente/`'false'`, o cron
  responde `{ skipped: true }` sem tocar no banco.
- **Gate barato de atividade:** empresa habilitada sem venda nos últimos 7 dias é pulada
  (`skipped_inactive`).
- **Ordem de exposição:** Phases 1–4 rodam sem nenhuma superfície visível (só tabelas). Phase 6
  (feed) fica atrás da mesma flag: o link no menu só aparece se `intelligence_enabled_at` não for
  null. Narrativa (Phase 5) tem flag própria `INTELLIGENCE_LLM_ENABLED` — dá para rodar semanas
  só com templates.
- **Critério para ampliar o piloto:** ≥2 semanas de runs sem `companies_failed`, precisão dos
  sinais validada manualmente contra os relatórios de 3–5 empresas piloto.

## 9. Observabilidade

- **Por execução:** 1 linha em `business_intelligence_runs` (schema §2) — duração, contadores de
  empresas (scanned/processed/skipped/failed), sinais (created/suppressed), LLM (calls/tokens/custo),
  `errors` jsonb com `{user_id, step, message}` por empresa falhada. Vercel logs expiram; a tabela
  é a fonte durável.
- **Resposta do cron:** JSON com os mesmos contadores (padrão de `expire-trials/+server.js:77-87`)
  — visível no dashboard de crons da Vercel.
- **LLM:** além do run, cada chamada loga em `ai_usage_logs` com `chat_type: 'intelligence'`
  (mesmo formato de `api/chat/assistant/+server.js:435-440`) — o admin `/ai-usage` passa a
  enxergar o custo do engine de graça.
- **Console:** `console.log` de progresso a cada N empresas + `console.error` por falha
  (padrão dos crons existentes). Sem PostHog na V1.

---

## 10. Plano em fases

Cada fase é revisável e entregável separadamente; nenhuma fase depende de fase posterior.
Commits pequenos dentro da fase (1 commit por task). `npm test` e `npm run check` verdes são
critério de aceite implícito de toda fase.

### Phase 0 — Validação do banco real (bloqueante, sem código)

**Arquivos:** nenhum no app; anotar resultados em `docs/projects/zelo-intelligence-engine-discovery.md` (seção 9) e no topo da migration.

**Mudanças/tasks:**
- [ ] Via CLI linkado (`npx supabase db query --linked`), confirmar: tipos reais de `produtos.id`, `vendas.id`, `caixas.id`; existência e tipo de `pessoas.created_at`; definição de `fiado_registrar_pagamento` e da view `v_daily_metrics`; índices existentes em `vendas`, `vendas_itens`, `vendas_pagamentos`, `caixa_fechamentos` (`pg_indexes`).
- [ ] Confirmar assinatura de `get_owner_user_id` (usada nas policies novas).
- [ ] Medir volumetria: empresas ativas, vendas/dia da maior empresa (dimensiona paginação e timeout).

**Testes:** n/a.
**Critérios de aceite:** os 4 "riscos §9 do discovery" respondidos por escrito; lista exata de índices a criar; tipos das FKs decididos para a migration.

### Phase 1 — Schema

**Arquivos:**
- Create: `.ai/migrations/intelligence_engine_v1_2026_07_XX.sql` (conteúdo do §2 + índices do §3 ajustados pela Phase 0)
- Modify: `docs/data/SCHEMA_RLS.md` (documentar as 3 tabelas + flag)

**Mudanças/tasks:**
- [ ] Escrever a migration (tabelas, RLS, grants, índices novos; índices de tabelas-fonte só os ausentes).
- [ ] Aplicar no Supabase real via CLI linkado; verificar com queries de checagem (RLS on, policies contadas, grants mínimos — mesmo checklist registrado em [[CURRENT]] para `zelomenu_publication_schema`).
- [ ] Smoke manual: como `authenticated` de um usuário teste, `select` em `business_signals` retorna vazio (não erro); `insert` falha; `update read_at` de linha própria funciona (inserir linha via service role antes).

**Testes:** verificação manual SQL (registrar comandos e saídas em [[CURRENT]]).
**Critérios de aceite:** migration aplicada e verificada; RLS bloqueia cross-tenant; `anon` sem acesso; rollback documentado (drop das 3 tabelas + coluna).

### Phase 2 — Timezone + Métricas (puro)

**Arquivos:**
- Create: `src/lib/server/intelligence/tz.js`, `src/lib/server/intelligence/config.js`, `src/lib/server/intelligence/metrics.js`
- Create: `tests/intelligence.tz.test.js`, `tests/intelligence.metrics.test.js`, `tests/helpers/intelligenceFixtures.js`

**Interfaces:** produz `localDateOf/dayRangeUtc/addDays/weekdayOf` e `computeDailyMetrics` (§6) — consumidos pelas Phases 3–4. `config.js` exporta `ENGINE_VERSION = 'v1.0.0'` e o objeto `THRESHOLDS` completo (§1).

**Mudanças/tasks (TDD — teste antes de implementação em cada item):**
- [ ] `tz.js`: implementar via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })` + `formatToParts` para derivar offset (não hardcodar `-03:00`; o teste é que fixa o comportamento). Testes: caso `02:30Z → dia anterior`, meia-noite exata, virada de ano, weekday.
- [ ] `metrics.js`: `computeDailyMetrics` reusando `money`, `calculatePaymentSummary`, `calculatePlatformFees` de `src/lib/finance/caixa.js` (import direto — é código isomórfico já testado). Testes: dedup múltiplo, fiado bruto-vs-realizada, ticket null com 0 vendas, `por_produto` chaveado por `id_produto` com fallback nome para avulsos, `por_hora` em hora local (não UTC), divisões por zero.
- [ ] Fixtures compartilhadas.

**Critérios de aceite:** 100% dos casos de teste do §7 marcados para esses arquivos passando; nenhum import de `$env`/supabase nos módulos; `npm test` verde.

### Phase 3 — Sinais + Ranking (puro)

**Arquivos:**
- Create: `src/lib/server/intelligence/signals.js`, `src/lib/server/intelligence/ranking.js`
- Create: `tests/intelligence.signals.test.js`, `tests/intelligence.ranking.test.js`

**Interfaces:** consome `DetectorContext` (§6) e `THRESHOLDS` de `config.js`; produz `detectSignals` e `rankSignals` para a Phase 4.

**Mudanças/tasks:**
- [ ] Implementar os 11 detectores como funções `(ctx) → BusinessSignal|BusinessSignal[]|null` num registry `const DETECTORS = [...]`, cada um lendo thresholds só de `config.js`. Ordem dos testes: S1/S2 (baseline weekday + heurística dia fechado) → S3 → S4 (blocos de 7d, elegibilidade top-10) → S5–S7 (absolutos 30d) → S8 (fechamentos) → S9/S10 (estoque + regra "S10 suprime S4") → S11.
- [ ] `confidence` como helper único `baselineConfidence(n, nAlvo, values)` testado isoladamente.
- [ ] `ranking.js`: `score = severityWeight × min(2, |delta|/threshold) × confidence` (sinais sem delta usam magnitude 1), gate `confidence ≥ 0.5`, cap 3/dia, retorno `{selected, suppressed}`.
- [ ] Cobrir todos os casos do §7 marcados para signals/ranking.

**Critérios de aceite:** cada um dos 11 sinais tem ≥1 teste de emissão e ≥1 de supressão (min sample); thresholds vivem só em `config.js` (grep no PR); pureza mantida.

### Phase 4 — Fetchers + Engine + Cron (persistência ponta a ponta)

**Arquivos:**
- Create: `src/lib/server/intelligence/fetchers.js`, `src/lib/server/intelligence/engine.js`
- Create: `src/routes/api/cron/intelligence-daily/+server.js`
- Modify: `vercel.json` (cron `0 7 * * *`)
- Test: `tests/intelligence.engine.test.js` (fetchers injetados/mockados — sem rede)

**Interfaces:** consome tudo das Phases 2–3; produz `runDaily` para o handler.

**Mudanças/tasks:**
- [ ] `fetchers.js` com as 7 funções do §6: paginação 1000 (padrão `relatorios:740-759`), batches `.in()` de 1000, escopo `id_usuario` (`user_id` em `expenses` — não usada na V1, mas anotar).
- [ ] `engine.runForCompany`: janela de recompute D-3..D-1 → `computeDailyMetrics` por dia → `upsertSnapshots`; **backfill**: se a empresa não tem nenhum snapshot, computar 56 dias (marcar `metrics.backfilled = true`, `fiado_saldo_total = null` nos dias passados); montar `DetectorContext` → `detectSignals` → filtro de cooldown (`fetchLastSignalDates`) → `rankSignals` → `insertSignals` (ignorar 23505). `narrative` fica null nesta fase.
- [ ] `engine.runDaily`: kill switch env → `fetchEligibleCompanies` → loop serial com try/catch por empresa → gravar `business_intelligence_runs` → retornar resumo.
- [ ] Handler cron: clone da auth de `onboarding-emails/+server.js:47-54` (`safeEqualString`), `export const config = { maxDuration: 300 }`, resposta JSON com contadores.
- [ ] Testes de integração leve (§7): venda excluída/offline via recompute, backfill, idempotência (rodar 2× o mesmo dia → 0 sinais novos), isolamento de falha (1 empresa lança erro, run completa).
- [ ] Execução manual controlada: habilitar 1 empresa de teste via SQL, chamar o endpoint com Bearer local, conferir snapshot e sinais no banco contra os relatórios da empresa.

**Critérios de aceite:** run manual produz snapshots corretos (bater `receita_bruta`/`qtd_vendas` de 3 dias contra `/relatorios` da empresa piloto, ajustando pela diferença de fuso conhecida); re-execução é no-op em sinais; linha de run gravada; cron registrado na Vercel.

### Phase 5 — Narrativa

**Arquivos:**
- Create: `src/lib/server/intelligence/narrative.js`
- Modify: `src/lib/server/intelligence/engine.js` (passo 7–8 do pipeline), `src/lib/server/intelligence/config.js` (modelo, max tokens, flag)
- Test: `tests/intelligence.narrative.test.js`

**Mudanças/tasks:**
- [ ] `templateNarrative(signal)`: 1 template pt-BR por tipo (11), interpolando só `evidence`, formato brasileiro `R$ 1.234,56`, proibido "lucro"/"margem" (teste faz grep). É o fallback e o modo default enquanto `INTELLIGENCE_LLM_ENABLED !== 'true'`.
- [ ] `generateNarratives`: 1 chamada por empresa/dia (`gpt-4.1-mini`, `temperature: 0.3`, `max_tokens: 400`, **sem tools**), input = array de `{type, severity, evidence}` + nome do negócio; instrução dura: só números do evidence, 1–2 frases por sinal, tom de parceiro. Parse defensivo: resposta que não casar com os sinais → fallback template por sinal.
- [ ] Custo: logar em `ai_usage_logs` (`chat_type: 'intelligence'`) e acumular no run.
- [ ] Testes: templates completos e determinísticos; LLM mockado (sucesso, falha → fallback, resposta malformada → fallback).

**Critérios de aceite:** pipeline nunca falha por causa do LLM; toda linha de `business_signals` termina com `narrative` e `narrative_source` preenchidos; custo visível em `/ai-usage` do admin.

### Phase 6 — Feed in-app mínimo

**Arquivos:**
- Create: `src/routes/gestao/insights/+page.svelte`
- Modify: componente de navegação de `/gestao` (link "Insights" visível só com `intelligence_enabled_at` — carregado junto do perfil) — identificar o arquivo exato de nav na hora (ver `DESIGN_PATTERNS` antes, regra do CLAUDE.md)

**Mudanças/tasks:**
- [ ] **Ler `docs/DESIGN_PATTERNS.md` antes de qualquer markup** (obrigatório por convenção do repo).
- [ ] Página: client lê `business_signals` via supabase anon (RLS já garante escopo), últimos 14 dias, agrupado por `signal_date` desc, badge de severidade (tokens de tema, sem hex hardcoded), narrativa como texto principal, evidência num `<details>`; marcar `read_at` ao expandir (update permitido por RLS/grant).
- [ ] Guard de página: `ensureActiveSubscription` (padrão de `/gestao/*`) + esconder se flag off.
- [ ] Estado vazio honesto: "Ainda estamos aprendendo o padrão do seu negócio" quando não há sinais.

**Testes:** `npm run check` sem erros novos; validação visual manual com a empresa piloto.
**Critérios de aceite:** subusuário da empresa vê o feed do owner (RLS via `get_owner_user_id`); empresa sem flag não vê link nem acessa dados; zero hex hardcoded.

### Pós-fases (não bloqueiam V1, registrar ao final)

- [ ] Atualizar [[CURRENT]], [[FIXES_PROGRESS]] e [[TRADEOFFS]] (aceites: drift fora da janela de 3 dias, fuso fixo, cobertura parcial de estoque, "resultado operacional" ≠ lucro).
- [ ] Adicionar `zelo-intelligence-engine-*` ao índice de docs se houver.

---

## Self-review (executado na escrita)

- Cobertura da spec: 11 sinais ∈ [8,12] com os 13 campos pedidos ✔; schema+índices ✔; 4 estratégias avaliadas e 1 escolhida ✔; estrutura de arquivos adaptada ✔; contratos ✔; testes com todos os cenários pedidos ✔; rollout com flag ✔; observabilidade com os 6 itens pedidos ✔; 7 fases com arquivos/mudanças/testes/aceite ✔.
- Consistência de nomes: assinaturas de §6 são as usadas nas Phases 2–5 ✔; `dedupe_key`/`signal_date`/`evidence` idênticos entre §1, §2 e §6 ✔.
- Sem placeholders: todo detector tem fórmula/threshold/amostra; único "decidir na hora" é o arquivo de navegação da Phase 6 (desconhecido por design — exige leitura de DESIGN_PATTERNS antes).
