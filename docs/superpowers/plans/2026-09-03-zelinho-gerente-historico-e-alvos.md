# Zelinho Gerente: alvos confiáveis, histórico de conversas e acesso no celular

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Impedir que o agente prepare ações com id inventado, dar histórico de conversas com botão de rebobinar, tornar o chat alcançável no celular e deixar o "Desfazer" explícito.

**Evidência que motiva o plano** (linhas reais de `gerente_agent_actions`, 2026-09-03):

| Hora | Ferramenta | Argumentos | Status |
| --- | --- | --- | --- |
| 01:17:50 | `pausar_no_cardapio` | `produto_id: 850, pausado: false` | executed |
| 01:18:11 | `pausar_no_cardapio` | `produto_id: 850, pausado: true` | cancelled |
| 01:20:06 | `pausar_no_cardapio` | **`produto_id: 0`**, `pausado: true` | failed (`Não encontrei esse produto.`) |
| 01:20:48 | `pausar_no_cardapio_undo` | `produto_id: 850, pausado: true` | executed |

O modelo inventou `produto_id: 0`. O mesmo aconteceu com `criar_produto` recebendo `categoria_id: 1` quando "Sobremesas" era 225, e `categoria_id: 0` em outra tentativa. Um id errado que *existe* criaria o produto na categoria errada sem ninguém perceber. O "Desfazer" funcionou como projetado (desfez a despausa, repausando o produto), mas o dono achou que estava desfazendo a ação que falhou.

Também confirmado: `gerente_agent_sessions` tem índice único por `(owner, channel, channel_ref)`, então existe **uma única sessão para sempre** por canal. "Nova conversa" só limpa a tela; o modelo continua vendo as últimas 30 mensagens da mesma sessão.

## Global Constraints

- Nunca mostrar nome de ferramenta, id de ação, id de produto/categoria ou JSON ao dono.
- Tokens do tema apenas, sem hex. Escala tipográfica 11/12/13/14/16/20/28px. Raios 6/8/12px ou pill. Alvo de toque ≥ 44px no que for primário, ≥ 36px em lista densa.
- Arquivos em LF, sem BOM. Verificar com `node -e "const fs=require('fs');for(const f of process.argv.slice(1))console.log(f,(fs.readFileSync(f,'latin1').match(/\r/g)||[]).length)" <arquivos>`. Nunca usar `grep -c $'\r'` nem PowerShell para escrever arquivo.
- Migrations são forward-only; nunca editar arquivo já aplicado.
- Implementadores **não commitam**. Cada tarefa termina com os testes indicados verdes e `npm run check` com 0 erros, e o orquestrador revisa e commita.
- Falhas preexistentes conhecidas e aceitáveis: 2 casos em `tests/gerente.weekReport.test.js`.

---

### Task 1: O servidor resolve o alvo; o modelo não escolhe id

**Files:**
- Create: `src/lib/server/gerente/resolveTargets.js`
- Modify: `src/lib/server/gerente/agent.js`, `src/lib/server/gerente/tools/catalog.js`, `src/lib/server/gerente/prompt.js`
- Create: `tests/gerente.resolveTargets.test.js`
- Modify: `tests/gerente.agent.run.test.js`, `tests/gerente.agent.registry.test.js`, `tests/gerente.catalogTools.test.js` (o nome real do teste de catálogo; confirme com `ls tests | grep -i catalog`)

**Interfaces:**

```js
// src/lib/server/gerente/resolveTargets.js
export async function resolveWriteTargets(db, ownerUserId, toolName, args)
// -> { ok: true, args: object } | { ok: false, motivo: string }
```

Regras, usando `normalizeText` já exportado de `tools/catalog.js` (importe de lá; não duplique):

