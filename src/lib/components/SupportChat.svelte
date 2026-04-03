<script>
  import { marked } from 'marked';
  const WHATSAPP_URL =
    'https://wa.me/5514991537503?text=Oi%2C%20vim%20pelo%20sistema%20Zelo%20PDV%20e%20preciso%20de%20suporte%20(d%C3%BAvida%20ou%20problema).';

  let isOpen = false;
  let messages = [];
  let input = '';
  let isStreaming = false;
  let messagesEl;

  function toggleChat() {
    isOpen = !isOpen;
  }

  function scrollToBottom() {
    if (messagesEl) {
      setTimeout(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }, 10);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || isStreaming) return;

    input = '';
    messages = [...messages, { role: 'user', content }];
    messages = [...messages, { role: 'assistant', content: '' }];
    const idx = messages.length - 1;
    isStreaming = true;
    scrollToBottom();

    try {
      const response = await fetch('/api/chat/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.slice(0, -1).slice(-12),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        messages[idx] = { ...messages[idx], content: err.error || 'Erro ao conectar. Tente novamente.' };
        messages = messages;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              messages[idx] = { ...messages[idx], content: messages[idx].content + parsed.content };
              messages = messages;
              scrollToBottom();
            }
            if (parsed.error) {
              messages[idx] = { ...messages[idx], content: parsed.error };
              messages = messages;
            }
          } catch {
            // ignore parse errors on incomplete chunks
          }
        }
      }
    } catch {
      messages[idx] = { ...messages[idx], content: 'Erro de conexão. Tente novamente.' };
      messages = messages;
    } finally {
      isStreaming = false;
      scrollToBottom();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="support-chat-container" role="complementary" aria-label="Chat de suporte">
  {#if isOpen}
    <div class="chat-window" role="dialog" aria-modal="true" aria-label="Suporte Zelo PDV">
      <!-- Header -->
      <div class="chat-header">
        <div class="flex items-center gap-2">
          <div class="avatar">Z</div>
          <div>
            <div class="font-semibold text-sm">Suporte Zelo PDV</div>
            <div class="text-xs" style="opacity: 0.75;">Assistente IA</div>
          </div>
        </div>
        <button on:click={toggleChat} class="close-btn" aria-label="Fechar chat">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Messages -->
      <div class="chat-messages" bind:this={messagesEl}>
        {#if messages.length === 0}
          <div class="welcome-message">
            <p>Olá! 👋 Sou o assistente do Zelo PDV. Como posso ajudar?</p>
            <p class="text-xs mt-2" style="opacity: 0.65;">Pergunte sobre funcionalidades, preços, como criar conta e muito mais.</p>
          </div>
        {/if}

        {#each messages as msg}
          <div class="message {msg.role === 'user' ? 'user-msg' : 'assistant-msg'}">
            {#if msg.role === 'assistant' && !msg.content && isStreaming}
              <span class="typing-indicator" aria-label="Digitando...">
                <span></span><span></span><span></span>
              </span>
            {:else if msg.role === 'assistant'}
              <div class="markdown-content">
                {@html marked.parse(msg.content)}
              </div>
            {:else}
              {msg.content}
            {/if}
          </div>
        {/each}
      </div>

      <!-- Disclaimer -->
      <div class="disclaimer">
        IA pode errar. Para problemas urgentes,
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" class="whatsapp-link">fale pelo WhatsApp</a>.
      </div>

      <!-- Input -->
      <div class="chat-input-area">
        <input
          type="text"
          bind:value={input}
          on:keydown={onKeyDown}
          placeholder="Digite sua dúvida..."
          disabled={isStreaming}
          class="chat-input"
          autocomplete="off"
          maxlength="500"
        />
        <button
          on:click={sendMessage}
          disabled={isStreaming || !input.trim()}
          class="send-btn"
          aria-label="Enviar mensagem"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Floating toggle button -->
  <button
    on:click={toggleChat}
    class="chat-toggle-btn"
    aria-label={isOpen ? 'Fechar chat de suporte' : 'Abrir chat de suporte'}
    title="Suporte IA"
  >
    {#if isOpen}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
        <path fill-rule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clip-rule="evenodd" />
      </svg>
    {/if}
  </button>
</div>

<style>
  .support-chat-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }

  .chat-window {
    width: 380px;
    height: 480px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  @media (max-width: 480px) {
    .chat-window {
      position: fixed;
      bottom: 80px;
      right: 12px;
      left: 12px;
      width: auto;
      height: 70vh;
    }
    .support-chat-container {
      right: 12px;
    }
  }

  .chat-header {
    padding: 12px 16px;
    background: var(--primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    opacity: 0.8;
    padding: 4px;
    border-radius: 4px;
    line-height: 0;
    transition: opacity 0.15s;
  }
  .close-btn:hover {
    opacity: 1;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .welcome-message {
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    padding: 20px 10px;
  }

  .message {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
  }

  .markdown-content :global(p) {
    margin-bottom: 0.75rem;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(ul), .markdown-content :global(ol) {
    margin-bottom: 0.75rem;
    padding-left: 1.25rem;
    list-style: disc;
  }
  .markdown-content :global(ol) {
    list-style: decimal;
  }
  .markdown-content :global(li) {
    margin-bottom: 0.25rem;
  }
  .markdown-content :global(strong) {
    font-weight: 700;
  }
  .markdown-content :global(code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    font-family: monospace;
  }

  .user-msg {
    background: var(--primary);
    color: white;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }

  .assistant-msg {
    background: var(--bg-input);
    color: var(--text-main);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }

  .typing-indicator {
    display: inline-flex;
    gap: 4px;
    padding: 2px 0;
    align-items: center;
  }
  .typing-indicator span {
    width: 6px;
    height: 6px;
    background: var(--text-muted);
    border-radius: 50%;
    animation: typing-bounce 1.2s infinite ease-in-out;
  }
  .typing-indicator span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-indicator span:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes typing-bounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  .disclaimer {
    padding: 6px 16px;
    font-size: 11px;
    color: var(--text-muted);
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .whatsapp-link {
    color: var(--primary);
    font-weight: 500;
    text-decoration: underline;
  }

  .chat-input-area {
    padding: 10px;
    display: flex;
    gap: 8px;
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .chat-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 20px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .chat-input:focus {
    border-color: var(--primary);
  }
  .chat-input:disabled {
    opacity: 0.6;
  }

  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, opacity 0.15s;
  }
  .send-btn:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .chat-toggle-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .chat-toggle-btn:hover {
    transform: scale(1.06);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }
</style>
