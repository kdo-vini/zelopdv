// Disposable local PostgreSQL only. Never reads a database URL or .env.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const docker = process.env.DOCKER_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe' : 'docker');
const container = `pix-reservation-test-${randomUUID().slice(0, 8)}`;
const owner = randomUUID();
const run = (args, input = '') => new Promise((resolve, reject) => {
  const child = spawn(docker, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; let error = '';
  const timer = setTimeout(() => { child.kill(); reject(new Error('Docker test deadline')); }, 60_000);
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { error += chunk; });
  child.on('error', reject);
  child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(error || output)); });
  child.stdin.end(input);
});
const sql = text => run(['exec', '-i', container, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], text);
const reserve = `select public.reserve_pix_payment('${owner}', 'pdv', 5900, false, false, false, '{"source":"test"}');`;
try {
  await run(['run', '--detach', '--rm', '--network', 'none', '--name', container,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { await sql('select 1;'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert(ready, 'PostgreSQL startup');
  const baseline = readFileSync(new URL('../supabase/baselines/20260813091000/schema.sql', import.meta.url), 'utf8');
  const paymentTable = baseline.match(/CREATE TABLE IF NOT EXISTS "public"\."billing_payments" \([\s\S]+?\n\);/)[0];
  await sql(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.subscriptions (
      id uuid primary key default gen_random_uuid(), user_id uuid, status text,
      current_period_end timestamptz, manually_extended_until timestamptz,
      cancel_at_period_end boolean, payment_provider text, billing_type text, plan_tier text,
      has_mesas_addon boolean, has_acessos_addon boolean, has_zelo_menu boolean,
      monthly_value_cents integer, created_at timestamptz, updated_at timestamptz
    );
    ${paymentTable}
    alter table public.billing_payments add primary key(id);
    alter table public.billing_payments add unique(external_reference);
    alter table public.billing_payments add unique(provider, provider_payment_id);
    create unique index open_pix on public.billing_payments(user_id,provider,method)
      where provider='abacatepay' and method='pix' and status='pending';
    alter table public.billing_payments enable row level security;
    grant usage on schema public to service_role;
    grant all on public.billing_payments, public.subscriptions to service_role;
  `);
  await sql(readFileSync(new URL('../supabase/migrations/20260905001053_pix_creation_reservation.sql', import.meta.url), 'utf8'));
  await sql(readFileSync(new URL('../supabase/migrations/20260812165936_webhook_reliability_pix_atomicity.sql', import.meta.url), 'utf8'));
  const raced = await Promise.all([0, 1].map(() => sql(`begin; set local role service_role; ${reserve} select pg_sleep(0.3); commit;`)));
  const reservations = raced.map(output => JSON.parse(output.split('\n').find(line => line.startsWith('{'))));
  assert.deepEqual(reservations.map(row => row.action).sort(), ['blocked', 'create']);
  assert.equal(new Set(reservations.map(row => row.payment.id)).size, 1);
  const payment = reservations[0].payment;
  const complete = (outcome, remote = null) => `select to_jsonb(public.complete_pix_creation('${payment.id}', '${owner}', '${outcome}', ${remote ? `'${JSON.stringify(remote)}'::jsonb` : 'null'}));`;
  await sql(complete('unknown'));
  await sql(`update public.billing_payments set created_at=now()-interval '7 days' where id='${payment.id}';`);
  assert.equal(JSON.parse(await sql(reserve)).action, 'blocked');
  const remote = { id: 'provider-fixture', externalId: payment.external_reference, amount: 5900,
    metadata: { paymentId: payment.id, userId: owner }, brCode: 'fixture-code', expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  await assert.rejects(sql(complete('ready', { ...remote, amount: 1 })), /mismatch/);
  await assert.rejects(sql(complete('ready', { ...remote, metadata: { paymentId: randomUUID(), userId: owner } })), /mismatch/);
  await sql(complete('ready', remote));
  assert.equal(JSON.parse(await sql(reserve)).action, 'reuse');
  assert.equal(JSON.parse(await sql(reserve.replace("'pdv', 5900", "'chat', 14900"))).action, 'selection_conflict');
  const settle = `select to_jsonb(public.settle_pix_payment('${payment.id}', 'PAID', 'paid', 5900, null, now(), '${payment.external_reference}'));`;
  await sql(settle);
  const end = await sql(`select current_period_end from public.subscriptions where user_id='${owner}';`);
  await sql(settle);
  assert.equal(await sql(`select current_period_end from public.subscriptions where user_id='${owner}';`), end);
  const late = JSON.parse(await sql(complete('ready', remote)));
  assert.equal(late.status, 'paid'); assert(late.paid_at);
  await sql(complete('unknown'));
  assert.equal(await sql(`select creation_state from public.billing_payments where id='${payment.id}';`), 'ready');
  const next = JSON.parse(await sql(reserve));
  assert.equal(next.action, 'create');
  await sql(`select public.complete_pix_creation('${next.payment.id}', '${owner}', 'not_sent');`);
  assert.equal(JSON.parse(await sql(reserve)).action, 'create');
  assert.equal(await sql(`select has_function_privilege('anon','public.reserve_pix_payment(uuid,text,integer,boolean,boolean,boolean,jsonb)','execute'), has_function_privilege('authenticated','public.complete_pix_creation(uuid,uuid,text,jsonb)','execute'), has_function_privilege('service_role','public.reserve_pix_payment(uuid,text,integer,boolean,boolean,boolean,jsonb)','execute');`), 'f|f|t');
  console.log('Pix PostgreSQL17: concurrency, durable unknown, recovery, identity/amount checks, settlement replay, late response, local failure release and ACL passed.');
} finally {
  await run(['rm', '--force', container]).catch(() => {});
}