- **Ferramentas com produto** (`pausar_no_cardapio`, `ocultar_no_pdv`, `alterar_preco`):
  1. `id = Number(args.produto_id)`. Se for inteiro > 0, buscar em `produtos` por `id` + `id_usuario = ownerUserId` (colunas `id, nome`). Se achou e (`args.nome_produto` vazio **ou** `normalizeText(nome) === normalizeText(args.nome_produto)`), devolver `{ ok: true, args: { ...args, produto_id: id, nome_produto: nome } }`.
  2. Senão, buscar por nome: `produtos.select('id, nome').eq('id_usuario', owner).ilike('nome', '%' + termo + '%').limit(10)` com `termo = args.nome_produto`. Filtrar em JS: primeiro casamento exato por `normalizeText`; se houver exatamente 1, aceitar. Se não houver exato, usar os parciais; se houver exatamente 1, aceitar.
  3. Zero resultados: `{ ok: false, motivo: 'Não encontrei o produto "<nome>" no catálogo deste dono. Chame buscar_produto de novo com outro termo ou peça o nome exato antes de preparar a mudança.' }`
  4. Mais de um: `{ ok: false, motivo: 'Mais de um produto combina com "<nome>": <A>, <B>. Pergunte ao dono qual é antes de preparar a mudança.' }` (até 3 nomes)
  5. `args.nome_produto` vazio e id inválido: `{ ok: false, motivo: 'Preciso do nome exato do produto. Chame buscar_produto antes.' }`
- **`criar_produto`** (categoria): mesma lógica contra `categorias` (`select('id, nome').eq('id_usuario', owner)`), campos `categoria_id` e `nome_categoria`. Zero: `{ ok: false, motivo: 'A categoria "<nome>" não existe. Crie a categoria antes ou peça ao dono para escolher uma das existentes.' }`. Sem id válido e sem nome: `{ ok: false, motivo: 'Preciso saber em qual categoria cadastrar. Chame listar_categorias antes.' }`.
- **Qualquer outra ferramenta** (inclusive `criar_categoria`): `{ ok: true, args }` sem tocar em nada.
- Erro de banco: deixar propagar (o chamador já trata exceção do turno).

**Wiring em `agent.js`**, no ramo `if (tool?.write)`, substituindo o bloco atual por, nesta ordem:

```js
        if (pendingAction) {
          result = { status: 'nao_preparado', motivo: 'Só uma mudança por vez. A ação anterior já está aguardando confirmação; prepare a próxima depois que o dono confirmar.' };
        } else {
          const resolved = await resolveWriteTargets(db, ownerUserId, name, args);
          if (!resolved.ok) {
            result = { status: 'nao_preparado', motivo: resolved.motivo };
          } else {
            const summary = summarizeAction(name, resolved.args);
            const created = await createPendingAction(db, { ownerUserId, sessionId: session.id, actorUserId, channel, toolName: name, args: resolved.args, summary, now });
            pendingAction = { ...created, effect: summarizeEffect(name, resolved.args) };
            result = { status: 'aguardando_confirmacao', resumo: pendingAction.summary, acao_id: pendingAction.id };
          }
        }
```

**Pausa em produto não publicado** (`tools/catalog.js`, função `pausarNoCardapio`): antes de chamar a RPC, ler a publicação (`zelomenu_product_publications.select('visivel_online').eq('id_usuario', ownerUserId).eq('id_produto', produto_id).maybeSingle()`). Se não existir linha ou `visivel_online !== true`, devolver `{ ok: false, error: 'Esse produto não está publicado no cardápio digital, então pausar ou despausar não muda nada para os clientes. Para publicá-lo, o dono usa o ZeloMenu.' }`. Só então chamar a RPC. Justifique em comentário que é checagem de política, não invariante, e que a RPC continua sendo a autoridade transacional.

**Prompt** (`prompt.js`), acrescentar na lista "O que você faz", logo depois da linha que fala de `buscar_produto`:

```
- Os ids vêm SEMPRE de buscar_produto ou listar_categorias na mesma conversa. Nunca invente, adivinhe ou repita um id de memória, e nunca use 0. Se não tiver o id em mãos, chame a ferramenta de busca primeiro. Quando uma ferramenta devolver status "nao_preparado", explique o motivo ao dono em uma frase e faça a pergunta que resolve; não tente de novo com o mesmo id.
```

- [ ] **Step 1: Testes que falham primeiro**

