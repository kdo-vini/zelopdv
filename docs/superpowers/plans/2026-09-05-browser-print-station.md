# Browser Print Station Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que impressões iniciadas no celular sejam entregues à impressora conectada a uma aba autenticada do ZeloPDV no computador.

**Architecture:** Ações explícitas usam uma fila owner-scoped no Supabase; uma estação opt-in no navegador do PC reserva e encaminha os envelopes ao Zelo Impressão local. Pedidos canônicos de Menu, Chat e Mesas continuam usando `zelo_orders`, mas o observador automático sai da página de Pedidos e passa a rodar globalmente quando a estação está ativa.

**Tech Stack:** SvelteKit 2, Svelte 5, Supabase/PostgreSQL, Vitest e o contrato HTTP do Zelo Impressão 0.2.0.

**Spec:** `docs/superpowers/specs/2026-09-05-browser-print-station-design.md`

## Global Constraints

- O modo é opt-in e local ao navegador pelo botão **Este computador recebe impressões**.
- O agente Windows 0.2.0 não será alterado.
- O cliente nunca informa `owner_user_id`; as RPCs derivam o owner por `get_owner_user_id(auth.uid())`.
- `anon` não recebe acesso às tabelas nem às RPCs.
- `PRINT_OUTCOME_UNKNOWN` nunca é repetido automaticamente.
- Trabalhos expiram em duas horas e payloads não podem exceder 256 KiB.
- Itens de Mesa imprimem automaticamente somente depois de **Enviar para cozinha**.
- Cores novas de UI devem usar variáveis CSS existentes.

---

### Task 1: Fila e reserva transacional no PostgreSQL

**Files:**
- Modify: `supabase/migrations/20260905195511_browser_print_station.sql`
- Create: `supabase/verification/browser_print_station.sql`
- Create: `tests/browserPrintStationSchema.test.js`

**Interfaces:**
- Produces: `zelo_print_stations`, `zelo_print_jobs`.
- Produces: `enqueue_zelo_print_job_v1(uuid,text,jsonb,timestamptz)`.
- Produces: `heartbeat_zelo_print_station_v1(uuid,text,boolean)`.
- Produces: `claim_zelo_print_jobs_v1(uuid,integer)`.
- Produces: `finish_zelo_print_job_v1(uuid,uuid,text,text,text)`.

- [ ] **Step 1: Write the failing schema test**

Assert that the migration creates both owner-scoped tables, enables RLS,
revokes `anon`, derives the owner from `auth.uid()`, uses `for update skip
locked`, validates the 256 KiB payload limit and refuses automatic retry for
`unknown`.

```js
expect(sql).toMatch(/create table public\.zelo_print_jobs/i);
expect(sql).toMatch(/for update skip locked/i);
expect(sql).toMatch(/octet_length\(payload::text\) <= 262144/i);
expect(sql).toMatch(/revoke all .* from public, anon/i);
```

- [ ] **Step 2: Run the schema test and confirm RED**

Run: `npx vitest run tests/browserPrintStationSchema.test.js`

Expected: FAIL because the generated migration is empty.

- [ ] **Step 3: Implement the migration**

Use enums as checked text columns to keep PostgREST payloads simple. Claim up
to three rows with one `update ... from (select ... for update skip locked)`.
Um claim abandonado vira `unknown`: depois de reservar não existe prova de que
o POST local não começou. Apenas falhas seguras devolvidas explicitamente pela
estação voltam para `pending`.

```sql
create table public.zelo_print_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  client_job_id uuid not null,
  job_type text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending','claimed','spooled','failed','unknown','expired')),
  station_id uuid,
  claimed_at timestamptz,
  attempts integer not null default 0,
  error_code text,
  error_message text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, client_job_id),
  check (octet_length(payload::text) <= 262144)
);
```

Every SECURITY DEFINER RPC must set `search_path`, validate `auth.uid()`, call
`get_owner_user_id`, revoke PUBLIC/anon access and grant only authenticated and
service role.

- [ ] **Step 4: Add disposable SQL verification**

The verification must run inside a transaction and roll back. It creates two
owners and actors, proves idempotent enqueue, cross-owner isolation, single
claim, matching-station completion, retry seguro explícito e claim abandonado
terminal em `unknown`.

- [ ] **Step 5: Run schema and SQL verification**

Run: `npx vitest run tests/browserPrintStationSchema.test.js`

