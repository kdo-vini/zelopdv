# Zelinho Gerente conversacional — design aprovado

> Data: 2026-09-02. Status: aprovado pelo dono do produto nesta data.
> Revisão completa que originou este design: artefato "Zelinho Gerente no WhatsApp" (2026-09-02).
> Planos de implementação: `docs/superpowers/plans/2026-09-02-zelinho-gerente-agente-zelopdv.md` (este repo) e `docs/superpowers/plans/2026-09-02-zelinho-gerente-agente-zelochat.md` (repo `../zelochat`).

## 1. Objetivo

Transformar o Zelinho Gerente, hoje uma página de sinais, em um agente conversacional que **ouve** (app e WhatsApp), **age** (ferramentas com escrita no catálogo) e **mora onde o dono já está** (um contato WhatsApp chamado Zelinho Gerente).

Exemplos de pedidos que o agente deve resolver:

- "pausa o refri de 2 litros no cardápio" → pausa no ZeloMenu, não oculta no PDV.
- "cria a categoria Sobremesas" → cria categoria com ordem no fim.
- "cadastra pudim por 12 reais em Sobremesas" → cria produto com categoria obrigatória.
- "como foi ontem?" → resumo do dia anterior a partir dos snapshots já calculados.
- "o que merece atenção?" → sinais ativos do motor noturno.

## 2. Decisões tomadas (não reabrir)

| Decisão | Escolha |
| --- | --- |
| Transporte WhatsApp | ZeloChat (Whatsmiau). API oficial da Meta fica para o futuro; o adaptador deve permitir troca sem tocar no núcleo. |
| Número | **Novo número virtual, exclusivo** para o Zelinho Gerente. Não usar o número da Téchne. Instância Whatsmiau própria, ligada a uma `empresa_perfil` interna com `zelochat_mode = 'manager'`. |
| Ordem de entrega | Fase 0 (correções), Fase 1 (núcleo do agente no app), Fase 2 (canal WhatsApp com pareamento). |
| Quem pode usar na fase 1 e 2 | Somente o **dono** da empresa (`isSubUser === false`). Subusuários entram em fase 3. |
| Escritas na primeira versão | pausar/despausar no cardápio, ocultar/mostrar no PDV, criar categoria, criar produto, alterar preço. **Nada de exclusão, vendas, caixa, fiado, despesas, assinatura, permissões.** |
| Confirmação | Toda escrita passa por proposta → confirmação explícita do dono → execução. Uma ação pendente por sessão. Expira em 10 minutos. |
| Modelo | `gpt-4.1-mini` por padrão (env `GERENTE_AGENT_MODEL`), function calling nativo da OpenAI, sem streaming de tokens. |
| Preço | Incluído no plano PDV, com limite de 20 turnos por hora por empresa. Sem SKU novo. |
| Onde vive a lógica | Núcleo, ferramentas, RPCs e confirmações no **ZeloPDV**. ZeloChat é só transporte: recebe, resolve telefone → empresa via endpoint do ZeloPDV, envia a resposta. |

## 3. Arquitetura

```
WhatsApp (Whatsmiau) ──► ZeloChat /webhook/:instance ──► modo 'manager'
                                                          │
                                                          ▼
                                    POST zelopdv /api/gerente/channel  (chave interna)
                                                          │
App (painel Zelinho) ──► POST zelopdv /api/gerente/agent (JWT) ──► runAgentTurn()
                                                          │
                                   ┌──────────────────────┴──────────────────────┐
                                   ▼                                             ▼
                        ferramentas de leitura                       ferramentas de escrita
                        (fetchers, snapshots, sinais,                (RPCs owner-scoped:
                         catálogo, estoque)                           gerente_* no Postgres)
```

### 3.1 Núcleo (`src/lib/server/gerente/`)

- `agent.js` — `runAgentTurn(input)` orquestra: carrega sessão e histórico, monta prompt, chama a OpenAI com `tools`, executa ferramentas de leitura imediatamente, transforma ferramentas de escrita em **ação pendente**, persiste mensagens, registra custo em `ai_usage_logs` com `chat_type = 'gerente_agent'`.
- `toolRegistry.js` — catálogo único das ferramentas: schema JSON para a OpenAI, flag `write`, executor. O modelo **nunca** recebe nem escolhe `ownerUserId`; ele é injetado pelo servidor.
- `tools/catalog.js` — leitura e escrita de catálogo. Escrita chama RPC via `supabaseAdmin.rpc(...)` passando `p_owner`.
- `tools/insights.js` — resumo de período e sinais ativos, reaproveitando `fetchSnapshots`, `fetchVendas`, `computeDailyMetrics`, `buildActiveSignalsContext`, `templateNarrative`.
- `sessions.js` — `getOrCreateSession`, `appendMessages`, `loadHistory`.
- `actions.js` — `createPendingAction`, `getPendingAction`, `confirmAction`, `cancelAction`, `expirePendingActions`, `undoAction`.
- `prompt.js` — `buildAgentSystemPrompt({ perfil, channel, hints })`.
- `phoneLinks.js` — `resolveOwnerByPhone`, `startPairing`, `completePairing`, `unlinkPhone`.

