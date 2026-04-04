<script>
  import { onMount, onDestroy } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { fade } from 'svelte/transition'

  const USD_TO_BRL = 5.0

  let loading = true
  let summaryCards = { totalTokens: 0, costBrl: 0, uniqueUsers: 0, avgTokensPerUser: 0 }
  let perUserRows = []
  let dailyChartCanvas
  let dailyChart
  let dailyChartData = null

  onMount(async () => {
    await loadData()
    loading = false
    await renderChart()
  })

  onDestroy(() => {
    dailyChart?.destroy()
  })

  async function loadData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

    const [logsRes, profilesRes] = await Promise.all([
      supabase
        .from('ai_usage_logs')
        .select('user_id, chat_type, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at')
        .gte('created_at', startOfMonth.toISOString()),
      supabase
        .from('empresa_perfil')
        .select('user_id, nome_exibicao, contato'),
    ])

    const logs = logsRes.data || []
    const profiles = profilesRes.data || []
    const profileMap = {}
    for (const p of profiles) profileMap[p.user_id] = p

    // Summary
    const uniqueUserSet = new Set(logs.filter(l => l.user_id).map(l => l.user_id))
    summaryCards.totalTokens = logs.reduce((s, l) => s + (l.total_tokens || 0), 0)
    summaryCards.costBrl = logs.reduce((s, l) => s + (Number(l.cost_usd) || 0), 0) * USD_TO_BRL
    summaryCards.uniqueUsers = uniqueUserSet.size
    summaryCards.avgTokensPerUser = uniqueUserSet.size > 0
      ? Math.round(summaryCards.totalTokens / uniqueUserSet.size) : 0

    // Per-user aggregation
    const userMap = {}
    for (const log of logs) {
      const uid = log.user_id || '__support__'
      if (!userMap[uid]) {
        userMap[uid] = { user_id: uid, support: 0, assistant: 0, totalTokens: 0, costUsd: 0 }
      }
      if (log.chat_type === 'support') userMap[uid].support++
      else userMap[uid].assistant++
      userMap[uid].totalTokens += log.total_tokens || 0
      userMap[uid].costUsd += Number(log.cost_usd) || 0
    }

    perUserRows = Object.values(userMap).sort((a, b) => b.totalTokens - a.totalTokens).map(r => ({
      ...r,
      profile: profileMap[r.user_id] || null,
      costBrl: r.costUsd * USD_TO_BRL,
    }))

    // Build daily data for chart (last 30 days)
    dailyChartData = buildDailyData(logs, thirtyDaysAgo)
  }

  function buildDailyData(logs, since) {
    const now = new Date()
    const days = 30
    const labels = [], tokenData = [], costData = []

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(now.getDate() - i)
      day.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day.getTime() + 86400000)

      labels.push(day.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }))

      const dayLogs = logs.filter(l => {
        const t = new Date(l.created_at)
        return t >= day && t < dayEnd
      })
      tokenData.push(dayLogs.reduce((s, l) => s + (l.total_tokens || 0), 0))
      costData.push(Number((dayLogs.reduce((s, l) => s + (Number(l.cost_usd) || 0), 0) * USD_TO_BRL).toFixed(4)))
    }
    return { labels, tokenData, costData }
  }

  async function renderChart() {
    if (typeof window === 'undefined' || !dailyChartData) return
    const { labels, tokenData, costData } = dailyChartData

    try {
      const { Chart, BarController, BarElement, LinearScale, CategoryScale,
        LineController, LineElement, PointElement, Tooltip, Legend } = await import('chart.js')
      Chart.register(BarController, BarElement, LinearScale, CategoryScale,
        LineController, LineElement, PointElement, Tooltip, Legend)

      const gridColor = 'rgba(100,116,139,0.12)'
      const tickColor = '#64748b'

      if (dailyChartCanvas) {
        dailyChart = new Chart(dailyChartCanvas, {
          data: {
            labels,
            datasets: [
              {
                type: 'bar',
                label: 'Tokens',
                data: tokenData,
                backgroundColor: 'rgba(99,102,241,0.5)',
                borderColor: '#6366f1',
                borderWidth: 1,
                borderRadius: 3,
                yAxisID: 'y',
              },
              {
                type: 'line',
                label: 'Custo R$',
                data: costData,
                borderColor: '#a855f7',
                backgroundColor: 'transparent',
                tension: 0.3,
                pointRadius: 2,
                yAxisID: 'y2',
              },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
              tooltip: { mode: 'index', intersect: false },
            },
            scales: {
              x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9 } } },
              y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } }, beginAtZero: true, position: 'left' },
              y2: {
                grid: { drawOnChartArea: false },
                ticks: { color: '#a855f7', font: { size: 10 }, callback: v => `R$ ${v}` },
                beginAtZero: true, position: 'right',
              },
            },
          },
        })
      }
    } catch (err) {
      console.error('[AI Usage] Chart error:', err)
    }
  }
