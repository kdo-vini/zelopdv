// Proves the iFood queue RPCs (`claim_ifood_events_v1`, `finish_ifood_event_v1`,
// `claim_ifood_commands_v1`) behave correctly under real concurrent workers,
// not just sequential calls in one session. `supabase/verification/
// ifood_mvp_foundation.sql` deliberately only proves sequential-claim
// semantics inside a single rolled-back transaction; this probe uses several
// independent `psql` processes (real separate Postgres backends, matching
// the pattern in verify-sale-owner-concurrency.mjs) racing against the same
// disposable database to prove exactly-once claiming, distinct lease ids,
// and compare-and-set on finish.
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createPsqlProcessLifecycle, throwCollectedFailures } from './lib/psql-process-lifecycle.mjs';

const databaseUrl = process.env.ZELOPDV_DISPOSABLE_DB_URL;
if (databaseUrl !== 'postgresql://postgres:postgres@127.0.0.1:55322/postgres') {
  throw new Error('This probe only accepts the disposable PostgreSQL database on loopback port 55322.');
}

const EVENT_COUNT = 40;
const COMMAND_COUNT = 40;
const WORKER_COUNT = 4;
const CLAIM_BATCH = 5;
const timeoutMs = 20_000;

const lifecycle = createPsqlProcessLifecycle({ timeoutMs, spawnImpl: spawn });
const handles = [];

function startPsql() {
  const child = spawn('psql', [databaseUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let stdout = '', stderr = '', closed = false;
  const done = new Promise((resolve) => {
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { stderr += error.message; });
    child.once('close', (code) => { closed = true; resolve({ code: code ?? 1, stdout, stderr }); });
  });
  const handle = { child, done, closed: () => closed, output: () => stdout };
  handles.push(handle);
  return handle;
}

function assertOk(result, label) {
  if (result.code !== 0) throw new Error(`psql failed${label ? ` (${label})` : ''}: ${result.stderr || result.stdout}`);
  return result;
}

async function runSql(sql, { expectFailure = false, label } = {}) {
  const handle = startPsql();
  lifecycle.endStdin(handle, `${sql}\n\\q\n`);
  const result = await lifecycle.waitForProcess(handle, label ?? 'SQL');
  if (expectFailure) {
    if (result.code === 0) throw new Error(`Expected failure but psql succeeded${label ? ` (${label})` : ''}: ${result.stdout}`);
    return result;
  }
  return assertOk(result, label);
}

const owner = randomUUID();
const empresaId = randomUUID();
const connectionId = randomUUID();
const orderId = randomUUID();
const orderRefId = randomUUID();
const merchantId = `merchant-lease-race-${randomUUID()}`;

const setupSql = `
begin;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('${owner}','ifood-lease-race-${owner}@invalid.local','authenticated','authenticated','{}','{}',now(),now());
insert into public.empresa_perfil(id,user_id,nome_exibicao)
values('${empresaId}','${owner}','iFood lease concurrency');
insert into ifood_internal.connections(id,empresa_id,merchant_id,status)
values('${connectionId}','${empresaId}','${merchantId}','active');
insert into public.zelo_orders(id,empresa_id,source,status,revision,customer,fulfillment,payment,subtotal,delivery_fee,discount,total)
values('${orderId}','${empresaId}','ifood','pending_review',1,'{}','{}','{}',10,0,0,10);
insert into ifood_internal.order_refs(id,connection_id,empresa_id,merchant_id,external_order_id,zelo_order_id,external_revision,external_status)
values('${orderRefId}','${connectionId}','${empresaId}','${merchantId}','lease-race-order','${orderId}',1,'PLACED');
commit;`;

const cleanupSql = `
begin;
delete from ifood_internal.connections where id = '${connectionId}';
delete from public.zelo_orders where id = '${orderId}';
delete from public.empresa_perfil where id = '${empresaId}';
delete from auth.users where id = '${owner}';
commit;`;

async function enqueueEvents(count) {
  const values = Array.from({ length: count }, (_, i) => `(
    '${connectionId}', 'lease-race-event-${i}-${randomUUID()}', '${merchantId}',
    'lease-race-order', 'order.updated', ${i}, now(),
    jsonb_build_object('i', ${i})
  )`).join(',\n');
  await runSql(`
set role service_role;
select public.enqueue_ifood_event_v1(v.connection_id::uuid, v.event_id, v.merchant_id, v.external_order_id, v.event_type, v.revision::bigint, v.occurred_at::timestamptz, v.payload::jsonb)
  from (values ${values}) as v(connection_id, event_id, merchant_id, external_order_id, event_type, revision, occurred_at, payload);`,
    { label: 'enqueue events' });
}

async function insertCommands(count) {
  const values = Array.from({ length: count }, (_, i) => `(
    '${connectionId}', '${orderRefId}', '${empresaId}', '${merchantId}',
    'lease-race-cmd-order-${i}', 'confirm', ${i + 1}, 'lease-race-cmd-key-${i}-${randomUUID()}',
    jsonb_build_object('i', ${i})
  )`).join(',\n');
  await runSql(`
set role service_role;
insert into ifood_internal.order_commands(
  connection_id, order_ref_id, empresa_id, merchant_id, external_order_id,
  intent, expected_external_revision, idempotency_key, payload
) values ${values};`,
    { label: 'insert commands' });
}

async function claimBatchOnce(rpc, workerId) {
  const result = await runSql(`
set role service_role;
select 'CLAIM:' || inbox_id::text || ',' || lease_id::text
  from public.${rpc}('${workerId}', ${CLAIM_BATCH}, 120);`,
    { label: `${rpc} ${workerId}` });
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('CLAIM:'))
    .map((line) => line.slice('CLAIM:'.length).split(','));
}
// claim_ifood_commands_v1 returns `command_id`, not `inbox_id`; reuse the
// same marker query with the right column name per RPC.
async function claimCommandsBatchOnce(workerId) {
  const result = await runSql(`
set role service_role;
select 'CLAIM:' || command_id::text || ',' || lease_id::text
  from public.claim_ifood_commands_v1('${workerId}', ${CLAIM_BATCH}, 120);`,
    { label: `claim_ifood_commands_v1 ${workerId}` });
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('CLAIM:'))
    .map((line) => line.slice('CLAIM:'.length).split(','));
}

