import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_product_mapping_stock\.sql$/.test(name))
  .sort()
  .at(-1);
const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const sql = migrationPath
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_product_mapping_stock.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const rpcSignatures = [
  'suggest_ifood_product_mapping_v1(uuid, text, text, text, text)',
  'confirm_ifood_product_mapping_v1(uuid, text, text, integer, text, text)',
  'commit_ifood_stock_for_event_v1(text, text, text, jsonb)',
  'release_ifood_stock_for_event_v1(text, text, text)',
];

describe('iFood progressive product-mapping and stock schema', () => {
  it('uses a CLI-generated forward migration with hardened service-role-only RPCs', () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).toContain("raise exception 'forbidden'");
    expect(sql).not.toMatch(/alter\s+table\s+ifood_internal\.(?:product_mappings|stock_commitments)/);
  });

  it('defines every required RPC signature and revokes browser execution', () => {
    for (const signature of rpcSignatures) {
      const functionName = signature.split('(')[0];
      expect(sql).toContain(`create or replace function public.${functionName}`);
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('keeps exact externalCode suggestion separate from similar-name auto-link', () => {
    expect(sql).toContain('external_code');
    expect(sql).toContain("'suggested'");
    expect(sql).toContain("'confirmed'");
    expect(sql).toContain('similar_name');
    expect(sql).toContain('never auto-confirm');
  });

  it('commits and releases stock through the ledger with unique order/item/product keys', () => {
    expect(sql).toContain('stock_commitments');
    expect(sql).toContain('ifood_stock_commitments_item_unique');
    expect(sql).toContain("'committed'");
    expect(sql).toContain("'released'");
    expect(sql).toContain('on conflict on constraint ifood_stock_commitments_item_unique');
    expect(sql).toContain('estoque_atual');
    expect(sql).toContain('estoque_compartilhado_atual');
    expect(sql).toContain('stock_committed_at');
    expect(sql).toContain('stock_released_at');
  });

  it('transactionally verifies exact match, cross-tenant isolation, double confirm, and cancel restore', () => {
    for (const marker of [
      'browser role can execute',
      'exact match',
      'similar name',
      'manual confirm',
      'cross-tenant',
      'duplicate confirmed',
      'duplicate cancel',
      'unmapped item',
      'rollback;',
    ]) {
      expect(verificationSql).toContain(marker);
    }
    expect(verificationSql).toContain('set local role service_role');
    expect(verificationSql).toContain('commit_ifood_stock_for_event_v1');
    expect(verificationSql).toContain('release_ifood_stock_for_event_v1');
  });
});
