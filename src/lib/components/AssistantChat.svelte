<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import {
    isOpen,
    messages as assistantMessages,
    contextType,
    signalContext,
    screenContext,
    pendingAction,
    setPendingAction,
    clearPendingAction,
    quickReplies,
    setQuickReplies,
    clearQuickReplies,
    prefillMessage,
    closeAssistant,
    clearSignalContext,
    clearScreenContext,
    screenContextMatchesLocation,
  } from '$lib/stores/assistant';
  import ChatStreamCore from '$lib/components/chat/ChatStreamCore.svelte';
  import { AlertCircle, Plus, X, ArrowUp, Clock3, Check } from 'lucide-svelte';
  import { getSignalPresenter } from '$lib/gerente/signalPresenter.js';

  const SUGGESTIONS = [
    { label: 'como foi ontem?', send: true },
    { label: 'o que merece atenção?', send: true },
    { label: 'pausa um produto no cardápio', send: false },
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

  async function prepareAssistantRequest({ content } = {}) {
    const token = await getToken();
    if (!token) {
      return { error: 'Sessão expirada. Faça login novamente.' };
    }

    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        message: content,
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

  let resolvedCards = [];
  let actionBusy = false;
  let thinkingLabel = 'Pensando…';
  let thinkingTimer = null;
  let expiresIn = '';
  let expiryTimer = null;

  function handleStreamEvent(event) {
    const payload = event.detail;
    if (payload?.type === 'pending_action') setPendingAction(payload.action);
    if (payload?.type === 'quick_replies') setQuickReplies(payload.options);
    if (payload?.type === 'action_resolved') settleFromServer(payload.action);
  }

  async function resolvePendingAction(kind) {
    const action = $pendingAction;
    if (!action || actionBusy) return;
    actionBusy = true;
    try {
      const token = await getToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch('/api/gerente/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(kind === 'confirm' ? { confirm_action_id: action.id } : { cancel_action_id: action.id }),
      });
      const data = await response.json().catch(() => ({}));
      const ok = data?.ok === true;
      resolvedCards = [...resolvedCards, {
        id: action.id,
        summary: action.summary,
        effect: action.effect,
        status: kind === 'confirm' ? (ok ? 'done' : 'failed') : 'cancelled',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }];
      assistantMessages.update((items) => [...items, { role: 'assistant', content: data?.reply || data?.error || 'Não consegui concluir agora.' }]);
    } catch (error) {
      assistantMessages.update((items) => [...items, { role: 'assistant', content: error?.message || 'Erro de conexão. Tente novamente.', error: true }]);
    } finally {
      clearPendingAction();
      actionBusy = false;
    }
  }

  function settleFromServer(action) {
    if (!action?.id) return;
    const current = $pendingAction;
    if (current && current.id === action.id && current.summary) {
      const status = action.status === 'executed' ? 'done' : action.status === 'cancelled' ? 'cancelled' : 'failed';
      resolvedCards = [...resolvedCards, { id: action.id, summary: current.summary, effect: current.effect, status, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }];
    }
    clearPendingAction();
  }

  $: if ($pendingAction?.expires_at) startExpiry($pendingAction); else stopExpiry();
  function startExpiry(action) {
    stopExpiry();
    const tickExpiry = () => {
      const left = Math.max(0, new Date(action.expires_at).getTime() - Date.now());
      expiresIn = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
      if (left <= 0) {
        stopExpiry();
        clearPendingAction();
        assistantMessages.update((items) => [...items, { role: 'assistant', content: 'Essa confirmação expirou. Me peça de novo e eu preparo outra vez.' }]);
      }
    };
    tickExpiry();
    expiryTimer = setInterval(tickExpiry, 500);
  }
  function stopExpiry() {
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
  }
  onDestroy(stopExpiry);

  function watchThinking(streaming) {
    if (thinkingTimer) clearTimeout(thinkingTimer);
    thinkingLabel = 'Pensando…';
    if (streaming) thinkingTimer = setTimeout(() => { thinkingLabel = 'Consultando os seus dados…'; }, 1200);
  }

  let pendingPrefill = '';
  $: if ($prefillMessage) { pendingPrefill = $prefillMessage; prefillMessage.set(''); }

  function applyPrefill(node, { value, setInput, onApplied }) {
    const apply = (val) => {
      if (!val) return;
      setInput(val);
      onApplied?.();
      void tick().then(() => node.focus());
    };
    apply(value);
    return {
      update({ value: nextValue, setInput: nextSetInput, onApplied: nextOnApplied }) {
        if (nextValue) {
          nextSetInput(nextValue);
          nextOnApplied?.();
          void tick().then(() => node.focus());
        }
      },
    };
  }

  function autoGrow(node) {
    const fit = () => { node.style.height = 'auto'; node.style.height = `${Math.min(120, node.scrollHeight)}px`; };
    node.addEventListener('input', fit);
    fit();
    return { destroy() { node.removeEventListener('input', fit); } };
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
  let returnFocusElement = null;

  onMount(() => {
    const mediaQuery = window.matchMedia('(max-width: 1279px)');
    const updateViewport = () => { isModalViewport = mediaQuery.matches; };
    updateViewport();
    mediaQuery.addEventListener?.('change', updateViewport);
    return () => mediaQuery.removeEventListener?.('change', updateViewport);
  });

  $: if ($isOpen && !wasOpen) {
    if (typeof document !== 'undefined') {
      const activeElement = document.activeElement;
      returnFocusElement = activeElement instanceof HTMLElement ? activeElement : null;
    }
    wasOpen = true;
    void trackZelinhoUsage();
    void tick().then(() => inputElement?.focus());
  } else if (!$isOpen) {
    wasOpen = false;
  }

  async function closePanel() {
    closeAssistant();
    await tick();
    if (returnFocusElement?.isConnected) returnFocusElement.focus();
    returnFocusElement = null;
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
  endpoint="/api/gerente/agent"
  placeholder="Peça algo ao Zelinho"
  maxLength={1000}
  messageLimit={20}
  prepareRequest={prepareAssistantRequest}
  on:event={handleStreamEvent}
  on:send={() => watchThinking(true)}
  on:streamComplete={() => watchThinking(false)}
  let:clearMessages
  let:input
  let:isStreaming
  let:messages
  let:onKeyDown
  let:registerMessagesContainer
  let:renderMarkdown
  let:retryLast
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
    <div class="p-head">
      <div class="p-avatar" aria-hidden="true">Z</div>
      <div>
        <div class="name">Zelinho</div>
        <div class="status"><i class:busy={isStreaming}></i>{isStreaming ? 'Pensando…' : 'Pronto para ajudar'}</div>
      </div>
      <div class="tools">
        <button type="button" class="iconb" title="Nova conversa" aria-label="Nova conversa" on:click={() => { clearMessages(); clearPendingAction(); clearQuickReplies(); resolvedCards = []; }}><Plus size={16} aria-hidden="true" /></button>
        <button type="button" class="iconb" aria-label="Fechar Zelinho" on:click={() => void closePanel()}><X size={16} aria-hidden="true" /></button>
      </div>
    </div>

    {#if $signalContext}
      <div class="ctx" use:prefillSignalQuestion={{ question: activeSignalPresenter.perguntaSugerida, setInput }}>
        <span>Sobre o aviso</span>
        <b>{activeSignalPresenter.titulo}</b>
        <button type="button" class="iconb" aria-label="Remover contexto do aviso" on:click={clearSignalContext}><X size={14} aria-hidden="true" /></button>
      </div>
    {:else if $screenContext}
      <div class="ctx">
        <span>Sobre</span>
        <b>{$screenContext.title}</b>
        <button type="button" class="iconb" aria-label="Remover contexto da tela" on:click={clearScreenContext}><X size={14} aria-hidden="true" /></button>
      </div>
    {/if}

    <div class="thread" use:registerMessagesContainer>
      {#if messages.length === 0}
        <div class="p-msg p-assistant"><span class="who" aria-hidden="true">Z</span><div class="txt"><p>Oi! Posso te contar como foram as vendas, cadastrar categorias e produtos, alterar preços e, se você usa o ZeloMenu, pausar itens do cardápio. O que precisa?</p></div></div>
      {/if}
      {#each messages as msg, index}
        {#if msg.role === 'user'}
          <div class="p-msg p-user">{msg.content}</div>
        {:else if !msg.content && isStreaming && index === messages.length - 1}
          <div class="p-msg p-assistant"><span class="who" aria-hidden="true">Z</span><div class="thinking" role="status" aria-live="polite">{thinkingLabel}</div></div>
        {:else if msg.error}
          <div class="p-msg p-assistant error"><span class="who" aria-hidden="true"><AlertCircle size={14} /></span><div class="txt"><p>{msg.content}</p><button type="button" class="retry" on:click={retryLast}>Tentar de novo</button></div></div>
        {:else}
          <div class="p-msg p-assistant"><span class="who" aria-hidden="true">Z</span><div class="txt markdown-content">{@html renderMarkdown(msg.content)}</div></div>
        {/if}
      {/each}
      {#each resolvedCards as card (card.id)}
        <div class="proposal {card.status}">
          <div class="ph">{#if card.status === 'done'}<Check size={13} aria-hidden="true" />Feita {card.time}{:else if card.status === 'cancelled'}Cancelada{:else}Não deu certo{/if}</div>
          <div class="pb"><div class="what">{card.summary}</div>{#if card.effect}<div class="fx">{card.effect}</div>{/if}</div>
        </div>
      {/each}
      {#if $pendingAction}
        <div class="proposal" role="group" aria-label="Confirmar ação do Zelinho">
          <div class="ph"><Clock3 size={13} aria-hidden="true" />Proposta, aguardando você</div>
          <div class="pb">
            <div class="what">{$pendingAction.summary}</div>
            {#if $pendingAction.effect}<div class="fx">{$pendingAction.effect}</div>{/if}
            <div class="row">
              <button type="button" class="btn primary" disabled={actionBusy} on:click={() => resolvePendingAction('confirm')}>Confirmar</button>
              <button type="button" class="btn ghost" disabled={actionBusy} on:click={() => resolvePendingAction('cancel')}>Cancelar</button>
              <span class="exp tabular-nums">expira em {expiresIn}</span>
            </div>
          </div>
        </div>
      {/if}
      {#if $quickReplies.length && !isStreaming}
        <div class="choices">{#each $quickReplies as option}<button type="button" class:alt={option === 'Nenhum desses' || option === 'Criar categoria nova'} on:click={() => { clearQuickReplies(); void sendMessage(option); }}>{option}</button>{/each}</div>
      {/if}
    </div>

    {#if messages.length === 0}
      <div class="suggest">{#each SUGGESTIONS as s}<button type="button" on:click={() => { if (s.send) void sendMessage(s.label); else { setInput(s.label); inputElement?.focus(); } }}>{s.label}</button>{/each}</div>
    {/if}

    <div class="composer">
      <label class="sr-only" for="zelinho-message">Mensagem para o Zelinho</label>
      <div class="box">
        <textarea id="zelinho-message" rows="1" bind:this={inputElement} value={input} use:autoGrow use:applyPrefill={{ value: pendingPrefill, setInput, onApplied: () => { pendingPrefill = ''; } }} on:input={(event) => setInput(event.currentTarget.value)} on:keydown={onKeyDown} placeholder="Peça algo ao Zelinho" disabled={isStreaming} maxlength="1000"></textarea>
        <button type="button" class="send" on:click={() => void sendMessage()} disabled={isStreaming || !input.trim()} aria-label="Enviar"><ArrowUp size={15} aria-hidden="true" /></button>
      </div>
      <div class="hintline"><span>Mudanças só acontecem depois que você confirma.</span><span><kbd>Enter</kbd> envia</span></div>
    </div>
  </div>
</ChatStreamCore>

<style>
  .assistant-panel { position: fixed; top: 0; right: 0; width: 25rem; max-width: 100vw; height: 100vh; background: var(--bg-panel); border-left: 1px solid var(--border-card); z-index: 90; display: flex; flex-direction: column; transform: translateX(100%); transition: transform var(--transition-fast); }
  .assistant-panel.open { transform: translateX(0); }
  .assistant-backdrop { position: fixed; inset: 0; z-index: 89; background: color-mix(in srgb, var(--text-inverse) 62%, transparent); }
  @media (min-width: 1280px) { .assistant-backdrop { display: none; } }
  @media (max-width: 767px) { .assistant-panel { width: 100vw; height: auto; bottom: var(--mobile-bottom-nav-offset); border-left: 0; } }
  .p-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
  .p-avatar { width: 30px; height: 30px; border-radius: 8px; background: var(--primary); color: var(--primary-text); display: grid; place-items: center; font-weight: 700; font-size: 13px; }
  .name { font-weight: 600; font-size: 13px; line-height: 1.2; color: var(--text-main); }
  .status { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
  .status i { width: 6px; height: 6px; border-radius: 50%; background: var(--status-success-text); }
  .status i.busy { background: var(--primary); animation: blink 1s ease-in-out infinite; }
  .tools { margin-left: auto; display: flex; gap: 2px; }
  .iconb { width: 34px; height: 34px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
  .iconb:hover { background: var(--bg-input); color: var(--text-main); }
  .ctx { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-card); font-size: 12px; color: var(--text-muted); }
  .ctx b { color: var(--text-label); font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ctx .iconb { margin-left: auto; }
  .thread { flex: 1; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 16px; }
  .thread > * { flex-shrink: 0; }
  .p-msg { font-size: 14px; line-height: 1.55; word-break: break-word; }
  .p-user { align-self: flex-end; max-width: 88%; padding: 8px 12px; border-radius: 8px; background: var(--bg-panel); border: 1px solid var(--border-subtle); color: var(--text-main); white-space: pre-wrap; }
  .p-assistant { display: grid; grid-template-columns: 22px minmax(0, 1fr); column-gap: 10px; color: var(--text-main); }
  .who { width: 22px; height: 22px; border-radius: 6px; background: var(--primary); color: var(--primary-text); font-size: 11px; font-weight: 700; display: grid; place-items: center; margin-top: 2px; }
  .p-assistant.error .who { background: var(--status-error-bg); color: var(--status-error-text); }
  .p-assistant.error .txt { border: 1px solid var(--status-error-border); background: var(--status-error-bg); border-radius: 8px; padding: 10px 12px; }
  .retry { margin-top: 6px; min-height: 36px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); font-size: 13px; cursor: pointer; }
  .txt :global(p) { margin: 0 0 8px; } .txt :global(p:last-child) { margin: 0; }
  .txt :global(ul), .txt :global(ol) { margin: 0 0 8px; padding-left: 18px; } .txt :global(li) { margin: 2px 0; }
  .txt :global(strong) { font-weight: 600; }
  .txt :global(code) { background: var(--bg-input); padding: .1rem .3rem; border-radius: 4px; font-family: monospace; }
  .thinking { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
  .thinking::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); animation: blink 1s ease-in-out infinite; }
  @keyframes blink { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
  .proposal { border: 1px solid var(--primary); border-radius: 8px; background: var(--bg-card); overflow: hidden; }
  .proposal .ph { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: var(--accent-light); color: var(--primary); font-size: 11px; font-weight: 600; }
  .proposal.done { border-color: var(--border-subtle); } .proposal.done .ph { background: var(--status-success-bg); color: var(--status-success-text); }
  .proposal.cancelled, .proposal.failed { border-color: var(--border-subtle); opacity: .75; } .proposal.cancelled .ph, .proposal.failed .ph { background: var(--bg-input); color: var(--text-muted); }
  .pb { padding: 10px 12px 12px; display: grid; gap: 8px; }
  .what { font-size: 13px; color: var(--text-main); } .fx { font-size: 12px; color: var(--text-muted); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .exp { margin-left: auto; font-size: 11px; color: var(--text-muted); }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border-radius: 6px; border: 1px solid transparent; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn.primary { background: var(--primary); color: var(--primary-text); } .btn.primary:hover { background: var(--primary-hover); }
  .btn.ghost { background: transparent; color: var(--text-label); border-color: var(--border-subtle); } .btn.ghost:hover { color: var(--text-main); border-color: var(--border-strong); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .choices { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 32px; }
  .choices button { min-height: 32px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-main); font-size: 13px; cursor: pointer; transition: border-color 180ms cubic-bezier(.22,1,.36,1), background 180ms cubic-bezier(.22,1,.36,1); }
  .choices button:hover { border-color: var(--primary); background: var(--accent-light); }
  .choices button.alt { color: var(--text-muted); }
  .suggest { display: flex; gap: 6px; padding: 8px 14px 0; overflow-x: auto; scrollbar-width: none; }
  .suggest::-webkit-scrollbar { display: none; }
  .suggest button { flex: 0 0 auto; min-height: 32px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); font-size: 12px; cursor: pointer; }
  .suggest button:hover { border-color: var(--primary); color: var(--text-main); }
  .composer { padding: 10px 14px 14px; display: grid; gap: 6px; flex-shrink: 0; }
  .box { display: flex; align-items: flex-end; gap: 6px; padding: 6px 6px 6px 12px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-input); transition: border-color 180ms cubic-bezier(.22,1,.36,1); }
  .box:focus-within { border-color: var(--primary); }
  .box textarea { flex: 1; resize: none; border: 0; background: transparent; color: var(--text-main); font: inherit; font-size: 13px; line-height: 1.5; padding: 6px 0; max-height: 120px; outline: none; }
  .box textarea:focus, .box textarea:focus-visible { outline: none; box-shadow: none; }
  .box textarea::placeholder { color: var(--text-muted); }
  .box textarea:disabled { opacity: .6; }
  .send { width: 32px; height: 32px; border: 0; border-radius: 6px; background: var(--primary); color: var(--primary-text); display: grid; place-items: center; cursor: pointer; }
  .send:disabled { background: var(--border-subtle); color: var(--text-muted); cursor: not-allowed; }
  .hintline { font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; gap: 8px; }
  kbd { font: inherit; font-size: 11px; padding: 0 5px; border: 1px solid var(--border-subtle); border-bottom-width: 2px; border-radius: 4px; color: var(--text-muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .iconb:focus-visible, .btn:focus-visible, .choices button:focus-visible, .suggest button:focus-visible, .send:focus-visible, .retry:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent); }
  @media (prefers-reduced-motion: reduce) { .assistant-panel, .box, .choices button { transition: none; } .thinking::before, .status i.busy { animation: none; } }
</style>
