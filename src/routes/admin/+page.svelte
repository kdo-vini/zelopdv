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
    const { data, error } = await supabase.rpc('dashboard_resumo');
    if(error){
      // Fallback client-side: compõe um resumo básico sem o RPC
      console.warn('[dashboard_resumo] RPC falhou, usando fallback:', error.message);
      try{
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        // caixa aberto recente
        const { data: cx } = await supabase
          .from('caixas')
          .select('id, data_abertura, data_fechamento')
          .eq('id_usuario', uid)
          .order('data_abertura', { ascending:false })
          .limit(1);
        const caixaAtual = (cx&&cx[0])||null;
        let vendasHoje = [];
        if(caixaAtual){
          const inicio = new Date(); inicio.setHours(0,0,0,0);
          const { data: vs } = await supabase
            .from('vendas')
            .select('id, valor_total, forma_pagamento, created_at')
            .eq('id_caixa', caixaAtual.id)
            .gte('created_at', inicio.toISOString());
          vendasHoje = vs||[];
        }
        const totalHoje = (vendasHoje||[]).reduce((a,v)=>a+Number(v.valor_total||0),0);
        const countHoje = (vendasHoje||[]).length;
        const ticketMedioHoje = countHoje ? totalHoje/countHoje : null;
        dash = {
          vendas: { totalHoje, countHoje, ticketMedioHoje, ticketMedioOntem:null, ticketMedioVarPct:null },
          estoque: { criticos:0, rupturas:0, saudePct:null },
          caixa: { aberto: !!(caixaAtual && !caixaAtual.data_fechamento), desde: caixaAtual?.data_abertura||null, horasAberto: caixaAtual? Math.max(0, Math.round((Date.now()-new Date(caixaAtual.data_abertura).getTime())/36e5)) : null, ultimoFechamento: null },
          atividade: (vendasHoje||[]).slice(0,10).map(v=>({ tipo:'venda', id:v.id, valor:v.valor_total, ts:v.created_at })),
          alertas: [],
          insight: 'Exibindo dados básicos (fallback).'
        };
      }catch(e){
        errorMsg = error.message; loading=false; return;
      }
      loading=false; return;
    }
    dash = data || dash; loading=false;
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
        <div class="kptitle">Vendas hoje</div>
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
          <span># {ev.id} • {fmt(ev.valor)}</span>
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
  .err{color:#ef4444;margin:8px 0}
  .grid.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:14px 0}
  .card{background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:14px}
  .kptitle{color:#94a3b8;font-size:12px;margin-bottom:4px}
  .kpval{font-size:22px;font-weight:700}
  .kpval.small{font-size:15px;font-weight:600}
  .kpsub{color:#94a3b8;font-size:11px;margin-top:3px}
  .alerts ul{margin:6px 0 0 16px;padding:0;list-style:disc}
  .timeline{display:flex;flex-direction:column;gap:6px;margin:10px 0 0;padding:0;list-style:none}
  .muted{color:#94a3b8;margin-left:6px;font-size:11px}
  .tag{padding:2px 6px;border-radius:6px;font-size:11px;background:#1f2937;margin-right:6px;text-transform:capitalize}
  .tag.venda{background:#064e3b;color:#d1fae5}
  .tag.sangria{background:#7f1d1d;color:#fecaca}
  .tag.suprimento{background:#111827;color:#e5e7eb}
  .btn{display:inline-flex;align-items:center;justify-content:center;height:36px;border-radius:8px;border:1px solid #1f2937;background:#0f172a;color:#e5e7eb;text-decoration:none;font-size:13px;padding:0 14px}
  .btn:hover{background:#111827}
  .grid.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:16px}
  .loading{height:100px;border-radius:10px;background:linear-gradient(90deg,#0b1220,#0e1526,#0b1220);animation:sh 1.2s infinite}
  @keyframes sh{0%{background-position:-120px}100%{background-position:240px}}
</style>