Criar `tests/gerente.resolveTargets.test.js` cobrindo: id válido com nome batendo; id 0 caindo para busca por nome exato; id existente com nome divergente resolvendo pelo nome; zero resultados; ambíguo com dois nomes na mensagem; `criar_produto` com `categoria_id: 1` quando o nome aponta para outra categoria; `criar_categoria` passando intacto. Use um stub de `db` no estilo de `tests/helpers/gerenteStubs.js` (leia o helper e reaproveite `makeDb`/`baseTables` se couberem; se não couberem, escreva um stub local mínimo no próprio arquivo de teste).

Em `tests/gerente.agent.run.test.js`, acrescentar: turno em que o modelo chama `pausar_no_cardapio` com `produto_id: 0` e o produto existe pelo nome → a ação pendente é criada com o id correto; e turno em que o nome não existe → nenhuma ação criada e a mensagem de ferramenta tem `status: 'nao_preparado'`.

Em `tests/gerente.agent.registry.test.js`, garantir que o prompt contém `nunca use 0`.

- [ ] **Step 2:** `npx vitest run tests/gerente.resolveTargets.test.js tests/gerente.agent.run.test.js tests/gerente.agent.registry.test.js` → deve falhar.
- [ ] **Step 3:** Implementar `resolveTargets.js`, o wiring em `agent.js`, a checagem em `catalog.js` e o parágrafo do prompt.
- [ ] **Step 4:** Rodar `npx vitest run tests/gerente.resolveTargets.test.js tests/gerente.agent.run.test.js tests/gerente.agent.registry.test.js tests/api.gerente-agent.test.js tests/gerente.channel.test.js` mais o arquivo de teste do catálogo, e `npm run check`. Colar as linhas de resumo reais.

---

### Task 2: Várias conversas por dono, com histórico legível

**Files:**
- Create: `supabase/migrations/20260903010000_gerente_agent_session_history.sql`
- Modify: `src/lib/server/gerente/sessions.js`
- Create: `src/routes/api/gerente/sessions/+server.js`, `src/routes/api/gerente/sessions/[id]/+server.js`
- Create: `tests/gerente.sessions.test.js`, `tests/api.gerente-sessions.test.js`

**Migration** (forward-only, aditiva, sem perda de dados):

```sql
-- Uma sessão aberta por canal; as fechadas viram histórico.
alter table public.gerente_agent_sessions add column if not exists title text;

drop index if exists public.gerente_agent_sessions_owner_channel_ref_idx;

create unique index if not exists gerente_agent_sessions_open_owner_channel_ref_idx
  on public.gerente_agent_sessions (owner_user_id, channel, coalesce(channel_ref, ''))
  where status = 'open';

create index if not exists gerente_agent_sessions_owner_last_message_idx
  on public.gerente_agent_sessions (owner_user_id, last_message_at desc nulls last);
```

**`sessions.js`:**
- `getOrCreateSession` passa a filtrar `.eq('status', 'open')` na busca; o insert continua igual (o default de `status` já é `'open'`).
- `appendMessages`: além de `last_message_at`, gravar o título quando ainda não houver. Buscar `title` da sessão; se for nulo, usar a primeira mensagem `role === 'user'` do lote, com `String(content).replace(/\s+/g, ' ').trim().slice(0, 60)`. Uma única atualização combinando `last_message_at` e, quando aplicável, `title`.
- Novo `export async function closeOpenSession(db, { ownerUserId, channel, channelRef = null })`: atualiza para `status: 'closed'` a sessão aberta daquele canal e devolve `{ closed: boolean }`. Se não houver sessão aberta ou ela não tiver nenhuma mensagem (`last_message_at` nulo), devolver `{ closed: false }` sem fechar, para não encher o histórico de conversas vazias.
- Novo `export async function listSessions(db, { ownerUserId, limit = 20 })`: devolve `[{ id, title, channel, status, created_at, last_message_at }]` do dono, só as que têm `last_message_at` não nulo, ordenadas por `last_message_at desc`, limitadas. `title` nulo vira `'Conversa'`.
- Novo `export async function loadSessionMessages(db, { sessionId, ownerUserId, limit = 100 })`: devolve `{ found: boolean, messages: [{ role, content, created_at }] }` só com `role` em `user`/`assistant` e `content` não vazio, em ordem cronológica. `found: false` quando a sessão não é do dono.

