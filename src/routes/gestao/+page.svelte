<script>
  import { onMount, tick } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { waitAuthReady } from '$lib/authStore';
  import BarChart from '$lib/components/charts/BarChart.svelte'; // [NEW]
  import OnboardingChecklist from '$lib/components/OnboardingChecklist.svelte';
  import { revertFiadoDebtForVenda } from '$lib/finance/saleOps';
  import { addToast } from '$lib/stores/ui';
  import { buildSaleReceiptPayload, loadSaleReceiptCompanyProfile } from '$lib/finance/saleReceipt';
  import { printVenda } from '$lib/printService';
  import { ArrowUpRight, MoreHorizontal, Printer, Trash2 } from 'lucide-svelte';


  let loading = true;
  let errorMsg = '';
  let usuarioId = null;
  let vendasItens = [];
  let vendasPagamentos = [];
  let dadosEmpresa = null;
  let vendaParaDeletarId = null;
  let vendaDeleteReturnFocus = null;
  let vendaMenuAbertoId = null;
  let reimprimindoVendaId = null;
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
      usuarioId = uid;

      // O dashboard reflete a SESSÃO DO CAIXA ATUAL, não o dia de calendário.
      // Motivo: empresas que atravessam a meia-noite (bar, lanchonete) precisam
      // ver a noite inteira num único caixa, sem zerar às 00h.
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
      vendasItens = [];
      vendasPagamentos = [];

      if(caixaAtual){
        // Busca TODAS as vendas do caixa atual
        const { data: vs } = await supabase
          .from('vendas')
          .select('id, numero_venda, valor_total, forma_pagamento, valor_recebido, valor_troco, valor_desconto, taxa_entrega, tipo_pedido, created_at')
          .eq('id_caixa', caixaAtual.id)
          .order('created_at', { ascending: false });
        vendasCaixa = vs||[];

        // Busca itens das vendas para hover
        const vendaIds = (vs||[]).map(v => v.id);
        if (vendaIds.length) {
          const { data: itens } = await supabase
            .from('vendas_itens')
            .select('id_venda, quantidade, nome_produto_na_venda, preco_unitario_na_venda, modifiers')
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
      const vendaIdsCaixa = vendasCaixa.map(v=>v.id);
      let pagFiadoMulti = 0;
      if (vendaIdsCaixa.length) {
        const { data: pagsMulti } = await supabase
          .from('vendas_pagamentos')
          .select('id_venda, forma_pagamento, valor')
          .in('id_venda', vendaIdsCaixa);
        vendasPagamentos = pagsMulti || [];
        pagFiadoMulti = vendasPagamentos
          .filter((p) => p.forma_pagamento === 'fiado')
          .reduce((a,p)=> a + Number(p.valor||0), 0);
      }
      const totalCaixa = vendasCaixa.reduce((a,v)=> {
        // Venda fiado pura: ignora valor inteiro.
        if (v.forma_pagamento === 'fiado') return a;
        return a + Number(v.valor_total||0);
      }, 0) - pagFiadoMulti;
      const countCaixa = vendasCaixa.length;
      const ticketMedioCaixa = countCaixa ? totalCaixa/countCaixa : null;

      // [NEW] Process hourly sales for the chart
      const vendasPorHoraMap = new Array(24).fill(0);
      let temVendas = false;
      
      // Vendas do caixa agrupadas por hora do dia.
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
      const atividadeVendas = vendasCaixa.map(v=>({ ...v, tipo:'venda', id:v.id, numero_venda:v.numero_venda, valor:v.valor_total, ts:v.created_at }));
      const atividadeMovs = (movimentacoes||[]).map(m=>({ tipo:m.tipo, id:m.id, valor:m.valor, ts:m.created_at, motivo:m.motivo }));
      const atividadeCombinada = [...atividadeVendas, ...atividadeMovs]
        .sort((a,b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, 10);
      
      // Calcula alertas
      const alertas = [];
      if(caixaAtual && !caixaAtual.data_fechamento){
        const horasAberto = Math.round((Date.now()-new Date(caixaAtual.data_abertura).getTime())/36e5);
        if(horasAberto >= 10){
          alertas.push({
            mensagem: 'Caixa aberto há mais de 10h. Considere fechar.',
            actionHref: '/gestao/caixa',
            actionLabel: 'Fechar caixa'
          });
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
  const fmtDataHora = (v)=> v ? new Date(v).toLocaleString('pt-BR',{ day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  $: caixaTooltip = dash.caixa.aberto && dash.caixa.desde
    ? `Caixa aberto desde ${fmtDataHora(dash.caixa.desde)} · ${dash.caixa.horasAberto}h ativo`
    : '';

  function toggleVendaMenu(id) {
    vendaMenuAbertoId = vendaMenuAbertoId === id ? null : id;
  }

  function handleVendaMenuWindowClick(event) {
    if (!(event.target instanceof Element) || !event.target.closest('[data-sale-menu]')) {
      vendaMenuAbertoId = null;
    }
  }

  function handleVendaMenuKeydown(event) {
    if (event.key === 'Escape') vendaMenuAbertoId = null;
  }

  async function carregarPerfilImpressao() {
    if (dadosEmpresa) return dadosEmpresa;
    dadosEmpresa = await loadSaleReceiptCompanyProfile({ supabase, userId: usuarioId });
    return dadosEmpresa;
  }

  function perfilToEstabelecimento(perfil = {}) {
    return {
      id: perfil.id,
      nome_exibicao: perfil.nome_exibicao || 'Zelo PDV',
      documento: perfil.documento || null,
      endereco: perfil.endereco || null,
      contato: perfil.contato || null,
      logoUrl: perfil.logoUrl || perfil.logo_url || null,
      rodape_recibo: perfil.rodape_recibo || 'Obrigado pela preferência!',
      largura_bobina: perfil.largura_bobina || '80mm'
    };
  }

  async function reimprimirVenda(id) {
    const venda = dash.atividade.find((event) => event.tipo === 'venda' && event.id === id);
    if (!venda) {
      addToast('Venda não encontrada para reimpressão.', 'error');
      vendaMenuAbertoId = null;
      return;
    }

    vendaMenuAbertoId = null;
    reimprimindoVendaId = id;
    try {
      const itens = vendasItens.filter((item) => item.id_venda === id);
      const pagamentos = vendasPagamentos.filter((pagamento) => pagamento.id_venda === id);
      const perfil = await carregarPerfilImpressao();
      await printVenda({
        estabelecimento: perfilToEstabelecimento(perfil),
        venda: buildSaleReceiptPayload({ venda, itens, pagamentos }),
        opcoes: { copia: true }
      });
      addToast('Venda reimpressa com sucesso.', 'success');
    } catch (error) {
      console.error('[Dashboard] Falha ao reimprimir venda:', error);
      addToast('Não foi possível reimprimir a venda: ' + (error?.message || error), 'error');
    } finally {
      reimprimindoVendaId = null;
    }
  }

  function solicitarDelecaoVenda(id, event) {
    const menuTrigger = event?.currentTarget instanceof Element
      ? event.currentTarget.closest('[data-sale-menu]')?.querySelector('button[aria-haspopup="menu"]')
      : null;
    vendaMenuAbertoId = null;
    if (typeof document !== 'undefined') {
      const activeElement = document.activeElement;
      vendaDeleteReturnFocus = menuTrigger instanceof HTMLElement
        ? menuTrigger
        : activeElement instanceof HTMLElement ? activeElement : null;
    }
    vendaParaDeletarId = id;
  }

  function cancelarDelecaoVenda() {
    vendaParaDeletarId = null;
    void tick().then(() => {
      if (vendaDeleteReturnFocus?.isConnected) vendaDeleteReturnFocus.focus();
      vendaDeleteReturnFocus = null;
    });
  }

  function handleVendaDeleteKeydown(event) {
    if (event.key === 'Escape') cancelarDelecaoVenda();
  }

  async function confirmarDelecaoVenda() {
    if (!vendaParaDeletarId) return;
    const id = vendaParaDeletarId;
    cancelarDelecaoVenda();
    // Estorna fiado antes da exclusão para manter o fichário consistente.
    try {
      await revertFiadoDebtForVenda(supabase, id);
    } catch (e) {
      addToast('Não foi possível estornar a dívida no fichário: ' + (e?.message || e), 'error');
      return;
    }
    const { error } = await supabase.from('vendas').delete().eq('id', id);
    if (error) {
      addToast('Erro ao excluir: ' + error.message, 'error');
    } else {
      vendasItens = vendasItens.filter(i => i.id_venda !== id);
      vendasPagamentos = vendasPagamentos.filter(p => p.id_venda !== id);
      dash = { ...dash, atividade: dash.atividade.filter(ev => !(ev.tipo === 'venda' && ev.id === id)) };
    }
  }
</script>

<svelte:window on:click={handleVendaMenuWindowClick} on:keydown={handleVendaMenuKeydown} />

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
      <!-- Vendas do Caixa Atual (Most Important) -->
      <div
        class="card col-span-2 sm:col-span-1"
        title={caixaTooltip}
        style="
          background: color-mix(in srgb, var(--primary) 10%, var(--bg-card));
          border-color: color-mix(in srgb, var(--primary) 28%, var(--border-card));
          {caixaTooltip ? 'cursor:help;' : ''}
        "
      >
        <div class="kptitle font-semibold" style="color: var(--primary);">Vendas do Caixa</div>
        <div class="kpval" style="color: var(--text-main);">{fmt(dash.vendas.totalHoje)}</div>
        <div class="kpsub" style="color: var(--text-label);">{dash.vendas.countHoje} cupons no caixa atual</div>
      </div>
      
      <!-- Chart spanning 2 cols on mobile if we want, or just generic kpis first -->
      <!-- Let's keep KPIs compact -->

       <!-- Ticket Médio -->
       <div class="card">
        <div class="kptitle">Ticket Médio</div>
        <div class="kpval">{dash.vendas.ticketMedioHoje ? fmt(dash.vendas.ticketMedioHoje) : '-'}</div>
      </div>

       <!-- Status Caixa -->
       <div class="card" title={caixaTooltip} style={caixaTooltip ? 'cursor:help' : ''}>
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
          title="Vendas por Hora (Caixa Atual)"
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
        <ul>{#each dash.alertas as a}
          <li>
            <span>{a.mensagem}</span>
            {#if a.actionHref}
              <a href={a.actionHref} class="alert-action">
                <span>{a.actionLabel}</span>
                <ArrowUpRight class="size-3.5" aria-hidden="true" />
              </a>
            {/if}
          </li>
        {/each}</ul>
      </div>
    {/if}

    <!-- Recent Activity -->
    <div class="card">
      <div class="flex justify-between items-center mb-2 gap-2">
         <div class="kptitle text-base font-semibold" style="color: var(--text-main);">Atividade Recente</div>
         <a href="/relatorios" class="caixa-link">
           <span>Ver relatório completo</span>
           <ArrowUpRight class="size-3.5" aria-hidden="true" />
         </a>
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
                 <div class="sale-actions" data-sale-menu>
                   <button
                     type="button"
                     class="btn-icon"
                     title="Ações da venda"
                     aria-label="Ações da venda"
                     aria-haspopup="menu"
                     aria-expanded={vendaMenuAbertoId === ev.id}
                     disabled={reimprimindoVendaId === ev.id}
                     data-testid={`sale-actions-trigger-${ev.id}`}
                     on:click={() => toggleVendaMenu(ev.id)}
                   >
                     <MoreHorizontal class="size-4" aria-hidden="true" />
                   </button>
                   {#if vendaMenuAbertoId === ev.id}
                     <div class="sale-menu" role="menu" data-testid={`sale-actions-menu-${ev.id}`}>
                       <button type="button" class="sale-menu-item text-xs" role="menuitem" on:click={() => reimprimirVenda(ev.id)}>
                         <Printer class="size-4" aria-hidden="true" />
                         <span>{reimprimindoVendaId === ev.id ? 'Imprimindo...' : 'Reimprimir venda'}</span>
                       </button>
                       <button type="button" class="sale-menu-item danger text-xs" role="menuitem" on:click={(event) => solicitarDelecaoVenda(ev.id, event)}>
                         <Trash2 class="size-4" aria-hidden="true" />
                         <span>Excluir venda</span>
                       </button>
                     </div>
                   {/if}
                 </div>
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
      <dialog
        open
        class="modal-backdrop"
        aria-modal="true"
        aria-labelledby="delete-sale-title"
        tabindex="-1"
        on:keydown={handleVendaDeleteKeydown}
        on:click|self={cancelarDelecaoVenda}
      >
        <div class="modal-box">
          <h3 id="delete-sale-title" class="modal-title">Excluir venda?</h3>
          <p class="modal-text">Esta ação remove a venda do banco de dados e dos relatórios permanentemente. Use apenas para remover vendas de teste.</p>
          <div class="modal-actions">
            <button class="btn ghost" on:click={cancelarDelecaoVenda}>Cancelar</button>
            <button class="btn-danger" on:click={confirmarDelecaoVenda}>Sim, excluir</button>
          </div>
        </div>
      </dialog>
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
  .alerts li + li{margin-top:4px}
  .alert-action{display:inline-flex;align-items:center;gap:3px;margin-left:8px;font-weight:600;color:var(--status-error-text);text-decoration:underline;text-underline-offset:2px;vertical-align:middle;transition:opacity 0.15s}
  .alert-action:hover{opacity:0.75}
  
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
  .btn-icon:disabled{cursor:wait;opacity:.55}

  .sale-actions{position:relative;display:inline-flex}
  .sale-actions > .btn-icon{min-width:44px;min-height:44px}
  .sale-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:20;min-width:180px;padding:4px;border:1px solid var(--border-card);border-radius:8px;background:var(--bg-card);box-shadow:var(--shadow-modal)}
  .sale-menu-item{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:var(--text-label);text-align:left;cursor:pointer;transition:background .15s,color .15s}
  .sale-menu-item:hover{background:var(--bg-panel);color:var(--text-main)}
  .sale-menu-item.danger:hover{background:var(--status-error-bg);color:var(--status-error-text)}

  .modal-backdrop{position:fixed;top:0;left:0;width:100%;height:100%;margin:0;border:0;padding:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000}
  .modal-backdrop::backdrop{background:transparent}
  .modal-box{background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:24px;max-width:380px;width:90%;box-shadow:var(--shadow-modal)}
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

  .caixa-link{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;font-size:12px;font-weight:500;color:var(--primary);text-decoration:none;white-space:nowrap;transition:color 0.15s}
  .caixa-link:hover{color:var(--primary-hover);text-decoration:underline}

  .loading{height:100px;border-radius:12px;background:linear-gradient(90deg,var(--bg-card),var(--bg-panel),var(--bg-card));animation:sh 1.2s infinite}
  @keyframes sh{0%{background-position:-120px}100%{background-position:240px}}
</style>
