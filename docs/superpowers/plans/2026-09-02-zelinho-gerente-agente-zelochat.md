# Zelinho Gerente Agente (ZeloChat) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o ZeloChat servir de transporte WhatsApp para o Zelinho Gerente: um número exclusivo, ligado a uma empresa interna em modo `manager`, recebe as mensagens do dono, repassa ao ZeloPDV (`POST /api/gerente/channel`) e devolve a resposta com botões de confirmação.

**Architecture:** Nenhuma lógica de negócio do PDV entra neste repo. O webhook detecta a empresa em modo `manager` antes do fluxo de clientes, persiste a mensagem com `handleIncomingMessage`, chama o endpoint interno do ZeloPDV e envia a resposta pela fila durável (`dispatchConversationOutbound`, origem `internal_system`). Botões `GERENTE_CONFIRM:<id>` e `GERENTE_CANCEL:<id>` voltam como `kind: 'confirm'|'cancel'`. Áudio usa a transcrição já existente.

**Tech Stack:** Node + TypeScript + Express (`server/`), Whatsmiau (Evolution v2), Supabase compartilhado (service role), testes com `tsx` e `tests/testHarness.ts` (`npm test`), `npm run lint` = `tsc --noEmit`.

**Spec:** `../zelopdv/docs/superpowers/specs/2026-09-02-zelinho-gerente-agente-design.md` (seção 3.6). Plano irmão no ZeloPDV: `../zelopdv/docs/superpowers/plans/2026-09-02-zelinho-gerente-agente-zelopdv.md` (Tasks 16 a 22 entregam o endpoint consumido aqui).

## Global Constraints

- Este repo **não** altera schema de `produtos`, `categorias`, `subscriptions`, `vendas*` nem cria RPC em tabelas do PDV (CLAUDE.md §"Shared database"). Pode adicionar coluna/valor em `empresa_perfil` e criar tabelas `zelochat_*`.
- A empresa do Zelinho é uma `empresa_perfil` interna com `zelochat_mode = 'manager'`, `ai_enabled = false`, assinatura interna de 10 anos (mesmo padrão da migration `025`). Ela nunca entra no fluxo de clientes: o branch de modo `manager` retorna antes de `dispatchIncomingMessage`.
- Não tocar nas três camadas do fluxo de confirmação de pedidos (CLAUDE.md §"Order confirmation flow"). O branch novo fica **antes** do bloco `if (buttonId && parseOrderingButton(buttonId))`.
- Envs novas: `ZELOPDV_GERENTE_CHANNEL_URL` (padrão `https://zelopdv.com.br/api/gerente/channel`), `GERENTE_CHANNEL_INTERNAL_KEY` (mesma chave configurada no ZeloPDV), `ZELINHO_MANAGER_EMPRESA_EMAIL` (e-mail do auth user da empresa interna; padrão `zelinho@zelopdv.com.br`).
- Limite local: 20 mensagens por hora por JID no adaptador, antes de chamar o ZeloPDV.
- Migrations seguem a numeração sequencial `NNN_slug.sql` em `supabase/migrations/` (próxima: `068`).
- Cada tarefa termina com `npm run lint` e o teste da tarefa verdes, e um commit.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/068_zelinho_manager_mode.sql` | valor `manager` em `zelochat_mode`; empresa interna Zelinho + assinatura interna |
| `src/domain/zelochatMode.ts` | tipo e normalização com `manager` |
| `server/gerenteChannel.ts` | resolução de modo, cliente HTTP do ZeloPDV, parse de botões, rate limit, envio da resposta |
| `server/router.ts` | branch de modo `manager` em `processWebhookEvent` |
| `server/index.ts` | branch de modo `manager` no handler de áudio transcrito |
| `tests/gerenteChannel.test.ts` | unidades puras do adaptador |
| `tests/zelinhoManagerModeSchema.test.ts` | asserções da migration 068 |

---

### Task 1: Migration 068 — modo `manager` e empresa interna do Zelinho

**Files:**
- Create: `supabase/migrations/068_zelinho_manager_mode.sql`
- Test: `tests/zelinhoManagerModeSchema.test.ts`

**Pré-requisito manual (antes de aplicar a migration):** criar no Supabase Auth o usuário `zelinho@zelopdv.com.br` (senha forte, guardada no cofre da Téchne). A migration procura esse e-mail; sem ele, ela não cria nada e não falha.

- [ ] **Step 1: Teste que falha**

```ts
// tests/zelinhoManagerModeSchema.test.ts
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve('supabase/migrations/068_zelinho_manager_mode.sql');
assert(existsSync(migrationPath), 'migration 068_zelinho_manager_mode.sql must exist');
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