**Rotas** (mesma guarda do agente: exigir Bearer, resolver `getServerAccessContext`, responder 403 com `{ error: 'Por enquanto, só o dono da empresa conversa com o Zelinho Gerente.' }` para subusuário; copie o cabeçalho de `src/routes/api/gerente/agent/+server.js`, incluindo rate limit se ele já estiver lá, com limite próprio mais folgado):

- `GET /api/gerente/sessions` → `{ sessions: [...] }` (usa `listSessions`).
- `POST /api/gerente/sessions` → fecha a conversa aberta do canal `app` e devolve `{ ok: true, closed: boolean }`.
- `GET /api/gerente/sessions/[id]` → `{ messages: [...] }`; 404 com `{ error: 'Conversa não encontrada.' }` quando `found` for falso.

**Testes:** `tests/gerente.sessions.test.js` cobre `closeOpenSession` (sem sessão, sessão vazia, sessão com mensagens), `listSessions` (ordem, título padrão, filtro de vazias) e `loadSessionMessages` (escopo por dono, filtro de role). `tests/api.gerente-sessions.test.js` cobre 403 de subusuário, listagem, criação de nova conversa e 404 de sessão de outro dono, no estilo de `tests/api.gerente-agent.test.js`.

- [ ] **Step 1:** Escrever os dois arquivos de teste.
- [ ] **Step 2:** `npx vitest run tests/gerente.sessions.test.js tests/api.gerente-sessions.test.js` → falha.
- [ ] **Step 3:** Migration, `sessions.js` e as duas rotas.
- [ ] **Step 4:** `npx vitest run tests/gerente.sessions.test.js tests/api.gerente-sessions.test.js tests/api.gerente-agent.test.js tests/gerente.agent.run.test.js tests/gerente.channel.test.js` e `npm run check`. **Não aplicar a migration no banco**; o orquestrador aplica.

---

### Task 3: Histórico no painel, botão de nova conversa de verdade e bolha no celular

**Files:**
- Modify: `src/lib/components/AssistantChat.svelte`
- Modify: `src/routes/gestao/gerente/+page.svelte`
- Modify: `tests/assistantChatAgentWiring.test.js`, `tests/gerentePageNavigation.test.js`

**Contrato do servidor** (Task 2, escreva contra ele mesmo que ainda não exista no seu worktree): `GET /api/gerente/sessions` → `{ sessions: [{ id, title, channel, status, created_at, last_message_at }] }`; `POST /api/gerente/sessions` → `{ ok, closed }`; `GET /api/gerente/sessions/<id>` → `{ messages: [{ role, content, created_at }] }`. Todas exigem `Authorization: Bearer <token>` (use o `getToken()` que já existe no componente).

**Histórico no painel:**
- No cabeçalho, antes do botão "Nova conversa", um botão com o ícone `History` do `lucide-svelte`, `aria-label="Conversas anteriores"`.
- Ao clicar, carrega `GET /api/gerente/sessions` e mostra um painel sobreposto **dentro** do painel do Zelinho (mesma largura, cobrindo thread e compositor), com título "Conversas anteriores", botão de fechar, e a lista: título da conversa em 13px e a data em 12px `var(--text-muted)` formatada como `hoje HH:MM`, `ontem HH:MM` ou `dd/mm`. Estado de carregamento com uma linha esqueleto; estado vazio com "Nenhuma conversa por aqui ainda."; erro com "Não consegui carregar suas conversas." e botão "Tentar de novo".
- Clicar numa conversa carrega `GET /api/gerente/sessions/<id>` e mostra as mensagens **somente leitura** no lugar do thread, com uma faixa no topo: "Conversa de {data}" e um botão "Voltar para a conversa atual". Enquanto está nesse modo, o compositor fica escondido e nenhum cartão de proposta ou pill aparece. Guardar em `let viewingSession = null` e usar `{#if viewingSession}` para trocar o corpo do painel; a conversa atual continua na store, intacta.
- A conversa aberta no momento não precisa aparecer na lista; se aparecer, não há problema.

