<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  export let params;

  let loading = true;
  let errorMsg = '';
  let dash = {
    vendas:{ totalHoje:0, countHoje:0, ticketMedioHoje:null, ticketMedioOntem:null, ticketMedioVarPct:null },
    estoque:{ criticos:0, rupturas:0, saudePct:null },
    caixa:{ aberto:false, desde:null, horasAberto:null, ultimoFechamento:null },
    atividade:[], alertas:[], insight:''
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
        // Busca TODAS as vendas do caixa atual (sem filtro de data)
        // Isso garante que vendas de caixas abertos por múltiplos dias apareçam corretamente
        const { data: vs } = await supabase
          .from('vendas')
          .select('id, numero_venda, valor_total, forma_pagamento, created_at')
          .eq('id_caixa', caixaAtual.id)
          .order('created_at', { ascending: false });
        vendasCaixa = vs||[];
        
        // Busca movimentações (sangrias/suprimentos) do caixa
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
      
      // Combina vendas e movimentações para atividade recente, ordenado por timestamp
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
          alertas.push({ mensagem: 'Caixa aberto ha mais de 10h. Considere fechar.' });
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
        insight: countCaixa > 0 ? `${countCaixa} vendas registradas neste caixa.` : 'Nenhuma venda registrada ainda.'
      };
    }catch(e){
      console.error('[Dashboard] Erro ao carregar:', e);
      errorMsg = e?.message || 'Erro ao carregar dashboard.';
    }
    loading=false;
  }
  import { waitAuthReady } from '$lib/authStore';
  onMount(async () => { await waitAuthReady(); await loadDash(); });

  const fmt = (v)=> `R$ ${Number(v||0).toFixed(2)}`;
</script>

<section class="wrap">
  <h1 class="pageTitle">Dashboard</h1>
  {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
  {#if loading}
    <div class="loading">Carregando...</div>
  {:else}
    <div class="grid kpis">
      <div class="card">
        <div class="kptitle">Vendas do caixa</div>
        <div class="kpval">{fmt(dash.vendas.totalHoje)}</div>
        <div class="kpsub">{dash.vendas.countHoje} cupons • Ticket {dash.vendas.ticketMedioHoje ? fmt(dash.vendas.ticketMedioHoje) : '-'}</div>
      </div>
      <div class="card">
        <div class="kptitle">Estoque saúde</div>
        <div class="kpval">{dash.estoque.saudePct ?? '-'}%</div>
        <div class="kpsub">{dash.estoque.rupturas} rupturas • {dash.estoque.criticos} críticos</div>
      </div>
      <div class="card">
        <div class="kptitle">Caixa</div>
        <div class="kpval">{dash.caixa.aberto ? 'Aberto' : 'Fechado'}</div>
        <div class="kpsub">{dash.caixa.aberto ? `Aberto há ${dash.caixa.horasAberto}h` : (dash.caixa.ultimoFechamento ? 'Último: '+ new Date(dash.caixa.ultimoFechamento).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—')}</div>
      </div>
      <div class="card">
        <div class="kptitle">Insight</div>
        <div class="kpval small">{dash.insight || '—'}</div>
        <button class="btn" on:click={loadDash}>Atualizar</button>
      </div>
    </div>

    {#if dash.alertas?.length}
      <div class="card alerts">
        <strong>Alertas</strong>
        <ul>{#each dash.alertas as a}<li>{a.mensagem}</li>{/each}</ul>
      </div>
    {/if}

    <div class="card">
      <div class="kptitle">Atividade recente</div>
      <ul class="timeline">{#each dash.atividade as ev}
        <li>
          <span class="tag {ev.tipo}">{ev.tipo}</span>
          <span># {ev.numero_venda || ev.id} • {fmt(ev.valor)}</span>
          <span class="muted">{new Date(ev.ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
          {#if ev.motivo}<span class="muted">• {ev.motivo}</span>{/if}
        </li>
      {/each}</ul>
    </div>

    <div class="grid actions">
      <a href="/app" class="btn">Nova venda</a>
      <a href="/admin/pessoas" class="btn">Pessoas</a>
      <a href="/admin/fichario" class="btn">Fichário</a>
      <a href="/relatorios" class="btn">Relatórios</a>
    </div>
  {/if}
</section>

<style>
  .wrap{padding:18px;max-width:1100px;margin:0 auto}
  .err{color:var(--error);margin:8px 0}
  .grid.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:14px 0}
  .card{background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:14px}
  .kptitle{color:var(--text-muted);font-size:12px;margin-bottom:4px}
  .kpval{font-size:22px;font-weight:700}
  .kpval.small{font-size:15px;font-weight:600}
  .kpsub{color:var(--text-muted);font-size:11px;margin-top:3px}
  .alerts ul{margin:6px 0 0 16px;padding:0;list-style:disc}
  .timeline{display:flex;flex-direction:column;gap:6px;margin:10px 0 0;padding:0;list-style:none}
  .muted{color:var(--text-muted);margin-left:6px;font-size:11px}
  .tag{padding:2px 6px;border-radius:6px;font-size:11px;background:var(--border-card);margin-right:6px;text-transform:capitalize}
  .tag.venda{background:var(--success-bg);color:var(--success-light)}
  .tag.sangria{background:var(--error-bg);color:var(--error-light)}
  .tag.suprimento{background:var(--bg-input);color:var(--text-label)}
  .btn{display:inline-flex;align-items:center;justify-content:center;height:36px;border-radius:8px;border:1px solid var(--border-card);background:var(--bg-input);color:var(--text-label);text-decoration:none;font-size:13px;padding:0 14px}
  .btn:hover{background:var(--bg-panel)}
  .grid.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:16px}
  .loading{height:100px;border-radius:10px;background:linear-gradient(90deg,var(--bg-card),var(--bg-panel),var(--bg-card));animation:sh 1.2s infinite}
  @keyframes sh{0%{background-position:-120px}100%{background-position:240px}}
</style>
