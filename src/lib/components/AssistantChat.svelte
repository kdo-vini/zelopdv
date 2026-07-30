<script>
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { isOpen, messages as assistantMessages, contextType, signalContext, screenContext, closeAssistant, clearSignalContext, clearScreenContext, screenContextMatchesLocation } from '$lib/stores/assistant';
  import ChatStreamCore from '$lib/components/chat/ChatStreamCore.svelte';
  import ZelinhoRail from '$lib/components/zelinho/ZelinhoRail.svelte';
  import { BarChart3, PackageSearch, Sparkles, Trash2, X, SendHorizontal } from 'lucide-svelte';
  import { getSignalPresenter } from '$lib/gerente/signalPresenter.js';

  const ICEBREAKERS = [
    { icon: BarChart3, title: 'Entenda suas vendas', prompt: 'Como foram minhas vendas de ontem comparadas à média?' },
    { icon: PackageSearch, title: 'Acompanhe seus produtos', prompt: 'Quais produtos merecem minha atenção hoje?' },
    { icon: Sparkles, title: 'Escolha um próximo passo', prompt: 'O que devo priorizar hoje no meu negócio?' },
  ];

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function trackZelinhoUsage() {
    const token = await getToken();
    if (!token || typeof window === 'undefined') return;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const cacheKey = `zelo:usage:${day}:zelinho`;
    if (window.sessionStorage.getItem(cacheKey)) return;
    window.sessionStorage.setItem(cacheKey, '1');

    try {
      const response = await fetch('/api/product-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feature: 'zelinho' }),
      });
      if (!response.ok) window.sessionStorage.removeItem(cacheKey);
    } catch {
      window.sessionStorage.removeItem(cacheKey);
    }
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
        signal_id: $signalContext?.id || undefined,
        screen_context: $signalContext ? undefined : ($screenContext || undefined),
      },
    };
  }

  function prefillSignalQuestion(node, { question, setInput }) {
    if (question) setInput(question);
    return {
      update({ question: nextQuestion, setInput: nextSetInput }) {
        if (nextQuestion) nextSetInput(nextQuestion);
      },
    };
  }

  function chooseIcebreaker(prompt, setInput) {
    if (typeof setInput !== 'function') return;

    setInput(prompt);
    void tick().then(() => inputElement?.focus());
  }

  $: activeSignalPresenter = $signalContext ? getSignalPresenter($signalContext) : null;
  $: if ($screenContext && !screenContextMatchesLocation($screenContext, $page.url.pathname, $page.url.search)) {
    clearSignalContext();
    clearScreenContext();
  }
  let inputElement;
  let panelElement;
  let isModalViewport = false;
  let wasOpen = false;

  onMount(() => {
    const mediaQuery = window.matchMedia('(max-width: 1279px)');
    const updateViewport = () => { isModalViewport = mediaQuery.matches; };
    updateViewport();
    mediaQuery.addEventListener?.('change', updateViewport);
    return () => mediaQuery.removeEventListener?.('change', updateViewport);
  });

  $: if ($isOpen && !wasOpen) {
    wasOpen = true;
    void trackZelinhoUsage();
    void tick().then(() => inputElement?.focus());
  } else if (!$isOpen) {
    wasOpen = false;
  }

  async function closePanel() {
    closeAssistant();
    await tick();
    document.querySelector('[data-zelinho-rail]')?.focus();
  }

  function handleEscape(event) {
    if (event.key === 'Escape' && $isOpen) void closePanel();
  }

  function handlePanelKeydown(event) {
    if (!$isOpen || !isModalViewport || event.key !== 'Tab' || !panelElement) return;

    const focusable = [...panelElement.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hasAttribute('inert') && element.getClientRects().length > 0);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window on:keydown={handleEscape} />

<ZelinhoRail />

{#if $isOpen}
  <div
    class="assistant-backdrop"
    role="presentation"
    on:click={() => void closePanel()}
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
    bind:this={panelElement}
    class="assistant-panel"
    class:open={$isOpen}
    role={$isOpen && isModalViewport ? 'dialog' : 'complementary'}
    aria-label="Zelinho"
    aria-modal={$isOpen && isModalViewport ? 'true' : undefined}
    aria-hidden={!$isOpen}
    inert={!$isOpen}
    on:keydown={handlePanelKeydown}
  >
    <div class="panel-header">
      <div class="flex items-center gap-2">
        <div class="panel-avatar">
          <Sparkles class="size-5" aria-hidden="true" />
        </div>
        <div>
          <div class="font-semibold text-sm">Zelinho</div>
          <div class="text-xs" style="opacity: 0.75;">{$screenContext?.title || 'Dados do seu negócio'}</div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button type="button" on:click={clearMessages} class="icon-btn" title="Limpar conversa" aria-label="Limpar conversa">
          <Trash2 class="size-4" />
        </button>
        <button type="button" on:click={() => void closePanel()} class="icon-btn" aria-label="Fechar Zelinho">
          <X class="size-4" />
        </button>
      </div>
    </div>

    {#if $signalContext}
      <div class="signal-context" use:prefillSignalQuestion={{ question: activeSignalPresenter.perguntaSugerida, setInput }}>
        <span class:critical={$signalContext.severity === 'critical'} class:attention={$signalContext.severity === 'attention'} class="signal-context-tag">
          {$signalContext.severity === 'critical' ? 'PRECISA DE VOCÊ' : $signalContext.severity === 'attention' ? 'FICA DE OLHO' : 'PRA SABER'}
        </span>
        <span class="signal-context-title">{activeSignalPresenter.titulo}</span>
        <button type="button" class="signal-context-close" on:click={clearSignalContext} aria-label="Remover contexto do aviso"><X class="size-4" /></button>
      </div>
    {:else if $screenContext}
      <div class="screen-context">
        <span>Sobre</span>
        <strong>{$screenContext.title}</strong>
        <button type="button" class="signal-context-close" on:click={clearScreenContext} aria-label="Remover contexto da tela"><X class="size-4" /></button>
      </div>
    {/if}

    <div class="panel-messages" use:registerMessagesContainer>
      {#if messages.length === 0}
        <div class="welcome-msg">
          <p class="font-semibold mb-1">Olá! Sou o Zelinho ✨</p>
          <p class="text-sm" style="opacity: 0.75;">Escolha uma pergunta para começar ou escreva a sua.</p>
          <div class="icebreakers" aria-label="Sugestões para começar">
            {#each ICEBREAKERS as icebreaker}
              <button type="button" class="icebreaker" on:click={() => chooseIcebreaker(icebreaker.prompt, setInput)}>
                <span class="icebreaker-icon"><svelte:component this={icebreaker.icon} size={17} aria-hidden="true" /></span>
                <span class="icebreaker-copy"><strong>{icebreaker.title}</strong><small>{icebreaker.prompt}</small></span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#each messages as msg}
        <div class="p-msg {msg.role === 'user' ? 'p-user' : 'p-assistant'}">
          {#if msg.role === 'assistant' && !msg.content && isStreaming}
            <span class="typing-dots" role="status" aria-live="polite" aria-label="Zelinho está digitando">
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
      <label class="sr-only" for="zelinho-message">Mensagem para o Zelinho</label>
      <input
        id="zelinho-message"
        type="text"
        bind:this={inputElement}
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
        type="button"
        on:click={sendMessage}
        disabled={isStreaming || !input.trim()}
        class="panel-send-btn"
        aria-label="Enviar"
      >
        <SendHorizontal class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</ChatStreamCore>

<style>
  .assistant-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 24rem;
    max-width: 100vw;
    height: 100vh;
    background: var(--bg-panel);
    border-left: 1px solid var(--border-card);
    z-index: 90;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform var(--transition-fast);
  }

  .assistant-panel.open {
    transform: translateX(0);
  }

  .assistant-backdrop {
    position: fixed;
    inset: 0;
    z-index: 89;
    background: color-mix(in srgb, var(--text-inverse) 62%, transparent);
  }

  @media (min-width: 1280px) {
    .assistant-backdrop { display: none; }
  }

  @media (max-width: 767px) {
    .assistant-panel {
      width: 100vw;
      border-left: 0;
    }
  }

  .panel-header {
    padding: 14px 16px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-main);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .panel-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--primary) 16%, var(--bg-panel));
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .icon-btn {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    background: transparent;
    border: 0;
    cursor: pointer;
    color: var(--text-muted);
    padding: 0;
    border-radius: 8px;
    line-height: 0;
    transition: opacity 0.15s;
  }
  .icon-btn:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .icon-btn:focus-visible,
  .signal-context-close:focus-visible,
  .icebreaker:focus-visible,
  .panel-send-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent);
  }

  .signal-context { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 9px 14px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-input); }
  .signal-context-tag { flex: 0 0 auto; color: var(--primary); font-size: 10px; font-weight: 700; letter-spacing: .06em; }.signal-context-tag.attention { color: var(--status-warning-text); }.signal-context-tag.critical { color: var(--status-error-text); }
  .signal-context-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main); font-size: 12px; font-weight: 600; }
  .signal-context-close { display: grid; place-items: center; width: 44px; height: 44px; place-self: center; flex: 0 0 auto; margin-left: auto; border: 0; border-radius: 8px; background: transparent; color: var(--text-muted); cursor: pointer; padding: 0; }
  .screen-context { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 9px 14px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-muted); font-size: 12px; }
  .screen-context strong { min-width: 0; overflow: hidden; color: var(--text-main); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }

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
    text-align: left;
    padding: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 8px;
  }

  .icebreakers {
    display: grid;
    gap: 8px;
    margin-top: 14px;
  }

  .icebreaker {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 58px;
    padding: 9px 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-main);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .icebreaker:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 7%, var(--bg-input));
  }

  .icebreaker-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    border-radius: 7px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 13%, var(--bg-panel));
  }

  .icebreaker-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .icebreaker-copy strong {
    color: var(--text-label);
    font-size: 12px;
    font-weight: 600;
  }

  .icebreaker-copy small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.35;
    line-clamp: 2;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .p-msg {
    max-width: 88%;
    padding: 10px 14px;
    border-radius: 8px;
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
    background: color-mix(in srgb, var(--text-main) 8%, var(--bg-input));
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    font-family: monospace;
  }

  .p-user {
    background: var(--primary);
    color: var(--text-inverse);
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
    animation: dot-pulse 1.2s infinite ease-in-out;
  }
  .typing-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes dot-pulse {
    0%,
    60%,
    100% {
      opacity: 0.4;
    }
    30% {
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
    border-radius: 8px;
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
    width: 44px;
    height: 44px;
    border-radius: 8px;
    background: var(--primary);
    color: var(--text-inverse);
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

  @media (prefers-reduced-motion: reduce) {
    .assistant-panel { transition: none; }
    .typing-dots span { animation: none; }
    .icebreaker { transition: none; }
  }
</style>
