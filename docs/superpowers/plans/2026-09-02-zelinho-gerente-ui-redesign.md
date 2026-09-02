# Zelinho Gerente UI Redesign — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refazer a página `/gestao/gerente` e o painel do Zelinho seguindo o redesenho aprovado em 2026-09-02, sem expor nomes de ferramenta ao dono e com respostas rápidas em pills.

**Architecture:** Só camada de apresentação mais dois ajustes pequenos no servidor: o agente passa a devolver `effect` (o que a ação muda) junto da ação pendente e `quickReplies` (opções de resposta) quando faz uma pergunta de escolha. O cliente consome esses dados por frames SSE já suportados pelo `ChatStreamCore`. Nenhuma migration, nenhuma mudança de RLS.

**Tech Stack:** SvelteKit 2 + Svelte 5 (sintaxe legacy `export let` como os componentes irmãos), Tailwind v4 com tokens do tema, `lucide-svelte`, Vitest.

**Spec:** Redesenho aprovado (protótipo): https://claude.ai/code/artifact/47f21ea7-bf38-4162-bef1-d7ef85402156 · Design system: `DESIGN.md` (via `node C:/Users/Vinicius/.claude/skills/impeccable/scripts/context.mjs`) e `docs/DESIGN_PATTERNS.md` · Spec funcional do agente: `docs/superpowers/specs/2026-09-02-zelinho-gerente-agente-design.md`.

## Global Constraints

- Nunca mostrar nome de ferramenta (`buscar_produto`, `listar_categorias`, etc.) nem `acao_id` ao usuário. Progresso em linguagem humana ("Consultando as vendas…").
- Tokens do tema apenas: `var(--bg-app|--bg-panel|--bg-card|--bg-input|--text-main|--text-label|--text-muted|--primary|--primary-hover|--accent-light|--border-card|--border-subtle|--border-strong|--link|--status-*-text|--status-*-bg|--status-*-border)`. Sem hex em componente.
- Escala tipográfica fixa em px: 11, 12, 13, 14, 16, 20, 28. Raios: 6px (`sm`), 8px (`md`), 12px (`lg`), `9999px` (pill). Nada de `border-left`/`border-top` colorido como acento. Nada de gradiente em texto. Nada de cartão dentro de cartão.
- Alvos de toque ≥ 44px em botões primários; ≥ 36px em botões secundários dentro de listas densas, com `min-height` explícito.
- Movimento: só transições de 180ms `cubic-bezier(.22,1,.36,1)` em hover/estado; `@media (prefers-reduced-motion: reduce)` desliga tudo.
- Português de operador. Copies exatas estão nas tarefas.
- Arquivos existentes mantêm o estilo de quebra de linha; novos arquivos em LF sem BOM. Verificar `git diff --stat` antes de cada commit.
- Testes de componente são guardas de texto (padrão do repo); lógica pura vai para `src/lib/gerente/*.js` com testes de comportamento.
- Cada tarefa termina com `npx vitest run <arquivos>` e `npm run check` verdes (0 erros) e um commit.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/server/gerente/toolRegistry.js` | `effect(args)` por ferramenta de escrita; `summarizeEffect(name, args)` |
| `src/lib/server/gerente/agent.js` | `pendingAction.effect`; `quickReplies` no retorno de `runAgentTurn` |
| `src/routes/api/gerente/agent/+server.js` | frames `pending_action` (com `effect`) e `quick_replies` |
| `src/lib/gerente/dayStrip.js` | `computeDayStrip(snapshots)` puro |
| `src/lib/gerente/greeting.js` | `buildGreeting({ nomeExibicao, snapshot, dayStrip, signals, hour })` puro |
| `src/lib/components/gerente/DayStrip.svelte` | faixa de 4 números com contexto e mini barras |
| `src/lib/components/gerente/SignalRow.svelte` | linha de sinal (substitui `SignalCard` no briefing e no histórico) |
| `src/lib/components/gerente/ZelinhoBriefing.svelte` | seção plana: saudação + `SignalRow`s |
| `src/lib/components/gerente/SignalFeed.svelte` | histórico com `SignalRow` |
| `src/lib/components/gerente/AgentActionsList.svelte` | linhas com pill de status e estado vazio com exemplos |
| `src/routes/gestao/gerente/+page.svelte` | cabeçalho novo, abas Briefing / Ações / Histórico, links Resumo semanal / Preferências |
| `src/lib/stores/assistant.js` | store `quickReplies` |
| `src/lib/components/chat/ChatStreamCore.svelte` | marca mensagens de erro com `error: true` |
| `src/lib/components/AssistantChat.svelte` | painel redesenhado |

---

### Task 1: Servidor devolve `effect` e `quickReplies`

**Files:**
- Modify: `src/lib/server/gerente/toolRegistry.js`
- Modify: `src/lib/server/gerente/agent.js`
- Modify: `src/routes/api/gerente/agent/+server.js`
- Modify: `tests/gerente.agent.registry.test.js`, `tests/gerente.agent.run.test.js`, `tests/api.gerente-agent.test.js`

**Interfaces:**
- Produces (toolRegistry.js): cada ferramenta `write: true` ganha `effect(args)`; nova função `summarizeEffect(name, args)`:
  - `pausar_no_cardapio`: `pausado` → `Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.`; senão → `Volta a aparecer no cardápio digital.`
  - `ocultar_no_pdv`: `ocultar` → `Sai da frente de caixa. O cardápio digital não muda.`; senão → `Volta a aparecer na frente de caixa.`
  - `criar_categoria`: `Aparece em Produtos e no cardápio quando tiver itens.`
  - `criar_produto`: `Entra no PDV na hora. No cardápio digital só quando você publicar.`
  - `alterar_preco`: `Vale para o PDV e para o cardápio digital a partir de agora.`
- Produces (agent.js): `createPendingAction` recebe `effect` e o devolve; `runAgentTurn` retorna também `quickReplies: string[]` (máx. 6). Regra determinística: se, neste turno, `buscar_produto` devolveu 2 ou mais produtos e nenhuma ação pendente foi criada, `quickReplies` = nomes dos produtos (até 5) mais `"Nenhum desses"`; senão, se `listar_categorias` foi chamada e nenhuma ação pendente foi criada, `quickReplies` = nomes das categorias (até 5) mais `"Criar categoria nova"`; senão `[]`.
- Produces (actions.js, sem mudar assinatura): `createPendingAction` aceita campo opcional `effect` e o grava em `arguments._effect`? **Não.** Gravar em `summary` é errado. Decisão: `effect` não é persistido; vive só na resposta (`pendingAction.effect`) e é recalculado por `summarizeEffect` quando a rota devolve JSON. Nada muda no banco.
- Produces (rota): frame `data: {"type":"pending_action","action":{"id","summary","effect","expires_at"}}` e, quando `quickReplies.length > 0`, frame `data: {"type":"quick_replies","options":[...]}` antes de `[DONE]`.

- [ ] **Step 1: Testes que falham**

Acrescentar em `tests/gerente.agent.registry.test.js`, dentro de `describe('tool registry')`:

```js
  it('descreve o efeito de cada ferramenta de escrita', async () => {
    const { summarizeEffect } = await import('../src/lib/server/gerente/toolRegistry.js');
    expect(summarizeEffect('pausar_no_cardapio', { pausado: true })).toBe('Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.');
    expect(summarizeEffect('pausar_no_cardapio', { pausado: false })).toBe('Volta a aparecer no cardápio digital.');
    expect(summarizeEffect('ocultar_no_pdv', { ocultar: true })).toBe('Sai da frente de caixa. O cardápio digital não muda.');
    expect(summarizeEffect('criar_categoria', {})).toBe('Aparece em Produtos e no cardápio quando tiver itens.');
    expect(summarizeEffect('criar_produto', {})).toBe('Entra no PDV na hora. No cardápio digital só quando você publicar.');
    expect(summarizeEffect('alterar_preco', {})).toBe('Vale para o PDV e para o cardápio digital a partir de agora.');
    expect(summarizeEffect('buscar_produto', {})).toBe('');
  });