async function workerLoop(claimFn, workerId) {
  const claims = [];
  let consecutiveEmpty = 0;
  // Bounded retry loop: stop once this worker sees two consecutive empty
  // batches (accounts for a worker racing ahead of others without spinning
  // forever if something is actually wrong upstream).
  while (consecutiveEmpty < 2) {
    const batch = await claimFn(workerId);
    if (batch.length === 0) {
      consecutiveEmpty += 1;
    } else {
      consecutiveEmpty = 0;
      claims.push(...batch);
    }
  }
  return claims;
}

function assertExactlyOnce(label, claimedByWorker, expectedTotal) {
  const all = claimedByWorker.flat();
  const ids = all.map(([id]) => id);
  const leaseIds = all.map(([, leaseId]) => leaseId);
  const uniqueIds = new Set(ids);
  const uniqueLeaseIds = new Set(leaseIds);
  if (ids.length !== expectedTotal) {
    throw new Error(`${label}: expected ${expectedTotal} total claims across all workers, got ${ids.length}`);
  }
  if (uniqueIds.size !== expectedTotal) {
    throw new Error(`${label}: expected ${expectedTotal} distinct ids, got ${uniqueIds.size} (duplicate claim across workers)`);
  }
  if (uniqueLeaseIds.size !== expectedTotal) {
    throw new Error(`${label}: expected ${expectedTotal} distinct lease ids, got ${uniqueLeaseIds.size}`);
  }
  return all;
}

