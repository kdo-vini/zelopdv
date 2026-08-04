<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseClient'
  import { fade } from 'svelte/transition'
  import { METRIC_SETTINGS_TABLE, createMetricSettingsMap, getMetricAccountName, getMetricAccountStatus, isMetricIncluded } from '$lib/metricSettings'
  import { logAdminAction } from '$lib/logger'
  import { error as errorToast } from '$lib/toast'

  let loading = true
  let savingUserId = null
  let adminInfo = null
  let accounts = []
  let settingsByUserId = new Map()
  let search = ''
  let showExcludedOnly = false

  $: includedCount = accounts.filter((account) => account.includeInMetrics).length
  $: excludedCount = accounts.length - includedCount
  $: filteredAccounts = accounts.filter((account) => {
    const normalizedSearch = search.trim().toLowerCase()
    const matchesSearch = !normalizedSearch || [
      getMetricAccountName(account),
      account.email,
      account.contato,
    ].some((value) => (value || '').toLowerCase().includes(normalizedSearch))

    return matchesSearch && (!showExcludedOnly || !account.includeInMetrics)
  })

  onMount(async () => {
    try {
      await loadAdminInfo()
      await loadAccounts()
    } catch (err) {
      console.error('[Admin settings] Failed to load metric settings:', err)
      errorToast('Não foi possível carregar as configurações de métricas.')
    } finally {
      loading = false
    }
  })

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

  async function loadAccounts() {
    const [{ data: allUsers, error: usersError }, { data: settings, error: settingsError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      supabase.rpc('admin_get_all_auth_users'),
      supabase.from(METRIC_SETTINGS_TABLE).select('user_id, include_in_metrics, updated_at'),
      supabase.from('subscriptions').select('user_id, status, plan_tier, current_period_end, manually_extended_until'),
    ])

    if (usersError) throw usersError
    if (settingsError) throw settingsError
    if (subscriptionsError) throw subscriptionsError

    settingsByUserId = createMetricSettingsMap(settings || [])

    const subscriptionByUserId = new Map()
    for (const subscription of subscriptions || []) {
      if (!subscriptionByUserId.has(subscription.user_id)) {
        subscriptionByUserId.set(subscription.user_id, subscription)
      }
    }

    accounts = (allUsers || [])
      .map((account) => ({
        ...account,
        subscription: subscriptionByUserId.get(account.user_id) || null,
        includeInMetrics: isMetricIncluded(account.user_id, settingsByUserId),
      }))
      .sort((a, b) => getMetricAccountName(a).localeCompare(getMetricAccountName(b), 'pt-BR'))
  }

  async function toggleAccount(account) {
    if (!account?.user_id || savingUserId) return

    const includeInMetrics = !account.includeInMetrics

    try {
      savingUserId = account.user_id

      const { error } = await supabase
        .from(METRIC_SETTINGS_TABLE)
        .upsert({
          user_id: account.user_id,
          include_in_metrics: includeInMetrics,
          updated_by: adminInfo?.user_id || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (error) throw error

      accounts = accounts.map((item) => item.user_id === account.user_id
        ? { ...item, includeInMetrics }
        : item)
      settingsByUserId = new Map(settingsByUserId).set(account.user_id, {
        user_id: account.user_id,
        include_in_metrics: includeInMetrics,
      })

      if (adminInfo?.id) {
        await logAdminAction({
          adminId: adminInfo.id,
          action: 'update_admin_metric_company_scope',
          details: {
            user_id: account.user_id,
            company: getMetricAccountName(account),
            include_in_metrics: includeInMetrics,
          },
        })
      }
    } catch (err) {
      console.error('[Admin settings] Failed to update metric scope:', err)
      errorToast('Não foi possível salvar o escopo das métricas.')
    } finally {
      savingUserId = null
    }
  }

  function formatDate(value) {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('pt-BR')
  }
</script>

<svelte:head>
  <title>Configurações - Zelo Admin</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
  <div class="flex flex-col gap-5 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
    <div>
      <div class="text-xs font-semibold uppercase tracking-[0.24em] text-sky-400">Administrativo</div>
      <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-white">Configurações</h2>
      <p class="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-400">
        Defina quais empresas fazem parte das métricas globais do painel. A configuração vale para o financeiro e para os indicadores de uso e base.
      </p>
    </div>
    <a href="/" class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-sky-500/50 hover:text-white">
      Voltar ao dashboard
    </a>
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center space-y-4 py-24" in:fade>
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-500"></div>
      <div class="text-sm font-medium text-slate-400">Carregando empresas...</div>
    </div>
  {:else}
    <section class="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/50 p-6 shadow-xl" in:fade>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 class="text-xl font-bold tracking-wide text-white">Escopo global das métricas</h3>
          <p class="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
            Empresas incluídas afetam MRR, ARR, ticket médio, assinaturas, trials, churn, DAU/WAU e demais indicadores calculados por conta. Novas empresas entram automaticamente.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3 text-center sm:min-w-[280px]">
          <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Incluídas</div>
            <div class="mt-1 text-2xl font-extrabold text-white">{includedCount}</div>
          </div>
          <div class="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Excluídas</div>
            <div class="mt-1 text-2xl font-extrabold text-white">{excludedCount}</div>
          </div>
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-3 md:flex-row">
        <input
          bind:value={search}
          type="search"
          placeholder="Buscar por empresa, e-mail ou contato"
          class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-hidden placeholder:text-slate-500 focus:border-sky-500/60"
        />
        <button
          type="button"
          on:click={() => showExcludedOnly = !showExcludedOnly}
          class={`rounded-2xl border px-4 py-3 text-sm font-semibold transition md:min-w-[190px] ${showExcludedOnly ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'}`}
        >
          {showExcludedOnly ? 'Mostrar todas' : 'Ver só excluídas'}
        </button>
      </div>

      <div class="mt-6 overflow-x-auto rounded-2xl border border-slate-800">
        <table class="min-w-full divide-y divide-slate-800 text-left">
          <thead class="bg-slate-950/80">
            <tr>
              <th class="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Empresa</th>
              <th class="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assinatura</th>
              <th class="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Período</th>
              <th class="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nas métricas</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/80 bg-slate-900/30">
            {#if filteredAccounts.length === 0}
              <tr>
                <td colspan="4" class="px-5 py-12 text-center text-sm text-slate-500">Nenhuma empresa encontrada.</td>
              </tr>
            {:else}
              {#each filteredAccounts as account (account.user_id)}
                <tr class="transition hover:bg-slate-800/30">
                  <td class="px-5 py-4">
                    <div class="font-semibold text-white">{getMetricAccountName(account)}</div>
                    <div class="mt-1 text-xs text-slate-500">{account.email || 'E-mail não informado'}</div>
                  </td>
                  <td class="px-5 py-4">
                    <div class="text-sm text-slate-200">{getMetricAccountStatus(account.subscription)}</div>
                    {#if account.subscription?.plan_tier}
                      <div class="mt-1 text-xs text-slate-500">Plano {account.subscription.plan_tier}</div>
                    {/if}
                  </td>
                  <td class="px-5 py-4 text-sm text-slate-400">
                    {account.subscription ? formatDate(account.subscription.manually_extended_until || account.subscription.current_period_end) : '—'}
                  </td>
                  <td class="px-5 py-4 text-right">
                    <button
                      type="button"
                      on:click={() => toggleAccount(account)}
                      disabled={savingUserId === account.user_id}
                      aria-pressed={account.includeInMetrics}
                      class={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${account.includeInMetrics ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/60' : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:border-amber-400/60'}`}
                    >
                      <span class={`h-2 w-2 rounded-full ${account.includeInMetrics ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                      {savingUserId === account.user_id ? 'Salvando...' : account.includeInMetrics ? 'Incluída' : 'Excluída'}
                    </button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <div class="mt-5 rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-4 text-xs leading-relaxed text-slate-400">
        <strong class="font-semibold text-slate-200">Regra padrão:</strong> toda conta nova é incluída automaticamente. Use “Excluída” para contas de teste, internas ou administrativas; a alteração fica salva no Supabase e vale para todos os administradores.
      </div>
    </section>
  {/if}
</div>