Run the repository PostgreSQL verification mechanism against
`supabase/verification/browser_print_station.sql`; expected result is all
assertions passing and rollback.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260905195511_browser_print_station.sql supabase/verification/browser_print_station.sql tests/browserPrintStationSchema.test.js
git commit -m "feat: add browser print queue"
```

### Task 2: Cliente de fila e preferência local

**Files:**
- Create: `src/lib/remotePrintQueue.js`
- Create: `src/lib/printStationPreference.js`
- Create: `tests/remotePrintQueue.test.js`

**Interfaces:**
- Produces: `enqueueRemotePrintJob(client, envelope, options?)`.
- Produces: `heartbeatPrintStation(client, station)`.
- Produces: `claimRemotePrintJobs(client, stationId, limit?)`.
- Produces: `finishRemotePrintJob(client, result)`.
- Produces: `getPrintStationId()`, `isPrintStationEnabled()`, `setPrintStationEnabled(enabled)` and `printStationEnabled` store.

- [ ] **Step 1: Write failing unit tests**

Cover stable station UUID in localStorage, idempotent client job ID forwarding,
two-hour expiry, RPC error propagation, claim limit capped at three and finish
payload sanitization.

```js
await enqueueRemotePrintJob(client, { jobId, type: 'receipt', content: { format: 'raw_escpos_base64', base64: 'AA==' } });
expect(client.rpc).toHaveBeenCalledWith('enqueue_zelo_print_job_v1', expect.objectContaining({ p_client_job_id: jobId }));
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run tests/remotePrintQueue.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement minimal adapters**

Keep Supabase calls in `remotePrintQueue.js`; keep all localStorage/store logic
in `printStationPreference.js`. Do not import Svelte components into either
module.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npx vitest run tests/remotePrintQueue.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/lib/remotePrintQueue.js src/lib/printStationPreference.js tests/remotePrintQueue.test.js
git commit -m "feat: add remote print queue client"
```

### Task 3: Encaminhar impressões explícitas para a estação

**Files:**
- Modify: `src/lib/printService.js`
- Modify: `tests/printService.reliability.test.js`

**Interfaces:**
- Consumes: `enqueueRemotePrintJob` from Task 2.
- Preserves: `printVenda`, `printMovCaixa`, `printPagamentoFiado`, `printOrder`, `printTeste` public signatures.

- [ ] **Step 1: Add failing reliability tests**

Prove that a safe local preflight failure enqueues the exact raw/text job,
queue success suppresses browser fallback, queue failure preserves fallback,
and uncertain local outcome neither queues nor falls back.

```js
mocks.sendRaw.mockRejectedValueOnce(Object.assign(new Error('offline'), {
  code: 'ZELO_IMPRESSAO_UNAVAILABLE', retrySafe: true,
}));
mocks.enqueue.mockResolvedValueOnce({ status: 'pending', stationOnline: true });
await printVenda(payload);
expect(mocks.enqueue).toHaveBeenCalledOnce();
expect(mocks.fallback).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run tests/printService.reliability.test.js`

- [ ] **Step 3: Refactor local outcome into explicit states**

Return `spooled`, `safe_failure` or `unknown` from the private local attempt.
On `safe_failure`, build the same job accepted by `sendPrintJob`, assign one
UUID before the RPC and enqueue it. Show a success/info toast according to the
station heartbeat returned by the RPC.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npx vitest run tests/printService.reliability.test.js tests/remotePrintQueue.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/lib/printService.js tests/printService.reliability.test.js
git commit -m "feat: queue remote receipt printing"
```

### Task 4: Consumidor global da estação

**Files:**
- Create: `src/lib/remotePrintStation.js`
- Create: `src/lib/components/RemotePrintStation.svelte`
- Create: `tests/remotePrintStation.test.js`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/perfil/+page.svelte`

**Interfaces:**
- Consumes: queue adapters and preference store from Task 2.
- Produces: `runRemotePrintStationCycle(dependencies)` for deterministic tests.
- Produces: global Svelte lifecycle for heartbeat and two-second polling.

- [ ] **Step 1: Write failing runner tests**

Cover disabled station, unavailable local agent, sequential processing,
`spooled`, safe failure, `unknown`, logout/owner change and claim cap.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run tests/remotePrintStation.test.js`

- [ ] **Step 3: Implement the pure station cycle**

The runner receives `detectAgent`, `claim`, `send`, `finish` and `stationId`.
It never overlaps cycles and stops after an uncertain result.

