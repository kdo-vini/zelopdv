<script>
  import { supabase } from '$lib/supabaseClient';
  import { isOpen, messages as assistantMessages, contextType, closeAssistant } from '$lib/stores/assistant';
  import ChatStreamCore from '$lib/components/chat/ChatStreamCore.svelte';
  import { Sparkles, Trash2, X, SendHorizontal } from 'lucide-svelte';

  const CONTEXT_CHIPS = [
    { value: 'geral', label: 'Geral' },
    { value: 'vendas', label: 'Vendas' },
    { value: 'produtos', label: 'Produtos' },
    { value: 'despesas', label: 'Despesas' },
  ];

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function prepareAssistantRequest() {
    const token = await getToken();
    if (!token) {
      return { error: 'Sessão expirada. Faça login novamente.' };
    }

    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        context_type: $contextType,
      },
    };
  }
</script>

{#if $isOpen}
  <div
    class="md:hidden fixed inset-0 z-89 bg-black/50"
    role="presentation"
    on:click={closeAssistant}
    aria-hidden="true"
  ></div>
{/if}

<ChatStreamCore
  messagesStore={assistantMessages}
  active={$isOpen}
  endpoint="/api/chat/assistant"
  placeholder="Pergunte sobre seu negócio..."
  maxLength={1000}
  messageLimit={20}
  prepareRequest={prepareAssistantRequest}
  let:clearMessages
  let:input
  let:isStreaming
  let:messages
  let:onKeyDown
  let:registerMessagesContainer
  let:renderMarkdown
  let:sendMessage
  let:setInput
>
  <div
    class="assistant-panel"
    class:open={$isOpen}
    role="complementary"
    aria-label="Parceiro Zelinho"
    aria-hidden={!$isOpen}
  >
    <div class="panel-header">
      <div class="flex items-center gap-2">
        <div class="panel-avatar">
          <Sparkles class="size-5" aria-hidden="true" />
        </div>
        <div>
          <div class="font-semibold text-sm">Parceiro Zelinho</div>
          <div class="text-xs" style="opacity: 0.75;">Assistente IA do seu negócio</div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button on:click={clearMessages} class="icon-btn" title="Limpar conversa" aria-label="Limpar conversa">
          <Trash2 class="size-4" />
        </button>
        <button on:click={closeAssistant} class="icon-btn" aria-label="Fechar parceiro">
          <X class="size-4" />
        </button>
      </div>
    </div>

    <div class="context-chips">
      {#each CONTEXT_CHIPS as chip}
        <button
          class="chip"
          class:chip-active={$contextType === chip.value}
          on:click={() => ($contextType = chip.value)}
          aria-pressed={$contextType === chip.value}
        >
          {chip.label}
        </button>
      {/each}
    </div>

    <div class="panel-messages" use:registerMessagesContainer>
      {#if messages.length === 0}
        <div class="welcome-msg">
          <p class="font-semibold mb-1">Olá! Sou o Zelinho ✨</p>
          <p class="text-sm" style="opacity: 0.75;">Tenho acesso aos dados do seu negócio e posso ajudar com análise de vendas, precificação, controle de despesas e muito mais.</p>
          <p class="text-sm mt-2" style="opacity: 0.65;">Escolha um foco acima ou pergunte qualquer coisa sobre seu negócio.</p>
        </div>
      {/if}

      {#each messages as msg}
        <div class="p-msg {msg.role === 'user' ? 'p-user' : 'p-assistant'}">
          {#if msg.role === 'assistant' && !msg.content && isStreaming}
            <span class="typing-dots" aria-label="Digitando...">
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

    <div class="panel-input-area">
      <input
        type="text"
        value={input}
        on:input={(event) => setInput(event.currentTarget.value)}
        on:keydown={onKeyDown}
        placeholder="Pergunte sobre seu negócio..."
        disabled={isStreaming}
        class="panel-input"
        autocomplete="off"
        maxlength="1000"
      />
      <button
        on:click={sendMessage}
        disabled={isStreaming || !input.trim()}
        class="panel-send-btn"
        aria-label="Enviar"
      >
        <SendHorizontal class="size-4" />
      </button>
    </div>
  </div>
</ChatStreamCore>

<style>
  .assistant-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    background: var(--bg-card);
    border-left: 1px solid var(--border-card);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
    z-index: 90;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .assistant-panel.open {
    transform: translateX(0);
  }

  @media (max-width: 640px) {
    .assistant-panel {
      width: 100vw;
    }
  }

  .panel-header {
    padding: 14px 16px;
    background: var(--primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .panel-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    opacity: 0.8;
    padding: 5px;
    border-radius: 4px;
    line-height: 0;
    transition: opacity 0.15s;
  }
  .icon-btn:hover {
    opacity: 1;
  }

  .context-chips {
    display: flex;
    gap: 6px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .chip {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover {
    background: var(--bg-input);
    color: var(--text-main);
  }
  .chip-active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .panel-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .welcome-msg {
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    padding: 20px 10px;
    background: var(--bg-input);
    border-radius: 12px;
  }

  .p-msg {
    max-width: 88%;
    padding: 10px 14px;
    border-radius: 14px;
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

  .p-user {
    background: var(--primary);
    color: white;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }

  .p-assistant {
    background: var(--bg-input);
    color: var(--text-main);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }

  .typing-dots {
    display: inline-flex;
    gap: 4px;
    padding: 2px 0;
    align-items: center;
  }
  .typing-dots span {
    width: 6px;
    height: 6px;
    background: var(--text-muted);
    border-radius: 50%;
    animation: dot-bounce 1.2s infinite ease-in-out;
  }
  .typing-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes dot-bounce {
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

  .panel-input-area {
    padding: 12px;
    display: flex;
    gap: 8px;
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .panel-input {
    flex: 1;
    padding: 10px 14px;
    border-radius: 22px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .panel-input:focus {
    border-color: var(--primary);
  }
  .panel-input:disabled {
    opacity: 0.6;
  }

  .panel-send-btn {
    width: 40px;
    height: 40px;
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
  .panel-send-btn:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .panel-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
