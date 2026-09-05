<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { getOfflineContext } from '$lib/offline/runtime';
  import { readSnapshot, saveSnapshot } from '$lib/offline/operations';
  let adjustments = [];
  let divergences = [];
  let message = '';
  let busy = false;
  let active = true;
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  async function load() {
    const current = getOfflineContext();
    if (busy || !current || current.isSubUser || current.userId !== current.ownerUserId) return;
    const valid = () => active && getOfflineContext()?.ownerUserId === current.ownerUserId && getOfflineContext()?.userId === current.userId;
    busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const cached = await readSnapshot(current.ownerUserId, 'offline:adjustments');
      if (!valid()) return;
      if (cached) { adjustments = cached.adjustments; divergences = cached.divergences; }
      if (navigator.onLine === false) { message = 'Última consulta salva. Reconecte para atualizar os registros de outros aparelhos.'; return; }
      const [cash, stock] = await Promise.all([
        supabase.from('offline_caixa_adjustments').select('id, id_caixa, snapshot, created_at').eq('owner_user_id', current.ownerUserId).order('id', { ascending: false }).limit(50).abortSignal(controller.signal),
        supabase.from('offline_stock_divergences').select('id, entity_type, entity_id, previous_quantity, resulting_quantity, created_at').eq('owner_user_id', current.ownerUserId).order('id', { ascending: false }).limit(50).abortSignal(controller.signal)
      ]);
      if (cash.error || stock.error) throw cash.error || stock.error;
      if (!valid()) return;
      adjustments = cash.data || []; divergences = stock.data || []; message = '';
      await saveSnapshot(current.ownerUserId, 'offline:adjustments', { adjustments, divergences });
    } catch { if (valid()) message = 'Não foi possível atualizar as conferências. Os últimos registros salvos continuam disponíveis.'; }
    finally { clearTimeout(timer); busy = false; }
  }
  onMount(() => { void load(); return () => { active = false; }; });
</script>

<section aria-label="Ajustes após sincronização">
  <h3>Ajustes após sincronização</h3>
  <p>Até 50 registros recentes de cada tipo. Cada ajuste mostra uma nova conferência do turno; não some os valores entre ajustes. O fechamento original permanece preservado.</p>
  <button type="button" disabled={busy} on:click={load}>{busy ? 'Consultando…' : 'Atualizar conferências'}</button>
  {#if message}<p role="status">{message}</p>{/if}
  {#if !adjustments.length && !divergences.length && !message && !busy}<p>Nenhum ajuste encontrado.</p>{/if}
  <ul>
    {#each adjustments as row (row.id)}<li><strong>Caixa {row.id_caixa}</strong><span>{new Date(row.created_at).toLocaleString('pt-BR')} · Esperado após sincronizar: {money(row.snapshot.valor_esperado_em_gaveta)} · Diferença: {money(row.snapshot.diferenca)}</span></li>{/each}
    {#each divergences as row (row.id)}<li><strong>Estoque a conferir · {row.entity_type} {row.entity_id}</strong><span>Saldo de {row.previous_quantity} para {row.resulting_quantity}. A venda recebida foi preservada.</span></li>{/each}
  </ul>
</section>

<style>
  section { padding: 1.1rem 0; border-bottom: 1px solid var(--border-subtle); }
  h3 { font-size: 1rem; font-weight: 600; }
  p, li { font-size: 0.875rem; line-height: 1.5; margin-top: 0.45rem; }
  p, span { color: var(--text-muted); }
  button { border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.5rem 0.7rem; min-height: 2.5rem; font-size: 0.875rem; margin-top: 0.75rem; }
  button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  ul { list-style: none; padding: 0; } li { display: grid; gap: 0.3rem; padding: 0.65rem 0; overflow-wrap: anywhere; }
</style>