</script>

<svelte:head>
  <title>Uso de IA - Zelo Admin</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">

  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
    <div class="relative">
      <h2 class="text-3xl font-extrabold tracking-tight text-white mb-1">Uso de IA</h2>
      <p class="text-slate-400 text-sm font-medium">Consumo de tokens, custo estimado e breakdown por usuário (mês atual)</p>
      <div class="absolute -bottom-6 left-0 w-16 h-[2px] bg-violet-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div>
    </div>
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4" in:fade>
      <div class="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"></div>
      <div class="text-sm font-medium text-slate-400">Carregando dados de IA...</div>
    </div>
  {:else}

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" in:fade={{delay: 100}}>

      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-violet-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-400/0 via-violet-500 to-violet-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Total Tokens</div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{summaryCards.totalTokens.toLocaleString('pt-BR')}</div>
        <div class="mt-2 text-xs font-medium text-violet-400/60">Mês atual</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-purple-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-400/0 via-purple-500 to-purple-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Custo Estimado</div>
        <div class="text-3xl font-extrabold text-white tracking-tight">R$ {summaryCards.costBrl.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        <div class="mt-2 text-xs font-medium text-purple-400/60">USD × {USD_TO_BRL}</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-400/0 via-indigo-500 to-indigo-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Usuários que Usaram</div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{summaryCards.uniqueUsers}</div>
        <div class="mt-2 text-xs font-medium text-indigo-400/60">Assistente (autenticado)</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-sky-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400/0 via-sky-500 to-sky-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Média Tokens/Usuário</div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{summaryCards.avgTokensPerUser.toLocaleString('pt-BR')}</div>
        <div class="mt-2 text-xs font-medium text-sky-400/60">Usuários do assistente</div>
      </div>

    </div>

    <!-- Daily Chart -->
    <div class="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-sm" in:fade={{delay: 150}}>
      <h3 class="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Tokens × Custo por Dia (30 dias)</h3>
      <div class="h-64 relative">
        <canvas bind:this={dailyChartCanvas}></canvas>
      </div>
    </div>

    <!-- Per-User Table -->
    <div class="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden backdrop-blur-sm" in:fade={{delay: 200}}>
      <div class="px-6 py-5 border-b border-slate-800">
        <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Breakdown por Usuário</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 bg-slate-900/60">
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Empresa</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Suporte</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Assistente</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total Tokens</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Custo R$</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/50">
            {#each perUserRows as row (row.user_id)}
              <tr class="hover:bg-slate-800/30 transition-colors">
                <td class="py-3 px-6">
                  {#if row.user_id === '__support__'}
                    <span class="text-sm text-slate-400 italic">Visitantes (sem conta)</span>
                  {:else}
                    <div>
                      <p class="text-sm font-medium text-slate-200">{row.profile?.nome_exibicao || 'Sem nome'}</p>
                      <p class="text-xs text-slate-500">{row.profile?.contato || row.user_id.slice(0, 12) + '…'}</p>
                    </div>
                  {/if}
                </td>
                <td class="py-3 px-6 text-xs text-slate-400 text-center">{row.support}</td>
                <td class="py-3 px-6 text-xs text-slate-400 text-center">{row.assistant}</td>
                <td class="py-3 px-6 text-sm text-white font-medium text-right">{row.totalTokens.toLocaleString('pt-BR')}</td>
                <td class="py-3 px-6 text-sm text-violet-400 font-medium text-right">R$ {row.costBrl.toLocaleString('pt-BR', {minimumFractionDigits: 4, maximumFractionDigits: 4})}</td>
              </tr>
            {:else}
              <tr>
                <td colspan="5" class="py-12 text-center text-slate-500 text-sm">Nenhum uso de IA registrado este mês.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

  {/if}
</div>