assert.match(compact, /drop constraint if exists empresa_perfil_zelochat_mode_check/);
assert.match(compact, /check \(zelochat_mode in \('restaurant', 'general', 'manager'\)\)/);
assert.match(compact, /lower\(u\.email\) = lower\('zelinho@zelopdv\.com\.br'\)/);
assert.match(compact, /zelochat_mode = 'manager'/);
assert.match(compact, /ai_enabled = false/);
assert.match(compact, /plan_tier = 'chat'/);
assert.match(compact, /interval '10 years'/);
assert.doesNotMatch(sql, /alter table public\.(produtos|categorias|subscriptions|vendas)/);
assert.doesNotMatch(sql, /drop table/);

const versions = readdirSync(resolve('supabase/migrations')).filter((f) => f.startsWith('068_'));
assert.equal(versions.length, 1, 'migration version 068 must be unique');
console.log('PASS zelinho manager mode schema');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx tests/zelinhoManagerModeSchema.test.ts`
Expected: falha em `migration 068_zelinho_manager_mode.sql must exist`.

- [ ] **Step 3: Migration**

```sql
-- supabase/migrations/068_zelinho_manager_mode.sql
-- Modo interno 'manager': a empresa que atende o número do Zelinho Gerente.
-- Mensagens dessa empresa vão para o ZeloPDV (/api/gerente/channel), nunca para a IA de clientes.

alter table public.empresa_perfil
  drop constraint if exists empresa_perfil_zelochat_mode_check;
alter table public.empresa_perfil
  add constraint empresa_perfil_zelochat_mode_check
  check (zelochat_mode in ('restaurant', 'general', 'manager'));

comment on column public.empresa_perfil.zelochat_mode is
  'ZeloChat UI/AI mode. restaurant é o padrão público; general é interno/suporte; manager é o número do Zelinho Gerente (transporte para o ZeloPDV).';

-- Empresa interna do Zelinho Gerente (idempotente; sem o auth user, não faz nada).
with zelinho_user as (
  select id as user_id
  from auth.users u
  where lower(u.email) = lower('zelinho@zelopdv.com.br')
), upsert_empresa as (
  insert into public.empresa_perfil (user_id, nome_exibicao, timezone, zelochat_onboarding_done, ai_enabled, ai_mode, zelochat_mode, updated_at)
  select user_id, 'Zelinho Gerente', 'America/Sao_Paulo', true, false, 'always_off', 'manager', now()
  from zelinho_user
  on conflict (user_id) do update
    set nome_exibicao = 'Zelinho Gerente',
        zelochat_mode = 'manager',
        ai_enabled = false,
        ai_mode = 'always_off',
        zelochat_onboarding_done = true,
        updated_at = now()
  returning user_id
), latest_subscription as (
  select s.id
  from public.subscriptions s
  join zelinho_user u on u.user_id = s.user_id
  order by s.updated_at desc nulls last, s.created_at desc nulls last
  limit 1
), updated_subscription as (
  update public.subscriptions s
  set status = 'active',
      plan_tier = 'chat',
      payment_provider = 'internal',
      billing_type = 'INTERNAL',
      current_period_end = now() + interval '10 years',
      manually_extended_until = now() + interval '10 years',
      cancel_at_period_end = false,
      admin_notes = concat_ws(E'\n', nullif(s.admin_notes, ''), 'Internal Zelinho Gerente WhatsApp channel configured on 2026-09-02.'),
      updated_at = now(),
      last_modified_at = now()
  from latest_subscription ls
  where s.id = ls.id
  returning s.id
)
insert into public.subscriptions (user_id, status, plan_tier, payment_provider, billing_type, current_period_end, manually_extended_until, cancel_at_period_end, admin_notes, created_at, updated_at, last_modified_at)
select u.user_id, 'active', 'chat', 'internal', 'INTERNAL', now() + interval '10 years', now() + interval '10 years', false,
       'Internal Zelinho Gerente WhatsApp channel configured on 2026-09-02.', now(), now(), now()
