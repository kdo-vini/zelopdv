import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve('supabase/migrations/20260922190438_ifood_admin_replay_qualify_status.sql'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('iFood admin replay status qualification', () => {
  it('qualifies the inbox update so the returned status column is not ambiguous', () => {
    expect(sql).toContain('update ifood_internal.event_inbox as e');
    expect(sql).toContain('where e.id = p_inbox_id');
    expect(sql).toContain("and e.status in ('failed_retryable', 'dead_letter', 'processing')");
    expect(sql).not.toMatch(/update ifood_internal\.event_inbox\s+set status/);
  });

  it('qualifies the command update the same way', () => {
    expect(sql).toContain('update ifood_internal.order_commands as c');
    expect(sql).toContain('where c.id = p_command_id');
    expect(sql).toContain("and c.status in ('failed_retryable', 'failed_terminal', 'expired', 'sending')");
    expect(sql).not.toMatch(/update ifood_internal\.order_commands\s+set status/);
  });
});