### 3.2 Banco (migrations forward-only em `supabase/migrations/`)

Tabelas novas (todas owner-scoped por `owner_user_id`, leitura via RLS com `fiado_actor_can('relatorios.ver', owner_user_id)`, escrita só `service_role`):

- `gerente_agent_sessions` — uma por `(owner_user_id, channel, channel_ref)`.
- `gerente_agent_messages` — histórico com `role in ('user','assistant','tool','system')`, `tool_calls jsonb`, `tool_call_id text`.
- `gerente_agent_actions` — auditoria e fila de confirmação: `tool_name`, `arguments`, `status in ('pending','executed','failed','cancelled','expired')`, `before_state`, `after_state`, `result`, `expires_at`.
- `gerente_phone_links` — `owner_user_id` único, `phone_normalized` único (formato `55DDDNNNNNNNN`), `verified_at`.
- `gerente_pairing_codes` — `code_hash` (SHA-256 do código de 6 dígitos), `expires_at` (10 min), `consumed_at`.

RPCs novas (security definer, `set search_path = public, pg_temp`, detecção de service role por `coalesce(current_setting('role', true) = 'service_role', false)`, capability `produtos.gerenciar` para `authenticated`):

- `gerente_resolve_owner(p_owner uuid) returns uuid`
- `gerente_set_menu_pause(p_produto_id bigint, p_pausado boolean, p_owner uuid default null) returns jsonb`
- `gerente_set_ocultar_pdv(p_produto_id bigint, p_ocultar boolean, p_owner uuid default null) returns jsonb`
- `gerente_criar_categoria(p_nome text, p_owner uuid default null) returns jsonb`
- `gerente_criar_produto(p_nome text, p_preco numeric, p_categoria_id bigint, p_owner uuid default null, p_controlar_estoque boolean default false, p_estoque_atual integer default 0) returns jsonb`
- `gerente_alterar_preco(p_produto_id bigint, p_preco numeric, p_owner uuid default null) returns jsonb`

Invariantes das RPCs:

- Pausar no cardápio escreve **somente** `zelomenu_product_publications.pausado_manualmente`. Nunca toca `produtos.ocultar_no_pdv` (guard `20260824134536`). Se o produto não tem publicação, a RPC falha com `PRODUTO_NAO_PUBLICADO`.
- Criar categoria é idempotente por nome (`lower(trim(nome))`): se já existe, devolve a existente com `created: false`.
- Criar produto exige categoria do mesmo owner; nome duplicado (case-insensitive) falha com `PRODUTO_DUPLICADO`; categoria com estoque compartilhado força `controlar_estoque = false, estoque_atual = 0`.
- Alterar preço aceita `p_preco >= 0` e devolve `preco_anterior`.
- `ai_usage_logs_chat_type_check` passa a aceitar `'gerente_agent'`.

### 3.3 Rotas HTTP no ZeloPDV

