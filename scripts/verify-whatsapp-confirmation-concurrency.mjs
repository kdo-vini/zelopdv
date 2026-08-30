import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  createPsqlProcessLifecycle,
  throwCollectedFailures,
} from './lib/psql-process-lifecycle.mjs';

const timeoutMs = 4_000;
const databaseUrl = process.env.ZELOPDV_DISPOSABLE_DB_URL;

if (process.env.ZELOPDV_RUN_WHATSAPP_CONFIRMATION_CONCURRENCY !== '1') {
  console.error('Defina ZELOPDV_RUN_WHATSAPP_CONFIRMATION_CONCURRENCY=1 para executar este probe descartável.');
  process.exit(2);
}
if (!databaseUrl) {
  console.error('ZELOPDV_DISPOSABLE_DB_URL é obrigatório para o probe descartável de concorrência WhatsApp.');
  process.exit(2);
}

let url;
try {
  url = new URL(databaseUrl);
} catch {
  console.error('ZELOPDV_DISPOSABLE_DB_URL não é uma URL PostgreSQL válida.');
  process.exit(2);
}
if (url.protocol !== 'postgresql:'
  || url.hostname !== '127.0.0.1'
  || url.port !== '55322'
  || url.pathname !== '/postgres'
  || url.username !== 'postgres'
  || url.search
  || url.hash) {
  console.error('O probe aceita somente PostgreSQL descartável em postgresql://postgres@127.0.0.1:55322/postgres.');
  process.exit(2);
}

function startPsql(extraArgs = []) {
  const child = spawn('psql', [databaseUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...extraArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let closed = false;
  let spawnError = null;
  const done = new Promise((resolve) => {
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { spawnError = error.message; });
    child.once('close', (code) => {
      closed = true;
      resolve({ code: code ?? 1, stdout, stderr, error: spawnError });
    });
  });
  return {
    child,
    done,
    output: () => ({ stdout, stderr }),
    closed: () => closed,
  };
}

const { endStdin, writeStdin, waitForProcess, finalizePsql } = createPsqlProcessLifecycle({
  timeoutMs,
  spawnImpl: spawn,
});

async function runPsql(sql) {
  const process = startPsql();
  endStdin(process, `${sql}\n\\q\n`);
  return waitForProcess(process, 'psql SQL');
}

async function runPsqlFile(file) {
  const process = startPsql(['--file', file]);
  endStdin(process);
  return waitForProcess(process, `psql ${file}`);
}

function assertOk(result, label) {
  if (result.code !== 0) {
    throw new Error(`${label} saiu com ${result.code}: ${result.stderr || result.stdout}`);
  }
}

function firstJson(result) {
  const line = result.stdout.split(/\r?\n/).find((candidate) => candidate.trim().startsWith('{'));
  if (!line) throw new Error(`psql não retornou JSON: ${result.stdout}`);
  return JSON.parse(line);
}

function expectedFailure(result, message) {
  return result.code !== 0 && `${result.stdout}\n${result.stderr}`.includes(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, predicate) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await delay(25);
  }
  throw new Error(`timeout aguardando ${label}; última observação: ${JSON.stringify(last)}`);
}

async function waitForMarker(process, marker) {
  return waitFor(marker, () => {
    const line = process.output().stdout.split(/\r?\n/).find((value) => value.startsWith(marker));
    if (!line) return null;
    const pid = Number(line.slice(marker.length));
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  });
}

async function finish(process, label) {
  return waitForProcess(process, label);
}

const ownerId = randomUUID();
const empresaId = randomUUID();
const sessionId = randomUUID();
const sourceRef = `codex-concurrency-${sessionId}@s.whatsapp.net`;
const oldHash = randomBytes(32).toString('hex');
const newHash = randomBytes(32).toString('hex');

const setupSql = `
begin;
insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '${ownerId}', 'codex-whatsapp-concurrency-${ownerId}@invalid.local',
  'authenticated', 'authenticated', '{}', '{}', now(), now()
);
insert into public.empresa_perfil (id, user_id, nome_exibicao)
values ('${empresaId}', '${ownerId}', 'Empresa de concorrência WhatsApp');
insert into public.zelomenu_cart_sessions (
  id, empresa_id, context, state, source_ref, customer_snapshot, cart_snapshot,
  fulfillment_snapshot, pricing_snapshot, payment_snapshot, revision
) values (
  '${sessionId}', '${empresaId}', 'whatsapp_order', 'cart_open', '${sourceRef}',
  '{"name":"Cliente de concorrência"}',
  '{"items":[{"productName":"Produto de concorrência","unitPrice":0,"quantity":1,"lineTotal":0,"position":0}]}',
  '{"type":"pickup"}',
  '{"subtotal":0,"deliveryFee":0,"discount":0}',
  '{"pixReceiptRequired":false,"pixReceiptApproved":false}', 1
);
commit;
`;

const issueOldSql = `
begin;
set local role service_role;
select public.issue_whatsapp_zelo_confirmation_token(
  '${oldHash}', '${empresaId}'::uuid, '${sourceRef}', '${sessionId}'::uuid, 1, now() + interval '10 minutes'
);
commit;
`;

const confirmSql = `
begin;
set local role service_role;
select 'CONFIRM_PID:' || pg_backend_pid();
select public.confirm_whatsapp_zelo_order(
  '${oldHash}', '${empresaId}'::uuid, '${sourceRef}', 1, 'same-caller-key', null
);
commit;
`;

const replaceSql = `
begin;
set local role service_role;
select 'ISSUE_PID:' || pg_backend_pid();
select public.issue_whatsapp_zelo_confirmation_token(
  '${newHash}', '${empresaId}'::uuid, '${sourceRef}', '${sessionId}'::uuid, 1, now() + interval '10 minutes'
);
commit;
`;

