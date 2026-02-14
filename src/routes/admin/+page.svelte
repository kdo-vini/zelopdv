<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { waitAuthReady } from '$lib/authStore';
  import BarChart from '$lib/components/charts/BarChart.svelte'; // [NEW]

  export let params;

  let loading = true;
  let errorMsg = '';
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
        
        // Busca movimentações
        const { data: movs } = await supabase
          .from('caixa_movimentacoes')
          .select('id, tipo, valor, motivo, created_at')
          .eq('id_caixa', caixaAtual.id)
          .order('created_at', { ascending: false });
        movimentacoes = movs||[];
      }
      
      const totalCaixa = (vendasCaixa||[]).reduce((a,v)=>a+Number(v.valor_total||0),0);
      const countCaixa = (vendasCaixa||[]).length;
      const ticketMedioCaixa = countCaixa ? totalCaixa/countCaixa : null;
      
      // [NEW] Process hourly sales for the chart
      const vendasPorHoraMap = new Array(24).fill(0);
      let temVendas = false;
      
      // Filter sales from 'today' based on local time logic or just strictly follow current open box context
      // Since we want "Vendas Hoje" (or current box session), we stick to sales in `vendasCaixa`
      for(const v of vendasCaixa){
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
</script>

<section class="wrap">
  <div class="flex justify-between items-center mb-4">
    <h1 class="pageTitle">Dashboard</h1>
    <button class="btn-sm" on:click={loadDash}>Atualizar</button>
  </div>

  {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
  {#if loading}
    <div class="loading">Carregando...</div>
  {:else}
    <!-- [NEW] Mobile-First Grid Layout: 2 cols on mobile, 4 on desktop -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <!-- Vendas Hoje (Most Important) -->
      <div class="card bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-800 border-indigo-200 dark:border-slate-700 col-span-2 sm:col-span-1">
        <div class="kptitle text-indigo-700 dark:text-indigo-400 font-semibold">Vendas Hoje</div>
        <div class="kpval text-indigo-900 dark:text-white">{fmt(dash.vendas.totalHoje)}</div>
        <div class="kpsub text-indigo-600/80 dark:text-indigo-300/70">{dash.vendas.countHoje} cupons</div>
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
         <div class="kptitle text-base font-semibold text-gray-800 dark:text-gray-200">Atividade Recente</div>
      </div>
      <ul class="timeline">{#each dash.atividade as ev}
        <li>
          <div class="flex items-center justify-between w-full">
             <div class="flex items-center gap-2">
                <span class="tag {ev.tipo}">{ev.tipo === 'sangria' ? 'Sangria' : (ev.tipo === 'suprimento' ? 'Suprimento' : 'Venda')}</span>
                <span class="font-medium text-sm">#{ev.numero_venda || ev.id}</span>
             </div>
             <span class="font-bold text-gray-700 dark:text-gray-300">{ev.tipo !== 'venda' ? (ev.tipo === 'sangria' ? '-' : '+') : ''}{fmt(ev.valor)}</span>
          </div>
          <div class="flex justify-between w-full mt-1">
             <span class="muted">{new Date(ev.ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
             {#if ev.motivo}<span class="muted text-right max-w-[150px] truncate">{ev.motivo}</span>{/if}
          </div>
        </li>
      {/each}</ul>
    </div>

    <!-- Quick Actions (Bottom) -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      <a href="/app" class="btn btn-primary">Nova Venda</a>
      <a href="/relatorios" class="btn">Relatórios</a>
      <a href="/admin/pessoas" class="btn">Clientes</a>
      <a href="/admin/produtos" class="btn">Produtos</a>
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
  
  .alerts{background:#fff1f2;border-color:#fecdd3}
  .alerts ul{margin:4px 0 0 16px;padding:0;list-style:disc;color:#9f1239;font-size:13px}
  
  .timeline{display:flex;flex-direction:column;gap:12px;margin:10px 0 0;padding:0;list-style:none}
  .timeline li {padding-bottom:12px;border-bottom:1px dashed var(--border-card)}
  .timeline li:last-child {border-bottom:none;padding-bottom:0}
  
  .muted{color:var(--text-muted);font-size:11px}
  
  .tag{padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  .tag.venda{background:#dcfce7;color:#166534}
  .tag.sangria{background:#fee2e2;color:#991b1b}
  .tag.suprimento{background:#f3f4f6;color:#374151}

  .btn{display:inline-flex;align-items:center;justify-content:center;height:44px;border-radius:10px;border:1px solid var(--border-card);background:var(--bg-input);color:var(--text-label);text-decoration:none;font-size:14px;font-weight:500;transition:all 0.2s}
  .btn:hover{background:var(--bg-panel);transform:translateY(-1px)}
  .btn-primary{background:var(--primary);color:#fff;border:none}
  .btn-primary:hover{background:var(--primary-dark)}
  
  .btn-sm{padding:4px 12px;font-size:12px;border-radius:6px;border:1px solid var(--border-card)}

  .loading{height:100px;border-radius:12px;background:linear-gradient(90deg,var(--bg-card),var(--bg-panel),var(--bg-card));animation:sh 1.2s infinite}
  @keyframes sh{0%{background-position:-120px}100%{background-position:240px}}
</style>