| Rota | Auth | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /api/gerente/agent` | JWT Supabase, dono apenas | `{ message?, confirm_action_id?, cancel_action_id?, undo_action_id?, signal_id?, screen_context? }` | SSE: `data: {"content": "..."}`, opcional `data: {"type":"pending_action","action":{...}}`, `data: [DONE]` |
| `POST /api/gerente/channel` | header `X-Gerente-Channel-Key` = env `GERENTE_CHANNEL_INTERNAL_KEY` | `{ phone, text?, message_id, kind: 'message' \| 'confirm' \| 'cancel', action_id? }` | JSON `{ reply, pending_action, paired }` |
| `POST /api/gerente/pair/start` | JWT, dono | `{}` | JSON `{ code, expires_at, whatsapp_number }` |
| `DELETE /api/gerente/pair` | JWT, dono | `{}` | JSON `{ ok: true }` |
| `GET /api/gerente/pair` | JWT, dono | — | JSON `{ linked: boolean, phone_masked, verified_at, whatsapp_number }` |

Rate limit: `enforceRateLimit` com chave `gerente:agent:owner:<ownerUserId>`, 20 por hora, em ambas as rotas de conversa.

### 3.4 Fluxo de confirmação

1. O modelo chama uma ferramenta marcada `write: true`.
2. O servidor **não executa**. Cria `gerente_agent_actions` com `status='pending'`, `expires_at = now() + 10 min`, cancelando qualquer pendente anterior da mesma sessão (`status='cancelled'`).
3. O servidor responde ao modelo com o resultado sintético `{ "status": "aguardando_confirmacao", "resumo": "<texto>" }` e o modelo redige a pergunta de confirmação.
4. A resposta inclui `pending_action: { id, summary, expires_at }`. No app vira cartão com botões; no WhatsApp vira mensagem com botões `GERENTE_CONFIRM:<id>` e `GERENTE_CANCEL:<id>` e aceita "sim"/"não" em texto.
5. Confirmar chama `confirmAction(actionId, ownerUserId)`: verifica owner, status e expiração, executa a RPC, grava `before_state`/`after_state`/`result`, `status='executed'`, e devolve texto de confirmação determinístico (sem LLM).
6. `undoAction` existe só para `pausar_no_cardapio` e `ocultar_no_pdv`: aplica o valor de `before_state` e grava nova ação `executed` com `tool_name` sufixado `_undo`.

### 3.5 Pareamento de telefone (Fase 2)

1. No app, em `/gestao/gerente/preferencias`, o dono clica **Conectar no WhatsApp**. `POST /api/gerente/pair/start` gera código de 6 dígitos, grava SHA-256 em `gerente_pairing_codes` (10 min), devolve o código e o número do Zelinho (env `GERENTE_WHATSAPP_NUMBER`).
2. O dono manda o código para o número do Zelinho.
3. ZeloChat repassa a `/api/gerente/channel` com `kind: 'message'`. Sem vínculo para o telefone, o servidor tenta casar o texto (6 dígitos) com códigos vivos; ao casar, cria `gerente_phone_links` e responde "Pronto, seu WhatsApp está conectado à <nome da empresa>."
4. Sem código válido, responde instruções de pareamento. Nunca revela se um telefone pertence a alguma empresa.
5. Desvincular: `DELETE /api/gerente/pair` no app. Vínculo também é ignorado se a assinatura não estiver ativa (`isSubscriptionActiveStrict`).
6. Gancho futuro (fora deste escopo): quando o login por telefone existir, `resolveOwnerByPhone` passa a aceitar também `auth.users.phone` verificado do dono como vínculo implícito. A tabela `gerente_phone_links` fica só para contas criadas por e-mail.

### 3.6 Canal ZeloChat (repo `../zelochat`)

- `zelochat_mode` ganha o valor `'manager'`. Uma `empresa_perfil` interna "Zelinho Gerente" recebe esse modo, assinatura interna de 10 anos (mesmo padrão da migration 025) e instância Whatsmiau própria conectada ao número novo.
- Em `processWebhookEvent`, para empresa em modo `manager`: persiste a mensagem com `handleIncomingMessage`, extrai texto ou botão, chama `/api/gerente/channel`, envia a resposta via `dispatchConversationOutbound` com `origin: 'internal_system'`, e envia botões com `sendButtonMessage` quando houver `pending_action`. **Nunca** chega em `dispatchIncomingMessage` nem no fluxo de pedidos.
- Áudio: quando `onAudioTranscriptionSettled` disparar para empresa em modo `manager`, lê `audio_transcript` da mensagem e chama o mesmo caminho.
- Limite local: 20 mensagens por hora por JID no adaptador, antes de chamar o ZeloPDV.

## 4. Interface

### App
- `AssistantChat.svelte` passa a usar `/api/gerente/agent`. `ChatStreamCore.svelte` passa a emitir eventos SSE desconhecidos via `dispatch('event', parsed)`.
- Cartão de ação pendente com **Confirmar** e **Cancelar**.
- `/gestao/gerente` ganha a seção **Ações do Zelinho** (últimas 20 ações, com **Desfazer** para pausar e ocultar) e links para **Resumo semanal** e **Preferências** no cabeçalho.
- `/gestao/gerente/preferencias` ganha o cartão **Zelinho no WhatsApp** (conectar, código, número, desvincular).

### WhatsApp
- Respostas curtas (até 6 linhas), valores em `R$`, negrito do WhatsApp com `*`, sem markdown.
- Desambiguação por lista numerada quando a busca devolve mais de um produto.
- Primeira mensagem de telefone desconhecido: instrução de pareamento.

## 5. Fora de escopo (não implementar)

- Exclusão de produto ou categoria; qualquer escrita em vendas, caixa, fiado, despesas, assinatura, permissões.
- Subusuários conversando com o Gerente.
- API oficial da Meta.
- Refatorar a tela de Produtos para usar as RPCs novas (fica para depois; as RPCs já são compatíveis com `authenticated`).
- Streaming token a token do agente.
- Fila distribuída ou Redis para rate limit.

## 6. Correções da Fase 0 (independentes do agente)

1. `preferencias/+page.svelte` grava `hora: 'daily'` e o cron compara com hora `HH`. Remover o conceito de hora: o resumo sai sempre após o motor diário. Ajustar `intelligence-notify` para não exigir `hour`.
2. `support/+server.js` grava `chat_type: 'sales'`, rejeitado pela constraint. Trocar para `'support'`.
3. Adicionar links para `/gestao/gerente/semana` e `/gestao/gerente/preferencias` no cabeçalho de `/gestao/gerente`.
4. Ligar `INTELLIGENCE_LLM_ENABLED=true` na Vercel (operacional, sem código).

## 7. Riscos e mitigação (resumo)

- **Ação no tenant errado**: owner resolvido no servidor antes do modelo; telefone verificado e único; teste de mismatch em toda ferramenta de escrita.
- **Injeção via nome de produto**: resultados de ferramenta sempre em JSON e tratados como dado; nenhuma escrita sem confirmação humana.
- **Custo**: máximo 4 rodadas de ferramenta por turno; 20 turnos por hora por empresa; kill switch `GERENTE_AGENT_ENABLED=false`.
- **Bloqueio do número**: volume baixo, conversas iniciadas pelo cliente; app continua funcionando como canal alternativo.