from zelinho_user u
where not exists (select 1 from updated_subscription);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx tests/zelinhoManagerModeSchema.test.ts`
Expected: `PASS zelinho manager mode schema`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/068_zelinho_manager_mode.sql tests/zelinhoManagerModeSchema.test.ts
git commit -m "feat(gerente): modo manager e empresa interna do Zelinho Gerente"
```

### Task 2: Domínio `zelochatMode` com `manager`

**Files:**
- Modify: `src/domain/zelochatMode.ts`
- Test: `tests/zelochatModeDomain.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
// tests/zelochatModeDomain.test.ts
import { isGeneralZeloChatMode, isManagerZeloChatMode, normalizeZeloChatMode } from '../src/domain/zelochatMode.js';
import { assertEqual, runSuite } from './testHarness.js';

await runSuite('zelochat mode domain', [
  { name: 'normaliza manager', run: () => assertEqual(normalizeZeloChatMode('manager'), 'manager', 'manager é aceito') },
  { name: 'normaliza general', run: () => assertEqual(normalizeZeloChatMode('general'), 'general', 'general é aceito') },
  { name: 'desconhecido vira restaurant', run: () => assertEqual(normalizeZeloChatMode('x'), 'restaurant', 'fallback restaurant') },
  { name: 'isManager', run: () => { assertEqual(isManagerZeloChatMode('manager'), true, 'manager true'); assertEqual(isManagerZeloChatMode('general'), false, 'general false'); } },
  { name: 'isGeneral não muda', run: () => assertEqual(isGeneralZeloChatMode('manager'), false, 'manager não é general') },
]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx tests/zelochatModeDomain.test.ts`
Expected: falha de compilação/import (`isManagerZeloChatMode` inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/domain/zelochatMode.ts
export type ZeloChatMode = 'restaurant' | 'general' | 'manager';

export const DEFAULT_ZELOCHAT_MODE: ZeloChatMode = 'restaurant';

export function normalizeZeloChatMode(value: unknown): ZeloChatMode {
  if (value === 'general') return 'general';
  if (value === 'manager') return 'manager';
  return DEFAULT_ZELOCHAT_MODE;
}

export function isGeneralZeloChatMode(value: unknown): boolean {
  return normalizeZeloChatMode(value) === 'general';
}

export function isManagerZeloChatMode(value: unknown): boolean {
  return normalizeZeloChatMode(value) === 'manager';
}
```

- [ ] **Step 4: Rodar teste e lint**

Run: `npx tsx tests/zelochatModeDomain.test.ts && npm run lint`
Expected: 5 pass; `tsc` sem erros. Se algum `switch` exaustivo sobre `ZeloChatMode` no frontend reclamar do novo valor, adicionar o caso `manager` tratado como `general` na UI (a empresa é interna e não usa o painel).

- [ ] **Step 5: Commit**

```bash
git add src/domain/zelochatMode.ts tests/zelochatModeDomain.test.ts
git commit -m "feat(gerente): valor manager no domínio de modo do ZeloChat"
```

### Task 3: Adaptador `server/gerenteChannel.ts`

**Files:**
- Create: `server/gerenteChannel.ts`
- Test: `tests/gerenteChannel.test.ts`

**Interfaces:**
- Consumes: `getServiceSupabase` (`server/supabase.ts`), `handleIncomingMessage` (`server/messageHandler.ts`), `dispatchConversationOutbound` (`server/conversationOutbound.ts`), `sendButtonMessage` (`server/whatsapp.ts`), `redactJid` (mesmo import usado em `router.ts`).
- Produces:
  - `GERENTE_BUTTON_PREFIX = { confirm: 'GERENTE_CONFIRM:', cancel: 'GERENTE_CANCEL:' }`
  - `parseGerenteButton(buttonId: string): { kind: 'confirm'|'cancel'; actionId: string } | null`
  - `buildChannelPayload(input: { jid: string; text: string; messageId: string; buttonId?: string }): ChannelRequest` onde `ChannelRequest = { phone: string; text: string; message_id: string; kind: 'message'|'confirm'|'cancel'; action_id: string | null }`
  - `phoneFromJid(jid: string): string` (dígitos antes de `@`)
  - `checkGerenteRateLimit(jid: string, now?: number): boolean` (20/hora, Map em memória)
  - `isManagerEmpresa(empresaId: string): Promise<boolean>` (lê `empresa_perfil.zelochat_mode`, cache 60s)
  - `callGerenteChannel(payload: ChannelRequest, deps?: { fetchImpl?: typeof fetch }): Promise<ChannelResponse>` onde `ChannelResponse = { reply: string; pending_action: { id: string; summary: string; expires_at: string | null } | null; paired: boolean }`
  - `handleManagerInbound(params: { empresaId: string; jid: string; text: string; messageId: string; buttonId?: string }): Promise<void>` — chama o ZeloPDV, envia `reply` como texto e, se houver `pending_action`, envia botões.
  - `UNAVAILABLE_REPLY = 'O Zelinho está indisponível agora. Tente de novo em alguns minutos.'`

- [ ] **Step 1: Teste que falha**

```ts
// tests/gerenteChannel.test.ts
import { buildChannelPayload, callGerenteChannel, checkGerenteRateLimit, parseGerenteButton, phoneFromJid, UNAVAILABLE_REPLY } from '../server/gerenteChannel.js';
import { assert, assertEqual, runSuite } from './testHarness.js';

process.env.GERENTE_CHANNEL_INTERNAL_KEY = 'secret';
process.env.ZELOPDV_GERENTE_CHANNEL_URL = 'https://pdv.test/api/gerente/channel';

await runSuite('gerente channel adapter', [
  {
    name: 'parseGerenteButton reconhece confirm/cancel e ignora outros',
    run: () => {
      assertEqual(JSON.stringify(parseGerenteButton('GERENTE_CONFIRM:abc-123')), JSON.stringify({ kind: 'confirm', actionId: 'abc-123' }), 'confirm');
      assertEqual(JSON.stringify(parseGerenteButton('GERENTE_CANCEL:abc-123')), JSON.stringify({ kind: 'cancel', actionId: 'abc-123' }), 'cancel');
      assertEqual(parseGerenteButton('CONFIRM_ORDER'), null, 'botão de pedido não é do gerente');
      assertEqual(parseGerenteButton(''), null, 'vazio');
    },
  },
  {
    name: 'phoneFromJid e buildChannelPayload',
    run: () => {
      assertEqual(phoneFromJid('5514999991234@s.whatsapp.net'), '5514999991234', 'telefone do jid');
      const text = buildChannelPayload({ jid: '5514999991234@s.whatsapp.net', text: ' pausa o refri ', messageId: 'm1' });
      assertEqual(JSON.stringify(text), JSON.stringify({ phone: '5514999991234', text: 'pausa o refri', message_id: 'm1', kind: 'message', action_id: null }), 'mensagem');
      const confirm = buildChannelPayload({ jid: '5514999991234@s.whatsapp.net', text: 'Confirmar', messageId: 'm2', buttonId: 'GERENTE_CONFIRM:act-1' });
      assertEqual(confirm.kind, 'confirm', 'kind confirm');
      assertEqual(confirm.action_id, 'act-1', 'action id');
    },
  },
  {
    name: 'rate limit 20 por hora por jid',
    run: () => {
      const jid = 'rl-test@s.whatsapp.net';
      const base = 1_000_000;
      for (let i = 0; i < 20; i += 1) assert(checkGerenteRateLimit(jid, base + i), `mensagem ${i + 1} passa`);
      assert(!checkGerenteRateLimit(jid, base + 21), 'a 21ª é bloqueada');
      assert(checkGerenteRateLimit(jid, base + 60 * 60 * 1000 + 1), 'janela nova libera');
    },
  },
  {
    name: 'callGerenteChannel envia chave e corpo e devolve a resposta',
    run: async () => {
      let captured: { url: string; init: RequestInit } | null = null;
      const fetchImpl = (async (url: string, init: RequestInit) => {
        captured = { url, init };
        return new Response(JSON.stringify({ reply: 'Olá!', pending_action: null, paired: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as unknown as typeof fetch;
      const result = await callGerenteChannel({ phone: '5514999991234', text: 'oi', message_id: 'm1', kind: 'message', action_id: null }, { fetchImpl });
      assertEqual(result.reply, 'Olá!', 'reply');
      assertEqual(captured!.url, 'https://pdv.test/api/gerente/channel', 'url');
      assertEqual((captured!.init.headers as Record<string, string>)['X-Gerente-Channel-Key'], 'secret', 'chave');
      assertEqual(JSON.parse(String(captured!.init.body)).phone, '5514999991234', 'body');
    },
  },
  {
    name: 'callGerenteChannel cai em UNAVAILABLE_REPLY em erro HTTP ou rede',
    run: async () => {
      const failing = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
      const result = await callGerenteChannel({ phone: '5514999991234', text: 'oi', message_id: 'm1', kind: 'message', action_id: null }, { fetchImpl: failing });
      assertEqual(result.reply, UNAVAILABLE_REPLY, 'http 503');
      const throwing = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
      const result2 = await callGerenteChannel({ phone: '5514999991234', text: 'oi', message_id: 'm1', kind: 'message', action_id: null }, { fetchImpl: throwing });
      assertEqual(result2.reply, UNAVAILABLE_REPLY, 'rede');
    },
  },
]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx tests/gerenteChannel.test.ts`
Expected: falha de import.

- [ ] **Step 3: Implementar**

```ts
// server/gerenteChannel.ts
/**
 * Transporte WhatsApp do Zelinho Gerente.
 * Este arquivo NÃO decide nada de negócio: resolve o modo da empresa, repassa a
 * mensagem ao ZeloPDV (/api/gerente/channel) e entrega a resposta.
 */
import { randomUUID } from 'node:crypto';
import { getServiceSupabase } from './supabase.js';
import { dispatchConversationOutbound } from './conversationOutbound.js';
import { sendButtonMessage } from './whatsapp.js';

export const GERENTE_BUTTON_PREFIX = { confirm: 'GERENTE_CONFIRM:', cancel: 'GERENTE_CANCEL:' } as const;
export const UNAVAILABLE_REPLY = 'O Zelinho está indisponível agora. Tente de novo em alguns minutos.';

const DEFAULT_CHANNEL_URL = 'https://zelopdv.com.br/api/gerente/channel';
const REQUEST_TIMEOUT_MS = 25_000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MODE_CACHE_TTL_MS = 60_000;

export type ChannelKind = 'message' | 'confirm' | 'cancel';
export type ChannelRequest = { phone: string; text: string; message_id: string; kind: ChannelKind; action_id: string | null };
export type ChannelPendingAction = { id: string; summary: string; expires_at: string | null };
export type ChannelResponse = { reply: string; pending_action: ChannelPendingAction | null; paired: boolean };

export function parseGerenteButton(buttonId: string): { kind: 'confirm' | 'cancel'; actionId: string } | null {
  const value = String(buttonId || '');
  if (value.startsWith(GERENTE_BUTTON_PREFIX.confirm)) {
    const actionId = value.slice(GERENTE_BUTTON_PREFIX.confirm.length).trim();
    return actionId ? { kind: 'confirm', actionId } : null;
  }
  if (value.startsWith(GERENTE_BUTTON_PREFIX.cancel)) {
    const actionId = value.slice(GERENTE_BUTTON_PREFIX.cancel.length).trim();
    return actionId ? { kind: 'cancel', actionId } : null;
  }
  return null;
}

export function phoneFromJid(jid: string): string {
  return String(jid || '').split('@')[0].replace(/\D/g, '');
}

export function buildChannelPayload(input: { jid: string; text: string; messageId: string; buttonId?: string }): ChannelRequest {
  const button = input.buttonId ? parseGerenteButton(input.buttonId) : null;
  return {
    phone: phoneFromJid(input.jid),
    text: String(input.text || '').trim().slice(0, 1500),
    message_id: input.messageId,
    kind: button?.kind ?? 'message',
    action_id: button?.actionId ?? null,
  };
}

const rateLimits = new Map<string, { count: number; windowStart: number }>();

export function checkGerenteRateLimit(jid: string, now: number = Date.now()): boolean {
  const entry = rateLimits.get(jid);
  if (!entry || now > entry.windowStart + RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(jid, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count < RATE_LIMIT_MAX) {
    entry.count += 1;
    return true;
  }
  return false;
}

const modeCache = new Map<string, { isManager: boolean; cachedAt: number }>();

export async function isManagerEmpresa(empresaId: string): Promise<boolean> {
  const cached = modeCache.get(empresaId);
  if (cached && Date.now() - cached.cachedAt < MODE_CACHE_TTL_MS) return cached.isManager;
  const { data, error } = await getServiceSupabase()
    .from('empresa_perfil')
    .select('zelochat_mode')
    .eq('id', empresaId)
    .maybeSingle();
  if (error) {
    console.warn('[GerenteChannel] mode lookup failed:', error.message);
    return cached?.isManager ?? false;
  }
  const isManager = (data as { zelochat_mode?: string } | null)?.zelochat_mode === 'manager';
  modeCache.set(empresaId, { isManager, cachedAt: Date.now() });
  return isManager;
}

export async function callGerenteChannel(payload: ChannelRequest, deps: { fetchImpl?: typeof fetch } = {}): Promise<ChannelResponse> {
  const key = (process.env.GERENTE_CHANNEL_INTERNAL_KEY || '').trim();
  const url = (process.env.ZELOPDV_GERENTE_CHANNEL_URL || DEFAULT_CHANNEL_URL).trim();
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (!key) {
    console.error('[GerenteChannel] GERENTE_CHANNEL_INTERNAL_KEY missing');
    return { reply: UNAVAILABLE_REPLY, pending_action: null, paired: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gerente-Channel-Key': key },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[GerenteChannel] ZeloPDV responded ${response.status}`);
      return { reply: UNAVAILABLE_REPLY, pending_action: null, paired: false };
    }
    const data = (await response.json()) as Partial<ChannelResponse>;
    return {
      reply: typeof data.reply === 'string' && data.reply.trim() ? data.reply : UNAVAILABLE_REPLY,
      pending_action: data.pending_action && typeof data.pending_action.id === 'string'
        ? { id: data.pending_action.id, summary: String(data.pending_action.summary || ''), expires_at: data.pending_action.expires_at ?? null }
        : null,
      paired: data.paired === true,
    };
  } catch (error) {
    console.error('[GerenteChannel] request failed:', error);
    return { reply: UNAVAILABLE_REPLY, pending_action: null, paired: false };
  } finally {
    clearTimeout(timer);
  }
}

async function sendReply(empresaId: string, jid: string, text: string, messageId: string): Promise<void> {
  await dispatchConversationOutbound({
    empresaId,
    remoteJid: jid,
    actorUserId: null,
    origin: 'internal_system',
    takeoverPolicy: 'preserve_ai',
    idempotencyKey: `gerente-reply:${empresaId}:${messageId || randomUUID()}`,
    payload: { kind: 'text', text },
  });
}

export async function handleManagerInbound(params: { empresaId: string; jid: string; text: string; messageId: string; buttonId?: string }): Promise<void> {
  const { empresaId, jid, messageId } = params;
  if (!checkGerenteRateLimit(jid)) {
    console.warn(`[GerenteChannel] rate limit empresa=${empresaId}`);
    return;
  }
  const payload = buildChannelPayload({ jid, text: params.text, messageId, buttonId: params.buttonId });
  if (!payload.text && payload.kind === 'message') return;

  const result = await callGerenteChannel(payload);
  await sendReply(empresaId, jid, result.reply, messageId);

  if (result.pending_action) {
    try {
      await sendButtonMessage(
        jid,
        'Confirmar esta ação?',
        result.pending_action.summary,
        'Zelinho Gerente',
        [
          { id: `${GERENTE_BUTTON_PREFIX.confirm}${result.pending_action.id}`, displayText: 'Confirmar' },
          { id: `${GERENTE_BUTTON_PREFIX.cancel}${result.pending_action.id}`, displayText: 'Cancelar' },
        ],
        empresaId,
      );
    } catch (error) {
      console.error('[GerenteChannel] button send failed, text fallback:', error);
      await sendReply(empresaId, jid, 'Responda *sim* para confirmar ou *não* para cancelar.', `${messageId}:fallback`);
    }
  }
}
```

Se `dispatchConversationOutbound` exigir campos além dos usados em `router.ts:443-451` (`/internal/whatsapp/send-text`), copiar exatamente aquele objeto. `takeoverPolicy: 'preserve_ai'` e `origin: 'internal_system'` já são valores válidos naquele trecho.

- [ ] **Step 4: Rodar teste e lint**

Run: `npx tsx tests/gerenteChannel.test.ts && npm run lint`
Expected: 5 pass; `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add server/gerenteChannel.ts tests/gerenteChannel.test.ts
git commit -m "feat(gerente): adaptador do canal WhatsApp para o ZeloPDV"
```

### Task 4: Branch de modo `manager` no webhook e no áudio transcrito

**Files:**
- Modify: `server/router.ts` (dentro de `processWebhookEvent`, logo após o cálculo de `msgText`, antes de `if (buttonId && parseOrderingButton(buttonId))`)
- Modify: `server/index.ts` (handler `onAudioTranscriptionSettled`, no início)
- Test: `tests/gerenteRouterWiring.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
// tests/gerenteRouterWiring.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assert, runSuite } from './testHarness.js';

const router = readFileSync(resolve('server/router.ts'), 'utf8');
const index = readFileSync(resolve('server/index.ts'), 'utf8');

await runSuite('gerente router wiring', [
  {
    name: 'router desvia empresas manager antes do fluxo de pedidos',
    run: () => {
      assert(router.includes("from './gerenteChannel.js'"), 'router importa gerenteChannel');
      const managerIdx = router.indexOf('await isManagerEmpresa(empresaId)');
      const orderingIdx = router.indexOf('if (buttonId && parseOrderingButton(buttonId))');
      assert(managerIdx > 0, 'branch manager existe');
      assert(orderingIdx > managerIdx, 'branch manager vem antes do bloco de botões de pedido');
      assert(router.includes('handleManagerInbound({'), 'chama handleManagerInbound');
    },
  },
  {
    name: 'áudio transcrito de empresa manager vai para o gerente',
    run: () => {
      assert(index.includes('handleManagerAudioSettled'), 'index trata áudio do gerente');
    },
  },
]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx tests/gerenteRouterWiring.test.ts`
Expected: falhas nas asserções.

- [ ] **Step 3: `router.ts`**

Adicionar ao topo, junto dos outros imports:

```ts
import { handleManagerInbound, isManagerEmpresa } from './gerenteChannel.js';
```

Dentro de `processWebhookEvent`, logo depois da linha que termina o cálculo de `msgText` (`).trim();`) e **antes** de `if (buttonId && parseOrderingButton(buttonId)) {`, inserir:

```ts
    // Zelinho Gerente: a empresa interna em modo 'manager' nunca entra no fluxo de
    // clientes. Persistimos a mensagem para histórico e repassamos ao ZeloPDV.
    if (await isManagerEmpresa(empresaId)) {
      const persistedManager = await handleIncomingMessage(data, empresaId);
      if (!persistedManager) {
        console.log(`[WebhookTrace] manager_skip empresa=${empresaId} jid=${redactJid(remoteJid)} reason=duplicate_or_unpersisted`);
        return;
      }
      const isAudio = !!(data.message?.audioMessage || data.message?.pttMessage);
      if (isAudio && !msgText) {
        // A transcrição é assíncrona; o handler de áudio em index.ts encaminha depois.
        console.log(`[WebhookTrace] manager_audio_pending empresa=${empresaId} jid=${redactJid(remoteJid)}`);
        return;
      }
      await handleManagerInbound({ empresaId, jid: remoteJid, text: msgText, messageId: data.key?.id ?? persistedManager.messageId, buttonId: buttonId || undefined });
      return;
    }
```

`handleIncomingMessage` e `redactJid` já são importados em `router.ts`; se não forem, importar de `./messageHandler.js` e do mesmo módulo de redaction usado nas outras linhas `redactJid(`.

- [ ] **Step 4: `index.ts` — áudio**

Adicionar import:

```ts
import { handleManagerInbound, isManagerEmpresa } from './gerenteChannel.js';
import { getServiceSupabase } from './supabase.js';
```
(se `getServiceSupabase` já estiver importado, não duplicar.)

Adicionar antes de `onAudioTranscriptionSettled(async ({ empresaId, jid, messageId }) => {`:

```ts
async function handleManagerAudioSettled(empresaId: string, jid: string, messageId: string): Promise<void> {
  const { data, error } = await getServiceSupabase()
    .from('zelochat_messages')
    .select('audio_transcript, audio_transcript_status')
    .eq('id', messageId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) {
    console.error('[GerenteChannel] transcript lookup failed:', error.message);
    return;
  }
  const row = data as { audio_transcript?: string | null; audio_transcript_status?: string | null } | null;
  if (row?.audio_transcript_status !== 'done' || !row.audio_transcript?.trim()) {
    await handleManagerInbound({ empresaId, jid, text: 'Não consegui entender o áudio. Pode escrever?', messageId: `${messageId}:transcript-failed` });
    return;
  }
  await handleManagerInbound({ empresaId, jid, text: row.audio_transcript, messageId });
}
```

E como **primeiras linhas** do corpo do handler `onAudioTranscriptionSettled`, dentro do `try`:

```ts
    if (await isManagerEmpresa(empresaId)) {
      await handleManagerAudioSettled(empresaId, jid, messageId);
      return;
    }
```

Observação: no caso de transcrição falha, o texto `'Não consegui entender o áudio. Pode escrever?'` é enviado ao ZeloPDV como se fosse do dono; o agente responde a isso de forma natural. Alternativa mais simples e preferível: em vez de chamar o ZeloPDV, enviar direto a resposta com `dispatchConversationOutbound`. Se optar por ela, exporte `sendReply` de `gerenteChannel.ts` como `sendGerenteText(empresaId, jid, text, messageId)` e use-a aqui.

- [ ] **Step 5: Rodar teste, lint e a suíte de takeover**

Run: `npx tsx tests/gerenteRouterWiring.test.ts && npm run lint && npm run test:takeover`
Expected: pass; `tsc` limpo; takeover intacto (o branch novo retorna antes de qualquer caminho de pedido).

- [ ] **Step 6: Commit**

```bash
git add server/router.ts server/index.ts tests/gerenteRouterWiring.test.ts
git commit -m "feat(gerente): webhook desvia a empresa manager para o Zelinho Gerente"
```

### Task 5: Documentação e rollout

**Files:**
- Modify: `CLAUDE.md` (seção Database → modos; seção envs)
- Modify: `CURRENT.md`
- Modify: `docs/ai/ZeloChat.memory.md` (se existir) ou `AI_BACKEND_ROADMAP.md`

- [ ] **Step 1: Docs**

Em `CLAUDE.md`, na lista de colunas próprias de `empresa_perfil`, registrar que `zelochat_mode` aceita `manager` e o que isso significa. Acrescentar em envs: `ZELOPDV_GERENTE_CHANNEL_URL`, `GERENTE_CHANNEL_INTERNAL_KEY`, `ZELINHO_MANAGER_EMPRESA_EMAIL`. Em `CURRENT.md`, item novo descrevendo o canal do Zelinho Gerente, o número exclusivo e que a lógica vive no ZeloPDV.

- [ ] **Step 2: Rollout (operacional, em ordem)**

1. Criar o auth user `zelinho@zelopdv.com.br` no Supabase.
2. Aplicar a migration 068 (`supabase db push --linked` a partir deste repo, após `--dry-run`).
3. Configurar envs no servidor do ZeloChat: `GERENTE_CHANNEL_INTERNAL_KEY` (a mesma do ZeloPDV), `ZELOPDV_GERENTE_CHANNEL_URL`.
4. Logar no ZeloChat como `zelinho@zelopdv.com.br`, abrir a tela de conexão e escanear o QR com o **número virtual novo** do Zelinho. Isso cria a instância `zelo-{id8}-{16hex}` e registra o webhook com `?token=`.
5. Confirmar `whatsmiau_connected = true` na `empresa_perfil` do Zelinho.
6. Smoke: de um celular não pareado, mandar "oi" → esperado: instruções de pareamento. Gerar código no ZeloPDV (Preferências) → mandar → esperado: "Pronto! Este WhatsApp está conectado à ...". Mandar "quais categorias eu tenho?" → resposta real. Mandar "cria a categoria Teste Zelinho" → botões → Confirmar → "Feito: criei a categoria ...". Apagar a categoria pela tela de Produtos do ZeloPDV.
7. Registrar resultado em `CURRENT.md` dos dois repos.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md CURRENT.md
git commit -m "docs(gerente): canal WhatsApp do Zelinho Gerente"
```
