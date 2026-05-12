<script>
  import { onMount, onDestroy } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { fade } from 'svelte/transition'

  let loading = true
  let profiles = []
  let subs = []
  let churnUsers = []

  // Chart instances
  let engagementCanvas, revenueCanvas
  let engagementChart, revenueChart

  // Funnel data
  let funnelData = { signups: 0, trialing: 0, converted: 0 }

  // Score tooltip
  let tooltipUser = null
  let tooltipPos = { x: 0, y: 0 }

  function showTooltip(event, user) {
    const rect = event.currentTarget.getBoundingClientRect()
    tooltipPos = { x: rect.left + rect.width / 2, y: rect.top }
    tooltipUser = user
  }

  function hideTooltip() {
    tooltipUser = null
  }

  function calcChurnReasons(profile, sub) {
    if (!sub || sub.status === 'canceled') return [{ label: 'Assinatura cancelada', points: 100 }]

    const reasons = []

    const dias = profile.effective_last_seen
      ? Math.floor((Date.now() - new Date(profile.effective_last_seen)) / 86400000) : 999

    if      (dias > 30) reasons.push({ label: `Sem acesso há ${dias} dias`, points: 45 })
    else if (dias > 14) reasons.push({ label: `Sem acesso há ${dias} dias`, points: 30 })
    else if (dias > 7)  reasons.push({ label: `Sem acesso há ${dias} dias`, points: 15 })
    else if (dias > 3)  reasons.push({ label: `Sem acesso há ${dias} dias`, points: 5 })

    if (sub.status === 'past_due') {
      reasons.push({ label: 'Pagamento atrasado', points: 40 })
    } else if (sub.status === 'trialing') {
      const daysLeft = sub.current_period_end
        ? Math.floor((new Date(sub.current_period_end) - Date.now()) / 86400000) : 0
      if (daysLeft <= 3 && (profile.sales_last_30d || 0) === 0)
        reasons.push({ label: `Trial vence em ${daysLeft}d sem uso`, points: 25 })
      else if (daysLeft <= 7 && (profile.sales_last_30d || 0) === 0)
        reasons.push({ label: `Trial vence em ${daysLeft}d sem uso`, points: 15 })
    }

    const vendas = profile.sales_last_30d || 0
    if      (vendas === 0)  reasons.push({ label: 'Zero vendas em 30 dias', points: 20 })
    else if (vendas < 10)  reasons.push({ label: `Apenas ${vendas} vendas em 30d`, points: 8 })

    return reasons
  }

  onMount(async () => {
    await loadData()
    loading = false
    await renderCharts()
  })

  onDestroy(() => {
    engagementChart?.destroy()
    revenueChart?.destroy()
  })

  async function loadData() {
    const [profilesRes, subsRes, lastSeenRes, salesRes, adminsRes] = await Promise.all([
      supabase.from('empresa_perfil').select('user_id, nome_exibicao, created_at'),
      supabase.from('subscriptions').select('user_id, status, created_at, current_period_end, updated_at'),
      supabase.rpc('admin_get_users_last_seen'),
      supabase.rpc('admin_get_sales_counts', { days_ago: 30 }),
      supabase.from('super_admins').select('user_id'),
    ])

    const adminIds = new Set((adminsRes.data || []).map(a => a.user_id))

    const lastSeenMap = {}
    for (const r of lastSeenRes.data || []) lastSeenMap[r.user_id] = r.effective_last_seen

    const salesMap = {}
    for (const v of salesRes.data || []) {
      salesMap[v.id_usuario] = Number(v.sales_count)
    }

    profiles = (profilesRes.data || [])
      .filter(p => !adminIds.has(p.user_id))
      .map(p => ({
        ...p,
        effective_last_seen: lastSeenMap[p.user_id] || null,
        sales_last_30d: salesMap[p.user_id] || 0,
      }))
    subs = (subsRes.data || []).filter(s => !adminIds.has(s.user_id))

    // Funnel
    funnelData.signups = profiles.length
    funnelData.trialing = subs.filter(s => s.status === 'trialing').length
    funnelData.converted = subs.filter(s => s.status === 'active').length

    // Churn risk table (all users with score)
    churnUsers = profiles.map(p => {
      const sub = subs.find(s => s.user_id === p.user_id)
      const score = calcChurnScore(p, sub)
      return { ...p, sub, score }
    }).sort((a, b) => b.score - a.score)
  }

  // Score: 0–99 (100 = já cancelou)
  // Fatores principais: inatividade, pagamento atrasado, adoção (vendas)
  // Trial em si NÃO penaliza — só penaliza se trial está vencendo sem uso
  function calcChurnScore(profile, sub) {
    if (!sub || sub.status === 'canceled') return 100

    let s = 0

    // Inatividade (sinal mais forte)
    const dias = profile.effective_last_seen
      ? Math.floor((Date.now() - new Date(profile.effective_last_seen)) / 86400000) : 999
    if      (dias > 30) s += 45
    else if (dias > 14) s += 30
    else if (dias > 7)  s += 15
    else if (dias > 3)  s += 5
    // < 3 dias = sem penalidade (usuário ativo)

    // Status de pagamento
    if (sub.status === 'past_due') {
      s += 40 // pagamento atrasado = risco crítico
    } else if (sub.status === 'trialing') {
      // Trial vencendo em breve SEM engajamento = risco
      const daysLeft = sub.current_period_end
        ? Math.floor((new Date(sub.current_period_end) - Date.now()) / 86400000) : 0
      if (daysLeft <= 3 && (profile.sales_last_30d || 0) === 0) s += 25
      else if (daysLeft <= 7 && (profile.sales_last_30d || 0) === 0) s += 15
    }

    // Adoção do produto (vendas registradas nos últimos 30 dias)
    const vendas = profile.sales_last_30d || 0
    if      (vendas === 0)  s += 20 // nunca usou o PDV
    else if (vendas < 10)  s += 8  // uso muito baixo
    // ≥ 10 vendas = sem penalidade

    return Math.min(99, s)
  }

  function churnBadge(score) {
    if (score === 100) return { label: 'Cancelado', cls: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' }
    if (score >= 50)  return { label: 'Alto',      cls: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' }
    if (score >= 20)  return { label: 'Médio',     cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' }
    return                   { label: 'Baixo',     cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
  }

  function formatLastSeen(ts) {
    if (!ts) return 'Nunca'
    const m = Math.floor((Date.now() - new Date(ts)) / 60000)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (m < 60) return `${m}min atrás`
    if (h < 24) return `${h}h atrás`
    return `${d} dias atrás`
  }

  // Build DAU/WAU/MAU arrays for the last 90 days
  function buildEngagementSeries() {
    const days = 90
    const now = new Date()
    const labels = []
    const dauData = [], wauData = [], mauData = []

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(now.getDate() - i)
      day.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day.getTime() + 86400000)

      labels.push(day.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }))

      const dau = profiles.filter(p => {
        if (!p.effective_last_seen) return false
        const t = new Date(p.effective_last_seen)
        return t >= day && t < dayEnd
      }).length
      dauData.push(dau)

      const wauStart = new Date(day.getTime() - 6 * 86400000)
      const wau = profiles.filter(p => {
        if (!p.effective_last_seen) return false
        const t = new Date(p.effective_last_seen)
        return t >= wauStart && t < dayEnd
      }).length
      wauData.push(wau)

      const mauStart = new Date(day.getTime() - 29 * 86400000)
      const mau = profiles.filter(p => {
        if (!p.effective_last_seen) return false
        const t = new Date(p.effective_last_seen)
        return t >= mauStart && t < dayEnd
      }).length
      mauData.push(mau)
    }

    // Only show every 7th label for readability
    const sparseLabels = labels.map((l, i) => (i % 7 === 0 ? l : ''))
    return { labels: sparseLabels, dauData, wauData, mauData }
  }

  // Build MRR by month (last 6 months)
  function buildMrrSeries() {
    const months = 6
    const now = new Date()
    const labels = [], mrrData = []

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const dEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }))

      // Count subscriptions active during that month
      const active = subs.filter(s => {
        const created = new Date(s.created_at)
        const end = new Date(s.current_period_end || dEnd)
        return created < dEnd && end >= d && s.status === 'active'
      }).length
      mrrData.push(active * 59)
    }
    return { labels, mrrData }
  }

  async function renderCharts() {
    if (typeof window === 'undefined') return
    try {
      const { Chart, LineController, LineElement, PointElement, LinearScale,
        CategoryScale, BarController, BarElement, Tooltip, Legend, Filler } = await import('chart.js')
      Chart.register(LineController, LineElement, PointElement, LinearScale,
        CategoryScale, BarController, BarElement, Tooltip, Legend, Filler)

      const { labels: engLabels, dauData, wauData, mauData } = buildEngagementSeries()
      const { labels: mrrLabels, mrrData } = buildMrrSeries()

      const gridColor = 'rgba(100,116,139,0.12)'
      const tickColor = '#64748b'
      const axisDefaults = {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 10 } },
      }

      if (engagementCanvas) {
        engagementChart = new Chart(engagementCanvas, {
          type: 'line',
          data: {
            labels: engLabels,
            datasets: [
              { label: 'DAU', data: dauData, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.08)', fill: true, tension: 0.3, pointRadius: 0 },
              { label: 'WAU', data: wauData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.3, pointRadius: 0 },
              { label: 'MAU', data: mauData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.3, pointRadius: 0 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
            scales: { x: axisDefaults, y: { ...axisDefaults, beginAtZero: true } },
          },
        })
      }

      if (revenueCanvas) {
        revenueChart = new Chart(revenueCanvas, {
          type: 'bar',
          data: {
            labels: mrrLabels,
            datasets: [
              { label: 'MRR (R$)', data: mrrData, backgroundColor: 'rgba(16,185,129,0.6)', borderColor: '#10b981', borderWidth: 1, borderRadius: 4 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8' } }, tooltip: { callbacks: { label: ctx => `R$ ${ctx.raw.toLocaleString('pt-BR')}` } } },
            scales: { x: axisDefaults, y: { ...axisDefaults, beginAtZero: true, ticks: { ...axisDefaults.ticks, callback: v => `R$ ${v}` } } },
          },
        })
      }
    } catch (err) {
      console.error('[Analytics] Chart error:', err)
    }
  }
</script>

<svelte:head>
  <title>Analytics - Zelo Admin</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">

  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
    <div class="relative">
      <h2 class="text-3xl font-extrabold tracking-tight text-white mb-1">Analytics</h2>
      <p class="text-slate-400 text-sm font-medium">Engajamento, receita e risco de churn por usuário</p>
      <div class="absolute -bottom-6 left-0 w-16 h-[2px] bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
    </div>
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4" in:fade>
      <div class="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div>
      <div class="text-sm font-medium text-slate-400">Carregando analytics...</div>
    </div>
  {:else}

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" in:fade={{delay: 100}}>

      <!-- Engagement Chart -->
      <div class="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-sm">
        <h3 class="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Engajamento — DAU / WAU / MAU (90 dias)</h3>
        <div class="h-64 relative">
          <canvas bind:this={engagementCanvas}></canvas>
        </div>
      </div>

      <!-- Revenue Chart -->
      <div class="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-sm">
        <h3 class="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Receita Mensal — MRR (6 meses)</h3>
        <div class="h-64 relative">
          <canvas bind:this={revenueCanvas}></canvas>
        </div>
      </div>

    </div>

    <!-- Funnel -->
    <div class="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-sm" in:fade={{delay: 150}}>
      <h3 class="text-sm font-semibold text-slate-300 mb-6 uppercase tracking-wider">Funil Trial → Ativo</h3>
      <div class="space-y-4">
        {#each [
          { label: 'Total de Signups', value: funnelData.signups, color: 'bg-sky-500', pct: 100 },
          { label: 'Trials Ativos', value: funnelData.trialing, color: 'bg-indigo-500', pct: funnelData.signups > 0 ? Math.round(funnelData.trialing / funnelData.signups * 100) : 0 },
          { label: 'Convertidos (Pagos)', value: funnelData.converted, color: 'bg-emerald-500', pct: funnelData.signups > 0 ? Math.round(funnelData.converted / funnelData.signups * 100) : 0 },
        ] as step}
          <div class="flex items-center gap-4">
            <div class="w-40 text-sm text-slate-400 shrink-0">{step.label}</div>
            <div class="flex-1 h-5 bg-slate-800 rounded-full overflow-hidden">
              <div class="{step.color} h-full rounded-full transition-all" style="width: {step.pct}%"></div>
            </div>
            <div class="w-20 text-right">
              <span class="text-white font-bold text-sm">{step.value}</span>
              <span class="text-slate-500 text-xs ml-1">({step.pct}%)</span>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Churn Risk Table -->
    <div class="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden backdrop-blur-sm" in:fade={{delay: 200}}>
      <div class="px-6 py-5 border-b border-slate-800">
        <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Tabela de Risco de Churn</h3>
        <p class="text-xs text-slate-500 mt-1">Ordenado por score de risco (maior primeiro)</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 bg-slate-900/60">
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuário</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Último Acesso</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Vendas 30d</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Score</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Risco</th>
              <th class="py-3 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ação</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/50">
            {#each churnUsers as user (user.user_id)}
              {@const badge = churnBadge(user.score)}
              <tr class="hover:bg-slate-800/30 transition-colors">
                <td class="py-3 px-6 text-sm text-slate-200">{user.nome_exibicao || user.user_id.slice(0, 8) + '…'}</td>
                <td class="py-3 px-6 text-xs text-slate-400">{formatLastSeen(user.effective_last_seen)}</td>
                <td class="py-3 px-6 text-xs text-slate-400">{user.sub?.status || '—'}</td>
                <td class="py-3 px-6 text-xs text-slate-400 text-right">{user.sales_last_30d ?? 0}</td>
                <td class="py-3 px-6 text-center cursor-help"
                    on:mouseenter={(e) => showTooltip(e, user)}
                    on:mouseleave={hideTooltip}>
                  <span class="text-sm font-bold text-white">{user.score === 100 ? '—' : user.score}</span>
                </td>
                <td class="py-3 px-6">
                  <span class="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded {badge.cls}">{badge.label}</span>
                </td>
                <td class="py-3 px-6">
                  <a href="/users" class="text-xs text-sky-400 hover:text-sky-300 transition-colors">Ver usuário →</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

  {/if}
</div>

{#if tooltipUser}
  <div class="fixed z-50 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-3 pointer-events-none"
       style="left: {tooltipPos.x}px; top: {tooltipPos.y}px; transform: translate(-50%, calc(-100% - 8px))">
    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fatores de risco</div>
    {#each calcChurnReasons(tooltipUser, tooltipUser.sub) as r}
      <div class="flex justify-between text-xs py-0.5">
        <span class="text-slate-300">{r.label}</span>
        <span class="font-bold text-rose-400">+{r.points}</span>
      </div>
    {/each}
    {#if calcChurnReasons(tooltipUser, tooltipUser.sub).length === 0}
      <p class="text-xs text-emerald-400">Sem fatores de risco</p>
    {/if}
    <div class="border-t border-slate-700 mt-2 pt-2 flex justify-between text-xs">
      <span class="text-slate-400">Score total</span>
      <span class="font-bold text-white">{tooltipUser.score === 100 ? 'Cancelado' : tooltipUser.score}</span>
    </div>
  </div>
{/if}
