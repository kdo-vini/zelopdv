// Local PostgreSQL WASM fallback when Docker cannot run. Never accepts a DB URL.
// npm install --prefix <temporary-dir> @electric-sql/pglite@0.3.14 --no-audit --no-fund
// node supabase/verification/offline-pglite.mjs <temporary-dir>/node_modules/@electric-sql/pglite
// This proves PL/pgSQL/RLS in one session, NOT Supabase services or concurrency.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const packageRoot=process.argv[2];
if (!packageRoot || /^[a-z]+:\/\//i.test(packageRoot)) throw new Error('Pass a local PGlite package directory; remote URLs are forbidden.');
const metadata=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8'));
if (metadata.name!=='@electric-sql/pglite' || metadata.version!=='0.3.14') throw new Error('Use the reviewed @electric-sql/pglite 0.3.14.');
const {PGlite}=await import(pathToFileURL(path.resolve(packageRoot,'dist/index.js')).href);
const db=new PGlite();
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key,email text,aud text,role text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz);
    create table auth.sessions(id uuid,user_id uuid,created_at timestamptz,updated_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
    grant usage on schema auth to authenticated,anon,service_role; grant select on auth.users to authenticated,service_role;`);
  const seed='20260824012356_fullbuster_burger_catalog.sql';
  const seedHash=createHash('sha256').update(fs.readFileSync(path.join(root,'supabase/migrations',seed))).digest('hex');
  if(seedHash!=='3695d8546bceff1d399536fb1e2e070d5b22d61b24d719e41295f6f5e45de318') throw new Error('Tenant seed changed; review exclusion.');
  const excluded=new Set([seed,'20260813092000_zelochat_media_storage_containment.sql']);
  const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.slice(0,14)>'20260813091000' && f.endsWith('.sql') && !excluded.has(f)).sort();
  await db.exec(read('supabase/baselines/20260813091000/schema.sql').replace(/^\s*\\.*$/gm,''));
  for(const file of migrations) {
    await db.exec('set search_path=public,extensions; set check_function_bodies=on;');
    try { await db.exec(read('supabase/migrations/'+file)); }
    catch(error) { throw new Error(`${file}: ${error.message}; ${error.where||''}`,{cause:error}); }
  }
  console.log(`Loaded public baseline + ${migrations.length} forward migrations. Excluded customer seed and unrelated Storage policy; managed Auth/Storage services are not represented.`);
  for(const file of ['offline_operation_runtime.sql','pizza_composition_runtime.sql','manual_offline_order_runtime.sql']) {
    await db.exec("reset role; set row_security=on; set search_path=public,extensions; set request.jwt.claims='{}';");
    try { await db.exec(read('supabase/verification/'+file)); console.log('PASS',file); }
    catch(error) { throw new Error(`${file}: ${error.message}; ${error.where||''}`,{cause:error}); }
  }
  console.log('PASS single-session PostgreSQL WASM runtime. Multi-session PostgreSQL and physical devices remain separate gates.');
} finally { await db.close(); }
