import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const chat = new URL('../src/lib/components/AssistantChat.svelte', import.meta.url);
const core = new URL('../src/lib/components/chat/ChatStreamCore.svelte', import.meta.url);

describe('AssistantChat usa o agente', () => {
  it('aponta para /api/gerente/agent e renderiza o cartão de confirmação', async () => {
    const source = await readFile(chat, 'utf8');
    expect(source).toContain('endpoint="/api/gerente/agent"');
    expect(source).not.toContain('endpoint="/api/chat/assistant"');
    expect(source).toContain('on:event={handleStreamEvent}');
    expect(source).toContain('class="pending-action"');
    expect(source).toContain('confirm_action_id');
    expect(source).toContain('cancel_action_id');
    expect(source).toContain('message: content');
    expect(source).toContain('prepareAssistantRequest({ content }');
  });

  it('ChatStreamCore repassa eventos tipados', async () => {
    const source = await readFile(core, 'utf8');
    expect(source).toContain("dispatch('event', parsed)");
  });
});
