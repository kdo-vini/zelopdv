import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve('supabase/migrations/20260902140000_gerente_phone_links.sql');
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase() : '';
const compact = sql.replace(/\s+/g, ' ');

describe('gerente phone links migration', () => {
  it('um telefone por owner e um owner por telefone', () => {
    expect(sql).toContain('create table if not exists public.gerente_phone_links');
    expect(compact).toContain('owner_user_id uuid primary key references auth.users(id) on delete cascade');
    expect(compact).toContain('phone_normalized text not null unique');
    expect(compact).toContain("check (phone_normalized ~ '^55[0-9]{10,11}$')");
  });

  it('códigos guardam só hash sha-256 com validade', () => {
    expect(sql).toContain('create table if not exists public.gerente_pairing_codes');
    expect(compact).toContain("check (code_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain('expires_at timestamptz not null');
    expect(sql).toContain('consumed_at timestamptz');
    expect(sql).toContain('gerente_pairing_codes_live_idx');
  });

  it('nenhum acesso de browser', () => {
    expect(sql).toContain('alter table public.gerente_phone_links enable row level security');
    expect(sql).toContain('alter table public.gerente_pairing_codes enable row level security');
    expect(sql).toContain('grant all on table public.gerente_phone_links to service_role');
    expect(sql).toContain('grant all on table public.gerente_pairing_codes to service_role');
    expect(sql).not.toMatch(/grant .* on table public\.gerente_(phone_links|pairing_codes) to (anon|authenticated)/);
  });
});