let failure;
try {
  await runSql(setupSql, { label: 'fixture setup' });
  await enqueueEvents(EVENT_COUNT);

  const workerIds = Array.from({ length: WORKER_COUNT }, (_, i) => `lease-race-event-worker-${i}`);
  const eventClaims = await Promise.all(
    workerIds.map((workerId) => workerLoop((w) => claimBatchOnce('claim_ifood_events_v1', w), workerId))
  );
  const allEventClaims = assertExactlyOnce('event claims', eventClaims, EVENT_COUNT);
  console.log(`EVENT_CLAIM_EXACTLY_ONCE_PASS: ${EVENT_COUNT} events, ${WORKER_COUNT} workers, no duplicate claim, ${allEventClaims.length} distinct lease ids.`);

  // Compare-and-set on finish: a foreign/stale lease id must not be able to
  // finish an event this worker legitimately holds; the real lease must.
  const [sampleInboxId, sampleLeaseId] = allEventClaims[0];
  const staleLeaseId = randomUUID();
  const staleAttempt = await runSql(
    `set role service_role;\nselect * from public.finish_ifood_event_v1('${sampleInboxId}', '${staleLeaseId}', 'processed');`,
    { expectFailure: true, label: 'stale lease finish' }
  );
  if (!/LEASE_LOST/.test(staleAttempt.stderr)) {
    throw new Error(`Expected LEASE_LOST for a stale/foreign lease id, got: ${staleAttempt.stderr}`);
  }
  await runSql(
    `set role service_role;\nselect * from public.finish_ifood_event_v1('${sampleInboxId}', '${sampleLeaseId}', 'processed');`,
    { label: 'real lease finish' }
  );
  console.log('EVENT_FINISH_CAS_PASS: stale/foreign lease rejected with LEASE_LOST; the real lease finished successfully.');

  // Finish the remaining leased events so the fixture is left in a clean
  // terminal state before cleanup (not strictly required since the whole
  // fixture is deleted, but avoids leaving `processing` rows referencing a
  // connection about to be removed while other probes might run first).
  for (const [inboxId, leaseId] of allEventClaims.slice(1)) {
    await runSql(`set role service_role;\nselect * from public.finish_ifood_event_v1('${inboxId}', '${leaseId}', 'processed');`, { label: 'drain finish' });
  }

  await insertCommands(COMMAND_COUNT);
  const commandWorkerIds = Array.from({ length: WORKER_COUNT }, (_, i) => `lease-race-command-worker-${i}`);
  const commandClaims = await Promise.all(
    commandWorkerIds.map((workerId) => workerLoop((w) => claimCommandsBatchOnce(w), workerId))
  );
  const allCommandClaims = assertExactlyOnce('command claims', commandClaims, COMMAND_COUNT);
  console.log(`COMMAND_CLAIM_EXACTLY_ONCE_PASS: ${COMMAND_COUNT} commands, ${WORKER_COUNT} workers, no duplicate claim, ${allCommandClaims.length} distinct lease ids.`);

  const [sampleCommandId, sampleCommandLeaseId] = allCommandClaims[0];
  const staleCommandLeaseId = randomUUID();
  const staleCommandAttempt = await runSql(
    `set role service_role;\nselect * from public.finish_ifood_command_v1('${sampleCommandId}', '${staleCommandLeaseId}', 'accepted_http');`,
    { expectFailure: true, label: 'stale command lease finish' }
  );
  if (!/LEASE_LOST/.test(staleCommandAttempt.stderr)) {
    throw new Error(`Expected LEASE_LOST for a stale/foreign command lease id, got: ${staleCommandAttempt.stderr}`);
  }
  await runSql(
    `set role service_role;\nselect * from public.finish_ifood_command_v1('${sampleCommandId}', '${sampleCommandLeaseId}', 'accepted_http');`,
    { label: 'real command lease finish' }
  );
  console.log('COMMAND_FINISH_CAS_PASS: stale/foreign lease rejected with LEASE_LOST; the real lease finished successfully.');
} catch (error) {
  failure = error;
}

const cleanupFailures = [];
for (const handle of handles) {
  try { await lifecycle.finalizePsql(handle, 'lease concurrency probe session'); } catch (error) { cleanupFailures.push(error); }
}
try { await runSql(cleanupSql, { label: 'fixture cleanup' }); } catch (error) { cleanupFailures.push(error); }
throwCollectedFailures(failure, cleanupFailures, 'iFood lease concurrency probe or fixture cleanup failed.');
