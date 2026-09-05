import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('supabase/migrations/20260905195511_browser_print_station.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('browser print station schema', () => {
  it('creates an owner-scoped queue with bounded payloads and terminal outcomes', () => {
    expect(sql).toContain('create table public.zelo_print_stations');
    expect(sql).toContain('create table public.zelo_print_jobs');
    expect(sql).toContain("status in ('pending', 'claimed', 'spooled', 'failed', 'unknown', 'expired')");
    expect(sql).toMatch(/octet_length\s*\(\s*payload::text\s*\)\s*<=\s*262144/);
    expect(sql).toContain('alter table public.zelo_print_stations enable row level security');
    expect(sql).toContain('alter table public.zelo_print_jobs enable row level security');
    expect(sql).toMatch(/revoke all on table public\.zelo_print_jobs from public, anon/);
  });

  it('derives ownership from the authenticated actor and claims with row locks', () => {
    expect(sql).toContain('create or replace function public.enqueue_zelo_print_job_v1');
    expect(sql).toContain('create or replace function public.heartbeat_zelo_print_station_v1');
    expect(sql).toContain('create or replace function public.claim_zelo_print_jobs_v1');
    expect(sql).toContain('create or replace function public.finish_zelo_print_job_v1');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('get_owner_user_id');
    expect(sql).toContain('for update skip locked');
    expect(sql).toMatch(/status\s*=\s*'unknown'/);
    expect(sql).toMatch(/revoke all on function public\.enqueue_zelo_print_job_v1[\s\S]*from public, anon/);
  });
});
