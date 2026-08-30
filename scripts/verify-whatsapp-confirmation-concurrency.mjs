import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL (ou DATABASE_URL) é obrigatório para a verificação de concorrência WhatsApp.');
  process.exit(2);
}

function runPsql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [databaseUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
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

const ownerId = randomUUID();
const empresaId = randomUUID();
const sessionId = randomUUID();
const sourceRef = `codex-concurrency-${sessionId}@s.whatsapp.net`;
const oldHash = '1'.repeat(64);
const newHash = '2'.repeat(64);

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
select public.confirm_whatsapp_zelo_order(
  '${oldHash}', '${empresaId}'::uuid, '${sourceRef}', 1, 'same-caller-key', null
);
commit;
`;

const replaceSql = `
begin;
set local role service_role;
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

try {
  assertOk(await runPsql(setupSql), 'setup');
  assertOk(await runPsql(issueOldSql), 'emissão inicial');

  // Two independent psql connections race confirmation against replacement.
  const [confirmation, replacement] = await Promise.all([
    runPsql(confirmSql),
    runPsql(replaceSql),
  ]);

  const confirmationSucceeded = confirmation.code === 0;
  const replacementSucceeded = replacement.code === 0;
  if (confirmationSucceeded === replacementSucceeded) {
    throw new Error(`a corrida deveria ter um único vencedor: confirmação=${confirmation.code}, emissão=${replacement.code}`);
  }

  const state = firstJson(await runPsql(stateSql));
  if (confirmationSucceeded) {
    if (!expectedFailure(replacement, 'CONFIRMATION_SESSION_NOT_OPEN')
      || state.orders !== 1
      || state.state === 'cart_open'
      || state.oldConsumed !== true
      || state.newLive !== false) {
      throw new Error(`confirmação venceu, mas o estado não foi serializado: ${JSON.stringify({ confirmation, replacement, state })}`);
    }
  } else if (!expectedFailure(confirmation, 'CONFIRMATION_TOKEN_INVALIDATED')
    || state.orders !== 0
    || state.state !== 'cart_open'
    || state.oldInvalidated !== true
    || state.newLive !== true) {
    throw new Error(`emissão venceu, mas o estado não foi serializado: ${JSON.stringify({ confirmation, replacement, state })}`);
  }

  console.log(`concorrência emissão×confirmação OK: ${JSON.stringify(state)}`);
} finally {
  const cleanup = await runPsql(cleanupSql);
  if (cleanup.code !== 0) {
    console.error(`limpeza da fixture falhou: ${cleanup.stderr || cleanup.stdout}`);
    process.exitCode = 1;
  }
}
