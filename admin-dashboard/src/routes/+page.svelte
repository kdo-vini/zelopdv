<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { fade } from 'svelte/transition'
  import { subscriptionValue } from '$lib/pricing'
  import { getEffectiveExpiry, isSubscriptionExpired } from '$lib/subscriptionHelpers'
  import { INTERNAL_ACCOUNT_LABELS, filterExternalAccounts, isInternalAccount } from '$lib/internalAccounts'
  import { logAdminAction } from '$lib/logger'
  
  let stats = {
    activeSubscriptions: 0,
    realMrr: 0,
    trialPipelineValue: 0,
    paidSubscriptions: 0,
    trialSubscriptions: 0,
    inactiveSubscriptions: 0,
    internalAccountsExcluded: 0,
    expiringSoon: 0,
    newThisMonth: 0,
    dau: 0,
    wau: 0,
    aiCostBrl: 0,
    churnPct: 0,
  }

  let loading = true
  let savingFinanceExpense = false
  let adminInfo = null
  const internalAccountsLabel = INTERNAL_ACCOUNT_LABELS.join(', ')
  let fixedExpenses = []
  let expenseDraft = { label: '', amount: '' }

  $: fixedMonthlyCosts = fixedExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  $: arr = stats.realMrr * 12
  $: monthlyProfit = stats.realMrr - fixedMonthlyCosts
  $: projections = [3, 6, 12].map((months) => ({
    months,
    revenue: stats.realMrr * months,
    expenses: fixedMonthlyCosts * months,
    profit: monthlyProfit * months,
  }))
  $: canAddExpense = expenseDraft.label.trim().length > 0 && Number(expenseDraft.amount) >= 0

  onMount(async () => {
    await loadAdminInfo()
    await Promise.all([loadStats(), loadFixedExpenses()])
    loading = false
  })

  function formatCurrency(value) {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  async function loadAdminInfo() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return

    const { data } = await supabase
      .from('super_admins')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .maybeSingle()

    adminInfo = data || null
  }

  async function loadFixedExpenses() {
    const { data, error } = await supabase
      .from('admin_finance_fixed_expenses')
      .select('id, label, amount, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Dashboard] Failed to load fixed expenses:', error)
      fixedExpenses = []
      return
    }

    fixedExpenses = (data || []).map((item) => ({
      ...item,
      amount: Number(item.amount) || 0,
    }))
  }

  async function addFixedExpense() {
    if (!canAddExpense || savingFinanceExpense) return

    try {
      savingFinanceExpense = true

      const payload = {
        label: expenseDraft.label.trim(),
        amount: Math.round((Number(expenseDraft.amount) || 0) * 100) / 100,
        created_by: adminInfo?.id || null,
        updated_by: adminInfo?.id || null,
      }

      const { data, error } = await supabase
        .from('admin_finance_fixed_expenses')
        .insert(payload)
        .select('id, label, amount, created_at')
        .single()

      if (error) throw error

      fixedExpenses = [{ ...data, amount: Number(data?.amount) || 0 }, ...fixedExpenses]
      expenseDraft = { label: '', amount: '' }

      if (adminInfo?.id) {
        await logAdminAction({
          adminId: adminInfo.id,
          action: 'create_admin_finance_fixed_expense',
          details: {
            label: payload.label,
            amount: payload.amount,
          },
        })
      }
    } catch (err) {
      console.error('[Dashboard] Failed to add fixed expense:', err)
      alert('Erro ao adicionar despesa fixa.')
    } finally {
      savingFinanceExpense = false
    }
  }

  async function removeFixedExpense(expense) {
    if (!expense?.id) return

    try {
      const { error } = await supabase
        .from('admin_finance_fixed_expenses')
        .delete()
        .eq('id', expense.id)

      if (error) throw error

      fixedExpenses = fixedExpenses.filter((item) => item.id !== expense.id)

      if (adminInfo?.id) {
        await logAdminAction({
          adminId: adminInfo.id,
          action: 'delete_admin_finance_fixed_expense',
          details: {
            expense_id: expense.id,
            label: expense.label,
            amount: expense.amount,
          },
        })
      }
    } catch (err) {
      console.error('[Dashboard] Failed to remove fixed expense:', err)
      alert('Erro ao remover despesa fixa.')
    }
  }

  function isCurrentlyPaid(sub) {
    return sub?.status === 'active' && !isSubscriptionExpired(sub)
  }

  function isCurrentlyTrialing(sub) {
    return sub?.status === 'trialing' && !isSubscriptionExpired(sub)
  }

  function sumSubscriptionValues(subscriptions = []) {
    return subscriptions.reduce((sum, sub) => sum + subscriptionValue(sub), 0)
  }

  async function loadStats() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('id, user_id, status, current_period_end, manually_extended_until, created_at, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon')

    const allSubs = subs || []
    const externalSubs = filterExternalAccounts(allSubs)
    const paidSubs = externalSubs.filter(isCurrentlyPaid)
    const trialSubs = externalSubs.filter(isCurrentlyTrialing)
    const accessibleSubs = [...paidSubs, ...trialSubs]
    const inactiveSubs = externalSubs.filter((sub) => !isCurrentlyPaid(sub) && !isCurrentlyTrialing(sub))
    const internalSubs = allSubs.filter((sub) => isInternalAccount(sub))

    stats.activeSubscriptions = accessibleSubs.length
    stats.paidSubscriptions = paidSubs.length
    stats.trialSubscriptions = trialSubs.length
    stats.inactiveSubscriptions = inactiveSubs.length
    stats.internalAccountsExcluded = internalSubs.length
    stats.realMrr = sumSubscriptionValues(paidSubs)
    stats.trialPipelineValue = sumSubscriptionValues(trialSubs)

    stats.newThisMonth = accessibleSubs.filter(s =>
      new Date(s.created_at) >= startOfMonth
    ).length

    // "Expiring soon" must respect manually_extended_until — otherwise a
    // sub with current_period_end in the next 7 days but a manual extension
    // beyond that window incorrectly inflates this metric and triggers
    // unnecessary admin attention.
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000)
    stats.expiringSoon = accessibleSubs.filter(s => {
      const expiry = getEffectiveExpiry(s)
      return expiry && expiry <= sevenDaysFromNow && expiry > now
    }).length

    // DAU / WAU — uses GREATEST(last_seen_at, auth.last_sign_in_at) via security definer fn
    const { data: lastSeenData } = await supabase.rpc('admin_get_users_last_seen')
    const externalLastSeen = filterExternalAccounts(lastSeenData || [])

    stats.dau = externalLastSeen.filter(p => p.effective_last_seen && new Date(p.effective_last_seen) >= today).length
    stats.wau = externalLastSeen.filter(p => p.effective_last_seen && new Date(p.effective_last_seen) >= sevenDaysAgo).length

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
      .select('id, user_id')
      .eq('status', 'canceled')
      .gte('updated_at', startOfMonth.toISOString())

    const canceledCount = filterExternalAccounts(canceledThisMonth || []).length
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
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">MRR Real</div>
          <div class="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">
          R$ {stats.realMrr.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}
        </div>
        <div class="mt-2 text-xs font-medium text-emerald-400/60">Sem trials e sem contas internas</div>
      </div>
      
      <!-- Active Subs Card -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-sky-500/30 transition-colors">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400/0 via-sky-500 to-sky-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Contas com Acesso</div>
          <div class="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-white tracking-tight">{stats.activeSubscriptions}</div>
        <div class="mt-2 text-xs font-medium text-sky-400/60">Pagas + trial, sem contas internas</div>
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

    <section class="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm overflow-hidden relative" in:fade={{delay: 125}}>
      <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent"></div>

      <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between mb-6">
        <div class="max-w-2xl">
          <h3 class="text-xl font-bold text-white tracking-wide">Painel Financeiro</h3>
          <p class="text-sm text-slate-400 mt-1">Receita real, base pagante, custos fixos e projeções de caixa em um só lugar, sem misturar trial com MRR.</p>
        </div>
        <div class="inline-flex items-center gap-2 self-start rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-300">
          <span class="w-2 h-2 rounded-full bg-sky-400"></span>
          {stats.internalAccountsExcluded} conta(s) interna(s) fora do calculo: {internalAccountsLabel}
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] gap-6">
        <div class="space-y-5">
          <div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
            <div class="bg-slate-950/80 border border-emerald-500/15 rounded-2xl p-5">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.22em]">MRR</div>
              <div class="mt-3 text-3xl font-extrabold text-white">R$ {formatCurrency(stats.realMrr)}</div>
              <div class="mt-2 text-xs text-emerald-400/70">Receita mensal recorrente real</div>
            </div>

            <div class="bg-slate-950/80 border border-sky-500/15 rounded-2xl p-5">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.22em]">ARR</div>
              <div class="mt-3 text-3xl font-extrabold text-white">R$ {formatCurrency(arr)}</div>
              <div class="mt-2 text-xs text-sky-400/70">Run rate anual da base atual</div>
            </div>

            <div class="bg-slate-950/80 border border-violet-500/15 rounded-2xl p-5">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.22em]">Valor em Trial</div>
              <div class="mt-3 text-3xl font-extrabold text-white">R$ {formatCurrency(stats.trialPipelineValue)}</div>
              <div class="mt-2 text-xs text-violet-400/70">Potencial de conversao, ainda nao entra em MRR</div>
            </div>

            <div class={`bg-slate-950/80 border rounded-2xl p-5 ${monthlyProfit >= 0 ? 'border-emerald-500/15' : 'border-rose-500/15'}`}>
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.22em]">Lucro do Mes</div>
              <div class="mt-3 text-3xl font-extrabold text-white">R$ {formatCurrency(monthlyProfit)}</div>
              <div class={`mt-2 text-xs ${monthlyProfit >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                MRR menos custos fixos cadastrados
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Pagas</div>
              <div class="mt-2 text-2xl font-bold text-white">{stats.paidSubscriptions}</div>
              <div class="text-xs text-slate-400 mt-1">Contas pagantes ativas</div>
            </div>

            <div class="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Trial</div>
              <div class="mt-2 text-2xl font-bold text-white">{stats.trialSubscriptions}</div>
              <div class="text-xs text-slate-400 mt-1">Ainda em avaliacao</div>
            </div>

            <div class="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Inativas</div>
              <div class="mt-2 text-2xl font-bold text-white">{stats.inactiveSubscriptions}</div>
              <div class="text-xs text-slate-400 mt-1">Sem impacto no MRR atual</div>
            </div>

            <div class="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Custos Fixos</div>
              <div class="mt-2 text-2xl font-bold text-white">R$ {formatCurrency(fixedMonthlyCosts)}</div>
              <div class="text-xs text-slate-400 mt-1">Soma da lista salva no banco</div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            {#each projections as projection}
              <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                <div class="flex items-center justify-between">
                  <div class="text-sm font-semibold text-white">{projection.months} meses</div>
                  <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Projecao</div>
                </div>
                <div class="mt-4 space-y-3">
                  <div>
                    <div class="text-xs text-slate-500">Receita</div>
                    <div class="text-lg font-bold text-white">R$ {formatCurrency(projection.revenue)}</div>
                  </div>
                  <div>
                    <div class="text-xs text-slate-500">Custos fixos</div>
                    <div class="text-lg font-bold text-slate-200">R$ {formatCurrency(projection.expenses)}</div>
                  </div>
                  <div>
                    <div class="text-xs text-slate-500">Lucro projetado</div>
                    <div class={`text-xl font-extrabold ${projection.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      R$ {formatCurrency(projection.profit)}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <aside class="rounded-3xl border border-slate-800 bg-slate-950/85 p-5 lg:p-6">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-base font-bold text-white">Despesas Fixas</h4>
              <p class="text-sm text-slate-400 mt-1">Uma lista global de custos fixos, salva no banco e compartilhada entre navegadores, sem separar por mês.</p>
            </div>
            <div class="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              DB
            </div>
          </div>

          <div class="mt-5 grid grid-cols-1 gap-3">
            <input
              bind:value={expenseDraft.label}
              type="text"
              placeholder="Ex.: aluguel, folha, contador"
              class="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-sky-500/60"
            />
            <div class="flex gap-3">
              <input
                bind:value={expenseDraft.amount}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-sky-500/60"
              />
              <button
                type="button"
                on:click={addFixedExpense}
                disabled={!canAddExpense || savingFinanceExpense}
                class={`rounded-2xl px-4 py-3 text-sm font-semibold transition min-w-[120px] ${canAddExpense && !savingFinanceExpense ? 'bg-sky-500 text-slate-950 hover:bg-sky-400' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                {savingFinanceExpense ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
            <div class="text-xs text-slate-500">Adicione quantos itens quiser: aluguel, folha, internet, contador, sistema e outros custos fixos recorrentes.</div>
          </div>

          <div class="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Total fixo mensal</div>
                <div class="mt-2 text-2xl font-extrabold text-white">R$ {formatCurrency(fixedMonthlyCosts)}</div>
              </div>
              <div class="text-right">
                <div class="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Resultado</div>
                <div class={`mt-2 text-lg font-bold ${monthlyProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  R$ {formatCurrency(monthlyProfit)}
                </div>
              </div>
            </div>
          </div>

          <div class="mt-5 space-y-3 max-h-[320px] overflow-auto pr-1">
            {#if fixedExpenses.length === 0}
              <div class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center">
                <div class="text-sm font-medium text-slate-300">Nenhuma despesa fixa cadastrada</div>
                <div class="text-xs text-slate-500 mt-2">Adicione itens para o lucro e as projeções refletirem seus custos fixos reais.</div>
              </div>
            {:else}
              {#each fixedExpenses as expense}
                <div class="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-white truncate">{expense.label}</div>
                    <div class="text-xs text-slate-500 mt-1">Despesa fixa global</div>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <div class="text-sm font-bold text-slate-200">R$ {formatCurrency(expense.amount)}</div>
                    <button
                      type="button"
                      on:click={() => removeFixedExpense(expense)}
                      class="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <div class="mt-5 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5">
            <div class="text-sm font-medium text-slate-200">Como isso entra no painel</div>
            <div class="mt-3 space-y-2 text-xs text-slate-400">
              <div>MRR: considera apenas contas pagas ativas, sem trials e sem contas internas.</div>
              <div>ARR: `MRR x 12` com a base atual.</div>
              <div>Lucro do mês: `MRR - soma das despesas fixas`.</div>
              <div>Projeções 3/6/12 meses: repetem a mesma base de receita e a mesma lista fixa atual.</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
    
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
