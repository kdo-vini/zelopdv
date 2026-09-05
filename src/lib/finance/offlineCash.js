import { readSnapshot, saveSnapshot, listOperations } from '../offline/operations.js';
import { db } from '../offlineDb.js';
import { projectCashSnapshot } from './offlineProjection.js';

const empty = provisional => ({ caixa: null, vendas: [], pagamentos: [], taxas: [], movs: [], provisional });
export async function loadCashSnapshot(supabase, owner, { refresh = false, timeoutMs = 3000 } = {}) {
  let caixa = await readSnapshot(owner, 'caixa.aberto');
  const originalCash = JSON.stringify(caixa);
  let operations = await listOperations(owner);
  const unresolvedTurn = operations.some(op => ['caixa.open', 'caixa.close'].includes(op.type) && op.status !== 'acked');
  const opened = operations.find(op => op.type === 'caixa.open' && op.entityId === String(caixa?.id) && op.status === 'acked');
  const remoteId = opened?.result?.id || opened?.acknowledgement?.result?.id;
  const originalId = caixa?.id;
  if (remoteId) caixa = { ...caixa, id: remoteId };
  const fallbackCash = caixa;
  let snapshot = caixa ? await readSnapshot(owner, `caixa:${caixa.id}`) || await readSnapshot(owner, `caixa:${originalId}`) : null;
  const offline = globalThis.navigator?.onLine === false;
  if (caixa?.data_fechamento && (unresolvedTurn || offline)) return empty(true);
  if (offline && caixa) return projectCashSnapshot({ ...(snapshot || { vendas: [], pagamentos: [], taxas: [], movs: [] }), caixa, provisional: true }, operations);
  if (snapshot && !refresh && Date.now() - (snapshot.fetchedAt || 0) < 15000 && !caixa?.data_fechamento) return projectCashSnapshot({ ...snapshot, caixa }, operations);

  const controller = new AbortController();
  let timer;
  async function query(builder) {
    const response = await (builder.abortSignal ? builder.abortSignal(controller.signal) : builder);
    if (response.error) throw response.error;
    return response.data || [];
  }
  async function pages(table, select, filter, ownerField = 'id_usuario', order = 'id') {
    const rows = [];
    for (let start = 0; ; start += 500) {
      let builder = filter(supabase.from(table).select(select).eq(ownerField, owner)).order(order);
      if (table === 'offline_pending_receipts') builder = builder.order('line_number');
      const data = await query(builder.range(start, start + 499));
      rows.push(...data); if (data.length < 500) return rows;
    }
  }
  const fetchSnapshot = async () => {
    if (!unresolvedTurn) {
      const openRows = await query(supabase.from('caixas').select('id, data_abertura, valor_inicial, data_fechamento').eq('id_usuario', owner).is('data_fechamento', null).order('data_abertura', { ascending: false }).limit(1));
      caixa = openRows[0] || null;
    }
    if (!caixa || caixa.data_fechamento) return empty(unresolvedTurn);
    if (!Number.isSafeInteger(Number(caixa.id))) return { ...(snapshot || { vendas: [], pagamentos: [], taxas: [], movs: [] }), caixa, provisional: true };
    const [vendas, movs, mesaPagamentos, pendingReceipts] = await Promise.all([
      pages('vendas', 'id, client_sale_id, numero_venda, valor_total, forma_pagamento, valor_recebido, valor_troco, valor_desconto, id_cliente, pessoas!vendas_id_cliente_fkey(nome)', q => q.eq('id_caixa', caixa.id)),
      pages('caixa_movimentacoes', 'id, tipo, valor, client_operation_id', q => q.eq('id_caixa', caixa.id)),
      pages('comanda_pagamentos', 'id, id_comanda, id_caixa, forma_pagamento, valor, id_pessoa, id_venda', q => q.eq('id_caixa', caixa.id).is('id_venda', null)),
      pages('offline_pending_receipts', 'operation_id, line_number, id_caixa, forma_pagamento, valor, state', q => q.eq('id_caixa', caixa.id).in('state', ['pending', 'refunded']), 'owner_user_id', 'operation_id'),
    ]);
    const pagamentos = await pages('vendas_pagamentos', 'id, id_venda, id_caixa, forma_pagamento, valor, id_comanda_pagamento', q => q.eq('id_caixa', caixa.id));
    const taxas = [];
    for (let i = 0; i < vendas.length; i += 100) {
      const ids = vendas.slice(i, i + 100).map(v => v.id);
      pagamentos.push(...await pages('vendas_pagamentos', 'id, id_venda, id_caixa, forma_pagamento, valor, id_comanda_pagamento', q => q.in('id_venda', ids).is('id_caixa', null)));
      taxas.push(...await pages('vendas_taxas_plataforma', 'id, id_venda, plataforma_id, plataforma_nome, taxa_pct, valor_bruto, valor_taxa', q => q.in('id_venda', ids)));
    }
    return { caixa, vendas, pagamentos, taxas, movs, mesaPagamentos, pendingReceipts, fetchedAt: Date.now(), provisional: unresolvedTurn };
  };
  try {
    const requestTimeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1000, Math.min(Number(timeoutMs), 30000)) : 3000;
    const fetched = await Promise.race([fetchSnapshot(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Conexão instável.')); }, requestTimeout); })]);
    const published = await db.transaction('rw', db.offline_snapshots, async () => {
      // Never replace a newly opened/closed local turn with an earlier network response.
      if (JSON.stringify(await readSnapshot(owner, 'caixa.aberto')) !== originalCash) return false;
      await saveSnapshot(owner, 'caixa.aberto', fetched.caixa);
      if (fetched.caixa) await saveSnapshot(owner, `caixa:${fetched.caixa.id}`, fetched);
      return true;
    });
    operations = await listOperations(owner);
    if (!published) {
      const current = await readSnapshot(owner, 'caixa.aberto');
      if (!current || current.data_fechamento) return empty(true);
      const currentSnapshot = await readSnapshot(owner, `caixa:${current.id}`);
      return projectCashSnapshot({ ...(currentSnapshot || { vendas: [], pagamentos: [], taxas: [], movs: [] }), caixa: current, provisional: true }, operations);
    }
    return fetched.caixa ? projectCashSnapshot(fetched, operations) : fetched;
  } catch (error) {
    if (['42501', 'PGRST301'].includes(error.code)) throw error;
    if (fallbackCash && !fallbackCash.data_fechamento) return projectCashSnapshot({ ...(snapshot || { vendas: [], pagamentos: [], taxas: [], movs: [] }), caixa: fallbackCash, provisional: true }, operations);
    if (snapshot) return empty(true);
    throw error;
  } finally { clearTimeout(timer); }
}