- [ ] **Step 4: Mount the component globally**

Render `RemotePrintStation` from `src/routes/+layout.svelte` only when there is
an authenticated session and the current route is an internal sidebar route.
The component resolves the owner through `getAccessContext`, sends heartbeat
every 15 seconds and polls every two seconds while visible and online.

- [ ] **Step 5: Add the Profile control**

Place the toggle in the existing Zelo Impressão card. Its copy must explain
that the tab and Zelo Impressão need to remain open. Display `Pronto para
receber`, `Aguardando Zelo Impressão` or `Desativado neste computador`.

- [ ] **Step 6: Run focused tests and Svelte check**

Run: `npx vitest run tests/remotePrintStation.test.js tests/remotePrintQueue.test.js tests/printService.reliability.test.js`

Run: `npm run check`

- [ ] **Step 7: Commit**

```bash
git add src/lib/remotePrintStation.js src/lib/components/RemotePrintStation.svelte src/routes/+layout.svelte src/routes/perfil/+page.svelte tests/remotePrintStation.test.js
git commit -m "feat: add browser print station"
```

### Task 5: Tornar pedidos e cozinha independentes da tela aberta

**Files:**
- Create: `src/lib/canonicalOrderAutoPrintRuntime.js`
- Create: `src/lib/components/CanonicalOrderAutoPrinter.svelte`
- Create: `tests/canonicalOrderAutoPrintRuntime.test.js`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/app/pedidos/+page.svelte`

**Interfaces:**
- Consumes: `loadCanonicalOrders`, `subscribeCanonicalOrderUpdates`, `createPrintedOrderStore`, `selectOrdersToAutoPrint`, `printOrder`.
- Produces: one global observer active only when this browser is a print station.

- [ ] **Step 1: Write failing runtime tests**

Cover baseline suppression, new order, Mesa order, retry-safe release,
uncertain outcome retention, 15-minute reconciliation and cleanup of timers and
Realtime subscription.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run tests/canonicalOrderAutoPrintRuntime.test.js`

- [ ] **Step 3: Extract the automatic print runtime**

Keep the page responsible only for listing, reviewing, reprinting and changing
orders. The global component owns detection, subscription, polling and
automatic printing.

- [ ] **Step 4: Mount beside the remote queue consumer**

Mount `CanonicalOrderAutoPrinter` under the same authenticated/internal route
gate and preference store. Both components must stop immediately when the
station toggle is disabled.

- [ ] **Step 5: Run focused regressions and check**

Run: `npx vitest run tests/orderAutoPrint.test.js tests/canonicalOrderAutoPrintRuntime.test.js tests/printService.reliability.test.js tests/remotePrintStation.test.js`

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add src/lib/canonicalOrderAutoPrintRuntime.js src/lib/components/CanonicalOrderAutoPrinter.svelte src/routes/+layout.svelte src/routes/app/pedidos/+page.svelte tests/canonicalOrderAutoPrintRuntime.test.js
git commit -m "feat: run kitchen auto print globally"
```

### Task 6: Document, validate and publish

**Files:**
- Modify: `docs/CURRENT.md`
- Modify: `docs/ZeloPDV.memory.md`
- Modify: `docs/audits/2026-09-04-integracao.md`

**Interfaces:**
- Consumes: all tasks above.
- Produces: operational instructions and rollout record.

- [ ] **Step 1: Update operational documentation**

Document the station requirement, two-hour expiry, safe/uncertain retry rules,
coverage of Frente de Caixa/Mesas/Pedidos/Fiado and the fact that a browser tab
must remain open.

- [ ] **Step 2: Run final focused verification**

Run the new print tests, migration ledger verification and `npm run check`.
Do not claim physical printing; record it as a required smoke at Degust.

- [ ] **Step 3: Apply the migration through the linked Supabase CLI**

Run advisors, review the new table/RPC findings, then apply only
`20260905195511_browser_print_station.sql`. Confirm table, RLS, ACL and RPC
signatures with a read-only query and repair only this migration version if the
direct query path does not write the ledger.

- [ ] **Step 4: Merge and push after verification**

Follow the repository integration workflow, preserve unrelated work and push
the verified branch to `origin/main` so Vercel deploys automatically.

- [ ] **Step 5: Record field smoke as pending**

The Degust smoke consists of one mobile PDV receipt, one Mesa kitchen ticket,
one Mesa pre-account and one online order. Paper output must be observed by the
client or support before marking hardware validation complete.
