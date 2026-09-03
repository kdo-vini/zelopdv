import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const chat = new URL('../src/lib/components/AssistantChat.svelte', import.meta.url);
const core = new URL('../src/lib/components/chat/ChatStreamCore.svelte', import.meta.url);

describe('AssistantChat redesenhado', () => {
  it('fala com o agente e trata pendência, respostas rápidas, erro e pré-preenchimento', async () => {
    const source = await readFile(chat, 'utf8');
    expect(source).toContain('endpoint="/api/gerente/agent"');
    expect(source).not.toContain('endpoint="/api/chat/assistant"');
    expect(source).toContain('on:event={handleStreamEvent}');
    expect(source).toContain('message: content');
    for (const t of ['Proposta, aguardando você', 'confirm_action_id', 'cancel_action_id', 'expira em', 'quick_replies', 'setQuickReplies', 'prefillMessage', 'retryLast', 'Tentar de novo', 'Pensando', 'Consultando os seus dados', 'Peça algo ao Zelinho', 'Mudanças só acontecem depois que você confirma.', 'Nova conversa', '<textarea', 'action_resolved', '.thread > * { flex-shrink: 0; }', '/api/gerente/sessions', 'Conversas anteriores', 'Voltar para a conversa atual', 'viewingSession']) expect(source).toContain(t);
    expect(source).not.toContain('Seu gerente: pergunte ou peça uma ação');
    expect(source).not.toContain('icebreaker-icon');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/border-bottom-(left|right)-radius/);
  });

  it('ChatStreamCore repassa eventos tipados', async () => {
    const source = await readFile(core, 'utf8');
    expect(source).toContain("dispatch('event', parsed)");
  });
});
