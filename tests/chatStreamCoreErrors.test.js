import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('ChatStreamCore error state and retry', () => {
  it('marca mensagens de erro e expõe retryLast', async () => {
    const s = await readFile(new URL('../src/lib/components/chat/ChatStreamCore.svelte', import.meta.url), 'utf8');
    expect(s).toContain('error: true');
    expect(s).toContain('function retryLast');
    expect(s).toContain('{retryLast}');
    expect(s).toContain('async function sendMessage(text)');
  });
});
