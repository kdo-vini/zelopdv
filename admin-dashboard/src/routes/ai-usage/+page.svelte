<script>
  import { onMount, onDestroy } from 'svelte'
  import { supabase } from '$lib/supabaseClient'
  import { fade } from 'svelte/transition'

  const USD_TO_BRL = 5.0
  const GPT_4O_MINI_INPUT_PER_1M = 0.15
  const GPT_4O_MINI_OUTPUT_PER_1M = 0.60

  let loading = true
  let summaryCards = { totalTokens: 0, costBrl: 0, uniqueCompanies: 0, avgTokensPerCompany: 0 }
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

    const [logsRes, chatUsageRes, profilesRes] = await Promise.all([
      supabase
        .from('ai_usage_logs')
        .select('user_id, chat_type, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at')
        .gte('created_at', startOfMonth.toISOString()),
      supabase
        .from('zelochat_ai_usage_daily')
        .select('empresa_id, usage_date, feature, model, request_count, success_count, error_count, rate_limited_count, prompt_tokens, completion_tokens, total_tokens')
        .gte('usage_date', startOfMonth.toISOString().slice(0, 10)),
      supabase
        .from('empresa_perfil')
        .select('id, user_id, nome_exibicao, contato'),
    ])

    const logs = logsRes.data || []
    const chatUsage = chatUsageRes.data || []
    const profiles = profilesRes.data || []
    const profileByUser = {}
    const profileByEmpresa = {}
    for (const p of profiles) {
      if (p.user_id) profileByUser[p.user_id] = p
      if (p.id) profileByEmpresa[p.id] = p
    }

    // Summary
    const uniqueCompanySet = new Set()
    logs.filter(l => l.user_id).forEach(l => uniqueCompanySet.add(profileByUser[l.user_id]?.id || l.user_id))
    chatUsage.filter(l => l.empresa_id).forEach(l => uniqueCompanySet.add(l.empresa_id))

    const pdvTokens = logs.reduce((s, l) => s + (l.total_tokens || 0), 0)
    const chatTokens = chatUsage.reduce((s, l) => s + (l.total_tokens || 0), 0)
    const pdvCostUsd = logs.reduce((s, l) => s + (Number(l.cost_usd) || 0), 0)
    const chatCostUsd = chatUsage.reduce((s, l) => s + estimateChatUsageUsd(l), 0)

    summaryCards.totalTokens = pdvTokens + chatTokens
    summaryCards.costBrl = (pdvCostUsd + chatCostUsd) * USD_TO_BRL
    summaryCards.uniqueCompanies = uniqueCompanySet.size
    summaryCards.avgTokensPerCompany = uniqueCompanySet.size > 0
      ? Math.round(summaryCards.totalTokens / uniqueCompanySet.size) : 0

    // Per-company aggregation
    const companyMap = {}
    function ensureCompany(key, profile = null) {
      if (!companyMap[key]) {
        companyMap[key] = {
          key,
          profile,
          support: 0,
          assistant: 0,
          zelochat: 0,
          totalTokens: 0,
          costUsd: 0,
          errors: 0,
          rateLimited: 0,
        }
      }
      if (!companyMap[key].profile && profile) companyMap[key].profile = profile
      return companyMap[key]
    }

    for (const log of logs) {
      const profile = profileByUser[log.user_id] || null
      const key = profile?.id || log.user_id || '__support__'
      const row = ensureCompany(key, profile)
      if (log.chat_type === 'support') row.support++
      else row.assistant++
      row.totalTokens += log.total_tokens || 0
      row.costUsd += Number(log.cost_usd) || 0
    }

    for (const usage of chatUsage) {
      const key = usage.empresa_id || '__unknown_chat__'
      const row = ensureCompany(key, profileByEmpresa[key] || null)
      row.zelochat += usage.request_count || 0
      row.totalTokens += usage.total_tokens || 0
      row.costUsd += estimateChatUsageUsd(usage)
      row.errors += usage.error_count || 0
      row.rateLimited += usage.rate_limited_count || 0
    }

    perUserRows = Object.values(companyMap).sort((a, b) => b.totalTokens - a.totalTokens).map(r => ({
      ...r,
      costBrl: r.costUsd * USD_TO_BRL,
    }))

    // Build daily data for chart (last 30 days)
    dailyChartData = buildDailyData(logs, chatUsage, thirtyDaysAgo)
  }

  function estimateChatUsageUsd(row) {
    const model = String(row.model || '').toLowerCase()
    if (!model.includes('gpt-4o-mini')) return 0
    return ((row.prompt_tokens || 0) / 1_000_000) * GPT_4O_MINI_INPUT_PER_1M
      + ((row.completion_tokens || 0) / 1_000_000) * GPT_4O_MINI_OUTPUT_PER_1M
  }

  function buildDailyData(logs, chatUsage, since) {
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
      const isoDay = day.toISOString().slice(0, 10)
      const chatDayLogs = chatUsage.filter(l => l.usage_date === isoDay)
      const dayTokens = dayLogs.reduce((s, l) => s + (l.total_tokens || 0), 0)
        + chatDayLogs.reduce((s, l) => s + (l.total_tokens || 0), 0)
      const dayCostUsd = dayLogs.reduce((s, l) => s + (Number(l.cost_usd) || 0), 0)
        + chatDayLogs.reduce((s, l) => s + estimateChatUsageUsd(l), 0)
      tokenData.push(dayTokens)
      costData.push(Number((dayCostUsd * USD_TO_BRL).toFixed(4)))
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
      <p class="text-slate-400 text-sm font-medium">Consumo de tokens, custo estimado e breakdown por empresa (mês atual)</p>
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
        <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Empresas com Uso</div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{summaryCards.uniqueCompanies}</div>
        <div class="mt-2 text-xs font-medium text-indigo-400/60">PDV + ZeloChat</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-sky-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400/0 via-sky-500 to-sky-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Média Tokens/Empresa</div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{summaryCards.avgTokensPerCompany.toLocaleString('pt-BR')}</div>
        <div class="mt-2 text-xs font-medium text-sky-400/60">Empresas com consumo</div>
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
        <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Breakdown por Empresa</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 bg-slate-900/60">
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Empresa</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Suporte</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Assistente PDV</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">ZeloChat</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total Tokens</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Custo R$</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/50">
            {#each perUserRows as row (row.key)}
              <tr class="hover:bg-slate-800/30 transition-colors">
                <td class="py-3 px-6">
                  {#if row.key === '__support__'}
                    <span class="text-sm text-slate-400 italic">Visitantes (sem conta)</span>
                  {:else}
                    <div>
                      <p class="text-sm font-medium text-slate-200">{row.profile?.nome_exibicao || 'Sem nome'}</p>
                      <p class="text-xs text-slate-500">{row.profile?.contato || row.key.slice(0, 12) + '...'}</p>
                    </div>
                  {/if}
                </td>
                <td class="py-3 px-6 text-xs text-slate-400 text-center">{row.support}</td>
                <td class="py-3 px-6 text-xs text-slate-400 text-center">{row.assistant}</td>
                <td class="py-3 px-6 text-xs text-slate-400 text-center">
                  {row.zelochat}
                  {#if row.errors || row.rateLimited}
                    <span class="ml-1 text-[10px] text-amber-400">({row.errors} err, {row.rateLimited} limit)</span>
                  {/if}
                </td>
                <td class="py-3 px-6 text-sm text-white font-medium text-right">{row.totalTokens.toLocaleString('pt-BR')}</td>
                <td class="py-3 px-6 text-sm text-violet-400 font-medium text-right">R$ {row.costBrl.toLocaleString('pt-BR', {minimumFractionDigits: 4, maximumFractionDigits: 4})}</td>
              </tr>
            {:else}
              <tr>
                <td colspan="6" class="py-12 text-center text-slate-500 text-sm">Nenhum uso de IA registrado este mês.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

  {/if}
</div>
