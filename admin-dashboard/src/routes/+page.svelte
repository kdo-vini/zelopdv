<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { fade } from 'svelte/transition'
  import { subscriptionValue } from '$lib/pricing'
  
  let stats = {
    activeSubscriptions: 0,
    mrr: 0,
    expiringSoon: 0,
    newThisMonth: 0,
    dau: 0,
    wau: 0,
    aiCostBrl: 0,
    churnPct: 0,
  }

  let loading = true

  onMount(async () => {
    await loadStats()
    loading = false
  })

  async function loadStats() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Active subscriptions
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('id, status, current_period_end, created_at, plan_tier, has_mesas_addon')
      .in('status', ['active', 'trialing'])

    stats.activeSubscriptions = subs?.length || 0
    const activeSubs = subs?.filter(s => s.status === 'active') || []
    // MRR = soma do valor real de cada subscription ativa (plan_tier + addons)
    stats.mrr = activeSubs.reduce((sum, s) => sum + subscriptionValue(s), 0)

    stats.newThisMonth = subs?.filter(s =>
      new Date(s.created_at) >= startOfMonth
    ).length || 0

    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000)
    stats.expiringSoon = subs?.filter(s => {
      const expiry = new Date(s.current_period_end)
      return expiry <= sevenDaysFromNow && expiry > now
    }).length || 0

    // DAU / WAU — uses GREATEST(last_seen_at, auth.last_sign_in_at) via security definer fn
    const { data: lastSeenData } = await supabase.rpc('admin_get_users_last_seen')

    stats.dau = lastSeenData?.filter(p => p.effective_last_seen && new Date(p.effective_last_seen) >= today).length || 0
    stats.wau = lastSeenData?.filter(p => p.effective_last_seen && new Date(p.effective_last_seen) >= sevenDaysAgo).length || 0

    // AI cost this month (USD → BRL at 5.0)
    const { data: aiLogs } = await supabase
      .from('ai_usage_logs')
      .select('cost_usd')
      .gte('created_at', startOfMonth.toISOString())

    const totalCostUsd = aiLogs?.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) || 0
    stats.aiCostBrl = totalCostUsd * 5.0

    // Churn this month: canceled this month / (active at start of month)
    const { data: canceledThisMonth } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('status', 'canceled')
      .gte('updated_at', startOfMonth.toISOString())

    const canceledCount = canceledThisMonth?.length || 0
    const activeAtStart = stats.activeSubscriptions + canceledCount
    stats.churnPct = activeAtStart > 0 ? Math.round((canceledCount / activeAtStart) * 100) : 0
  }
</script>

<svelte:head>
  <title>Dashboard - Zelo Admin</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
  
  <!-- Sleek Header Area -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
    <div class="relative">
      <h2 class="text-3xl font-extrabold tracking-tight text-white mb-1">Visão Geral</h2>
      <p class="text-slate-400 text-sm font-medium">Métricas de crescimento e saúde da plataforma</p>
      <div class="absolute -bottom-6 left-0 w-16 h-[2px] bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
    </div>
  </div>
  
  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4" in:fade>
      <div class="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div>
      <div class="text-sm font-medium text-slate-400">Carregando métricas...</div>
    </div>
  {:else}
    <!-- Modern Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" in:fade={{delay: 100}}>
      
      <!-- MRR Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400/0 via-emerald-500 to-emerald-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">MRR</div>
          <div class="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">
          R$ {stats.mrr.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}
        </div>
        <div class="mt-2 text-xs font-medium text-emerald-400/60">+ Base estimada sólida</div>
      </div>
      
      <!-- Active Subs Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-sky-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400/0 via-sky-500 to-sky-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Assinaturas Ativas</div>
          <div class="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{stats.activeSubscriptions}</div>
        <div class="mt-2 text-xs font-medium text-sky-400/60">Contas pagantes ou trial</div>
      </div>
      
      <!-- New This Month Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-400/0 via-indigo-500 to-indigo-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Novos no Mês</div>
          <div class="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{stats.newThisMonth}</div>
        <div class="mt-2 text-xs font-medium text-indigo-400/60">Novas ativações</div>
      </div>

      <!-- Expiring Soon Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-amber-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400/0 via-amber-500 to-amber-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Expirando (7 dias)</div>
          <div class="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{stats.expiringSoon}</div>
        <div class="mt-2 text-xs font-medium text-amber-400/60">Cuidado com retenção</div>
      </div>

    </div>

    <!-- Engagement & Cost Row -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" in:fade={{delay: 150}}>

      <!-- DAU Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-sky-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400/0 via-sky-500 to-sky-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">DAU (hoje)</div>
          <div class="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{stats.dau}</div>
        <div class="mt-2 text-xs font-medium text-sky-400/60">Usuários ativos hoje</div>
      </div>

      <!-- WAU Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-400/0 via-indigo-500 to-indigo-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">WAU (7 dias)</div>
          <div class="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{stats.wau}</div>
        <div class="mt-2 text-xs font-medium text-indigo-400/60">Usuários ativos em 7 dias</div>
      </div>

      <!-- AI Cost Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-violet-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-400/0 via-violet-500 to-violet-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Custo IA (mês)</div>
          <div class="p-2 bg-violet-500/10 text-violet-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">R$ {stats.aiCostBrl.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
        <div class="mt-2 text-xs font-medium text-violet-400/60">USD × 5.0 estimado</div>
      </div>

      <!-- Churn Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-rose-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-400/0 via-rose-500 to-rose-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Churn (mês)</div>
          <div class="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{stats.churnPct}%</div>
        <div class="mt-2 text-xs font-medium text-rose-400/60">Cancelamentos no mês</div>
      </div>

    </div>
    
    <!-- Quick Actions -->
    <div class="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 backdrop-blur-sm mt-8" in:fade={{delay: 200}}>
      <h3 class="text-lg font-bold text-white mb-6 tracking-wide">Acesso Rápido</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
        
        <a href="/subscriptions" class="group flex flex-col items-center p-6 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-500/50 rounded-2xl transition-all shadow-inner">
          <div class="w-12 h-12 bg-sky-500/10 text-sky-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div class="font-semibold text-slate-200 group-hover:text-white text-sm">Assinaturas</div>
        </a>
        
        <a href="/users" class="group flex flex-col items-center p-6 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-2xl transition-all shadow-inner">
          <div class="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          </div>
          <div class="font-semibold text-slate-200 group-hover:text-white text-sm">Usuários</div>
        </a>
        
        <a href="/logs" class="group flex flex-col items-center p-6 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 rounded-2xl transition-all shadow-inner">
          <div class="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
          </div>
          <div class="font-semibold text-slate-200 group-hover:text-white text-sm">Auditoria (Logs)</div>
        </a>
        
      </div>
    </div>
    
    <!-- Alerts -->
    {#if stats.expiringSoon > 0}
      <div class="mt-8 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden" in:fade={{delay: 300}}>
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400/0 via-amber-500 to-amber-400/0"></div>
        <div class="flex items-start gap-4">
          <div class="p-3 bg-amber-500/20 text-amber-400 rounded-full">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <div>
             <h4 class="text-base font-bold text-amber-400 tracking-wide">Atenção Necessária</h4>
             <p class="text-sm text-slate-300 mt-1 mb-3">Existem <strong class="text-white">{stats.expiringSoon}</strong> assinaturas expirando na próxima semana.</p>
             <a href="/subscriptions?filter=expiring" class="inline-flex items-center text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors">
               Ver Detalhes ->
             </a>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
