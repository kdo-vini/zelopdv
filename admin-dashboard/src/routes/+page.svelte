<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  
  let stats = {
    activeSubscriptions: 0,
    mrr: 0,
    expiringSoon: 0,
    newThisMonth: 0
  }
  
  let loading = true
  
  onMount(async () => {
    await loadStats()
    loading = false
  })
  
  async function loadStats() {
    // Active subscriptions
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('id, status, current_period_end, created_at')
      .eq('status', 'active')
    
    stats.activeSubscriptions = subs?.length || 0
    stats.mrr = (subs?.length || 0) * 59.00
    
    // New this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    
    stats.newThisMonth = subs?.filter(s => 
      new Date(s.created_at) >= startOfMonth
    ).length || 0
    
    // Expiring soon (next 7 days)
    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    
    stats.expiringSoon = subs?.filter(s => {
      const expiry = new Date(s.current_period_end)
      return expiry <= sevenDaysFromNow && expiry > new Date()
    }).length || 0
  }
</script>

<svelte:head>
  <title>Dashboard - Zelo Admin</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-2xl font-bold">Dashboard</h2>
    <p class="text-slate-400 mt-1">Visão geral do sistema</p>
  </div>
  
  {#if loading}
    <div class="text-center py-12">
      <div class="text-slate-400">Carregando estatísticas...</div>
    </div>
  {:else}
    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Active Subscriptions -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div class="text-sm text-slate-400 mb-2">Assinaturas Ativas</div>
        <div class="text-3xl font-bold text-sky-400">{stats.activeSubscriptions}</div>
      </div>
      
      <!-- MRR -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div class="text-sm text-slate-400 mb-2">MRR</div>
        <div class="text-3xl font-bold text-green-400">
          R$ {stats.mrr.toFixed(2)}
        </div>
      </div>
      
      <!-- Expiring Soon -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div class="text-sm text-slate-400 mb-2">Expirando (7 dias)</div>
        <div class="text-3xl font-bold text-amber-400">{stats.expiringSoon}</div>
      </div>
      
      <!-- New This Month -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div class="text-sm text-slate-400 mb-2">Novos Este Mês</div>
        <div class="text-3xl font-bold text-purple-400">{stats.newThisMonth}</div>
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h3 class="text-lg font-semibold mb-4">Ações Rápidas</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="/subscriptions"
          class="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-center"
        >
          <div class="text-2xl mb-2">📋</div>
          <div class="font-medium">Gerenciar Assinaturas</div>
        </a>
        
        <a
          href="/users"
          class="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-center"
        >
          <div class="text-2xl mb-2">👥</div>
          <div class="font-medium">Gerenciar Usuários</div>
        </a>
        
        <a
          href="/logs"
          class="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-center"
        >
          <div class="text-2xl mb-2">📊</div>
          <div class="font-medium">Ver Logs</div>
        </a>
      </div>
    </div>
    
    <!-- Alerts -->
    {#if stats.expiringSoon > 0}
      <div class="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <div class="text-2xl">⚠️</div>
          <div>
            <div class="font-semibold text-amber-400">Atenção</div>
            <div class="text-sm text-slate-300 mt-1">
              {stats.expiringSoon} assinatura{stats.expiringSoon > 1 ? 's' : ''} expirando nos próximos 7 dias.
            </div>
            <a href="/subscriptions?filter=expiring" class="text-sm text-sky-400 hover:underline mt-2 inline-block">
              Ver detalhes →
            </a>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
