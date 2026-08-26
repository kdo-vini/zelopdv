import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL (ou DATABASE_URL) é obrigatório para a verificação de concorrência.');
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
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`psql saiu com ${code}: ${stderr || stdout}`));
    });
  });
}

const ownerId = randomUUID();
const email = `codex-customer-concurrency-${ownerId}@invalid.local`;
const phone = '5511987654321';
const observedName = 'Cliente concorrente';
const setupSql = `
begin;
insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '${ownerId}', '${email}', 'authenticated', 'authenticated', '{}', '{}', now(), now()
);
commit;`;
const callSql = `
begin;
set local role service_role;
select public.ensure_customer_from_whatsapp(
  '${ownerId}'::uuid, '${phone}', '${observedName}'
);
select pg_sleep(1);
commit;`;
const cleanupSql = `
begin;
set local role service_role;
delete from public.pessoa_identities where id_usuario = '${ownerId}'::uuid;
delete from public.pessoas where id_usuario = '${ownerId}'::uuid;
delete from auth.users where id = '${ownerId}'::uuid;
commit;`;

function resultJson(stdout) {
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.trim().startsWith('{'));
  if (!line) throw new Error(`psql não retornou JSON: ${stdout}`);
  return JSON.parse(line);
}

try {
  await runPsql(setupSql);
  const results = await Promise.all([
    runPsql(callSql),
    runPsql(callSql),
  ]);
  const payloads = results.map(({ stdout }) => resultJson(stdout));
  const statuses = payloads.map((payload) => payload.status).sort().join(',');
  const ids = new Set(payloads.map((payload) => payload.pessoaId));
  if (statuses !== 'created,linked' || ids.size !== 1) {
    throw new Error(`corrida não serializada: ${JSON.stringify(payloads)}`);
  }
  console.log(`concorrência OK: ${JSON.stringify(payloads)}`);
} finally {
  try {
    await runPsql(cleanupSql);
  } catch (error) {
    console.error(`limpeza da fixture falhou: ${error.message}`);
    process.exitCode = 1;
  }
}
