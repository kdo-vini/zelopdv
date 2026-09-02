import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/routes/api/chat/support/+server.js', import.meta.url);

describe('support chat usage logging', () => {
  it('grava chat_type aceito pela constraint ai_usage_logs_chat_type_check', async () => {
    const source = await readFile(routePath, 'utf8');
    expect(source).toContain("chat_type: 'support'");
    expect(source).not.toContain("chat_type: 'sales'");
  });
});