const stateSql = `
select json_build_object(
  'orders', (select count(*) from public.zelo_orders where zelomenu_session_id = '${sessionId}'::uuid),
  'state', (select state from public.zelomenu_cart_sessions where id = '${sessionId}'::uuid),
  'oldConsumed', exists(select 1 from public.zelomenu_whatsapp_confirmation_tokens where token_hash = '${oldHash}' and consumed_at is not null),
  'oldInvalidated', exists(select 1 from public.zelomenu_whatsapp_confirmation_tokens where token_hash = '${oldHash}' and invalidated_at is not null),
  'newLive', exists(select 1 from public.zelomenu_whatsapp_confirmation_tokens where token_hash = '${newHash}' and consumed_at is null and invalidated_at is null)
);
`;

const cleanupSql = `
begin;
delete from public.zelo_orders where zelomenu_session_id = '${sessionId}'::uuid;
delete from public.zelomenu_whatsapp_confirmation_tokens where session_id = '${sessionId}'::uuid;
delete from public.zelomenu_cart_sessions where id = '${sessionId}'::uuid;
delete from public.empresa_perfil where id = '${empresaId}'::uuid;
delete from auth.users where id = '${ownerId}'::uuid;
commit;
`;

let blocker;
let confirmation;
let issuance;
let primaryFailure;
try {
  const verifierPath = resolve(import.meta.dirname, '..', 'supabase', 'verification', 'whatsapp_confirmation_tokens_runtime.sql');
  assertOk(await runPsqlFile(verifierPath), 'verificação SQL transacional');
  assertOk(await runPsql(setupSql), 'setup');
  assertOk(await runPsql(issueOldSql), 'emissão inicial');

  blocker = startPsql();
  writeStdin(blocker, `
begin;
set local role service_role;
select token_hash from public.zelomenu_whatsapp_confirmation_tokens
 where token_hash = '${oldHash}'
 for update;
select 'BLOCKER_PID:' || pg_backend_pid();
`);
  const blockerPid = await waitForMarker(blocker, 'BLOCKER_PID:');

  // Two independent psql connections race confirmation against replacement.
  // The token blocker forces confirmation to retain the session lock while it
  // waits on the token. Issuance must then wait behind confirmation's session
  // lock; the observed blocking chain distinguishes the inverse lock order.
  confirmation = startPsql();
  endStdin(confirmation, `${confirmSql}\n\\q\n`);
  const confirmationPid = await waitForMarker(confirmation, 'CONFIRM_PID:');

  const barrierSql = (issuancePid = null) => `
select json_build_object(
  'confirmationBlockedByToken', ${blockerPid} = any(pg_blocking_pids(${confirmationPid})),
  'issuanceBlockedByConfirmation', ${issuancePid ?? 'null'}::integer is not null
    and ${confirmationPid} = any(pg_blocking_pids(${issuancePid ?? 'null'}::integer)),
  'newTokenVisibleBeforeRelease', exists(
    select 1 from public.zelomenu_whatsapp_confirmation_tokens where token_hash = '${newHash}'
  )
);
`;

  await waitForBarrier('confirmation blocked by token', async () => {
    const observed = firstJson(await runPsql(barrierSql()));
    return observed.confirmationBlockedByToken === true ? observed : null;
  });

  issuance = startPsql();
  endStdin(issuance, `${replaceSql}\n\\q\n`);
  const issuancePid = await waitForMarker(issuance, 'ISSUE_PID:');

  await waitForBarrier('issuance blocked by confirmation session lock', async () => {
    const observed = firstJson(await runPsql(barrierSql(issuancePid)));
    return observed.confirmationBlockedByToken === true
      && observed.issuanceBlockedByConfirmation === true
      && observed.newTokenVisibleBeforeRelease === false
      ? observed
      : null;
  });

  endStdin(blocker, 'commit;\n\\q\n');
  assertOk(await finish(blocker, 'liberação do bloqueador'), 'liberação do bloqueador');
  const confirmationResult = await finish(confirmation, 'confirmação');
  const issuanceResult = await finish(issuance, 'emissão');

  const state = firstJson(await runPsql(stateSql));
  if (confirmationResult.code !== 0
    || !expectedFailure(issuanceResult, 'CONFIRMATION_SESSION_NOT_OPEN')
    || state.orders !== 1
    || state.state === 'cart_open'
    || state.oldConsumed !== true
    || state.newLive !== false) {
    throw new Error(`barreira sessão→token não preservou confirmação canônica: ${JSON.stringify({ confirmationResult, issuanceResult, state })}`);
  }

  console.log(`concorrência emissão×confirmação OK: ${JSON.stringify(state)}`);
} catch (error) {
  primaryFailure = error;
} finally {
  const finalized = await Promise.allSettled([
    finalizePsql(blocker, 'finalização do bloqueador'),
    finalizePsql(confirmation, 'finalização da confirmação'),
    finalizePsql(issuance, 'finalização da emissão'),
  ]);
  const cleanupFailures = [];
  try {
    const cleanup = await runPsql(cleanupSql);
    if (cleanup.code !== 0) {
      cleanupFailures.push(new Error(`limpeza da fixture falhou: ${cleanup.stderr || cleanup.stdout}`));
    }
  } catch (error) {
    cleanupFailures.push(new Error(`limpeza da fixture excedeu o timeout: ${error.message}`));
  }
  const followupFailures = [
    ...finalized.filter((result) => result.status === 'rejected').map((result) => result.reason),
    ...cleanupFailures,
  ];
  throwCollectedFailures(
    primaryFailure,
    followupFailures,
    'falha principal e falhas ao finalizar processos psql ou limpar fixture',
  );
}

async function waitForBarrier(label, predicate) {
  return waitFor(label, predicate);
}
