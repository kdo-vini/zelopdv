<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { waitAuthReady } from '$lib/authStore';
  import BarChart from '$lib/components/charts/BarChart.svelte'; // [NEW]
  import OnboardingChecklist from '$lib/components/OnboardingChecklist.svelte';
  import { revertFiadoDebtForVenda } from '$lib/finance/saleOps';
  import { addToast } from '$lib/stores/ui';

  export let params;

  let loading = true;
  let errorMsg = '';
  let vendasItens = [];
  let vendaParaDeletarId = null;
  // [NEW] Added 'vendasPorHora' to dash state
  let dash = {
    vendas:{ totalHoje:0, countHoje:0, ticketMedioHoje:null, ticketMedioOntem:null, ticketMedioVarPct:null },
    estoque:{ criticos:0, rupturas:0, saudePct:null },
    caixa:{ aberto:false, desde:null, horasAberto:null, ultimoFechamento:null },
    atividade:[], alertas:[], insight:'',
    vendasPorHora: [] 
  };

  async function loadDash(){
    loading = true; errorMsg='';
    try{
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if(!uid){ window.location.href = '/login'; return; }
      
      // Busca caixa aberto mais recente
      const { data: cx } = await supabase
        .from('caixas')
        .select('id, data_abertura, data_fechamento')
        .eq('id_usuario', uid)
        .order('data_abertura', { ascending:false })
        .limit(1);
      const caixaAtual = (cx&&cx[0])||null;
      
      let vendasCaixa = [];
      let movimentacoes = [];
      
      if(caixaAtual){
        // Busca TODAS as vendas do caixa atual
        const { data: vs } = await supabase
          .from('vendas')
          .select('id, numero_venda, valor_total, forma_pagamento, created_at')
          .eq('id_caixa', caixaAtual.id)
          .order('created_at', { ascending: false });
        vendasCaixa = vs||[];

        // Busca itens das vendas para hover
        const vendaIds = (vs||[]).map(v => v.id);
        if (vendaIds.length) {
          const { data: itens } = await supabase
            .from('vendas_itens')
            .select('id_venda, quantidade, nome_produto_na_venda')
            .in('id_venda', vendaIds);
          vendasItens = itens || [];
        } else {
          vendasItens = [];
        }

        // Busca movimentações
        const { data: movs } = await supabase
          .from('caixa_movimentacoes')
          .select('id, tipo, valor, motivo, created_at')
          .eq('id_caixa', caixaAtual.id)
          .order('created_at', { ascending: false });
        movimentacoes = movs||[];
      }
      
      // Fiado é dívida (a receber), não receita realizada — exclui do total do caixa.
      // Para vendas múltiplas com parcela fiado, descontamos apenas a parcela fiado via vendas_pagamentos.
      const vendaIdsCaixa = (vendasCaixa||[]).map(v=>v.id);
      let pagFiadoMulti = 0;
      if (vendaIdsCaixa.length) {
        const { data: pagsMulti } = await supabase
          .from('vendas_pagamentos')
          .select('id_venda, forma_pagamento, valor')
          .in('id_venda', vendaIdsCaixa)
          .eq('forma_pagamento', 'fiado');
        pagFiadoMulti = (pagsMulti||[]).reduce((a,p)=> a + Number(p.valor||0), 0);
      }
      const totalCaixa = (vendasCaixa||[]).reduce((a,v)=> {
        // Venda fiado pura: ignora valor inteiro.
        if (v.forma_pagamento === 'fiado') return a;
        return a + Number(v.valor_total||0);
      }, 0) - pagFiadoMulti;
      const countCaixa = (vendasCaixa||[]).length;
      const ticketMedioCaixa = countCaixa ? totalCaixa/countCaixa : null;
      
      // [NEW] Process hourly sales for the chart
      const vendasPorHoraMap = new Array(24).fill(0);
      let temVendas = false;
      
      // Filter sales from 'today' based on local time logic or just strictly follow current open box context
      // Since we want "Vendas Hoje" (or current box session), we stick to sales in `vendasCaixa`
      for(const v of vendasCaixa){
        // Vendas fiado puras não contam como receita realizada do horário.
        if (v.forma_pagamento === 'fiado') continue;
        const d = new Date(v.created_at);
        const h = d.getHours();
        if(h >= 0 && h < 24) {
             vendasPorHoraMap[h] += Number(v.valor_total||0);
             temVendas = true;
        }
      }

      // Convert to chart format (label: '14h', value: 150.00)
      // Optimization: Only show range from first sale hour to current hour? Or fixed range?
      // Let's show full 24h or maybe just active hours. For simplicity: 08h to 22h usually, but dynamic is better.
      // Let's filter out hours with 0 sales at start/end to clean up chart? 
      // Actually, BarChart handles it. Let's just pass non-zero or a range.
      let vendasPorHora = [];
      if(temVendas){
          // Find first and last hour with sales
          let firstH = vendasPorHoraMap.findIndex(v => v > 0);
          let lastH = 0;
          for(let i=23; i>=0; i--) { if(vendasPorHoraMap[i]>0){ lastH=i; break; } }
          
          // Pad 1 hour before and after if possible
          const start = Math.max(0, firstH - 1);
          const end = Math.min(23, lastH + 1);

          for(let i=start; i<=end; i++){
              vendasPorHora.push({ label: `${i}h`, value: vendasPorHoraMap[i] });
          }
      }

      // Combina vendas e movimentações para atividade recente
      const atividadeVendas = (vendasCaixa||[]).map(v=>({ tipo:'venda', id:v.id, numero_venda:v.numero_venda, valor:v.valor_total, ts:v.created_at }));
      const atividadeMovs = (movimentacoes||[]).map(m=>({ tipo:m.tipo, id:m.id, valor:m.valor, ts:m.created_at, motivo:m.motivo }));
      const atividadeCombinada = [...atividadeVendas, ...atividadeMovs]
        .sort((a,b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, 10);
      
      // Calcula alertas
      const alertas = [];
      if(caixaAtual && !caixaAtual.data_fechamento){
        const horasAberto = Math.round((Date.now()-new Date(caixaAtual.data_abertura).getTime())/36e5);
        if(horasAberto >= 10){
          alertas.push({ mensagem: 'Caixa aberto há mais de 10h. Considere fechar.' });
        }
      }
      
      dash = {
        vendas: { totalHoje: totalCaixa, countHoje: countCaixa, ticketMedioHoje: ticketMedioCaixa, ticketMedioOntem:null, ticketMedioVarPct:null },
        estoque: { criticos:0, rupturas:0, saudePct:null },
        caixa: { 
          aberto: !!(caixaAtual && !caixaAtual.data_fechamento), 
          desde: caixaAtual?.data_abertura||null, 
          horasAberto: caixaAtual ? Math.max(0, Math.round((Date.now()-new Date(caixaAtual.data_abertura).getTime())/36e5)) : null, 
          ultimoFechamento: null 
        },
        atividade: atividadeCombinada,
        alertas: alertas,
        insight: countCaixa > 0 ? `${countCaixa} vendas registradas neste caixa.` : 'Nenhuma venda registrada ainda.',
        vendasPorHora
      };
    }catch(e){
      console.error('[Dashboard] Erro ao carregar:', e);
      errorMsg = e?.message || 'Erro ao carregar dashboard.';
    }
    loading=false;
  }

  onMount(async () => { await waitAuthReady(); await loadDash(); });

  const fmt = (v)=> `R$ ${Number(v||0).toFixed(2)}`;

  function solicitarDelecaoVenda(id) { vendaParaDeletarId = id; }
  function cancelarDelecaoVenda() { vendaParaDeletarId = null; }

  async function confirmarDelecaoVenda() {
    if (!vendaParaDeletarId) return;
    const id = vendaParaDeletarId;
    vendaParaDeletarId = null;
    // Estorna fiado antes da exclusão para manter o fichário consistente.
    try {
      await revertFiadoDebtForVenda(supabase, id);
    } catch (e) {
      addToast('Não foi possível estornar a dívida no fichário: ' + (e?.message || e), 'error');
      return;
    }
    // Desvincula pedidos que referenciam esta venda antes de deletar
    await supabase.from('pedidos').update({ id_venda: null }).eq('id_venda', id);
    const { error } = await supabase.from('vendas').delete().eq('id', id);
    if (error) {
      addToast('Erro ao excluir: ' + error.message, 'error');
    } else {
      vendasItens = vendasItens.filter(i => i.id_venda !== id);
      dash = { ...dash, atividade: dash.atividade.filter(ev => !(ev.tipo === 'venda' && ev.id === id)) };
    }
  }
</script>

<section class="wrap">
  <OnboardingChecklist />

  <div class="mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4">
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Gestão / Dashboard</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Dashboard</h1>
    </div>
    <button class="btn-sm" on:click={loadDash}>Atualizar</button>
  </div>

  {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
  {#if loading}
    <div class="loading">Carregando...</div>
  {:else}
    <!-- [NEW] Mobile-First Grid Layout: 2 cols on mobile, 4 on desktop -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <!-- Vendas Hoje (Most Important) -->
      <div
        class="card col-span-2 sm:col-span-1"
        style="
          background: color-mix(in srgb, var(--primary) 10%, var(--bg-card));
          border-color: color-mix(in srgb, var(--primary) 28%, var(--border-card));
        "
      >
        <div class="kptitle font-semibold" style="color: var(--primary);">Vendas Hoje</div>
        <div class="kpval" style="color: var(--text-main);">{fmt(dash.vendas.totalHoje)}</div>
        <div class="kpsub" style="color: var(--text-label);">{dash.vendas.countHoje} cupons</div>
      </div>
      
      <!-- Chart spanning 2 cols on mobile if we want, or just generic kpis first -->
      <!-- Let's keep KPIs compact -->

       <!-- Ticket Médio -->
       <div class="card">
        <div class="kptitle">Ticket Médio</div>
        <div class="kpval">{dash.vendas.ticketMedioHoje ? fmt(dash.vendas.ticketMedioHoje) : '-'}</div>
      </div>

       <!-- Status Caixa -->
       <div class="card">
        <div class="kptitle">Caixa</div>
        <!-- Status indicator dot -->
        <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full {dash.caixa.aberto ? 'bg-green-500' : 'bg-red-400'}"></span>
            <div class="kpval text-lg">{dash.caixa.aberto ? 'Aberto' : 'Fechado'}</div>
        </div>
        <div class="kpsub">{dash.caixa.aberto ? `${dash.caixa.horasAberto}h ativo` : 'Fechado'}</div>
      </div>

       <!-- Insight/Stock (Merged/Simplified) -->
      <div class="card">
        <div class="kptitle">Estoque</div>
        <div class="kpval">{dash.estoque.rupturas > 0 ? `${dash.estoque.rupturas} zerados` : 'Ok'}</div>
        <div class="kpsub">{dash.estoque.criticos} críticos</div>
      </div>
    </div>

    <!-- [NEW] Hourly Sales Chart (Full Width) -->
    {#if dash.vendasPorHora.length > 0}
      <div class="card mb-4">
        <BarChart 
          title="Vendas por Hora (Hoje)" 
          data={dash.vendasPorHora} 
          maxHeight={140} 
          barColor="bg-indigo-500" 
        />
      </div>
    {/if}

    <!-- Alertas -->
    {#if dash.alertas?.length}
      <div class="card alerts mb-4">
        <strong>Alertas</strong>
        <ul>{#each dash.alertas as a}<li>{a.mensagem}</li>{/each}</ul>
      </div>
    {/if}

    <!-- Recent Activity -->
    <div class="card">
      <div class="flex justify-between items-center mb-2">
         <div class="kptitle text-base font-semibold" style="color: var(--text-main);">Atividade Recente</div>
      </div>
      <ul class="timeline">{#each dash.atividade as ev}
        {@const itensVenda = ev.tipo === 'venda' ? vendasItens.filter(i => i.id_venda === ev.id) : []}
        <li>
          <div class="flex items-center justify-between w-full gap-2">
             <div class="flex items-center gap-2 min-w-0">
                <span class="tag {ev.tipo}">{ev.tipo === 'sangria' ? 'Sangria' : (ev.tipo === 'suprimento' ? 'Suprimento' : 'Venda')}</span>
                {#if ev.tipo === 'venda' && itensVenda.length}
                  <span class="relative group cursor-default">
                    <span class="muted text-[10px] underline decoration-dotted">ver itens</span>
                    <div class="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-52 rounded-lg shadow-lg border border-slate-600 bg-slate-800 text-slate-100 text-xs p-3 space-y-1" style="overflow:visible;">
                      <ul class="space-y-0.5">
                        {#each itensVenda as it}
                          <li>{it.quantidade}× {it.nome_produto_na_venda}</li>
                        {/each}
                      </ul>
                    </div>
                  </span>
                {/if}
             </div>
             <div class="flex items-center gap-1 ml-auto">
               <span class="font-bold" style="color: var(--text-main);">{ev.tipo !== 'venda' ? (ev.tipo === 'sangria' ? '-' : '+') : ''}{fmt(ev.valor)}</span>
               {#if ev.tipo === 'venda'}
                 <button class="btn-icon danger" title="Excluir venda" on:click={() => solicitarDelecaoVenda(ev.id)}>
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                 </button>
               {/if}
             </div>
          </div>
          <div class="flex justify-between w-full mt-1">
             <span class="muted">{new Date(ev.ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
             {#if ev.motivo}<span class="muted text-right max-w-[150px] truncate">{ev.motivo}</span>{/if}
          </div>
        </li>
      {/each}</ul>
    </div>

    <!-- Modal: Confirmar Exclusão de Venda -->
    {#if vendaParaDeletarId}
      <div class="modal-backdrop" on:click={cancelarDelecaoVenda}>
        <div class="modal-box" on:click|stopPropagation>
          <h3 class="modal-title">Excluir venda?</h3>
          <p class="modal-text">Esta ação remove a venda do banco de dados e dos relatórios permanentemente. Use apenas para remover vendas de teste.</p>
          <div class="modal-actions">
            <button class="btn ghost" on:click={cancelarDelecaoVenda}>Cancelar</button>
            <button class="btn-danger" on:click={confirmarDelecaoVenda}>Sim, excluir</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Quick Actions (Bottom) -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      <a href="/app" class="btn btn-primary">Nova Venda</a>
      <a href="/relatorios" class="btn">Relatórios</a>
      <a href="/gestao/pessoas" class="btn">Clientes</a>
      <a href="/gestao/produtos" class="btn">Produtos</a>
    </div>
  {/if}
</section>

<style>
  .wrap{padding:16px;max-width:1100px;margin:0 auto}
  .err{color:var(--error);margin:8px 0}
  .card{background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
  .kptitle{color:var(--text-muted);font-size:13px;margin-bottom:4px}
  .kpval{font-size:24px;font-weight:700;line-height:1.2;color:var(--text-main)}
  .kpsub{color:var(--text-muted);font-size:12px;margin-top:2px}
  
  .alerts{background: var(--status-error-bg);border-color: var(--status-error-border)}
  .alerts ul{margin:4px 0 0 16px;padding:0;list-style:disc;color:var(--status-error-text);font-size:13px}
  
  .timeline{display:flex;flex-direction:column;gap:12px;margin:10px 0 0;padding:0;list-style:none}
  .timeline li {padding-bottom:12px;border-bottom:1px dashed var(--border-card)}
  .timeline li:last-child {border-bottom:none;padding-bottom:0}
  
  .muted{color:var(--text-muted);font-size:11px}
  
  .tag{padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  .tag.venda{background:var(--status-success-bg);color:var(--status-success-text)}
  .tag.sangria{background:var(--status-error-bg);color:var(--status-error-text)}
  .tag.suprimento{background:var(--bg-input);color:var(--text-label)}

  .btn-icon{background:transparent;border:none;padding:4px;cursor:pointer;color:var(--text-muted);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;flex-shrink:0}
  .btn-icon:hover{background:var(--border-subtle)}
  .btn-icon.danger:hover{background:rgba(239,68,68,0.15);color:#ef4444}

  .modal-backdrop{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000}
  .modal-box{background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:24px;max-width:380px;width:90%}
  .modal-title{margin:0 0 10px;font-size:17px;font-weight:700;color:var(--text-main)}
  .modal-text{margin:0 0 20px;font-size:13px;color:var(--text-label);line-height:1.5}
  .modal-actions{display:flex;justify-content:flex-end;gap:10px}
  .btn-danger{padding:8px 18px;border-radius:8px;background:var(--error);color:var(--primary-text);font-weight:600;font-size:13px;border:none;cursor:pointer;transition:background 0.15s}
  .btn-danger:hover{background:#dc2626}

  .btn{display:inline-flex;align-items:center;justify-content:center;height:44px;border-radius:10px;border:1px solid var(--border-card);background:var(--bg-input);color:var(--text-label);text-decoration:none;font-size:14px;font-weight:500;transition:all 0.2s}
  .btn:hover{background:var(--bg-panel);transform:translateY(-1px)}
  .btn-primary{background:var(--primary);color:#fff;border:none}
  .btn-primary:hover{background:var(--primary-dark)}
  
  .btn-sm{padding:4px 12px;font-size:12px;border-radius:6px;border:1px solid var(--border-card)}

  .loading{height:100px;border-radius:12px;background:linear-gradient(90deg,var(--bg-card),var(--bg-panel),var(--bg-card));animation:sh 1.2s infinite}
  @keyframes sh{0%{background-position:-120px}100%{background-position:240px}}
</style>
