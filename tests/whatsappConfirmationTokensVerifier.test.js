import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const verifier = readFileSync(
  resolve('supabase/verification/whatsapp_confirmation_tokens_runtime.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const concurrencyProbePath = resolve('scripts/verify-whatsapp-confirmation-concurrency.mjs');
const concurrencyProbe = existsSync(concurrencyProbePath)
  ? readFileSync(concurrencyProbePath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const runtimeWrapper = readFileSync(
  resolve('tests/whatsappConfirmationTokensRuntime.test.js'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('verificador transacional dos tokens de confirmação WhatsApp', () => {
  it('concede acesso à fixture temporária antes de mudar para service_role', () => {
    const fixtureEnd = verifier.indexOf(') on commit drop;');
    const grant = verifier.indexOf(
      'grant select, insert, update, delete on table whatsapp_confirmation_fixture to service_role;',
    );
    const serviceRole = verifier.indexOf('set local role service_role;');

    expect(fixtureEnd).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(fixtureEnd);
    expect(grant).toBeLessThan(serviceRole);
  });

  it('monta sessões A/B e confirma ambas com a mesma chave fornecida pelo caller', () => {
    expect(verifier).toContain('session_b_id uuid not null');
    expect(verifier).toContain('second_confirmation_hash text not null');
    expect(verifier).toContain('second_confirmation_token_id uuid');
    expect(verifier).toContain("f.second_confirmation_hash, f.empresa_id, f.second_source_ref, 1, 'shared-caller-key', null");
    expect(verifier).toContain("raise exception 'same caller key resolved the order of another whatsapp session';");
  });

  it('oferece probe descartável, opt-in e com barreira observável para emissão×confirmação', () => {
    expect(concurrencyProbe).toContain('process.env.zelopdv_disposable_db_url');
    expect(concurrencyProbe).toContain("process.env.zelopdv_run_whatsapp_confirmation_concurrency !== '1'");
    expect(concurrencyProbe).not.toContain('supabase_db_url');
    expect(concurrencyProbe).not.toContain('database_url');
    expect(concurrencyProbe).toContain("url.hostname !== '127.0.0.1'");
    expect(concurrencyProbe).toContain("url.port !== '55322'");
    expect(concurrencyProbe).toContain("url.pathname !== '/postgres'");
    expect(concurrencyProbe).toContain('randombytes(32).tostring(\'hex\')');
    expect(concurrencyProbe).toContain('pg_blocking_pids');
    expect(concurrencyProbe).toContain('waitforbarrier');
    expect(concurrencyProbe).toContain('issuanceblockedbyconfirmation');
    expect(concurrencyProbe).toContain('terminatepsql');
    expect(concurrencyProbe).toContain("child.kill('sigterm')");
    expect(concurrencyProbe).toContain("child.kill('sigkill')");
    expect(concurrencyProbe).toContain("spawn('taskkill'");
    expect(concurrencyProbe).toContain('await runpsqlfile');
    expect(concurrencyProbe).toContain('confirm_whatsapp_zelo_order');
    expect(concurrencyProbe).toContain('issue_whatsapp_zelo_confirmation_token');
    expect(concurrencyProbe).toContain('two independent psql connections');
  });

  it('recusa env genérica sem o opt-in descartável antes de abrir psql', () => {
    const result = spawnSync(process.execPath, [concurrencyProbePath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
        ZELOPDV_DISPOSABLE_DB_URL: '',
        ZELOPDV_RUN_WHATSAPP_CONFIRMATION_CONCURRENCY: '',
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('ZELOPDV_RUN_WHATSAPP_CONFIRMATION_CONCURRENCY=1');
  });

  it('mantém o wrapper runtime no mesmo gate descartável e delega psql ao probe', () => {
    expect(runtimeWrapper).toContain('process.env.zelopdv_disposable_db_url');
    expect(runtimeWrapper).toContain('process.env.zelopdv_run_whatsapp_confirmation_concurrency');
    expect(runtimeWrapper).not.toContain('supabase_db_url');
    expect(runtimeWrapper).not.toContain('database_url');
    expect(runtimeWrapper).not.toContain("'psql'");
  });
});
