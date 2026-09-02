<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  export let messagesStore;
  export let endpoint = '/api/chat/support';
  export let active = true;
  export let messageLimit = 12;
  export let maxLength = 500;
  export let placeholder = 'Digite sua dúvida...';
  export let prepareRequest = async () => ({});
  export let requestErrorMessage = 'Erro ao conectar. Tente novamente.';
  export let connectionErrorMessage = 'Erro de conexão. Tente novamente.';

  const dispatch = createEventDispatcher();

  let input = '';
  let isStreaming = false;
  let messagesEl;
  let abortController = null;

  // If the caller resets the conversation (switching signal/screen context)
  // while a response is still streaming in, that stream is now stale — abort
  // it instead of leaving isStreaming stuck true, which would silently
  // ignore the next send until the abandoned request finishes on its own.
  $: if ($messagesStore.length === 0 && isStreaming) {
    abortController?.abort();
  }

  marked.use({
    renderer: {
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
    }
  });

  function scrollToBottom() {
    if (!messagesEl) return;

    setTimeout(() => {
      if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }, 10);
  }

  function registerMessagesContainer(node) {
    messagesEl = node;
    scrollToBottom();

    return {
      destroy() {
        if (messagesEl === node) {
          messagesEl = null;
        }
      }
    };
  }

  function setInput(value) {
    input = value;
  }

  function clearMessages() {
    messagesStore.set([]);
  }

  function renderMarkdown(content) {
    return DOMPurify.sanitize(marked.parse(content || ''));
  }

  function getRequestMessages(allMessages) {
    return allMessages
      .filter((message) => message?.role === 'user' || message?.content)
      .slice(-messageLimit);
  }

  function updateLastAssistantMessage(content) {
    messagesStore.update((items) => {
      if (!items.length) return items;

      const nextItems = [...items];
      nextItems[nextItems.length - 1] = { role: 'assistant', content };
      return nextItems;
    });
  }

  function appendToLastAssistantMessage(chunk) {
    messagesStore.update((items) => {
      if (!items.length) return items;

      const nextItems = [...items];
      const lastMessage = nextItems[nextItems.length - 1];

      nextItems[nextItems.length - 1] = {
        ...lastMessage,
        role: 'assistant',
        content: `${lastMessage?.content || ''}${chunk}`
      };

      return nextItems;
    });
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || isStreaming) return;

    const requestConfig = await prepareRequest({ content, messages: $messagesStore });
    if (requestConfig?.error) {
      messagesStore.update((items) => [
        ...items,
        { role: 'assistant', content: requestConfig.error }
      ]);
      scrollToBottom();
      return;
    }

    input = '';
    messagesStore.update((items) => [
      ...items,
      { role: 'user', content },
      { role: 'assistant', content: '' }
    ]);

    isStreaming = true;
    scrollToBottom();
    await tick();

    const currentMessages = $messagesStore;
    dispatch('send', { content, messages: currentMessages });

    abortController = new AbortController();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(requestConfig?.headers || {})
        },
        body: JSON.stringify({
          messages: getRequestMessages(currentMessages),
          ...(requestConfig?.body || {})
        }),
        signal: abortController.signal
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        updateLastAssistantMessage(err.error || requestConfig?.errorMessage || requestErrorMessage);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let shouldStop = false;

      while (!shouldStop) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            shouldStop = true;
            break;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              updateLastAssistantMessage(parsed.error);
              shouldStop = true;
              break;
            }

            if (parsed.type === 'whatsapp_sent') {
              appendToLastAssistantMessage(
                parsed.success
                  ? '\n\n✅ Resumo enviado no WhatsApp!'
                  : '\n\n❌ Não foi possível enviar o WhatsApp.'
              );
              shouldStop = true;
              break;
            }

            if (parsed.type) {
              dispatch('event', parsed);
              continue;
            }

            if (parsed.content) {
              appendToLastAssistantMessage(parsed.content);
              scrollToBottom();
            }
          } catch {
            // Ignore partial SSE chunks until the next loop completes the JSON.
          }
        }
      }
    } catch (err) {
      // Aborted because the conversation was reset out from under this
      // request (see the reactive abort above) — the array it would touch
      // now belongs to a different conversation, so stay quiet instead of
      // showing a connection error on it.
      if (err?.name !== 'AbortError') updateLastAssistantMessage(connectionErrorMessage);
    } finally {
      abortController = null;
      isStreaming = false;
      scrollToBottom();
      dispatch('streamComplete', {
        messages: $messagesStore,
        content: $messagesStore[$messagesStore.length - 1]?.content || ''
      });
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  $: if (active) {
    scrollToBottom();
  }
</script>

<slot
  {clearMessages}
  {input}
  {isStreaming}
  {maxLength}
  messages={$messagesStore}
  {onKeyDown}
  {placeholder}
  {registerMessagesContainer}
  {renderMarkdown}
  {sendMessage}
  {setInput}
></slot>
