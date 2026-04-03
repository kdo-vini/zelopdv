<script>
  import { supabase } from '$lib/supabaseClient';
  import { isOpen, messages, contextType, closeAssistant } from '$lib/stores/assistant';

  let input = '';
  let isStreaming = false;
  let messagesEl;

  const CONTEXT_CHIPS = [
    { value: 'geral', label: 'Geral' },
    { value: 'vendas', label: 'Vendas' },
    { value: 'produtos', label: 'Produtos' },
    { value: 'despesas', label: 'Despesas' },
  ];

  function scrollToBottom() {
    if (messagesEl) {
      setTimeout(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }, 10);
    }
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || isStreaming) return;

    const token = await getToken();
    if (!token) {
      messages.update(msgs => [
        ...msgs,
        { role: 'assistant', content: 'Sessão expirada. Faça login novamente.' },
      ]);
      return;
    }

    input = '';
    messages.update(msgs => [
      ...msgs,
      { role: 'user', content },
      { role: 'assistant', content: '' },
    ]);

    let idx;
    const unsub = messages.subscribe(msgs => {
      idx = msgs.length - 1;
    });
    unsub();

    isStreaming = true;
    scrollToBottom();

    try {
      let currentMessages;
      const unsub2 = messages.subscribe(v => { currentMessages = v; });
      unsub2();

      const response = await fetch('/api/chat/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: currentMessages.slice(0, -1).slice(-20),
          context_type: $contextType,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        messages.update(msgs => {
          const updated = [...msgs];
          updated[idx] = { ...updated[idx], content: err.error || 'Erro ao conectar. Tente novamente.' };
          return updated;
        });
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
              messages.update(msgs => {
                const updated = [...msgs];
                if (updated[idx]) {
                  updated[idx] = { ...updated[idx], content: updated[idx].content + parsed.content };
                }
                return updated;
              });
              scrollToBottom();
            }
            if (parsed.error) {
              messages.update(msgs => {
                const updated = [...msgs];
                if (updated[idx]) {
                  updated[idx] = { ...updated[idx], content: parsed.error };
                }
                return updated;
              });
            }
          } catch {
            // ignore parse errors on incomplete chunks
          }
        }
      }
    } catch {
      messages.update(msgs => {
        const updated = [...msgs];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], content: 'Erro de conexão. Tente novamente.' };
        }
        return updated;
      });
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

  function clearMessages() {
    $messages = [];
  }

  $: if ($isOpen) scrollToBottom();
</script>

<!-- Mobile backdrop -->
{#if $isOpen}
  <div
    class="md:hidden fixed inset-0 z-[89] bg-black/50"
    role="presentation"
    on:click={closeAssistant}
    aria-hidden="true"
  ></div>
{/if}

<!-- Slide-in panel -->
<div
  class="assistant-panel"
  class:open={$isOpen}
  role="complementary"
  aria-label="Parceiro Zelinho"
  aria-hidden={!$isOpen}
>
  <!-- Header -->
  <div class="panel-header">
    <div class="flex items-center gap-2">
      <div class="panel-avatar">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      </div>
      <div>
        <div class="font-semibold text-sm">Parceiro Zelinho</div>
        <div class="text-xs" style="opacity: 0.75;">Assistente IA do seu negócio</div>
      </div>
    </div>
    <div class="flex items-center gap-1">
      <button on:click={clearMessages} class="icon-btn" title="Limpar conversa" aria-label="Limpar conversa">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
      <button on:click={closeAssistant} class="icon-btn" aria-label="Fechar parceiro">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Context chips -->
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

  <!-- Messages -->
  <div class="panel-messages" bind:this={messagesEl}>
    {#if $messages.length === 0}
      <div class="welcome-msg">
        <p class="font-semibold mb-1">Olá! Sou o Zelinho ✨</p>
        <p class="text-sm" style="opacity: 0.75;">Tenho acesso aos dados do seu negócio e posso ajudar com análise de vendas, precificação, controle de despesas e muito mais.</p>
        <p class="text-sm mt-2" style="opacity: 0.65;">Escolha um foco acima ou pergunte qualquer coisa sobre seu negócio.</p>
      </div>
    {/if}

    {#each $messages as msg}
      <div class="p-msg {msg.role === 'user' ? 'p-user' : 'p-assistant'}">
        {#if msg.role === 'assistant' && !msg.content && isStreaming}
          <span class="typing-dots" aria-label="Digitando...">
            <span></span><span></span><span></span>
          </span>
        {:else}
          {msg.content}
        {/if}
      </div>
    {/each}
  </div>

  <!-- Input -->
  <div class="panel-input-area">
    <input
      type="text"
      bind:value={input}
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
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
      </svg>
    </button>
  </div>
</div>

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
    white-space: pre-wrap;
    word-break: break-word;
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
