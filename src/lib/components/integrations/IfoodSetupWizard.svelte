<script>
  import { createEventDispatcher } from 'svelte';
  import { X } from 'lucide-svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import {
    IFOOD_MAPPING_SUGGESTION_COPY,
    IFOOD_NO_ACTIVE_ORDERS_WARNING,
    availableIfoodActions,
    printOwnerLabel
  } from '$lib/integrations/ifoodSetup.js';

  // Dumb presentation modal: every piece of state and every network call
  // lives in `IfoodIntegrationCard.svelte`. This component only renders
  // `derived` (the output of the pure `deriveIfoodWizardState`) and emits
  // intent events — it never simulates a completed authorization and never
  // stores a secret.
  export let open = false;
  export let derived = null;
  export let busy = false;
  export let errorMessage = '';

  const dispatch = createEventDispatcher();

  let merchantIdInput = '';

  $: actions = availableIfoodActions(derived);
  $: reasonsCopy = (derived?.reasons ?? []).map(describeReason);

  function describeReason(reason) {
    const map = {
      worker_heartbeat_missing: 'O worker que processa pedidos do iFood ainda não iniciou.',
      worker_heartbeat_stale: 'O worker que processa pedidos do iFood parou de responder.',
      token_missing: 'Ainda não há um token de acesso válido para esta loja.',
      token_stale: 'O token de acesso desta loja está vencido.',
      configuration_not_ready: 'A configuração da conexão ainda não está completa.',
      connection_pending: 'A autorização ainda não foi concluída.',
      connection_degraded: 'A conexão está com problemas — verifique o worker e o token.',
      connection_paused: 'A conexão está pausada.',
      connection_revoked: 'A conexão foi desconectada.'
    };
    return map[reason] ?? reason;
  }

  function close() {
    if (busy) return;
    dispatch('close');
  }

  function submitConnect() {
    const value = merchantIdInput.trim();
    if (!value) return;
    dispatch('connect', { merchantId: value });
  }

  function submitRestart() {
    const value = (derived?.merchantId || merchantIdInput).trim();
    if (!value) return;
    dispatch('restart', { merchantId: value });
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-80 flex items-center justify-center p-4"
    style="background: rgba(0,0,0,0.6);"
    role="dialog"
    aria-modal="true"
    aria-labelledby="ifood-wizard-title"
  >
    <div class="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col" style="background: var(--bg-card); border: 1px solid var(--border-card);">
      <div class="px-6 py-4 flex items-center justify-between shrink-0" style="border-bottom: 1px solid var(--border-subtle);">
        <h3 id="ifood-wizard-title" class="text-lg font-semibold" style="color: var(--text-main);">
          Conectar iFood
        </h3>
        <button
          type="button"
          class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-50"
          style="color: var(--text-muted); background: transparent;"
          on:click={close}
          aria-label="Fechar"
          disabled={busy}
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>

      <div class="p-6 grid gap-5 overflow-y-auto">
        {#if errorMessage}
          <div class="rounded-md px-3 py-2 text-sm" style="color: var(--error); background: color-mix(in srgb, var(--error) 10%, transparent); border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);">
            {errorMessage}
          </div>
        {/if}

        {#if derived?.state === 'not_connected'}
          <div class="grid gap-3">
            <p class="text-sm leading-relaxed" style="color: var(--text-main);">
              Ao conectar, os pedidos novos do iFood passam a chegar direto no ZeloPDV — Pedidos e Cozinha,
              com o badge <strong>iFood</strong>. Pedidos já em andamento continuam no Gestor de Pedidos do
              iFood; não há importação retroativa.
            </p>
            <p class="text-xs leading-relaxed" style="color: var(--text-muted);">
              A autorização final acontece no Portal do Parceiro do iFood — o ZeloPDV não promete ativação
              instantânea, pois essa etapa depende do iFood confirmar sua loja.
            </p>
          </div>

          <label class="block">
            <span class="block mb-1 text-sm" style="color: var(--text-label);">Merchant ID da loja no iFood</span>
            <input
              class="w-full rounded-md px-3 py-2 text-sm"
              style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
              bind:value={merchantIdInput}
              placeholder="Ex.: 5f3a2b1c-..."
              disabled={busy}
            />
          </label>

          <button
            type="button"
            class="w-full px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style="background: var(--primary); color: var(--primary-text);"
            disabled={busy || !merchantIdInput.trim()}
            on:click={submitConnect}
          >
            {#if busy}<Spinner size="sm" />{:else}Conectar{/if}
          </button>

        {:else if derived?.state === 'awaiting_authorization'}
          <div class="grid gap-3">
            <p class="text-sm leading-relaxed" style="color: var(--text-main);">
              Loja identificada: <strong>{derived.merchantId}</strong>
            </p>
            {#if derived.expired}
              <div class="rounded-md px-3 py-2 text-sm" style="color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);">
                O prazo para concluir a autorização expirou. Reinicie a conexão para gerar um novo link.
              </div>
              <button
                type="button"
                class="w-full px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style="background: var(--primary); color: var(--primary-text);"
                disabled={busy}
                on:click={submitRestart}
              >Reiniciar conexão</button>
            {:else}
              <p class="text-sm leading-relaxed" style="color: var(--text-muted);">
                Finalize a autorização no Portal do Parceiro do iFood e volte aqui para confirmar. Isso pode
                levar alguns minutos — o ZeloPDV não ativa a conexão sozinho até o iFood confirmar.
              </p>
              {#if derived.authorizationUrl}
                <a
                  href={derived.authorizationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                  style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
                >Abrir Portal do Parceiro iFood</a>
              {/if}
              <button
                type="button"
                class="w-full px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style="background: var(--primary); color: var(--primary-text);"
                disabled={busy}
                on:click={() => dispatch('checkAuthorization')}
              >
                {#if busy}<Spinner size="sm" />{:else}Já autorizei, verificar{/if}
              </button>
              <button
                type="button"
                class="text-xs font-medium text-left transition-opacity hover:opacity-80 disabled:opacity-50"
                style="color: var(--text-muted);"
                disabled={busy}
                on:click={submitRestart}
              >Errei o Merchant ID — reiniciar conexão</button>
            {/if}
          </div>

        {:else}
          <!-- configuration_needed | active | attention | paused: connected states -->
          <div class="grid gap-3">
            <p class="text-sm" style="color: var(--text-main);">
              Loja conectada: <strong>{derived?.merchantId ?? '—'}</strong>
            </p>

            {#if reasonsCopy.length}
              <ul class="grid gap-1.5 rounded-md p-3 text-sm" style="background: color-mix(in srgb, var(--warning) 8%, transparent); border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);">
                {#each reasonsCopy as reason}
                  <li style="color: var(--text-main);">• {reason}</li>
                {/each}
              </ul>
            {/if}

            {#if actions.includes('set_print_owner')}
              <div class="grid gap-2 pt-2" style="border-top: 1px solid var(--border-subtle);">
                <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted);">Quem imprime os pedidos do iFood</span>
                <div class="flex gap-2 flex-wrap">
                  {#each ['zelo', 'external'] as option}
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-md text-sm font-medium border transition-colors disabled:opacity-50"
                      style="
                        background: {derived?.printOwner === option ? 'var(--primary)' : 'var(--bg-input)'};
                        color: {derived?.printOwner === option ? 'var(--primary-text)' : 'var(--text-label)'};
                        border-color: {derived?.printOwner === option ? 'var(--primary)' : 'var(--border-subtle)'};
                      "
                      disabled={busy}
                      on:click={() => dispatch('setPrintOwner', { printOwner: option })}
                    >{printOwnerLabel(option)}</button>
                  {/each}
                </div>
                <p class="text-xs" style="color: var(--text-muted);">
                  Escolha só um responsável pela impressão. O outro sistema deixa de imprimir os pedidos do iFood.
                </p>
              </div>
            {/if}

            <div class="grid gap-2 pt-2" style="border-top: 1px solid var(--border-subtle);">
              <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted);">{IFOOD_MAPPING_SUGGESTION_COPY.title}</span>
              <p class="text-xs leading-relaxed" style="color: var(--text-muted);">{IFOOD_MAPPING_SUGGESTION_COPY.description}</p>
            </div>

            {#if actions.includes('pause') || actions.includes('resume') || actions.includes('disconnect')}
              <div class="grid gap-2 pt-2" style="border-top: 1px solid var(--border-subtle);">
                <p class="text-xs" style="color: var(--text-muted);">{IFOOD_NO_ACTIVE_ORDERS_WARNING}</p>
                <div class="flex gap-2 flex-wrap">
                  {#if actions.includes('pause')}
                    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50" style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);" disabled={busy} on:click={() => dispatch('action', { action: 'pause' })}>Pausar</button>
                  {/if}
                  {#if actions.includes('resume')}
                    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50" style="background: var(--primary); color: var(--primary-text);" disabled={busy} on:click={() => dispatch('action', { action: 'resume' })}>Retomar</button>
                  {/if}
                  {#if actions.includes('disconnect')}
                    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50" style="background: transparent; color: var(--error); border: 1px solid color-mix(in srgb, var(--error) 45%, transparent);" disabled={busy} on:click={() => dispatch('action', { action: 'disconnect' })}>Desconectar</button>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