**Nova conversa de verdade:** o botão `+` passa a ser `async`: chama `POST /api/gerente/sessions`, e só então limpa (`clearMessages()`, `clearPendingAction()`, `clearQuickReplies()`, `resolvedCards = []`, `viewingSession = null`). Se a chamada falhar, não limpar e mostrar a mensagem de erro como mensagem do assistente com `error: true`. Desabilitar o botão enquanto a chamada estiver em voo.

**Bolha no celular:** na página `/gestao/gerente`, um botão flutuante redondo de 56px, `position: fixed`, canto inferior direito, acima da navegação inferior do celular (usar `bottom: calc(var(--mobile-bottom-nav-offset, 0px) + 16px)`; confirme o nome real da variável em `src/themes/base.css` ou em `src/routes/+layout.svelte` antes de usar, e caia para `16px` se não existir), `right: 16px`, fundo `var(--primary)`, ícone `MessageCircle` em `var(--primary-text)`, `aria-label="Falar com o Zelinho"`, sombra discreta. Deve aparecer **só quando o painel estiver fechado** (`$isOpen === false`, importando `isOpen` de `$lib/stores/assistant.js`) e ficar acima do conteúdo mas abaixo do painel (`z-index: 80`, sendo o painel 90). Clique abre o Zelinho sem contexto de aviso: importe e use `openAssistantWithMessage`? **Não** — isso preenche uma mensagem. Use `isOpen.set(true)` mais `closeSupport()` para não abrir os dois chats juntos.

**Testes:** em `tests/assistantChatAgentWiring.test.js`, acrescentar guardas para `'/api/gerente/sessions'`, `'Conversas anteriores'`, `'Voltar para a conversa atual'`, `'viewingSession'` e ausência de hex. Em `tests/gerentePageNavigation.test.js`, guardas para `'Falar com o Zelinho'` e para a regra de só aparecer com o painel fechado.

- [ ] **Step 1:** Testes primeiro. **Step 2:** ver falhar. **Step 3:** implementar. **Step 4:** `npx vitest run tests/assistantChatAgentWiring.test.js tests/gerentePageNavigation.test.js tests/assistant.store.test.js` e `npm run check`.

---

### Task 4: "Desfazer" diz o que vai acontecer

**Files:**
- Modify: `src/lib/gerente/agentActions.js`, `src/lib/components/gerente/AgentActionsList.svelte`
- Modify: `tests/gerenteAgentActionsList.test.js`

**Interfaces:**
- Novo em `agentActions.js`:
```js
export function describeUndo(action) // -> string
```
  Devolve a frase do que o desfazer faz, a partir de `action.tool_name` e `action.before_state`:
  - `pausar_no_cardapio`: se `before_state.pausado_manualmente === true` → `'<produto> volta a ficar pausado no cardápio digital.'`; senão → `'<produto> volta a aparecer no cardápio digital.'`
  - `ocultar_no_pdv`: se `before_state.ocultar_no_pdv === true` → `'<produto> volta a ficar escondido na frente de caixa.'`; senão → `'<produto> volta a aparecer na frente de caixa.'`
  - Outro caso: `'A ação anterior volta ao estado de antes.'`
  O nome do produto sai de `action.arguments?.nome_produto` e, se faltar, vira `'O produto'`.
- `canUndo` continua exigindo `status === 'executed'` e `before_state`. Acrescentar um comentário curto explicando que ação que falhou não pode ser desfeita porque nada foi alterado.

**UI:** o botão "Desfazer" deixa de agir no primeiro clique. Ao clicar, a linha revela, abaixo do resumo, um bloco com o texto de `describeUndo(action)` e dois botões: "Sim, desfazer" (primário) e "Agora não" (ghost). Só o segundo clique chama a API. Um `let confirmingId = null` controla qual linha está aberta; abrir outra fecha a anterior. Depois de desfazer, `confirmingId = null`.

**Testes:** cobrir `describeUndo` nos quatro casos e `canUndo` recusando `status: 'failed'`; e guardas de texto no componente para `'Sim, desfazer'`, `'Agora não'` e `describeUndo`.

- [ ] **Step 1..4:** mesmo ritmo. Rodar `npx vitest run tests/gerenteAgentActionsList.test.js` e `npm run check`.
