<script>
  import OfflineAdjustments from './OfflineAdjustments.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { X, CloudUpload, Download, Upload } from 'lucide-svelte';
  import { getOfflineContext, onOfflineChange, prepareOfflineDevice, runOfflineSync, refreshOfflineCounts, offlineRequest } from '$lib/offline/runtime';
  import { listOperations } from '$lib/offline/operations';
  import { reconcileOperation, retryPendingOperations } from '$lib/offline/reconciliation';
  import { exportRecovery, importRecovery } from '$lib/offline/recovery';
  import { offlineStatus } from '$lib/stores/offlineStatus';
  const dispatch = createEventDispatcher();
  let dialog;
  let context = null;
  let rows = [];
  let busy = false;
  let error = '';
  let message = '';
  let password = '';
  let fileInput;
  let selected = null;
  let note = '';
  let confirmation = null;
  function confirmAction(title, text) {
    return new Promise(resolve => { confirmation = { title, text, resolve }; });
  }
  function confirmChoice(value) { const answer = confirmation; confirmation = null; answer?.resolve(value); }
  const statuses = { pending: 'Aguardando conexão', inflight: 'Enviando', needs_auth: 'Entre novamente para sincronizar', needs_review: 'Precisa de conferência', acked: 'Sincronizado' };
  const types = { 'order.create': 'Pedido manual', 'sale.create': 'Venda', 'caixa.open': 'Abertura de caixa', 'caixa.move': 'Movimentação de caixa', 'caixa.close': 'Fechamento de caixa', 'mesa.open': 'Abertura de comanda', 'mesa.item.add': 'Item de comanda', 'mesa.item.delta': 'Alteração de item', 'mesa.close': 'Fechamento de comanda', 'mesa.payment.add': 'Pagamento de comanda', 'mesa.payment.remove': 'Remoção de pagamento', 'mesa.cancel': 'Cancelamento de comanda', 'mesa.transfer': 'Transferência de comanda', 'mesa.update': 'Alteração de comanda' };
  $: owner = !!context && !context.isSubUser && context.userId === context.ownerUserId;
  async function refresh() {
    const captured = getOfflineContext();
    const operations = captured ? await listOperations(captured.ownerUserId) : [];
    if (captured !== getOfflineContext()) return;
    context = captured;
    rows = operations.filter(row => row.status !== 'acked');
  }
  async function act(action) {
    if (busy) return;
    busy = true; error = ''; message = '';
    try { await action(); await refresh(); }
    catch (cause) { error = cause?.message || 'Não foi possível concluir. Seus registros foram preservados.'; }
    finally { busy = false; }
  }
  async function prepare(primary = false) {
    if (primary && !await confirmAction('Usar este aparelho como principal?', 'A abertura, as movimentações e o fechamento do caixa ficarão sob responsabilidade deste aparelho. Confirme apenas depois de encerrar e sincronizar o uso do aparelho anterior.')) return;
    await act(async () => {
      await prepareOfflineDevice({ primary });
      message = primary ? 'Aparelho principal definido.' : 'Dados da operação preparados. Confira o indicador de salvamento antes de desconectar.';
    });
  }
  function requireOwner() {
    const current = getOfflineContext();
    if (!current || current.isSubUser || current.userId !== current.ownerUserId) throw new Error('Somente o titular pode executar esta ação.');
    return current;
  }
  async function exportFile() {
    await act(async () => {
      const current = requireOwner();
      const archive = await exportRecovery(current.ownerUserId, password);
      if (getOfflineContext() !== current) throw new Error('A conta mudou. Abra a central novamente.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `zelo-recuperacao-${new Date().toISOString().slice(0,10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      password = ''; message = 'Arquivo de recuperação criado. Guarde a senha separadamente.';
    });
  }
  async function importFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    await act(async () => {
      const current = requireOwner();
      if (file.size > 50 * 1024 * 1024) throw new Error('Arquivo maior que 50 MB. Entre em contato com o suporte.');
      const archive = JSON.parse(await file.text());
      if (getOfflineContext() !== current) throw new Error('A conta mudou. Abra a central novamente.');
      const result = await importRecovery(current.ownerUserId, password, archive);
      password = ''; message = `${result.imported} lançamento(s) recuperados para sincronização.`;
      await refreshOfflineCounts();
    });
    if (fileInput) fileInput.value = '';
  }
  async function reconcile(action) {
    if (!selected || note.trim().length < 5) return;
    if (action === 'record_duplicate' && !await confirmAction('Confirmar registro repetido?', 'Use somente se este lançamento registra novamente uma operação já contabilizada. Um segundo pagamento realmente recebido precisa de tratamento financeiro; não marque como repetido. A justificativa ficará registrada.')) return;
    if (action === 'record_refund' && !await confirmAction('Registrar devolução já realizada?', 'Confirme somente depois de devolver o valor ao cliente. Esta ação registra a devolução no histórico; não envia dinheiro ao banco ou à operadora.')) return;
    if (action === 'record_additional_sale' && !await confirmAction('Registrar consumo adicional?', 'Confirme que este recebimento corresponde a um consumo adicional, que ainda não foi contabilizado como venda. O valor recebido será registrado como receita adicional.')) return;
    await act(async () => {
      const current = requireOwner();
      const operationId = selected.operationId;
      await reconcileOperation({ ownerUserId: current.ownerUserId, userId: current.userId, operationId, action, note, request: offlineRequest });
      selected = null; note = ''; message = 'Conferência registrada.';
      await refreshOfflineCounts();
    });
  }
  const amount = (row) => {
    const value = row.payload?.valor_total ?? row.payload?.valor ?? row.payload?.total;
    return Number.isFinite(Number(value)) && value != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value)) : '';
  };
  onMount(() => {
    dialog.showModal();
    void refresh().catch(() => error = 'Não foi possível ler os lançamentos deste aparelho.');
    return onOfflineChange(() => void refresh().catch(() => {}));
  });
