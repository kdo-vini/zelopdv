import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createPsqlProcessLifecycle, throwCollectedFailures } from './lib/psql-process-lifecycle.mjs';

const databaseUrl = process.env.ZELOPDV_DISPOSABLE_DB_URL;
if (databaseUrl !== 'postgresql://postgres:postgres@127.0.0.1:55322/postgres') {
  throw new Error('This probe only accepts the disposable PostgreSQL database on loopback port 55322.');
}
const timeoutMs = 8_000;
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
function assertOk(result) {
  if (result.code !== 0) throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  return result;
}
async function runSql(sql) {
  const handle = startPsql();
  lifecycle.endStdin(handle, `${sql}\n\\q\n`);
  return assertOk(await lifecycle.waitForProcess(handle, 'SQL'));
}
async function waitUntil(label, predicate) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function lineValue(stdout, marker) {
  return stdout.split(/\r?\n/).find((line) => line.startsWith(marker))?.slice(marker.length);
}
async function waitPid(handle) {
  return waitUntil('backend PID', () => Number(lineValue(handle.output(), 'PID:')) || null);
}

const owner = randomUUID(), actor = randomUUID(), role = randomUUID(), person = randomUUID();
const tenantActors = `'${owner}'::uuid,'${actor}'::uuid`;
const setupSql = `
begin;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id, 'sale-race-' || id::text || '@invalid.local','authenticated','authenticated','{}','{}',now(),now()
from (values (${tenantActors.split(',')[0]}),(${tenantActors.split(',')[1]})) ids(id);
insert into public.access_roles(id,owner_user_id,name,permissions)
values('${role}','${owner}','Sale race operator','{"pdv.acessar":true,"pdv.vender":true,"pdv.receber":true,"fiado.vender":true}');
insert into public.access_users(owner_user_id,auth_user_id,email,role_id,status)
values('${owner}','${actor}','sale-race-${actor}@invalid.local','${role}','active');
insert into public.caixas(id,id_usuario,valor_inicial) values(-913001,'${owner}',0);
insert into public.categorias(id,id_usuario,nome,controlar_estoque_compartilhado,estoque_compartilhado_atual)
values(-913002,'${owner}','Sale race shared',true,20);
insert into public.produtos(id,id_usuario,id_categoria,nome,preco,controlar_estoque,estoque_atual)
values(-913003,'${owner}',null,'Sale race individual',5,true,20),(-913004,'${owner}',-913002,'Sale race shared item',5,false,0);
insert into public.pessoas(id,id_usuario,nome,saldo_fiado) values('${person}','${owner}','Sale race person',100);
commit;`;
function payload(intent) {
  return JSON.stringify({ client_sale_id: intent, id_caixa: -913001, id_cliente: person,
    id_usuario: actor, id_operador: person, forma_pagamento: 'fiado', valor_total: 20,
    itens: [-913003, -913004].map((id) => ({ id_produto: id, quantidade: 2, nome: 'Sale race item', preco: 5 })),
    estoque: [-913003, -913004].map((id) => ({ id_produto: id, quantidade: 2 })),
    fiados: [{ id_pessoa: person, valor: 20 }],
  });
}
const cleanupSql = `
begin;
delete from public.fiado_lancamentos where id_usuario in(${tenantActors});
delete from public.vendas_itens where id_usuario in(${tenantActors});
delete from public.vendas where id_usuario in(${tenantActors});
delete from public.pessoas where id='${person}';
delete from public.produtos where id_usuario='${owner}';
delete from public.categorias where id_usuario='${owner}';
delete from public.caixas where id_usuario='${owner}';
delete from public.access_users where auth_user_id='${actor}';
delete from public.access_roles where id='${role}';
delete from auth.users where id in(${tenantActors});
commit;`;

let failure;
try {
  await runSql(setupSql);
  for (const actors of [[owner, actor], [actor, owner]]) {
    const intent = `sale-race-${randomUUID()}`;
    const blocker = startPsql();
    lifecycle.writeStdin(blocker, `begin;
select pg_advisory_xact_lock(hashtextextended('sale-create:${owner}:${intent}',0));
select 'PID:' || pg_backend_pid();\n`);
    const blockerPid = await waitPid(blocker);
    const calls = actors.map((identity) => {
      const handle = startPsql();
      lifecycle.endStdin(handle, `begin; set local statement_timeout='10s'; set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"${identity}"}',true);
select 'PID:' || pg_backend_pid();
select 'SALE_RESULT:' || public.criar_venda_completa('${payload(intent)}'::jsonb)::text;
commit;\n\\q\n`);
      return handle;
    });
    const pids = await Promise.all(calls.map(waitPid));
    await waitUntil('both sale requests waiting on the same tenant intention', async () => {
      const result = await runSql(`select 'WAIT:' || jsonb_build_array(pg_blocking_pids(${pids[0]}),pg_blocking_pids(${pids[1]}))::text;`);
      const [first, second] = JSON.parse(lineValue(result.stdout, 'WAIT:'));
      return (first.includes(blockerPid) || (first.includes(pids[1]) && second.includes(blockerPid)))
        && (second.includes(blockerPid) || (second.includes(pids[0]) && first.includes(blockerPid)));
    });
    lifecycle.endStdin(blocker, 'commit;\n\\q\n');
    assertOk(await lifecycle.waitForProcess(blocker, 'release sale barrier'));
    const responses = await Promise.all(calls.map(async (handle) => {
      const result = assertOk(await lifecycle.waitForProcess(handle, 'concurrent sale'));
      return JSON.parse(lineValue(result.stdout, 'SALE_RESULT:'));
    }));
    if (responses[0].id !== responses[1].id || responses.map((r) => r.idempotent).sort().join(',') !== 'false,true') {
      throw new Error(`Concurrent tenant intention was not replayed once: ${JSON.stringify(responses)}`);
    }
    const winner = actors[responses.findIndex((response) => response.idempotent === false)];
    await runSql(`do $$ begin
if not exists(select 1 from public.vendas where id=${responses[0].id} and id_usuario='${owner}' and id_operador='${winner}' and id_caixa=-913001)
then raise exception 'sale owner/operator/cash register differs from actual authenticated winner'; end if;
end $$;`);
  }
  await runSql(`do $$ begin
if (select count(*) from public.vendas where id_usuario in(${tenantActors})) <> 2
or (select estoque_atual from public.produtos where id=-913003) <> 16
or (select estoque_compartilhado_atual from public.categorias where id=-913002) <> 16
or (select saldo_fiado from public.pessoas where id='${person}') <> 140
or (select count(*) from public.fiado_lancamentos where id_usuario='${owner}' and id_pessoa='${person}') <> 2
or (select count(*) from public.vendas_itens where id_usuario='${owner}') <> 4
then raise exception 'concurrent sale duplicated or omitted financial/stock effects'; end if;
end $$;`);
  console.log('SALE_OWNER_CONCURRENCY_PASS: two real owner/operator races, one sale per intention, actual actor, individual/shared stock and fiado exactly once.');
} catch (error) {
  failure = error;
}
const cleanupFailures = [];
for (const handle of handles) {
  try { await lifecycle.finalizePsql(handle, 'sale probe session'); } catch (error) { cleanupFailures.push(error); }
}
try { await runSql(cleanupSql); } catch (error) { cleanupFailures.push(error); }
throwCollectedFailures(failure, cleanupFailures, 'Sale concurrency probe or fixture cleanup failed.');
