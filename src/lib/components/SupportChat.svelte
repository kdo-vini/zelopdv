<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import ChatStreamCore from '$lib/components/chat/ChatStreamCore.svelte';

  const WHATSAPP_URL =
    'https://wa.me/5514991537503?text=Ol%C3%A1%2C%20vim%20pelo%20site%20do%20Zelo%20PDV%20e%20gostaria%20de%20saber%20mais.';

  let isOpen = false;
  const messagesStore = writable([]);

  function toggleChat() {
    isOpen = !isOpen;
  }

  function openChat() {
    isOpen = true;
  }

  onMount(() => {
    const handleOpenChat = () => openChat();

    window.addEventListener('zelo:open-support-chat', handleOpenChat);

    return () => {
      window.removeEventListener('zelo:open-support-chat', handleOpenChat);
    };
  });
</script>

<div class="support-chat-container" role="complementary" aria-label="Chat de suporte">
  {#if isOpen}
    <ChatStreamCore
      messagesStore={messagesStore}
      active={isOpen}
      endpoint="/api/chat/support"
      placeholder="Digite sua dúvida..."
      maxLength={500}
      let:messages
      let:input
      let:isStreaming
      let:onKeyDown
      let:registerMessagesContainer
      let:renderMarkdown
      let:sendMessage
      let:setInput
    >
      <div class="chat-window" role="dialog" aria-modal="true" aria-label="Suporte Zelo PDV">
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

        <div class="chat-messages" use:registerMessagesContainer>
          {#if messages.length === 0}
            <div class="welcome-message">
              <p>Olá! 👋 Sou o assistente de suporte do Zelo PDV.</p>
              <p class="text-xs mt-2" style="opacity: 0.65;">Como posso te ajudar hoje? Pergunte sobre funcionalidades, o trial de 14 dias grátis ou como começar.</p>
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
                  {@html renderMarkdown(msg.content)}
                </div>
              {:else}
                {msg.content}
              {/if}
            </div>
          {/each}
        </div>

        <div class="disclaimer">
          Não encontrou o que precisava?
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" class="whatsapp-link">Falar com a equipe →</a>
        </div>

        <div class="chat-input-area">
          <input
            type="text"
            value={input}
            on:input={(event) => setInput(event.currentTarget.value)}
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
    </ChatStreamCore>
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
  .markdown-content :global(a) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #fff;
    background: #25D366;
    font-weight: 600;
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 20px;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s, transform 0.1s;
  }
  .markdown-content :global(a::before) {
    content: '';
    display: inline-block;
    width: 14px;
    height: 14px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-size: contain;
    flex-shrink: 0;
  }
  .markdown-content :global(a:hover) {
    background: #20b858;
    transform: scale(1.03);
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