```

Acrescentar em `tests/gerente.agent.run.test.js`, dentro de `describe('runAgentTurn')`:

```js
  it('devolve quickReplies com os produtos quando a busca é ambígua', async () => {
    const produtos = [
      { id: 1, nome: 'Refrigerante 2L Coca-Cola', preco: 14, id_categoria: 3, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0, categorias: { nome: 'Bebidas' } },
      { id: 2, nome: 'Refrigerante 2L Guaraná', preco: 12, id_categoria: 3, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0, categorias: { nome: 'Bebidas' } },
    ];
    const db = makeDb({ tables: baseTables({ produtos: [{ data: produtos, error: null }], zelomenu_product_publications: [{ data: [], error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'buscar_produto', { termo: 'refri' })]),
      assistantMessage('Achei dois. Qual deles?'),
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'pausa o refri', now });
    expect(result.quickReplies).toEqual(['Refrigerante 2L Coca-Cola', 'Refrigerante 2L Guaraná', 'Nenhum desses']);
  });

  it('devolve quickReplies com categorias quando listar_categorias foi usada sem ação pendente', async () => {
    const db = makeDb({ tables: baseTables({ categorias: [{ data: [{ id: 1, nome: 'Lanches', ordem: 1, controlar_estoque_compartilhado: false }, { id: 2, nome: 'Bebidas', ordem: 2, controlar_estoque_compartilhado: false }], error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'listar_categorias', {})]),
      assistantMessage('Em qual categoria?'),
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'cadastra pudim por 12', now });
    expect(result.quickReplies).toEqual(['Lanches', 'Bebidas', 'Criar categoria nova']);
  });

  it('não devolve quickReplies quando criou ação pendente', async () => {
    const db = makeDb({ tables: baseTables({ gerente_agent_actions: [{ data: null, error: null }, { data: { id: 'act-1', summary: 'Pausar "Refri 2L" no cardápio digital', expires_at: '2026-09-02T15:10:00Z' }, error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'pausar_no_cardapio', { produto_id: 7, nome_produto: 'Refri 2L', pausado: true })]),
      assistantMessage('Confirma?'),
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'pausa', now });
    expect(result.quickReplies).toEqual([]);
    expect(result.pendingAction.effect).toBe('Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.');
  });
```

Em `tests/api.gerente-agent.test.js`, no teste `'responde SSE com conteúdo e ação pendente'`, trocar o `mockResolvedValueOnce` para incluir `effect` e `quickReplies` e ampliar as asserções:

```js
    mocks.runAgentTurn.mockResolvedValueOnce({ reply: 'Confirma?', pendingAction: { id: 'act-1', summary: 'Pausar "Refri" no cardápio digital', effect: 'Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.', expires_at: '2026-09-02T15:10:00Z' }, quickReplies: ['Sim', 'Não'], toolsUsed: ['pausar_no_cardapio'], usage: {}, sessionId: 's' });
    ...
    expect(JSON.parse(frames[1])).toEqual({ type: 'pending_action', action: { id: 'act-1', summary: 'Pausar "Refri" no cardápio digital', effect: 'Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.', expires_at: '2026-09-02T15:10:00Z' } });
    expect(JSON.parse(frames[2])).toEqual({ type: 'quick_replies', options: ['Sim', 'Não'] });
    expect(frames[3]).toBe('[DONE]');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gerente.agent.registry.test.js tests/gerente.agent.run.test.js tests/api.gerente-agent.test.js`
Expected: FAIL nos casos novos.

- [ ] **Step 3: Implementar em `toolRegistry.js`**

Adicionar a cada ferramenta `write: true` a propriedade `effect`:

```js
    effect: (args) => args.pausado ? 'Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.' : 'Volta a aparecer no cardápio digital.',
```
(`pausar_no_cardapio`)
```js
    effect: (args) => args.ocultar ? 'Sai da frente de caixa. O cardápio digital não muda.' : 'Volta a aparecer na frente de caixa.',
```
(`ocultar_no_pdv`)
```js
    effect: () => 'Aparece em Produtos e no cardápio quando tiver itens.',
```
(`criar_categoria`)
```js
    effect: () => 'Entra no PDV na hora. No cardápio digital só quando você publicar.',
```
(`criar_produto`)
```js
    effect: () => 'Vale para o PDV e para o cardápio digital a partir de agora.',
```
(`alterar_preco`)

E exportar:

```js
export function summarizeEffect(name, args) {
  const tool = getTool(name);
  if (!tool?.effect) return '';
  return tool.effect(args || {});
}
```

- [ ] **Step 4: Implementar em `agent.js`**

Importar `summarizeEffect` de `./toolRegistry.js`. Em `runAgentTurn`, antes do loop: `const ambiguous = { produtos: null, categorias: null };`. Dentro do loop, no ramo de leitura, após `result = await executeTool(ctx, name, args);`:

```js
        if (name === 'buscar_produto' && result?.ok && Array.isArray(result.data?.produtos) && result.data.produtos.length >= 2) {
          ambiguous.produtos = result.data.produtos.map((p) => p.nome);
        }
        if (name === 'listar_categorias' && result?.ok && Array.isArray(result.data?.categorias)) {
          ambiguous.categorias = result.data.categorias.map((c) => c.nome);
        }
```

No ramo de escrita, ao criar a pendente: `pendingAction = { ...(await createPendingAction(...)), effect: summarizeEffect(name, args) };`

Antes do `return`, calcular:

```js
  let quickReplies = [];
  if (!pendingAction && ambiguous.produtos) quickReplies = [...ambiguous.produtos.slice(0, 5), 'Nenhum desses'];
  else if (!pendingAction && ambiguous.categorias) quickReplies = [...ambiguous.categorias.slice(0, 5), 'Criar categoria nova'];
```

E devolver `quickReplies` no objeto de retorno. Em `describeExecutedAction` nada muda.

- [ ] **Step 5: Implementar na rota**

Em `src/routes/api/gerente/agent/+server.js`, onde monta `frames`:

```js
    const frames = [{ content: result.reply }];
    if (result.pendingAction) frames.push({ type: 'pending_action', action: result.pendingAction });
    if (Array.isArray(result.quickReplies) && result.quickReplies.length) frames.push({ type: 'quick_replies', options: result.quickReplies.slice(0, 6) });
    frames.push('[DONE]');
```

- [ ] **Step 6: Rodar e commit**

Run: `npx vitest run tests/gerente.agent.registry.test.js tests/gerente.agent.run.test.js tests/api.gerente-agent.test.js tests/gerente.channel.test.js`
Expected: PASS.

```bash
git add src/lib/server/gerente/toolRegistry.js src/lib/server/gerente/agent.js src/routes/api/gerente/agent/+server.js tests/gerente.agent.registry.test.js tests/gerente.agent.run.test.js tests/api.gerente-agent.test.js
git commit -m "feat(gerente): efeito da ação pendente e respostas rápidas no agente"
```

### Task 2: Helpers puros `dayStrip.js` e `greeting.js`

**Files:**
- Create: `src/lib/gerente/dayStrip.js`, `src/lib/gerente/greeting.js`
- Test: `tests/gerente.dayStrip.test.js`, `tests/gerente.greeting.test.js`

**Interfaces:**
- `computeDayStrip(snapshots)` recebe snapshots ordenados por data desc (`snapshot_date`, `receita_bruta`, `qtd_vendas`, `ticket_medio`, `metrics.mix_pagamentos`) e devolve:
  ```js
  { date, receita, receitaDeltaPct, vendas, vendasMedia, ticket, ticketDeltaPct, pixShare, dinheiroShare, spark: Array<{ date, value, kind: 'now'|'avg'|'day' }> }
  ```
  Regras: `date` = snapshot mais recente. Média de referência = média dos até 5 snapshots anteriores com o **mesmo dia da semana** (`weekday` calculado com `new Date(date + 'T12:00:00Z').getUTCDay()`); se não houver nenhum, usar média dos até 6 dias anteriores; se ainda assim não houver, deltas e médias são `null`. `receitaDeltaPct = (receita - mediaReceita) / mediaReceita` arredondado a 3 casas; `vendasMedia` arredondada a 0 casas; `ticketDeltaPct` idem à receita. `pixShare = pix / soma(mix)` arredondado a 3 casas, `null` se soma 0. `spark` = os até 6 snapshots anteriores em ordem cronológica com `kind: 'day'` mais o mais recente com `kind: 'now'`; `value = receita_bruta`.
- `buildGreeting({ nomeExibicao, dayStrip, signals, hour })` devolve `{ title, lead }`:
  - `title`: `Bom dia, {nome}.` (hour < 12), `Boa tarde, {nome}.` (12–17), `Boa noite, {nome}.` (≥ 18). `{nome}` = primeira palavra de `nomeExibicao` se ela tiver até 14 caracteres e não for uma das palavras genéricas `lanchonete|restaurante|bar|padaria|pizzaria|mercado|loja`; senão `nomeExibicao` inteiro; se vazio, o título é só `Bom dia.` etc.
  - `lead`: se `dayStrip` nulo → `Ainda estou reunindo seu histórico. Continue registrando as vendas e o resumo aparece aqui.`; senão comece com `Ontem rendeu R$ X em N vendas` (moeda pt-BR sem centavos quando inteiro, com centavos caso contrário) + `, {abaixo|acima} do ritmo das suas {segundas}` quando `|receitaDeltaPct| ≥ 0.08` (dia da semana no plural: domingos, segundas, terças, quartas, quintas, sextas, sábados) ou `, no ritmo de sempre` quando o delta existir e for menor; ponto final. Depois: `Um ponto pede sua atenção.` / `{N} pontos pedem sua atenção.` contando `signals` com `severity` `critical` ou `attention`; se zero, `Nada pede sua atenção hoje.`

- [ ] **Step 1: Testes que falham**

```js
// tests/gerente.dayStrip.test.js
import { describe, expect, it } from 'vitest';
import { computeDayStrip } from '../src/lib/gerente/dayStrip.js';

const snap = (date, receita, vendas, ticket, mix) => ({ snapshot_date: date, receita_bruta: receita, qtd_vendas: vendas, ticket_medio: ticket, metrics: { mix_pagamentos: mix } });
const mix = (pix, dinheiro, cartao) => ({ pix, dinheiro, cartao, vale_refeicao: 0, fiado: 0, outros: 0 });

describe('computeDayStrip', () => {
  it('compara com a média do mesmo dia da semana', () => {
    const snapshots = [
      snap('2026-09-01', 1240, 38, 32.63, mix(756, 200, 284)), // segunda
      snap('2026-08-31', 900, 30, 30, mix(500, 100, 300)),
      snap('2026-08-25', 1500, 40, 37.5, mix(900, 200, 400)), // segunda anterior
      snap('2026-08-18', 1524, 42, 36.29, mix(900, 224, 400)), // segunda anterior
    ];
    const s = computeDayStrip(snapshots);
    expect(s.date).toBe('2026-09-01');
    expect(s.receita).toBe(1240);
    expect(s.receitaDeltaPct).toBeCloseTo(-0.18, 2);
    expect(s.vendas).toBe(38);
    expect(s.vendasMedia).toBe(41);
    expect(s.ticketDeltaPct).toBeCloseTo(-0.116, 2);
    expect(s.pixShare).toBeCloseTo(0.61, 2);
    expect(s.spark.map((p) => p.kind)).toEqual(['day', 'day', 'day', 'now']);
    expect(s.spark.at(-1)).toEqual({ date: '2026-09-01', value: 1240, kind: 'now' });
  });

  it('cai para a média dos dias anteriores quando não há mesmo dia da semana', () => {
    const s = computeDayStrip([snap('2026-09-01', 1000, 20, 50, mix(0, 0, 0)), snap('2026-08-31', 500, 10, 50, mix(0, 0, 0))]);
    expect(s.receitaDeltaPct).toBeCloseTo(1, 2);
    expect(s.pixShare).toBeNull();
  });

  it('devolve nulos sem histórico', () => {
    expect(computeDayStrip([])).toBeNull();
    const s = computeDayStrip([snap('2026-09-01', 1000, 20, 50, mix(100, 0, 0))]);
    expect(s.receitaDeltaPct).toBeNull();
    expect(s.vendasMedia).toBeNull();
    expect(s.spark).toEqual([{ date: '2026-09-01', value: 1000, kind: 'now' }]);
  });
});
```

```js
// tests/gerente.greeting.test.js
import { describe, expect, it } from 'vitest';
import { buildGreeting } from '../src/lib/gerente/greeting.js';

const strip = { date: '2026-09-01', receita: 1240, receitaDeltaPct: -0.18, vendas: 38 };
const signals = [{ severity: 'critical' }, { severity: 'attention' }, { severity: 'info' }];

describe('buildGreeting', () => {
  it('saúda pelo primeiro nome e resume ontem com o dia da semana', () => {
    const g = buildGreeting({ nomeExibicao: 'Zé Lanches', dayStrip: strip, signals, hour: 9 });
    expect(g.title).toBe('Bom dia, Zé.');
    expect(g.lead).toBe('Ontem rendeu R$ 1.240 em 38 vendas, abaixo do ritmo das suas segundas. 2 pontos pedem sua atenção.');
  });

  it('usa o nome inteiro quando a primeira palavra é genérica e varia a saudação pela hora', () => {
    expect(buildGreeting({ nomeExibicao: 'Lanchonete do Zé', dayStrip: null, signals: [], hour: 15 }).title).toBe('Boa tarde, Lanchonete do Zé.');
    expect(buildGreeting({ nomeExibicao: '', dayStrip: null, signals: [], hour: 20 }).title).toBe('Boa noite.');
  });

  it('cobre sem histórico, ritmo normal e nenhum ponto', () => {
    expect(buildGreeting({ nomeExibicao: 'Zé', dayStrip: null, signals: [], hour: 9 }).lead).toBe('Ainda estou reunindo seu histórico. Continue registrando as vendas e o resumo aparece aqui.');
    expect(buildGreeting({ nomeExibicao: 'Zé', dayStrip: { ...strip, receita: 1500.5, receitaDeltaPct: 0.02 }, signals: [{ severity: 'critical' }], hour: 9 }).lead).toBe('Ontem rendeu R$ 1.500,50 em 38 vendas, no ritmo de sempre. Um ponto pede sua atenção.');
    expect(buildGreeting({ nomeExibicao: 'Zé', dayStrip: { ...strip, receitaDeltaPct: null }, signals: [], hour: 9 }).lead).toBe('Ontem rendeu R$ 1.240 em 38 vendas. Nada pede sua atenção hoje.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gerente.dayStrip.test.js tests/gerente.greeting.test.js`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

```js
// src/lib/gerente/dayStrip.js
const round = (v, d) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const avg = (rows, pick) => (rows.length ? rows.reduce((s, r) => s + Number(pick(r) || 0), 0) / rows.length : null);

export function computeDayStrip(snapshots = []) {
  const sorted = [...snapshots].filter((s) => s?.snapshot_date).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  const latest = sorted[0];
  if (!latest) return null;
  const previous = sorted.slice(1);
  const sameWeekday = previous.filter((s) => weekdayOf(s.snapshot_date) === weekdayOf(latest.snapshot_date)).slice(0, 5);
  const baseline = sameWeekday.length ? sameWeekday : previous.slice(0, 6);
  const mediaReceita = avg(baseline, (s) => s.receita_bruta);
  const mediaVendas = avg(baseline, (s) => s.qtd_vendas);
  const mediaTicket = avg(baseline, (s) => s.ticket_medio);
  const receita = Number(latest.receita_bruta || 0);
  const ticket = latest.ticket_medio == null ? null : Number(latest.ticket_medio);
  const mix = latest.metrics?.mix_pagamentos || {};
  const total = Object.values(mix).reduce((s, v) => s + Number(v || 0), 0);
  const spark = [...previous.slice(0, 6).reverse().map((s) => ({ date: s.snapshot_date, value: Number(s.receita_bruta || 0), kind: 'day' })), { date: latest.snapshot_date, value: receita, kind: 'now' }];
  return {
    date: latest.snapshot_date,
    receita,
    receitaDeltaPct: mediaReceita ? round((receita - mediaReceita) / mediaReceita, 3) : null,
    vendas: Number(latest.qtd_vendas || 0),
    vendasMedia: mediaVendas == null ? null : Math.round(mediaVendas),
    ticket,
    ticketDeltaPct: mediaTicket && ticket != null ? round((ticket - mediaTicket) / mediaTicket, 3) : null,
    pixShare: total > 0 ? round(Number(mix.pix || 0) / total, 3) : null,
    dinheiroShare: total > 0 ? round(Number(mix.dinheiro || 0) / total, 3) : null,
    spark,
  };
}
```

```js
// src/lib/gerente/greeting.js
const GENERIC = /^(lanchonete|restaurante|bar|padaria|pizzaria|mercado|loja)$/i;
const WEEKDAYS = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

function money(value) {
  const n = Number(value || 0);
  const opts = Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return 'R$ ' + new Intl.NumberFormat('pt-BR', opts).format(n);
}

function displayName(nomeExibicao) {
  const full = String(nomeExibicao || '').trim();
  if (!full) return '';
  const first = full.split(/\s+/)[0];
  return first.length <= 14 && !GENERIC.test(first) ? first : full;
}

export function buildGreeting({ nomeExibicao = '', dayStrip = null, signals = [], hour = new Date().getHours() } = {}) {
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const name = displayName(nomeExibicao);
  const title = name ? `${period}, ${name}.` : `${period}.`;
  if (!dayStrip) return { title, lead: 'Ainda estou reunindo seu histórico. Continue registrando as vendas e o resumo aparece aqui.' };
  let lead = `Ontem rendeu ${money(dayStrip.receita)} em ${dayStrip.vendas} vendas`;
  const delta = dayStrip.receitaDeltaPct;
  if (delta != null && Math.abs(delta) >= 0.08) {
    const weekday = WEEKDAYS[new Date(`${dayStrip.date}T12:00:00Z`).getUTCDay()];
    lead += `, ${delta < 0 ? 'abaixo' : 'acima'} do ritmo das suas ${weekday}`;
  } else if (delta != null) {
    lead += ', no ritmo de sempre';
  }
  lead += '.';
  const attention = (signals || []).filter((s) => s?.severity === 'critical' || s?.severity === 'attention').length;
  lead += attention === 0 ? ' Nada pede sua atenção hoje.' : attention === 1 ? ' Um ponto pede sua atenção.' : ` ${attention} pontos pedem sua atenção.`;
  return { title, lead };
}
```

- [ ] **Step 4: Rodar e commit**

Run: `npx vitest run tests/gerente.dayStrip.test.js tests/gerente.greeting.test.js`
Expected: PASS.

```bash
git add src/lib/gerente/dayStrip.js src/lib/gerente/greeting.js tests/gerente.dayStrip.test.js tests/gerente.greeting.test.js
git commit -m "feat(gerente): cálculo da faixa do dia e saudação do briefing"
```

### Task 3: `DayStrip.svelte` e `SignalRow.svelte`

**Files:**
- Create: `src/lib/components/gerente/DayStrip.svelte`, `src/lib/components/gerente/SignalRow.svelte`
- Modify: `src/lib/gerente/signalPresenter.js` (acrescentar `acaoRapida` em dois presenters)
- Test: `tests/gerenteRedesignComponents.test.js`, `tests/gerente.presenter.test.js` (acrescentar)

**Interfaces:**
- `signalPresenter.js`: `STOCK_ZERO_WITH_DEMAND` e `STOCK_COVERAGE_LOW` ganham `acaoRapida: { label: 'Pausar no cardápio', mensagem: (signal) => `pausa ${signal?.evidence?.nome_produto || 'esse produto'} no cardápio, acabou o estoque` }`. Os demais não têm `acaoRapida`. `getSignalPresenter` continua igual.
- `DayStrip.svelte`: `export let strip` (objeto de `computeDayStrip` ou `null`). Renderiza 4 células: Receita de ontem (com delta e mini barras), Vendas (com `média N`), Ticket médio (com delta), Recebido em Pix (percentual e `dinheiro N%`). Delta: seta para cima/baixo via `lucide-svelte` `ArrowUpRight`/`ArrowDownRight`, cor `var(--status-error-text)` para queda, `var(--status-success-text)` para alta, `var(--text-muted)` para nulo com texto `sem referência`. Quando `strip` é nulo, renderiza nada.
- `SignalRow.svelte`: `export let signal; export let onRead; export let onAsk; export let onMute; export let onQuickAction; export let muted = false;`. Layout em grade `22px 1fr auto`: ícone de severidade em chip (`background: var(--status-error-bg)` crit, `var(--status-warning-bg)` attention, `var(--accent-light)` info) com o `presenter.icone`; corpo com kicker (`Precisa de você` / `Fica de olho` / `Pra saber`, cor da severidade, mais ponto azul de não lido e a data curta `ontem` ou `dd/mm`), `h3` com `presenter.titulo`, `p` com `signal.narrative`, `<details>` "Ver os números" com a `dl` de `presenter.formatEvidence(signal.evidence)`; ações à direita: botão primário `acaoRapida.label` (se existir; `on:click` → `onQuickAction(presenter.acaoRapida.mensagem(signal))`) ou link `acaoSugerida.label` estilizado como botão ghost, e botão quiet `Perguntar` (`on:click` → `onAsk(signal)`). Menu "…" com `Silenciar esse tipo` (→ `onMute(signal.type)`) e `Esse aviso não faz sentido?` (→ `onAsk(signal)`). `onRead(signal.id)` disparado ao abrir os números ou clicar em qualquer ação. `muted` mostra só kicker + título com opacidade .6 e texto `Silenciado nas preferências`.

- [ ] **Step 1: Testes que falham**

Acrescentar em `tests/gerente.presenter.test.js`:

```js
import { getSignalPresenter as getPresenterForQuick } from '../src/lib/gerente/signalPresenter.js';

describe('acaoRapida', () => {
  it('existe só para sinais de estoque e usa o nome do produto', () => {
    const p = getPresenterForQuick({ type: 'STOCK_ZERO_WITH_DEMAND', evidence: { nome_produto: 'Refri 2L' } });
    expect(p.acaoRapida.label).toBe('Pausar no cardápio');
    expect(p.acaoRapida.mensagem({ evidence: { nome_produto: 'Refri 2L' } })).toBe('pausa Refri 2L no cardápio, acabou o estoque');
    expect(getPresenterForQuick({ type: 'STOCK_COVERAGE_LOW' }).acaoRapida.label).toBe('Pausar no cardápio');
    expect(getPresenterForQuick({ type: 'REVENUE_BELOW_WEEKDAY_AVG' }).acaoRapida).toBeUndefined();
  });
});
```

```js
// tests/gerenteRedesignComponents.test.js
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

describe('DayStrip', () => {
  it('mostra os quatro números com contexto e não usa hex', async () => {
    const s = await read('src/lib/components/gerente/DayStrip.svelte');
    for (const t of ['Receita de ontem', 'Vendas', 'Ticket médio', 'Recebido em Pix', 'sem referência', 'computeDayStrip']) expect(s).toContain(t);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(s).toContain('tabular-nums');
  });
});

describe('SignalRow', () => {
  it('tem kicker por severidade, números recolhidos, ação rápida e perguntar', async () => {
    const s = await read('src/lib/components/gerente/SignalRow.svelte');
    for (const t of ['Precisa de você', 'Fica de olho', 'Pra saber', '<details', 'Ver os números', 'acaoRapida', 'Perguntar', 'Silenciar esse tipo', 'Silenciado nas preferências', 'onQuickAction']) expect(s).toContain(t);
    expect(s).not.toMatch(/border-(left|top):\s*[2-9]px/);
    expect(s).not.toMatch(/text-transform:\s*uppercase/);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gerente.presenter.test.js tests/gerenteRedesignComponents.test.js`
Expected: FAIL.

- [ ] **Step 3: `signalPresenter.js`**

Acrescentar antes de `export const signalPresenters`:

```js
const pausarNoCardapio = {
  label: 'Pausar no cardápio',
  mensagem: (signal) => `pausa ${signal?.evidence?.nome_produto || 'esse produto'} no cardápio, acabou o estoque`,
};
```

E nas entradas `STOCK_COVERAGE_LOW` e `STOCK_ZERO_WITH_DEMAND` acrescentar `acaoRapida: pausarNoCardapio,`.

- [ ] **Step 4: `DayStrip.svelte`**

```svelte
<script>
  import { ArrowDownRight, ArrowUpRight } from 'lucide-svelte';
  /** Objeto de computeDayStrip (src/lib/gerente/dayStrip.js) ou null. */
  export let strip = null;
  const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const pct = (v) => `${Math.round(Math.abs(Number(v)) * 100)}%`;
  $: maxSpark = strip ? Math.max(1, ...strip.spark.map((p) => p.value)) : 1;
</script>

{#if strip}
  <div class="day" aria-label="Números de ontem">
    <div>
      <span class="l">Receita de ontem</span>
      <strong class="v tabular-nums">{money(strip.receita)}</strong>
      {#if strip.receitaDeltaPct == null}<span class="d flat">sem referência</span>
      {:else if strip.receitaDeltaPct < 0}<span class="d down"><ArrowDownRight size={12} aria-hidden="true" />{pct(strip.receitaDeltaPct)} abaixo da sua média</span>
      {:else}<span class="d up"><ArrowUpRight size={12} aria-hidden="true" />{pct(strip.receitaDeltaPct)} acima da sua média</span>{/if}
      <div class="spark" aria-hidden="true">{#each strip.spark as p (p.date)}<i class={p.kind} style={`height:${Math.max(10, Math.round((p.value / maxSpark) * 100))}%`}></i>{/each}</div>
    </div>
    <div><span class="l">Vendas</span><strong class="v tabular-nums">{strip.vendas}</strong><span class="d flat">{strip.vendasMedia == null ? 'sem referência' : `média ${strip.vendasMedia}`}</span></div>
    <div>
      <span class="l">Ticket médio</span>
      <strong class="v tabular-nums">{strip.ticket == null ? '—' : money(strip.ticket)}</strong>
      {#if strip.ticketDeltaPct == null}<span class="d flat">sem referência</span>
      {:else if strip.ticketDeltaPct < 0}<span class="d down"><ArrowDownRight size={12} aria-hidden="true" />{pct(strip.ticketDeltaPct)}</span>
      {:else}<span class="d up"><ArrowUpRight size={12} aria-hidden="true" />{pct(strip.ticketDeltaPct)}</span>{/if}
    </div>
    <div><span class="l">Recebido em Pix</span><strong class="v tabular-nums">{strip.pixShare == null ? '—' : pct(strip.pixShare)}</strong><span class="d flat">{strip.dinheiroShare == null ? 'sem pagamentos' : `dinheiro ${pct(strip.dinheiroShare)}`}</span></div>
  </div>
{/if}

<style>
  .day { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); overflow: hidden; }
  .day > div { padding: 14px 16px; border-right: 1px solid var(--border-card); display: grid; gap: 2px; min-width: 0; }
  .day > div:last-child { border-right: 0; }
  .l { font-size: 12px; color: var(--text-muted); }
  .v { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: var(--text-main); overflow-wrap: anywhere; }
  .d { font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
  .d.down { color: var(--status-error-text); } .d.up { color: var(--status-success-text); } .d.flat { color: var(--text-muted); }
  .spark { display: flex; align-items: flex-end; gap: 3px; height: 28px; margin-top: 6px; }
  .spark i { flex: 1; background: var(--border-strong); border-radius: 4px 4px 0 0; min-height: 3px; }
  .spark i.now { background: var(--primary); }
  @media (max-width: 720px) { .day { grid-template-columns: repeat(2, 1fr); } .day > div:nth-child(2) { border-right: 0; } .day > div:nth-child(-n+2) { border-bottom: 1px solid var(--border-card); } }
</style>
```

- [ ] **Step 5: `SignalRow.svelte`**

```svelte
<script>
  import { onMount } from 'svelte';
  import { ChevronDown, MessageCircle, MoreHorizontal } from 'lucide-svelte';
  import { getSignalPresenter } from '$lib/gerente/signalPresenter.js';
  export let signal;
  export let onRead = () => {};
  export let onAsk = () => {};
  export let onMute = () => {};
  export let onQuickAction = () => {};
  export let muted = false;
  let menuOpen = false;
  let menuButton;
  let root;
  $: presenter = getSignalPresenter(signal);
  $: Icon = presenter.icone;
  $: sev = signal?.severity === 'critical' ? 'critical' : signal?.severity === 'attention' ? 'attention' : 'info';
  $: kicker = sev === 'critical' ? 'Precisa de você' : sev === 'attention' ? 'Fica de olho' : 'Pra saber';
  $: when = formatWhen(signal?.signal_date);
  function formatWhen(date) {
    if (!date) return '';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
    if (date === d.toISOString().slice(0, 10)) return 'ontem';
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  }
  function read() { onRead(signal.id); }
  onMount(() => {
    const close = (e) => { if (menuOpen && root && !root.querySelector('.menu')?.contains(e.target)) menuOpen = false; };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  });
</script>

<article bind:this={root} class="row" class:muted>
  <div class="sev {sev}"><svelte:component this={Icon} size={14} aria-hidden="true" /></div>
  <div class="body">
    <div class="kicker"><span class="k {sev}">{kicker}</span>{#if !signal?.read_at && !muted}<i class="new" role="status" aria-label="Novo"></i>{/if}{#if when}<span>{when}</span>{/if}</div>
    <h3>{presenter.titulo}</h3>
    {#if muted}
      <p class="quiet">Silenciado nas preferências</p>
    {:else}
      <p>{signal?.narrative || 'Há um ponto para acompanhar nos números recentes.'}</p>
      <details on:toggle={(e) => { if (e.currentTarget.open) read(); }}>
        <summary>Ver os números <ChevronDown size={14} aria-hidden="true" /></summary>
        <dl>{#each presenter.formatEvidence(signal?.evidence || {}) as item}<dt>{item.label}</dt><dd class="tabular-nums">{item.valor}</dd>{/each}</dl>
      </details>
    {/if}
  </div>
  {#if !muted}
    <div class="actions">
      {#if presenter.acaoRapida}
        <button type="button" class="btn primary" on:click={() => { read(); onQuickAction(presenter.acaoRapida.mensagem(signal)); }}>{presenter.acaoRapida.label}</button>
      {:else}
        <a class="btn ghost" href={presenter.acaoSugerida.href} on:click={read}>{presenter.acaoSugerida.label}</a>
      {/if}
      <div class="ask-row">
        <button type="button" class="btn quiet" on:click={() => { read(); onAsk(signal); }}><MessageCircle size={15} aria-hidden="true" />Perguntar</button>
        <div class="menu">
          <button type="button" bind:this={menuButton} class="icon" aria-label="Mais opções" aria-haspopup="menu" aria-expanded={menuOpen} on:click={() => (menuOpen = !menuOpen)}><MoreHorizontal size={16} aria-hidden="true" /></button>
          {#if menuOpen}
            <div class="popup" role="menu" tabindex="-1" on:keydown={(e) => { if (e.key === 'Escape') { menuOpen = false; menuButton?.focus(); } }}>
              <button type="button" role="menuitem" on:click={() => { menuOpen = false; onMute(signal.type); }}>Silenciar esse tipo</button>
              <button type="button" role="menuitem" on:click={() => { menuOpen = false; onAsk(signal); }}>Esse aviso não faz sentido?</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</article>

<style>
  .row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 14px; padding: 16px 18px; border-top: 1px solid var(--border-card); transition: background 180ms cubic-bezier(.22,1,.36,1); }
  .row:first-child { border-top: 0; }
  .row:hover { background: color-mix(in srgb, var(--bg-panel) 55%, var(--bg-card)); }
  .row.muted { opacity: .6; }
  .sev { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; margin-top: 1px; }
  .sev.critical { background: var(--status-error-bg); color: var(--status-error-text); }
  .sev.attention { background: var(--status-warning-bg); color: var(--status-warning-text); }
  .sev.info { background: var(--accent-light); color: var(--primary); }
  .body { min-width: 0; display: grid; gap: 4px; }
  .kicker { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
  .k.critical { color: var(--status-error-text); } .k.attention { color: var(--status-warning-text); } .k.info { color: var(--primary); }
  .new { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); }
  h3 { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.35; color: var(--text-main); }
  p { margin: 0; color: var(--text-label); font-size: 13px; line-height: 1.5; max-width: 70ch; }
  .quiet { color: var(--text-muted); font-size: 12px; }
  details { margin-top: 4px; }
  summary { list-style: none; cursor: pointer; font-size: 12px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; min-height: 28px; }
  summary::-webkit-details-marker { display: none; }
  summary:hover { color: var(--text-main); }
  details[open] summary :global(svg) { transform: rotate(180deg); }
  dl { margin: 6px 0 0; padding: 10px 12px; border: 1px solid var(--border-card); border-radius: 6px; background: var(--bg-input); display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; font-size: 12px; }
  dt { color: var(--text-muted); } dd { margin: 0; text-align: right; color: var(--text-label); }
  .actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .ask-row { display: flex; align-items: center; gap: 2px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 6px; border: 1px solid transparent; font-size: 13px; font-weight: 500; white-space: nowrap; text-decoration: none; cursor: pointer; transition: background 180ms cubic-bezier(.22,1,.36,1), border-color 180ms cubic-bezier(.22,1,.36,1), color 180ms cubic-bezier(.22,1,.36,1); }
  .btn.primary { background: var(--primary); color: var(--text-inverse); } .btn.primary:hover { background: var(--primary-hover); }
  .btn.ghost { background: transparent; color: var(--text-label); border-color: var(--border-subtle); } .btn.ghost:hover { color: var(--text-main); border-color: var(--border-strong); }
  .btn.quiet { background: transparent; color: var(--text-muted); } .btn.quiet:hover { color: var(--text-main); background: var(--bg-input); }
  .icon { width: 36px; height: 36px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
  .icon:hover { background: var(--bg-input); color: var(--text-main); }
  .menu { position: relative; }
  .popup { position: absolute; right: 0; top: calc(100% + 4px); z-index: 4; display: grid; width: 200px; padding: 4px; border: 1px solid var(--border-card); border-radius: 6px; background: var(--bg-card); }
  .popup button { min-height: 40px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: var(--text-label); text-align: left; font-size: 12px; cursor: pointer; }
  .popup button:hover { background: var(--bg-input); }
  .btn:focus-visible, .icon:focus-visible, summary:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent); }
  @media (max-width: 640px) { .row { grid-template-columns: 22px minmax(0, 1fr); } .actions { grid-column: 2; flex-direction: row; justify-content: flex-start; flex-wrap: wrap; } }
  @media (prefers-reduced-motion: reduce) { .row, .btn { transition: none; } }
</style>
```

Nota sobre `--text-inverse`: no tema escuro é `#0F172A`, o que deixaria o texto do botão primário escuro sobre azul. Usar `color: #fff` é hex proibido; use `color: var(--primary-text)` (existe em `src/themes/base.css:30` como `#FFFFFF`). Trocar `var(--text-inverse)` por `var(--primary-text)` no `.btn.primary`.

- [ ] **Step 6: Rodar, check e commit**

Run: `npx vitest run tests/gerente.presenter.test.js tests/gerenteRedesignComponents.test.js && npm run check`
Expected: PASS; 0 erros.

```bash
git add src/lib/gerente/signalPresenter.js src/lib/components/gerente/DayStrip.svelte src/lib/components/gerente/SignalRow.svelte tests/gerente.presenter.test.js tests/gerenteRedesignComponents.test.js
git commit -m "feat(gerente): faixa do dia e linha de sinal do redesenho"
```

### Task 4: Página do Gerente com saudação, abas e listas planas

**Files:**
- Modify: `src/routes/gestao/gerente/+page.svelte`
- Modify: `src/lib/components/gerente/ZelinhoBriefing.svelte`
- Modify: `src/lib/components/gerente/SignalFeed.svelte`
- Modify: `src/lib/components/gerente/AgentActionsList.svelte`
- Delete: `src/lib/components/gerente/DaySnapshotSummary.svelte` (só se nenhum outro arquivo importar; confirmar com `grep -rn DaySnapshotSummary src`)
- Test: `tests/gerentePageNavigation.test.js` (atualizar), `tests/gerenteAgentActionsList.test.js` (atualizar)

**Interfaces:**
- `+page.svelte`: a query de snapshots passa a selecionar `snapshot_date, receita_bruta, receita_realizada, qtd_vendas, ticket_medio, metrics, computed_at`; a de `empresa_perfil` passa a selecionar `nome_exibicao, gerente_prefs`. Computa `dayStrip = computeDayStrip(snapshots)` e `greeting = buildGreeting({ nomeExibicao: profile?.nome_exibicao, dayStrip, signals: todaySignals, hour: new Date().getHours() })`. Estado `tab` em `'briefing' | 'acoes' | 'historico'` lido de `$page.url.searchParams.get('aba')` com padrão `briefing` e escrito com `goto(`?aba=${tab}`, { replaceState: true, noScroll: true })`.
- Cabeçalho: breadcrumb simples `Gestão / Zelinho Gerente` (12px, sem caixa alta, sem tracking), `h1` = `greeting.title` (28px), `p.lead` = `greeting.lead` (16px), à direita `Analisado hoje às HH:MM` com ponto verde. Abaixo, uma barra de abas (`role="tablist"`): `Briefing`, `Ações do Zelinho` (com contagem de executadas quando > 0), `Histórico`, e dois links no mesmo estilo visual para `/gestao/gerente/semana` (`Resumo semanal`) e `/gestao/gerente/preferencias` (`Preferências`).
- Aba Briefing: `<DayStrip strip={dayStrip} />`, depois `<ZelinhoBriefing ... />` (só a lista de sinais de ontem em `SignalRow`s, sem saudação, sem cartão externo, sem borda superior), depois "Dias anteriores" com até 3 linhas `hist` (data por extenso, receita e vendas) e link `Ver histórico` que troca a aba.
- `ZelinhoBriefing.svelte`: remove `.briefing` com borda/fundo, remove `briefing-intro` e `DaySnapshotSummary`. Renderiza: título de seção `O que pede sua atenção` (16px/600) com link `Silenciar tipos de aviso` para `/gestao/gerente/preferencias`; lista `.signals` (borda 1px `var(--border-card)`, raio 12px, fundo `var(--bg-card)`) com `SignalRow` para cada sinal (props `onRead`, `onAsk`, `onMute`, `onQuickAction`); estado vazio dentro da lista: `Nada pede sua atenção hoje. Continue registrando as vendas e eu aviso quando algo mudar.`; estado "aprendendo" (`learning`) vira uma linha discreta acima da lista: `Ainda estou conhecendo seu ritmo: semana X de 4 ({salesDays} dias com venda de 28).`
- `SignalFeed.svelte`: usa `SignalRow` em vez de `SignalCard`; dias sem sinal continuam como linha `quiet`.
- `AgentActionsList.svelte`: sem cartão externo; lista `.acts` (mesma moldura da lista de sinais); cada linha `summary` + `meta` com pill de status (`Feita` verde, `Aguardando confirmação` âmbar, `Cancelada`/`Expirada`/`Falhou` neutras) + canal + hora; `Desfazer` como botão ghost 36px. Estado vazio: `Nada ainda.` + `Quando você pedir algo ao Zelinho e confirmar, a ação aparece aqui com hora, canal e a opção de desfazer.` + três chips de exemplo (`pausa o refri no cardápio`, `cria a categoria Sobremesas`, `preço do X-Bacon para 30`) que chamam `onExample(texto)` (nova prop; a página encaminha para `openAssistantWithMessage`).
- `stores/assistant.js`: nova função `openAssistantWithMessage(text)` que abre o painel e grava `prefillMessage` (novo `writable('')`) consumido pelo `AssistantChat` (Task 6). Já incluir nesta tarefa; o `AssistantChat` só lê na Task 6.
- Página: `onQuickAction = (mensagem) => openAssistantWithMessage(mensagem)`; `onAsk` continua `openAssistantWithSignal`.

- [ ] **Step 1: Testes que falham**

Substituir `tests/gerentePageNavigation.test.js` por:

```js
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

describe('gerente page redesign', () => {
  it('usa saudação, faixa do dia, abas e links de navegação', async () => {
    const page = await read('src/routes/gestao/gerente/+page.svelte');
    for (const t of ['buildGreeting', 'computeDayStrip', '<DayStrip', 'role="tablist"', 'Ações do Zelinho', 'Histórico', 'href="/gestao/gerente/semana"', 'href="/gestao/gerente/preferencias"', 'openAssistantWithMessage', 'onQuickAction']) expect(page).toContain(t);
    expect(page).not.toContain('tracking-[0.2em]');
    expect(page).toContain("select('snapshot_date, receita_bruta, receita_realizada, qtd_vendas, ticket_medio, metrics, computed_at')");
  });

  it('briefing e histórico usam SignalRow e não têm cartão aninhado', async () => {
    const briefing = await read('src/lib/components/gerente/ZelinhoBriefing.svelte');
    const feed = await read('src/lib/components/gerente/SignalFeed.svelte');
    expect(briefing).toContain('SignalRow');
    expect(briefing).not.toContain('SignalCard');
    expect(briefing).not.toContain('DaySnapshotSummary');
    expect(briefing).not.toMatch(/border-top:\s*2px/);
    expect(briefing).toContain('O que pede sua atenção');
    expect(feed).toContain('SignalRow');
    expect(feed).not.toContain('SignalCard');
  });

  it('a store abre o painel com uma mensagem pré-preenchida', async () => {
    const store = await read('src/lib/stores/assistant.js');
    expect(store).toContain('export const prefillMessage');
    expect(store).toContain('export function openAssistantWithMessage');
  });
});
```

Em `tests/gerenteAgentActionsList.test.js`, no `describe('gerente page renders actions list')`, acrescentar:

```js
  it('lista de ações tem pills de status e estado vazio com exemplos', async () => {
    const s = await readFile(new URL('../src/lib/components/gerente/AgentActionsList.svelte', import.meta.url), 'utf8');
    for (const t of ['Nada ainda.', 'onExample', 'pausa o refri no cardápio', 'Aguardando confirmação', 'Desfazer']) expect(s).toContain(t);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gerentePageNavigation.test.js tests/gerenteAgentActionsList.test.js`
Expected: FAIL.

- [ ] **Step 3: Store**

Em `src/lib/stores/assistant.js`, após `export const pendingAction = writable(null);`:

```js
export const prefillMessage = writable('');

export function openAssistantWithMessage(text) {
  const clean = typeof text === 'string' ? text.trim().slice(0, 1000) : '';
  if (!clean) return false;
  signalContext.set(null);
  screenContext.set(null);
  contextType.set('geral');
  prefillMessage.set(clean);
  isOpen.set(true);
  return true;
}
```

- [ ] **Step 4: `ZelinhoBriefing.svelte`**

Reescrever o arquivo inteiro:

```svelte
<script>
  import SignalRow from './SignalRow.svelte';
  export let signals = [];
  export let learning = false;
  export let salesDays = 0;
  export let onRead = () => {};
  export let onAsk = () => {};
  export let onMute = () => {};
  export let onQuickAction = () => {};
  $: week = Math.min(4, Math.max(1, Math.ceil(salesDays / 7)));
</script>

<section class="briefing" aria-labelledby="briefing-title">
  <div class="section-h"><h2 id="briefing-title">O que pede sua atenção</h2><a href="/gestao/gerente/preferencias">Silenciar tipos de aviso</a></div>
  {#if learning}<p class="learning">Ainda estou conhecendo seu ritmo: semana {week} de 4 ({salesDays} dias com venda de 28).</p>{/if}
  <div class="signals">
    {#if signals.length}
      {#each signals.slice(0, 3) as signal (signal.id)}<SignalRow {signal} {onRead} {onAsk} {onMute} {onQuickAction} />{/each}
    {:else}
      <p class="empty">Nada pede sua atenção hoje. Continue registrando as vendas e eu aviso quando algo mudar.</p>
    {/if}
  </div>
</section>

<style>
  .briefing { margin-top: 26px; }
  .section-h { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 10px; }
  .section-h h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-main); }
  .section-h a { font-size: 12px; color: var(--text-muted); text-decoration: none; min-height: 28px; display: inline-flex; align-items: center; }
  .section-h a:hover { color: var(--text-main); }
  .learning { margin: 0 0 10px; font-size: 12px; color: var(--text-muted); }
  .signals { border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); overflow: hidden; }
  .empty { margin: 0; padding: 18px; font-size: 13px; color: var(--text-muted); }
</style>
```

- [ ] **Step 5: `SignalFeed.svelte`**

Trocar `import SignalCard from './SignalCard.svelte';` por `import SignalRow from './SignalRow.svelte';`, acrescentar `export let onQuickAction = () => {};`, trocar o uso `<SignalCard {signal} {onRead} {onAsk} {onMute} muted={...} />` por `<SignalRow {signal} {onRead} {onAsk} {onMute} {onQuickAction} muted={mutedTypes.includes(signal.type)} />`, e envolver `.day-signals` na mesma moldura: `.day-signals { border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); overflow: hidden; }` (remover o `display: grid; gap: 10px`). Título `Histórico` permanece.

- [ ] **Step 6: `AgentActionsList.svelte`**

Reescrever o markup e estilos (manter a lógica de `load`/`undo` que já existe, acrescentar `export let onExample = () => {};`):

```svelte
<section class="acts-wrap" aria-labelledby="agent-actions-title">
  <div class="section-h"><h2 id="agent-actions-title">Ações do Zelinho</h2><span class="hint">o que foi feito a pedido seu, no app ou no WhatsApp</span></div>
  <div class="acts">
    {#if loading}
      <div class="skeleton" aria-hidden="true"></div>
    {:else if actions.length === 0}
      <div class="empty"><strong>Nada ainda.</strong><span>Quando você pedir algo ao Zelinho e confirmar, a ação aparece aqui com hora, canal e a opção de desfazer.</span><div class="examples">{#each ['pausa o refri no cardápio', 'cria a categoria Sobremesas', 'preço do X-Bacon para 30'] as ex}<button type="button" on:click={() => onExample(ex)}>{ex}</button>{/each}</div></div>
    {:else}
      {#each actions as action (action.id)}
        <div class="act">
          <div class="main"><span class="summary">{action.summary}</span><span class="meta"><span class="pill {action.status === 'executed' ? 'ok' : action.status === 'pending' ? 'warn' : 'mute'}">{describeStatus(action.status)}</span><span>{action.channel === 'whatsapp' ? 'WhatsApp' : 'App'} · {when(action)}</span></span></div>
          {#if canUndo(action)}<button type="button" class="undo" disabled={busyId === action.id} on:click={() => undo(action)}>Desfazer</button>{/if}
        </div>
      {/each}
    {/if}
  </div>
</section>
```

Estilos (substituir o bloco `<style>`):

```css
  .acts-wrap { margin-top: 26px; }
  .section-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 10px; }
  .section-h h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-main); }
  .hint { font-size: 12px; color: var(--text-muted); }
  .acts { border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); overflow: hidden; }
  .act { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--border-card); }
  .act:first-child { border-top: 0; }
  .main { display: grid; gap: 4px; min-width: 0; }
  .summary { font-size: 13px; color: var(--text-main); }
  .meta { font-size: 12px; color: var(--text-muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pill { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  .pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .pill.ok { background: var(--status-success-bg); color: var(--status-success-text); }
  .pill.warn { background: var(--status-warning-bg); color: var(--status-warning-text); }
  .pill.mute { background: var(--bg-input); color: var(--text-muted); }
  .undo { min-height: 36px; padding: 0 12px; border: 1px solid var(--border-subtle); border-radius: 6px; background: transparent; color: var(--text-label); font-size: 13px; font-weight: 500; cursor: pointer; }
  .undo:hover { color: var(--text-main); border-color: var(--border-strong); }
  .undo:disabled { opacity: .5; cursor: not-allowed; }
  .empty { padding: 22px 18px; display: grid; gap: 6px; color: var(--text-muted); font-size: 13px; }
  .empty strong { color: var(--text-label); font-weight: 600; }
  .examples { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .examples button { min-height: 32px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); font-size: 12px; cursor: pointer; }
  .examples button:hover { border-color: var(--primary); color: var(--text-main); }
  .skeleton { height: 56px; margin: 12px 18px; border-radius: 8px; background: var(--bg-input); }
```

- [ ] **Step 7: `+page.svelte`**

Reescrever a página (manter `load`, `read`, `mute`, `ask`, `refresh`, `onMount` como estão, ajustando as queries e acrescentando o que segue). Imports novos: `import { goto } from '$app/navigation'; import { page } from '$app/stores'; import { computeDayStrip } from '$lib/gerente/dayStrip.js'; import { buildGreeting } from '$lib/gerente/greeting.js'; import { openAssistantWithMessage } from '$lib/stores/assistant.js'; import DayStrip from '$lib/components/gerente/DayStrip.svelte';`. Remover a importação de `RefreshCw` se não for mais usada (manter o botão de refresh com o ícone se quiser; a copy é `Analisado hoje às {analysedAt}`).

Queries: `supabase.from('empresa_perfil').select('nome_exibicao, gerente_prefs')...` e `supabase.from('business_daily_snapshots').select('snapshot_date, receita_bruta, receita_realizada, qtd_vendas, ticket_medio, metrics, computed_at').order('snapshot_date', { ascending: false }).limit(56)`.

Derivações:

```js
  $: dayStrip = computeDayStrip(snapshots);
  $: greeting = buildGreeting({ nomeExibicao: profile?.nome_exibicao, dayStrip, signals: briefingSignals, hour: new Date().getHours() });
  $: tab = ['briefing', 'acoes', 'historico'].includes($page.url.searchParams.get('aba')) ? $page.url.searchParams.get('aba') : 'briefing';
  $: previousDays = snapshots.filter((s) => s.snapshot_date !== latestDate).slice(0, 3);
  $: executedCount = 0; // atualizado pela AgentActionsList via evento? Não: manter simples, sem contagem na aba nesta fase.
  function setTab(next) { goto(`?aba=${next}`, { replaceState: true, noScroll: true, keepFocus: true }); }
  function quick(mensagem) { closeSupport(); if (!openAssistantWithMessage(mensagem)) addToast('Não foi possível abrir o Zelinho.', 'error'); }
  const longDate = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' });
  const money0 = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0);
```

Markup:

```svelte
<svelte:head><title>Zelinho Gerente | ZeloPDV</title></svelte:head>
<section class="manager-page">
  <div class="head">
    <div>
      <p class="crumbs">Gestão <span>/ Zelinho Gerente</span></p>
      <h1>{greeting.title}</h1>
      <p class="lead">{greeting.lead}</p>
    </div>
    {#if analysedAt}<button type="button" class="meta" on:click={refresh} disabled={refreshing}><i class="dot" aria-hidden="true"></i>Analisado hoje às {analysedAt}</button>{/if}
  </div>

  <div class="tabs" role="tablist" aria-label="Seções do Zelinho">
    <button role="tab" class="tab" aria-selected={tab === 'briefing'} on:click={() => setTab('briefing')}>Briefing</button>
    <button role="tab" class="tab" aria-selected={tab === 'acoes'} on:click={() => setTab('acoes')}>Ações do Zelinho</button>
    <button role="tab" class="tab" aria-selected={tab === 'historico'} on:click={() => setTab('historico')}>Histórico</button>
    <a class="tab link" href="/gestao/gerente/semana">Resumo semanal</a>
    <a class="tab link" href="/gestao/gerente/preferencias">Preferências</a>
  </div>

  {#if loading}<div class="skeleton strip"></div><div class="skeleton row"></div><div class="skeleton row"></div>
  {:else if error}<div class="error-state"><CloudOff size={56} aria-hidden="true" /><p>{error}</p><button type="button" on:click={() => load()}>Tentar novamente</button></div>
  {:else if tab === 'briefing'}
    <DayStrip strip={dayStrip} />
    <ZelinhoBriefing signals={briefingSignals} {learning} {salesDays} onRead={read} onAsk={ask} onMute={mute} onQuickAction={quick} />
    {#if previousDays.length}
      <div class="section-h"><h2>Dias anteriores</h2><button type="button" class="linkish" on:click={() => setTab('historico')}>Ver histórico</button></div>
      {#each previousDays as day (day.snapshot_date)}<div class="hist"><b>{longDate(day.snapshot_date)}</b><span class="tabular-nums">{money0(day.receita_bruta)} em {day.qtd_vendas} vendas</span></div>{/each}
    {/if}
  {:else if tab === 'acoes'}
    <AgentActionsList {supabase} {getToken} onExample={quick} />
  {:else}
    <SignalFeed {signals} {snapshots} {mutedTypes} onRead={read} onAsk={ask} onMute={mute} onQuickAction={quick} />
  {/if}
</section>
```

Estilos (substituir o `<style>`):

```css
  .manager-page { max-width: 880px; margin: 0 auto; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .crumbs { margin: 0 0 6px; font-size: 12px; color: var(--text-muted); }
  .crumbs span { color: var(--text-label); }
  h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; color: var(--text-main); text-wrap: balance; }
  .lead { margin: 8px 0 0; color: var(--text-label); font-size: 16px; max-width: 60ch; }
  .meta { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; border: 0; background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; }
  .meta:disabled { opacity: .6; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--status-success-text); }
  .tabs { display: flex; gap: 2px; margin: 22px 0 18px; padding: 3px; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 8px; width: max-content; max-width: 100%; overflow-x: auto; }
  .tab { min-height: 36px; padding: 0 14px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; transition: background 180ms cubic-bezier(.22,1,.36,1), color 180ms cubic-bezier(.22,1,.36,1); }
  .tab:hover { color: var(--text-main); }
  .tab[aria-selected="true"] { background: var(--bg-panel); color: var(--text-main); }
  .tab.link { color: var(--text-muted); }
  .section-h { display: flex; align-items: baseline; justify-content: space-between; margin: 26px 0 10px; }
  .section-h h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-main); }
  .linkish { border: 0; background: transparent; padding: 0; min-height: 28px; font-size: 12px; color: var(--text-muted); cursor: pointer; }
  .linkish:hover { color: var(--text-main); }
  .hist { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; margin-bottom: 8px; border: 1px dashed var(--border-subtle); border-radius: 8px; color: var(--text-muted); font-size: 13px; }
  .hist b { color: var(--text-label); font-weight: 500; text-transform: capitalize; }
  .skeleton { border-radius: 12px; background: var(--bg-card); border: 1px solid var(--border-card); margin-bottom: 12px; }
  .skeleton.strip { height: 96px; } .skeleton.row { height: 88px; }
  .error-state { display: grid; place-items: center; gap: 10px; padding: 40px 0; color: var(--text-muted); }
  .error-state button { min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-main); cursor: pointer; }
  .tab:focus-visible, .meta:focus-visible, .linkish:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent); }
  @media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
```

Manter o `closeSupport` já importado e usado em `ask`. Remover `DaySnapshotSummary.svelte` só se `grep -rn "DaySnapshotSummary" src` não devolver nada além do próprio arquivo.

- [ ] **Step 8: Rodar, check e commit**

Run: `npx vitest run tests/gerentePageNavigation.test.js tests/gerenteAgentActionsList.test.js tests/assistant.store.test.js && npm run check`
Expected: PASS; 0 erros.

```bash
git add src/routes/gestao/gerente/+page.svelte src/lib/components/gerente/ZelinhoBriefing.svelte src/lib/components/gerente/SignalFeed.svelte src/lib/components/gerente/AgentActionsList.svelte src/lib/stores/assistant.js tests/gerentePageNavigation.test.js tests/gerenteAgentActionsList.test.js
git rm -q src/lib/components/gerente/DaySnapshotSummary.svelte 2>/dev/null || true
git commit -m "feat(gerente): página do Gerente com saudação, faixa do dia, abas e listas planas"
```

### Task 5: `ChatStreamCore` marca erros e aceita `quick_replies`

**Files:**
- Modify: `src/lib/components/chat/ChatStreamCore.svelte`
- Modify: `src/lib/stores/assistant.js`
- Test: `tests/assistant.store.test.js` (acrescentar), `tests/chatStreamCoreErrors.test.js`

**Interfaces:**
- `ChatStreamCore`: mensagens de falha passam a ser `{ role: 'assistant', content, error: true }` nos três pontos (`!response.ok`, `parsed.error`, `AbortError`/catch). Expõe no slot uma nova função `retryLast()` que reenvia o último `user` message (remove a última mensagem de erro e chama `sendMessage` com aquele texto). `sendMessage` aceita um argumento opcional `text` (usa `input` quando ausente).
- Store: `quickReplies = writable([])`, `setQuickReplies(options)` (aceita array de strings não vazias, máx. 6), `clearQuickReplies()`; `closeAssistant()` limpa; `pendingAction` já existe.

- [ ] **Step 1: Testes que falham**

```js
// tests/chatStreamCoreErrors.test.js
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('ChatStreamCore error state and retry', () => {
  it('marca mensagens de erro e expõe retryLast', async () => {
    const s = await readFile(new URL('../src/lib/components/chat/ChatStreamCore.svelte', import.meta.url), 'utf8');
    expect(s).toContain('error: true');
    expect(s).toContain('function retryLast');
    expect(s).toContain('{retryLast}');
    expect(s).toContain('async function sendMessage(text)');
  });
});
```

Acrescentar em `tests/assistant.store.test.js`:

```js
import { clearQuickReplies, quickReplies, setQuickReplies } from '../src/lib/stores/assistant.js';

describe('quickReplies store', () => {
  it('guarda até seis opções válidas e limpa ao fechar', () => {
    setQuickReplies(['A', '', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(get(quickReplies)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    clearQuickReplies();
    expect(get(quickReplies)).toEqual([]);
    setQuickReplies(['X']);
    closeAssistant();
    expect(get(quickReplies)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/chatStreamCoreErrors.test.js tests/assistant.store.test.js`
Expected: FAIL.

- [ ] **Step 3: Store**

```js
export const quickReplies = writable([]);

export function setQuickReplies(options) {
  const clean = Array.isArray(options) ? options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim()).slice(0, 6) : [];
  quickReplies.set(clean);
}

export function clearQuickReplies() {
  quickReplies.set([]);
}
```

E em `closeAssistant()` acrescentar `quickReplies.set([]);`.

- [ ] **Step 4: `ChatStreamCore.svelte`**

Alterações pontuais:

1. Assinatura: `async function sendMessage(text) { const content = (typeof text === 'string' ? text : input).trim(); if (!content || isStreaming) return;` (substituir as duas primeiras linhas atuais que usam `input.trim()`). Onde havia `input = '';`, manter (limpa o campo nos dois casos).
2. Função de erro única:
```js
  function failLastAssistantMessage(content) {
    messagesStore.update((items) => {
      if (!items.length) return items;
      const nextItems = [...items];
      nextItems[nextItems.length - 1] = { role: 'assistant', content, error: true };
      return nextItems;
    });
  }
```
   Usar `failLastAssistantMessage(...)` no lugar de `updateLastAssistantMessage(...)` nos três pontos de falha: `!response.ok || !response.body`, `parsed.error`, e o `catch` de conexão. `updateLastAssistantMessage` continua existindo para o caso de sucesso.
3. Retry:
```js
  function retryLast() {
    const items = $messagesStore;
    const lastUserIndex = [...items].map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex < 0) return;
    const text = items[lastUserIndex].content;
    messagesStore.set(items.slice(0, lastUserIndex));
    void sendMessage(text);
  }
```
   Expor no `<slot ...>`: `{retryLast}`.
4. `getRequestMessages` deve ignorar mensagens com `error: true` (não reenviar erro como histórico): `.filter((message) => (message?.role === 'user' || message?.content) && !message?.error)`.

- [ ] **Step 5: Rodar e commit**

Run: `npx vitest run tests/chatStreamCoreErrors.test.js tests/assistant.store.test.js tests/assistantChatAgentWiring.test.js && npm run check`
Expected: PASS; 0 erros.

```bash
git add src/lib/components/chat/ChatStreamCore.svelte src/lib/stores/assistant.js tests/chatStreamCoreErrors.test.js tests/assistant.store.test.js
git commit -m "feat(chat): estado de erro com tentar de novo e store de respostas rápidas"
```

### Task 6: Painel do Zelinho redesenhado

**Files:**
- Modify: `src/lib/components/AssistantChat.svelte`
- Modify: `tests/assistantChatAgentWiring.test.js`

**Interfaces:**
- Consome do `ChatStreamCore`: `messages`, `isStreaming`, `input`, `setInput`, `sendMessage`, `retryLast`, `onKeyDown`, `registerMessagesContainer`, `renderMarkdown`, `clearMessages`.
- Consome da store: `pendingAction`, `quickReplies`, `prefillMessage`, `signalContext`, `screenContext`.
- Eventos SSE: `pending_action` → `setPendingAction(action)` (agora com `effect`); `quick_replies` → `setQuickReplies(options)`. Ao enviar qualquer mensagem, `clearQuickReplies()`.

Layout e comportamento (copiar do protótipo):
- Cabeçalho: avatar quadrado 30px `background: var(--primary); color: var(--primary-text); border-radius: 8px` com a letra `Z`; nome `Zelinho` (13px/600); linha de status 11px `var(--text-muted)` com ponto verde e `Pronto para ajudar` (ou `Pensando…` enquanto `isStreaming`); à direita botões `Nova conversa` (ícone `Plus`, chama `clearMessages` e limpa `pendingAction`/`quickReplies`) e `Fechar`.
- Faixa de contexto (`signalContext`/`screenContext`) mantida, mas com o texto `Sobre o aviso` / `Sobre` em 12px e o título em 500, sem caixa alta.
- Mensagens: `.p-assistant` sem fundo e sem borda, texto 14px na largura toda com um marcador `Z` de 22px à esquerda (grade `22px 1fr`); `.p-user` com `background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 8px;` alinhada à direita, máx. 88%. Markdown do assistente com `p` (margem 0 0 8px) e `ul` (padding-left 18px). Mensagem com `error: true`: borda `var(--status-error-border)`, fundo `var(--status-error-bg)`, ícone `AlertCircle` e botão `Tentar de novo` (chama `retryLast`).
- Indicador de raciocínio: enquanto `isStreaming` e a última mensagem do assistente estiver vazia, mostrar um ponto azul pulsando e o texto `Pensando…`; após 1200 ms trocar para `Consultando os seus dados…` (timer local, cancelado ao chegar conteúdo). Sem chips de ferramenta.
- Cartão de proposta (`pendingAction`): bloco com cabeçalho `Proposta, aguardando você` (11px/600 em `var(--primary)` sobre `var(--accent-light)`), corpo com `summary` (13px) e `effect` (12px muted), linha com `Confirmar` (primário) e `Cancelar` (ghost) e `expira em m:ss` calculado de `expires_at` (contador a cada 500 ms; ao zerar, limpar a pendente e adicionar mensagem do assistente `Essa confirmação expirou. Me peça de novo e eu preparo outra vez.`). Ao confirmar/cancelar, o cartão não some: vira estado `Feita HH:MM` (cabeçalho verde `var(--status-success-bg)`/`var(--status-success-text)`) ou `Cancelada` (cabeçalho neutro), sem botões, e a resposta JSON `reply` entra como mensagem do assistente. Implementar guardando `resolvedCards` local (array de `{ id, summary, effect, status, time }`) renderizados no fluxo logo após a mensagem que os gerou (simplificação aceitável: renderizar a lista de cartões resolvidos ao final do histórico, antes do cartão pendente).
- Respostas rápidas: quando `quickReplies.length > 0`, renderizar pills (`min-height: 32px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: var(--bg-card); font-size: 13px`) logo abaixo da última mensagem do assistente; clicar envia o texto (`sendMessage(option)`) e limpa as pills. `Nenhum desses` e `Criar categoria nova` recebem cor `var(--text-muted)`.
- Sugestões iniciais: substituir os cartões `icebreaker` por três pills na área acima do compositor quando não há mensagens: `como foi ontem?`, `o que merece atenção?`, `pausa um produto no cardápio` (a terceira só preenche o campo, não envia).
- Compositor: `textarea` com `rows="1"` e auto-altura até 120px, placeholder `Peça algo ao Zelinho`, botão enviar quadrado 32px dentro da caixa (desabilitado quando vazio ou `isStreaming`), linha de ajuda 11px: `Mudanças só acontecem depois que você confirma.` à esquerda e `Enter envia` à direita. `onKeyDown` do core já trata Enter sem Shift.
- `prefillMessage`: quando muda para um valor não vazio, `setInput(valor)`, foca o campo e zera a store.
- Sem a subtítulo antigo `Seu gerente: pergunte ou peça uma ação`.

- [ ] **Step 1: Teste que falha**

Substituir o conteúdo de `tests/assistantChatAgentWiring.test.js` por:

```js
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const chat = new URL('../src/lib/components/AssistantChat.svelte', import.meta.url);
const core = new URL('../src/lib/components/chat/ChatStreamCore.svelte', import.meta.url);

describe('AssistantChat redesenhado', () => {
  it('fala com o agente e trata pendência, respostas rápidas, erro e pré-preenchimento', async () => {
    const source = await readFile(chat, 'utf8');
    expect(source).toContain('endpoint="/api/gerente/agent"');
    expect(source).not.toContain('endpoint="/api/chat/assistant"');
    expect(source).toContain('on:event={handleStreamEvent}');
    expect(source).toContain('message: content');
    for (const t of ['Proposta, aguardando você', 'confirm_action_id', 'cancel_action_id', 'expira em', 'quick_replies', 'setQuickReplies', 'prefillMessage', 'retryLast', 'Tentar de novo', 'Pensando', 'Consultando os seus dados', 'Peça algo ao Zelinho', 'Mudanças só acontecem depois que você confirma.', 'Nova conversa', '<textarea']) expect(source).toContain(t);
    expect(source).not.toContain('Seu gerente: pergunte ou peça uma ação');
    expect(source).not.toContain('icebreaker-icon');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/border-bottom-(left|right)-radius/);
  });

  it('ChatStreamCore repassa eventos tipados', async () => {
    const source = await readFile(core, 'utf8');
    expect(source).toContain("dispatch('event', parsed)");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/assistantChatAgentWiring.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `AssistantChat.svelte`**

Reescrever o componente seguindo as regras acima. Esqueleto de referência (completar com os estilos listados; manter `trackZelinhoUsage`, `getToken`, `prepareAssistantRequest`, foco/escape/`isModalViewport` e o backdrop como já existem):

```svelte
<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { isOpen, messages as assistantMessages, contextType, signalContext, screenContext, pendingAction, setPendingAction, clearPendingAction, quickReplies, setQuickReplies, clearQuickReplies, prefillMessage, closeAssistant, clearSignalContext, clearScreenContext, screenContextMatchesLocation } from '$lib/stores/assistant';
  import ChatStreamCore from '$lib/components/chat/ChatStreamCore.svelte';
  import { AlertCircle, Plus, X, ArrowUp, Clock3, Check } from 'lucide-svelte';
  import { getSignalPresenter } from '$lib/gerente/signalPresenter.js';

  const SUGGESTIONS = [
    { label: 'como foi ontem?', send: true },
    { label: 'o que merece atenção?', send: true },
    { label: 'pausa um produto no cardápio', send: false },
  ];
  // ... getToken, trackZelinhoUsage, prepareAssistantRequest (inalterados, com message: content)

  let resolvedCards = [];
  let actionBusy = false;
  let thinkingLabel = 'Pensando…';
  let thinkingTimer = null;
  let expiresIn = '';
  let expiryTimer = null;

  function handleStreamEvent(event) {
    const payload = event.detail;
    if (payload?.type === 'pending_action') setPendingAction(payload.action);
    if (payload?.type === 'quick_replies') setQuickReplies(payload.options);
  }

  async function resolvePendingAction(kind) {
    const action = $pendingAction;
    if (!action || actionBusy) return;
    actionBusy = true;
    try {
      const token = await getToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch('/api/gerente/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(kind === 'confirm' ? { confirm_action_id: action.id } : { cancel_action_id: action.id }) });
      const data = await response.json().catch(() => ({}));
      const ok = data?.ok === true;
      resolvedCards = [...resolvedCards, { id: action.id, summary: action.summary, effect: action.effect, status: kind === 'confirm' ? (ok ? 'done' : 'failed') : 'cancelled', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }];
      assistantMessages.update((items) => [...items, { role: 'assistant', content: data?.reply || data?.error || 'Não consegui concluir agora.' }]);
    } catch (error) {
      assistantMessages.update((items) => [...items, { role: 'assistant', content: error?.message || 'Erro de conexão. Tente novamente.', error: true }]);
    } finally {
      clearPendingAction();
      actionBusy = false;
    }
  }

  $: if ($pendingAction?.expires_at) startExpiry($pendingAction); else stopExpiry();
  function startExpiry(action) {
    stopExpiry();
    const tick = () => {
      const left = Math.max(0, new Date(action.expires_at).getTime() - Date.now());
      expiresIn = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
      if (left <= 0) { stopExpiry(); clearPendingAction(); assistantMessages.update((items) => [...items, { role: 'assistant', content: 'Essa confirmação expirou. Me peça de novo e eu preparo outra vez.' }]); }
    };
    tick(); expiryTimer = setInterval(tick, 500);
  }
  function stopExpiry() { if (expiryTimer) clearInterval(expiryTimer); expiryTimer = null; }
  onDestroy(stopExpiry);

  function watchThinking(isStreaming) {
    if (thinkingTimer) clearTimeout(thinkingTimer);
    thinkingLabel = 'Pensando…';
    if (isStreaming) thinkingTimer = setTimeout(() => { thinkingLabel = 'Consultando os seus dados…'; }, 1200);
  }

  let pendingPrefill = '';
  $: if ($prefillMessage) { pendingPrefill = $prefillMessage; prefillMessage.set(''); }
  // aplicar pendingPrefill dentro do slot via action (ver markup): setInput(pendingPrefill); foco; pendingPrefill = ''.

  function autoGrow(node) { const fit = () => { node.style.height = 'auto'; node.style.height = `${Math.min(120, node.scrollHeight)}px`; }; node.addEventListener('input', fit); fit(); return { destroy() { node.removeEventListener('input', fit); } }; }
  // ... restante (viewport modal, foco, escape) inalterado
</script>
```

Markup dentro de `<ChatStreamCore ... let:retryLast ...>` (além dos `let:` já existentes):

```svelte
  <div bind:this={panelElement} class="assistant-panel" class:open={$isOpen} role={$isOpen && isModalViewport ? 'dialog' : 'complementary'} aria-label="Zelinho" aria-modal={$isOpen && isModalViewport ? 'true' : undefined} aria-hidden={!$isOpen} inert={!$isOpen} on:keydown={handlePanelKeydown}>
    <div class="p-head">
      <div class="p-avatar" aria-hidden="true">Z</div>
      <div><div class="name">Zelinho</div><div class="status"><i class:busy={isStreaming}></i>{isStreaming ? 'Pensando…' : 'Pronto para ajudar'}</div></div>
      <div class="tools">
        <button type="button" class="iconb" title="Nova conversa" aria-label="Nova conversa" on:click={() => { clearMessages(); clearPendingAction(); clearQuickReplies(); resolvedCards = []; }}><Plus size={16} aria-hidden="true" /></button>
        <button type="button" class="iconb" aria-label="Fechar Zelinho" on:click={() => void closePanel()}><X size={16} aria-hidden="true" /></button>
      </div>
    </div>
    {#if $signalContext}<div class="ctx"><span>Sobre o aviso</span><b>{activeSignalPresenter.titulo}</b><button type="button" class="iconb" aria-label="Remover contexto do aviso" on:click={clearSignalContext}><X size={14} aria-hidden="true" /></button></div>
    {:else if $screenContext}<div class="ctx"><span>Sobre</span><b>{$screenContext.title}</b><button type="button" class="iconb" aria-label="Remover contexto da tela" on:click={clearScreenContext}><X size={14} aria-hidden="true" /></button></div>{/if}

    <div class="thread" use:registerMessagesContainer>
      {#if messages.length === 0}
        <div class="p-msg p-assistant"><span class="who" aria-hidden="true">Z</span><div class="txt"><p>Oi! Posso pausar produtos no cardápio, cadastrar categorias e produtos, alterar preços e te contar como foram as vendas. O que precisa?</p></div></div>
      {/if}
      {#each messages as msg, index}
        {#if msg.role === 'user'}
          <div class="p-msg p-user">{msg.content}</div>
        {:else if !msg.content && isStreaming && index === messages.length - 1}
          <div class="p-msg p-assistant"><span class="who" aria-hidden="true">Z</span><div class="thinking" role="status" aria-live="polite">{thinkingLabel}</div></div>
        {:else if msg.error}
          <div class="p-msg p-assistant error"><span class="who" aria-hidden="true"><AlertCircle size={14} /></span><div class="txt"><p>{msg.content}</p><button type="button" class="retry" on:click={retryLast}>Tentar de novo</button></div></div>
        {:else}
          <div class="p-msg p-assistant"><span class="who" aria-hidden="true">Z</span><div class="txt markdown-content">{@html renderMarkdown(msg.content)}</div></div>
        {/if}
      {/each}
      {#each resolvedCards as card (card.id)}
        <div class="proposal {card.status}"><div class="ph">{#if card.status === 'done'}<Check size={13} aria-hidden="true" />Feita {card.time}{:else if card.status === 'cancelled'}Cancelada{:else}Não deu certo{/if}</div><div class="pb"><div class="what">{card.summary}</div>{#if card.effect}<div class="fx">{card.effect}</div>{/if}</div></div>
      {/each}
      {#if $pendingAction}
        <div class="proposal" role="group" aria-label="Confirmar ação do Zelinho"><div class="ph"><Clock3 size={13} aria-hidden="true" />Proposta, aguardando você</div><div class="pb"><div class="what">{$pendingAction.summary}</div>{#if $pendingAction.effect}<div class="fx">{$pendingAction.effect}</div>{/if}<div class="row"><button type="button" class="btn primary" disabled={actionBusy} on:click={() => resolvePendingAction('confirm')}>Confirmar</button><button type="button" class="btn ghost" disabled={actionBusy} on:click={() => resolvePendingAction('cancel')}>Cancelar</button><span class="exp tabular-nums">expira em {expiresIn}</span></div></div></div>
      {/if}
      {#if $quickReplies.length && !isStreaming}
        <div class="choices">{#each $quickReplies as option}<button type="button" class:alt={option === 'Nenhum desses' || option === 'Criar categoria nova'} on:click={() => { clearQuickReplies(); void sendMessage(option); }}>{option}</button>{/each}</div>
      {/if}
    </div>

    {#if messages.length === 0}
      <div class="suggest">{#each SUGGESTIONS as s}<button type="button" on:click={() => { if (s.send) void sendMessage(s.label); else { setInput(s.label); inputElement?.focus(); } }}>{s.label}</button>{/each}</div>
    {/if}

    <div class="composer">
      <label class="sr-only" for="zelinho-message">Mensagem para o Zelinho</label>
      <div class="box">
        <textarea id="zelinho-message" rows="1" bind:this={inputElement} value={input} use:autoGrow on:input={(event) => setInput(event.currentTarget.value)} on:keydown={onKeyDown} placeholder="Peça algo ao Zelinho" disabled={isStreaming} maxlength="1000"></textarea>
        <button type="button" class="send" on:click={() => void sendMessage()} disabled={isStreaming || !input.trim()} aria-label="Enviar"><ArrowUp size={15} aria-hidden="true" /></button>
      </div>
      <div class="hintline"><span>Mudanças só acontecem depois que você confirma.</span><span><kbd>Enter</kbd> envia</span></div>
    </div>
  </div>
```

Onde `pendingPrefill` precisa de `setInput` (só disponível dentro do slot), usar uma reatividade dentro do slot: `{#if pendingPrefill}{@const _ = (setInput(pendingPrefill), pendingPrefill = '', void tick().then(() => inputElement?.focus()))}{/if}` **não é permitido em Svelte**. Em vez disso, criar uma action `use:applyPrefill={{ value: pendingPrefill, setInput }}` no `textarea`: a action, no `update`, quando `value` não vazio, chama `setInput(value)`, foca o nó e dispara `pendingPrefill = ''` via callback (`onApplied`). Passar `onApplied: () => { pendingPrefill = ''; }`.

Chamar `watchThinking(isStreaming)` com `$: watchThinking(isStreaming)` dentro do componente **não funciona** porque `isStreaming` vem do slot; em vez disso, escutar o evento `send` do `ChatStreamCore` (`on:send={() => watchThinking(true)}`) e `on:streamComplete={() => watchThinking(false)}`.

Estilos (substituir o bloco `<style>` inteiro; manter regras do backdrop e responsivas existentes para `.assistant-panel`):

```css
  .assistant-panel { position: fixed; top: 0; right: 0; width: 25rem; max-width: 100vw; height: 100vh; background: var(--bg-panel); border-left: 1px solid var(--border-card); z-index: 90; display: flex; flex-direction: column; transform: translateX(100%); transition: transform var(--transition-fast); }
  .assistant-panel.open { transform: translateX(0); }
  .assistant-backdrop { position: fixed; inset: 0; z-index: 89; background: color-mix(in srgb, var(--text-inverse) 62%, transparent); }
  @media (min-width: 1280px) { .assistant-backdrop { display: none; } }
  @media (max-width: 767px) { .assistant-panel { width: 100vw; height: auto; bottom: var(--mobile-bottom-nav-offset); border-left: 0; } }
  .p-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
  .p-avatar { width: 30px; height: 30px; border-radius: 8px; background: var(--primary); color: var(--primary-text); display: grid; place-items: center; font-weight: 700; font-size: 13px; }
  .name { font-weight: 600; font-size: 13px; line-height: 1.2; color: var(--text-main); }
  .status { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
  .status i { width: 6px; height: 6px; border-radius: 50%; background: var(--status-success-text); }
  .status i.busy { background: var(--primary); animation: blink 1s ease-in-out infinite; }
  .tools { margin-left: auto; display: flex; gap: 2px; }
  .iconb { width: 34px; height: 34px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
  .iconb:hover { background: var(--bg-input); color: var(--text-main); }
  .ctx { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-card); font-size: 12px; color: var(--text-muted); }
  .ctx b { color: var(--text-label); font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ctx .iconb { margin-left: auto; }
  .thread { flex: 1; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 16px; }
  .p-msg { font-size: 14px; line-height: 1.55; word-break: break-word; }
  .p-user { align-self: flex-end; max-width: 88%; padding: 8px 12px; border-radius: 8px; background: var(--bg-panel); border: 1px solid var(--border-subtle); color: var(--text-main); white-space: pre-wrap; }
  .p-assistant { display: grid; grid-template-columns: 22px minmax(0, 1fr); column-gap: 10px; color: var(--text-main); }
  .who { width: 22px; height: 22px; border-radius: 6px; background: var(--primary); color: var(--primary-text); font-size: 11px; font-weight: 700; display: grid; place-items: center; margin-top: 2px; }
  .p-assistant.error .who { background: var(--status-error-bg); color: var(--status-error-text); }
  .p-assistant.error .txt { border: 1px solid var(--status-error-border); background: var(--status-error-bg); border-radius: 8px; padding: 10px 12px; }
  .retry { margin-top: 6px; min-height: 36px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); font-size: 13px; cursor: pointer; }
  .txt :global(p) { margin: 0 0 8px; } .txt :global(p:last-child) { margin: 0; }
  .txt :global(ul), .txt :global(ol) { margin: 0 0 8px; padding-left: 18px; } .txt :global(li) { margin: 2px 0; }
  .txt :global(strong) { font-weight: 600; }
  .txt :global(code) { background: var(--bg-input); padding: .1rem .3rem; border-radius: 4px; font-family: monospace; }
  .thinking { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
  .thinking::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); animation: blink 1s ease-in-out infinite; }
  @keyframes blink { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
  .proposal { border: 1px solid var(--primary); border-radius: 8px; background: var(--bg-card); overflow: hidden; }
  .proposal .ph { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: var(--accent-light); color: var(--primary); font-size: 11px; font-weight: 600; }
  .proposal.done { border-color: var(--border-subtle); } .proposal.done .ph { background: var(--status-success-bg); color: var(--status-success-text); }
  .proposal.cancelled, .proposal.failed { border-color: var(--border-subtle); opacity: .75; } .proposal.cancelled .ph, .proposal.failed .ph { background: var(--bg-input); color: var(--text-muted); }
  .pb { padding: 10px 12px 12px; display: grid; gap: 8px; }
  .what { font-size: 13px; color: var(--text-main); } .fx { font-size: 12px; color: var(--text-muted); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .exp { margin-left: auto; font-size: 11px; color: var(--text-muted); }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border-radius: 6px; border: 1px solid transparent; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn.primary { background: var(--primary); color: var(--primary-text); } .btn.primary:hover { background: var(--primary-hover); }
  .btn.ghost { background: transparent; color: var(--text-label); border-color: var(--border-subtle); } .btn.ghost:hover { color: var(--text-main); border-color: var(--border-strong); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .choices { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 32px; }
  .choices button { min-height: 32px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-main); font-size: 13px; cursor: pointer; transition: border-color 180ms cubic-bezier(.22,1,.36,1), background 180ms cubic-bezier(.22,1,.36,1); }
  .choices button:hover { border-color: var(--primary); background: var(--accent-light); }
  .choices button.alt { color: var(--text-muted); }
  .suggest { display: flex; gap: 6px; padding: 8px 14px 0; overflow-x: auto; scrollbar-width: none; }
  .suggest::-webkit-scrollbar { display: none; }
  .suggest button { flex: 0 0 auto; min-height: 32px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); font-size: 12px; cursor: pointer; }
  .suggest button:hover { border-color: var(--primary); color: var(--text-main); }
  .composer { padding: 10px 14px 14px; display: grid; gap: 6px; flex-shrink: 0; }
  .box { display: flex; align-items: flex-end; gap: 6px; padding: 6px 6px 6px 12px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-input); transition: border-color 180ms cubic-bezier(.22,1,.36,1); }
  .box:focus-within { border-color: var(--primary); }
  .box textarea { flex: 1; resize: none; border: 0; background: transparent; color: var(--text-main); font: inherit; font-size: 13px; line-height: 1.5; padding: 6px 0; max-height: 120px; outline: none; }
  .box textarea::placeholder { color: var(--text-muted); }
  .box textarea:disabled { opacity: .6; }
  .send { width: 32px; height: 32px; border: 0; border-radius: 6px; background: var(--primary); color: var(--primary-text); display: grid; place-items: center; cursor: pointer; }
  .send:disabled { background: var(--border-subtle); color: var(--text-muted); cursor: not-allowed; }
  .hintline { font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; gap: 8px; }
  kbd { font: inherit; font-size: 11px; padding: 0 5px; border: 1px solid var(--border-subtle); border-bottom-width: 2px; border-radius: 4px; color: var(--text-muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .iconb:focus-visible, .btn:focus-visible, .choices button:focus-visible, .suggest button:focus-visible, .send:focus-visible, .retry:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent); }
  @media (prefers-reduced-motion: reduce) { .assistant-panel, .box, .choices button { transition: none; } .thinking::before, .status i.busy { animation: none; } }
```

- [ ] **Step 4: Rodar, check e commit**

Run: `npx vitest run tests/assistantChatAgentWiring.test.js tests/assistant.store.test.js tests/chatStreamCoreErrors.test.js && npm run check`
Expected: PASS; 0 erros.

```bash
git add src/lib/components/AssistantChat.svelte tests/assistantChatAgentWiring.test.js
git commit -m "feat(gerente): painel do Zelinho redesenhado com proposta, respostas rápidas e erro com tentar de novo"
```

### Task 7: Limpeza, docs e verificação

**Files:**
- Delete (se sem uso): `src/lib/components/gerente/SignalCard.svelte` (confirmar com `grep -rn "SignalCard" src tests`; se `tests/*` referenciarem, atualizar o teste para `SignalRow`)
- Modify: `docs/DESIGN_PATTERNS.md`, `docs/CURRENT.md`

- [ ] **Step 1: Remover componentes sem uso e ajustar testes**

Run: `grep -rn "SignalCard\|DaySnapshotSummary" src tests`. Para cada referência restante em `tests/`, trocar para o componente novo mantendo a asserção equivalente. Depois `git rm` dos arquivos sem referência.

- [ ] **Step 2: DESIGN_PATTERNS.md**

Acrescentar seção `## 14. Zelinho Gerente e painel do Zelinho (2026-09-02)` descrevendo: cabeçalho com saudação (h1 28px) em vez de eyebrow em caixa alta; listas de sinais em linhas (`SignalRow`) dentro de uma moldura única, nunca cartão dentro de cartão; `DayStrip` para números com contexto; painel do Zelinho com mensagens do assistente sem bolha, mensagem do dono em bloco discreto, cartão `Proposta, aguardando você`, respostas rápidas em pills, erro com `Tentar de novo`; regra: **nunca exibir nomes de ferramenta ou ids ao usuário**.

- [ ] **Step 3: CURRENT.md**

Novo item no topo: `Zelinho Gerente redesenhado (2026-09-02)` com os componentes novos, a regra de não mostrar ferramentas, os frames `pending_action.effect` e `quick_replies`, e a nota de que a validação visual em navegador ainda está pendente.

- [ ] **Step 4: Suíte completa**

Run: `npm test && npm run check`
Expected: mesma linha de base anterior (só as 2 falhas preexistentes de `gerente.weekReport`), 0 erros no check.

- [ ] **Step 5: Commit**

```bash
git add -A docs/DESIGN_PATTERNS.md docs/CURRENT.md src tests
git commit -m "chore(gerente): remover componentes antigos e documentar o redesenho"
```
