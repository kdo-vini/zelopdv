import { pdvCache } from '../stores/pdvCache.js';
import { atualizarCatalogoOffline, atualizarCacheCategorias, atualizarCacheSubcategorias } from '../offlineDb.js';
import { listOperations, saveSnapshot } from './operations.js';
import { loadMesaState } from './mesas.js';
import { loadCashSnapshot } from '../finance/offlineCash.js';
import { refreshOrderSnapshot } from './orders.js';

/** Preparation downloads complete, owner-scoped operational data, never authenticated HTTP pages. */
export async function prepareOperationalData(supabase, context, assertCurrent) {
  const owner = context.ownerUserId;
  const allowed = capability => !context.isSubUser || !!context.permissions?.[capability];
  const before = await listOperations(owner);
  assertCurrent();
  pdvCache.setUserId(owner);
  const [products, categories, subcategories] = await Promise.all([
    pdvCache.getProdutos(true), pdvCache.getCategorias(true), pdvCache.getSubcategorias(true)
  ]);
  assertCurrent();
  const stored = await atualizarCatalogoOffline(products, owner, before.filter(row => row.status === 'acked').map(row => row.operationId), before.map(row => row.operationId));
  if (stored === false) throw new Error('Sincronize os lançamentos pendentes antes de atualizar a preparação. Seus dados continuam salvos.');
  await Promise.all([atualizarCacheCategorias(categories, owner), atualizarCacheSubcategorias(subcategories, owner)]);
  const { data: company, error } = await supabase.from('empresa_perfil').select('id, nome_exibicao, documento, endereco, contato, logo_url, rodape_recibo, largura_bobina, tabelas_preco_ativo, tabela_preco_1_nome, tabela_preco_2_nome, tabela_preco_3_nome, plataformas_pagamento').eq('user_id', owner).maybeSingle();
  if (error) throw error;
  assertCurrent();
  await saveSnapshot(owner, 'empresa.perfil', company || {});
  if (allowed('pdv.receber') || allowed('pedidos.receber')) {
    const people = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from('pessoas').select('id, nome, saldo_fiado').eq('id_usuario', owner).order('id').range(from, from + 499);
      if (error) throw error;
      assertCurrent();
      people.push(...data);
      if (data.length < 500) break;
    }
    await saveSnapshot(owner, 'pessoas.fiado', people);
  }
  const cash = await loadCashSnapshot(supabase, owner, { refresh: true });
  assertCurrent();
  if (cash.provisional) throw new Error('Não foi possível atualizar o turno. Reconecte e prepare novamente antes de depender do modo offline.');
  if (allowed('mesas.acessar')) await loadMesaState(supabase, owner);
  if (allowed('pedidos.acessar')) await refreshOrderSnapshot(supabase, owner, company?.id);
  assertCurrent();
  const readiness = { catalog: true, cash: true, mesas: allowed('mesas.acessar'), completedAt: Date.now() };
  await saveSnapshot(owner, `readiness:${context.userId}`, readiness);
  return readiness;
}