</script>

<dialog bind:this={dialog} on:close={() => dispatch('close')} aria-labelledby="offline-center-title">
  <header><div><h2 id="offline-center-title">Operação offline</h2><p>Preparação, salvamento e sincronização deste aparelho</p></div><button type="button" class="icon" aria-label="Fechar central" on:click={() => dialog.close()}><X size={20} /></button></header>
  <div class="content">
    {#if confirmation}
      <section aria-label="Confirmar decisão"><h3>{confirmation.title}</h3><p>{confirmation.text}</p><div class="actions"><button type="button" on:click={() => confirmChoice(true)}>Confirmar</button><button type="button" on:click={() => confirmChoice(false)}>Cancelar</button></div></section>
    {:else}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if message}<p role="status">{message}</p>{/if}
    <section aria-label="Preparação do aparelho">
      <h3>{context?.registered ? 'Aparelho registrado' : 'Preparar este aparelho'}</h3>
      <p>{context?.isPrimaryDevice ? 'Este é o aparelho principal do caixa.' : 'Este aparelho pode guardar seus próprios lançamentos após a preparação.'}</p>
      <p>Preparar baixa o catálogo, os clientes autorizados e os dados do caixa e das mesas. Aguarde a conclusão com internet. Na primeira preparação, reabra o sistema com conexão para ativar a abertura offline.</p>
      {#if $offlineStatus.prepared}<p>Dados e abertura offline verificados neste aparelho.</p>{:else if context?.registered}<p>Preparação ainda não confirmada. Mantenha a conexão e conclua a preparação antes de operar offline.</p>{/if}
      {#if context?.enabled === false}<p>A liberação do modo offline para esta loja ainda está pendente.</p>{/if}
      <div class="actions">
        <button type="button" disabled={busy || !context || $offlineStatus.connection === 'offline'} on:click={() => prepare(false)}>Preparar este aparelho</button>
        {#if owner && !context?.isPrimaryDevice}<button type="button" disabled={busy || $offlineStatus.connection === 'offline'} on:click={() => prepare(true)}>Definir como principal</button>{/if}
      </div>
      {#if context?.storage?.writable}<p>Gravação local verificada. {context.storage.persistent ? 'Armazenamento persistente concedido pelo navegador.' : 'O navegador não concedeu armazenamento persistente.'}</p>{/if}
    </section>
    <section aria-label="Lançamentos pendentes">
      <div class="section-title"><h3>{rows.length} lançamento(s) pendentes</h3><button type="button" disabled={busy || $offlineStatus.syncing || $offlineStatus.connection === 'offline'} on:click={() => act(async () => { await retryPendingOperations(context.ownerUserId); await runOfflineSync(); })}><CloudUpload size={16} /> Sincronizar</button></div>
      {#if !rows.length}<p>Nenhum lançamento pendente nesta fila. Operações de outros aparelhos aparecem quando eles sincronizam.</p>{/if}
      <ul>{#each rows as row (row.operationId)}<li>
        <strong>{types[row.type] || 'Lançamento'} {amount(row)}</strong>
        <span>{statuses[row.status] || 'Aguardando conferência'} · {new Date(row.occurredAt).toLocaleString('pt-BR')}</span>
        <small>Referência {row.operationId} · aparelho {row.deviceId.slice(0,8)}</small>
        {#if row.lastError?.message}<p>{row.lastError.message}</p>{/if}
        {#if row.status === 'needs_auth'}<a href="/login">Entrar para sincronizar</a>{/if}
        {#if owner && row.status === 'needs_review'}<button type="button" disabled={busy} on:click={() => { selected = row; note = ''; }}>Conferir lançamento</button>{/if}
      </li>{/each}</ul>
      {#if selected}<div class="review"><h3>Conferir {selected.operationId}</h3><label for="offline-note">Justificativa</label><textarea id="offline-note" bind:value={note} minlength="5" maxlength="2000" rows="3"></textarea><div class="actions"><button disabled={busy || note.trim().length < 5} on:click={() => reconcile('retry')}>Tentar aplicar após correção</button><button disabled={busy || note.trim().length < 5} on:click={() => reconcile('record_duplicate')}>É um registro repetido</button>{#if ['sale.create', 'mesa.close', 'mesa.payment.add'].includes(selected.type)}<button disabled={busy || note.trim().length < 5} on:click={() => reconcile('record_additional_sale')}>Registrar consumo adicional</button><button disabled={busy || note.trim().length < 5} on:click={() => reconcile('record_refund')}>Registrar devolução já realizada</button>{/if}<button disabled={busy} on:click={() => selected = null}>Cancelar</button></div></div>{/if}
    </section>
    {#if owner}<OfflineAdjustments /><section aria-label="Recuperação de lançamentos"><h3>Arquivo de recuperação</h3><p>Proteja os lançamentos pendentes com uma senha de pelo menos 12 caracteres. A recuperação só pode ser feita na mesma loja e mantém a identificação original para evitar repetição.</p><label for="offline-password">Senha do arquivo</label><input id="offline-password" type="password" autocomplete="new-password" minlength="12" bind:value={password} /><div class="actions"><button disabled={busy || password.length < 12} on:click={exportFile}><Download size={16} /> Exportar</button><button disabled={busy || password.length < 12} on:click={() => fileInput.click()}><Upload size={16} /> Importar</button><input hidden bind:this={fileInput} type="file" accept="application/json,.json" on:change={importFile} /></div></section>{/if}
    <p>Até sincronizar, não limpe os dados do site nem remova o aplicativo. Fechar normalmente não apaga gravações confirmadas; a sincronização retoma ao abrir com conexão. Limpeza de dados e defeitos físicos podem apagar o armazenamento local.</p>
    {/if}
  </div>
</dialog>

<style>
 dialog { width: min(42rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; padding: 0; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--bg-panel); color: var(--text-main); }
 dialog::backdrop { background: color-mix(in srgb, var(--bg-app) 75%, transparent); }
 header { display: flex; justify-content: space-between; align-items: start; padding: 1.25rem; border-bottom: 1px solid var(--border-subtle); }
 h2 { font-size: 1.1rem; font-weight: 700; } h3 { font-weight: 650; font-size: 0.95rem; } p, label, li { font-size: 0.85rem; line-height: 1.5; } p { color: var(--text-muted); margin-top: 0.45rem; }
 .content { padding: 0 1.25rem 1.25rem; } section { padding: 1.1rem 0; border-bottom: 1px solid var(--border-subtle); }
 button, a { display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid var(--border-subtle); border-radius: 7px; padding: 0.5rem 0.7rem; font-size: 0.8rem; min-height: 2.5rem; } button:hover, a:hover { background: var(--bg-card); } button:disabled { opacity: 0.5; } .icon { border: 0; } .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; } .section-title { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
 input:not([hidden]), textarea { display: block; width: 100%; border: 1px solid var(--border-subtle); background: var(--bg-input); border-radius: 6px; padding: 0.6rem; margin-top: 0.3rem; } label { display: block; margin-top: 0.75rem; } ul { list-style: none; padding: 0; } li { display: grid; gap: 0.3rem; padding: 0.9rem 0; border-bottom: 1px solid var(--border-subtle); } small { overflow-wrap: anywhere; color: var(--text-muted); } .error { color: var(--error); } .review { padding: 0.85rem; background: var(--bg-card); margin-top: 0.75rem; } button:focus-visible, a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
</style>
