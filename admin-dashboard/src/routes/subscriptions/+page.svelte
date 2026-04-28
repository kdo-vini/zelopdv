<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { logAdminAction } from '$lib/logger'
  import { success, error as errorToast } from '$lib/toast'
  import { fade, slide } from 'svelte/transition'
  import { PLANS, VALID_PLAN_TIERS, calculateValue, isAddonAllowed, planLabel, subscriptionValue } from '$lib/pricing'

  // Base do app principal (onde rodam os endpoints /api/admin/billing/*)
  const API_BASE = import.meta.env.DEV ? 'http://localhost:5173' : 'https://zelopdv.com.br'

  let subscriptions = []
  let loading = true
  let searchTerm = ''
  let filterStatus = 'all' // 'all', 'active', 'canceled', 'expired', 'expiring'
  let filterPlan = 'all' // 'all', 'pdv', 'chat', 'bundle'
  let adminInfo = null

  // Modal states
  let showExtendModal = false
  let showPlanModal = false
  let selectedSub = null
  let extendMonths = 1
  let extendReason = ''
  let extending = false
  let statusUpdating = false
  let planSaving = false
  let editPlanTier = 'pdv'
  let editMesasAddon = false
  
  onMount(async () => {
    await loadAdminInfo()
    await loadSubscriptions()
    loading = false
  })
  
  async function loadAdminInfo() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase
        .from('super_admins')
        .select('*')
        .eq('user_id', session.user.id)
        .single()
      adminInfo = data
    }
  }
  
  async function loadSubscriptions() {
    loading = true

    let query = supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })

    if (filterPlan !== 'all') {
      query = query.eq('plan_tier', filterPlan)
    }
    
    // Apply status filter
    if (filterStatus === 'active') {
      query = query.eq('status', 'active')
    } else if (filterStatus === 'canceled') {
      query = query.eq('status', 'canceled')
    } else if (filterStatus === 'expiring') {
      const sevenDaysFromNow = new Date()
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
      query = query
        .eq('status', 'active')
        .lte('current_period_end', sevenDaysFromNow.toISOString())
        .gte('current_period_end', new Date().toISOString())
    } else if (filterStatus === 'expired') {
      query = query
        .eq('status', 'active')
        .lt('current_period_end', new Date().toISOString())
    }
    
    const { data: subs, error } = await query
    
    if (error) {
      console.error('Error loading subscriptions:', error)
      subscriptions = []
      loading = false
      return
    }
    
    if (subs && subs.length > 0) {
      const userIds = subs.map(s => s.user_id)
      const { data: profiles, error: profileError } = await supabase
        .from('empresa_perfil')
        .select('user_id, nome_exibicao, contato, documento')
        .in('user_id', userIds)
      
      subscriptions = subs.map(sub => ({
        ...sub,
        empresa_perfil: profiles?.find(p => p.user_id === sub.user_id) || {
          nome_exibicao: 'Sem perfil',
          contato: 'N/A',
          documento: 'N/A'
        }
      }))
    } else {
      subscriptions = []
    }
    
    loading = false
  }
  
  function openExtendModal(sub) {
    selectedSub = sub
    extendMonths = 1
    extendReason = ''
    showExtendModal = true
  }

  function closeExtendModal() {
    showExtendModal = false
    selectedSub = null
    extendMonths = 1
    extendReason = ''
  }

  function openPlanModal(sub) {
    selectedSub = sub
    editPlanTier = sub.plan_tier || 'pdv'
    editMesasAddon = !!sub.has_mesas_addon
    showPlanModal = true
  }

  function closePlanModal() {
    showPlanModal = false
    selectedSub = null
    editPlanTier = 'pdv'
    editMesasAddon = false
  }

  // Admin muda plano e addons. Para subs Stripe, chama endpoint que sincroniza com Stripe API
  // (igual o user faria via /assinatura). Para subs manual/sem provedor, update direto no DB.
  async function handleSavePlan() {
    if (!selectedSub || !VALID_PLAN_TIERS.includes(editPlanTier)) {
      errorToast('Plano inválido.')
      return
    }
    const finalMesas = isAddonAllowed(editPlanTier, 'mesas') && editMesasAddon

    if (editMesasAddon && !isAddonAllowed(editPlanTier, 'mesas')) {
      const confirm1 = confirm(`O plano ${planLabel(editPlanTier)} não suporta o Módulo Mesas. Vamos desativar o add-on. Continuar?`)
      if (!confirm1) return
    }

    try {
      planSaving = true
      const provider = selectedSub.payment_provider

      if (provider === 'stripe') {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          errorToast('Sessão expirada. Faça login novamente.')
          return
        }

        const res = await fetch(`${API_BASE}/api/admin/billing/sync-plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            subscriptionId: selectedSub.id,
            planTier: editPlanTier,
            hasMesasAddon: finalMesas,
          }),
        })
        const body = await res.json().catch(() => ({}))

        if (res.status === 422 && body.code === 'stripe_resource_missing') {
          const ok = confirm(
            `A subscription ${body.providerSubscriptionId || ''} não existe no Stripe (provavelmente ID legado de migração). ` +
            `Reclassificar como "manual" pra desbloquear edição direta no DB?`
          )
          if (ok) {
            await handleReclassifyManual(selectedSub, session.access_token)
          }
          return
        }

        if (!res.ok) {
          errorToast('Erro ao sincronizar com Stripe: ' + (body.error || res.statusText))
          return
        }

        await logAdminAction({
          adminId: adminInfo.id,
          action: 'admin_sync_plan_stripe',
          targetUserId: selectedSub.user_id,
          details: {
            subscription_id: selectedSub.id,
            old: { plan_tier: selectedSub.plan_tier, has_mesas_addon: selectedSub.has_mesas_addon },
            new: { plan_tier: editPlanTier, has_mesas_addon: finalMesas },
            stripe_updated: body.stripeUpdated,
          },
        })

        success(`Plano alterado para ${planLabel(editPlanTier)}${body.stripeUpdated ? ' (Stripe sincronizado)' : ' (sem mudança no Stripe)'}.`)
        closePlanModal()
        await loadSubscriptions()
        return
      }

      // Manual ou sem provedor: update direto no DB
      const updatePayload = {
        plan_tier: editPlanTier,
        has_mesas_addon: finalMesas,
        last_modified_by: adminInfo?.id || null,
        last_modified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('subscriptions')
        .update(updatePayload)
        .eq('id', selectedSub.id)

      if (error) throw error

      await logAdminAction({
        adminId: adminInfo.id,
        action: 'admin_change_plan_manual',
        targetUserId: selectedSub.user_id,
        details: {
          subscription_id: selectedSub.id,
          old: { plan_tier: selectedSub.plan_tier, has_mesas_addon: selectedSub.has_mesas_addon },
          new: { plan_tier: editPlanTier, has_mesas_addon: finalMesas },
          provider: provider || 'none',
        },
      })

      success(`Plano alterado para ${planLabel(editPlanTier)} (apenas no DB — sem provedor).`)
      closePlanModal()
      await loadSubscriptions()
    } catch (err) {
      console.error('Save plan error:', err)
      errorToast('Erro ao alterar plano: ' + err.message)
    } finally {
      planSaving = false
    }
  }

  async function handleReclassifyManual(sub, accessToken) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/reclassify-manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ subscriptionId: sub.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        errorToast('Erro ao reclassificar: ' + (body.error || res.statusText))
        return
      }
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'admin_reclassify_manual',
        targetUserId: sub.user_id,
        details: {
          subscription_id: sub.id,
          previous_provider: body.previousProvider,
          previous_provider_sub_id: body.previousProviderSubId,
        },
      })
      success(`Subscription reclassificada como manual. Provedor anterior (${body.previousProvider}) limpo.`)
      closePlanModal()
      await loadSubscriptions()
    } catch (err) {
      console.error('Reclassify error:', err)
      errorToast('Erro ao reclassificar: ' + err.message)
    }
  }
  
  async function handleExtendSubscription() {
    if (!selectedSub || !extendReason.trim()) {
      errorToast('Por favor, preencha o motivo do pagamento')
      return
    }
    
    extending = true
    
    try {
      const { data, error } = await supabase.rpc('admin_extend_subscription', {
        p_subscription_id: selectedSub.id,
        p_months: extendMonths,
        p_reason: extendReason,
        p_admin_id: adminInfo.id
      })
      
      if (error) throw error
      
      if (data.error) {
        errorToast(data.error)
      } else {
        const wasExpired = data.was_expired ? ' (assinatura estava expirada)' : '';
        success(`Pagamento registrado! Nova expiração: ${new Date(data.new_expiry).toLocaleDateString('pt-BR')}${wasExpired}`)
        closeExtendModal()
        await loadSubscriptions()
      }
    } catch (err) {
      console.error('Error extending subscription:', err)
      errorToast('Erro ao registrar pagamento')
    } finally {
      extending = false
    }
  }
  
  async function handleCancelSubscription(sub) {
    if (!confirm(`Têm certeza que deseja cancelar a assinatura de ${sub.empresa_perfil.nome_exibicao}?`)) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          current_period_end: new Date().toISOString(), // Expira data imediatamente
          last_modified_by: adminInfo.id,
          last_modified_at: new Date().toISOString()
        })
        .eq('id', sub.id)
      
      if (error) throw error
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'cancel_subscription',
        targetUserId: sub.user_id,
        details: { subscription_id: sub.id, company: sub.empresa_perfil.nome_exibicao }
      })
      
      success('Assinatura cancelada com sucesso')
      await loadSubscriptions()
    } catch (err) {
      console.error('Error canceling subscription:', err)
      errorToast('Erro ao cancelar assinatura')
    }
  }
  
  async function handleReactivateSubscription(sub) {
    if (!confirm(`Reativar assinatura de ${sub.empresa_perfil.nome_exibicao}?`)) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          last_modified_by: adminInfo.id,
          last_modified_at: new Date().toISOString()
        })
        .eq('id', sub.id)
      
      if (error) throw error
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'reactivate_subscription',
        targetUserId: sub.user_id,
        details: { subscription_id: sub.id, company: sub.empresa_perfil.nome_exibicao }
      })
      
      success('Assinatura reativada com sucesso')
      await loadSubscriptions()
    } catch (err) {
      console.error('Error reactivating subscription:', err)
      errorToast('Erro ao reativar assinatura')
    }
  }

  async function handleUpdateStatus(sub, newStatus) {
    if (sub.status === newStatus) return
    
    try {
      statusUpdating = true
      const updateData = {
        status: newStatus,
        last_modified_by: adminInfo.id,
        last_modified_at: new Date().toISOString()
      }
      
      // Se cancelar manual, mata a data de expiração para travar o acesso
      if (newStatus === 'canceled') {
        updateData.current_period_end = new Date().toISOString()
      }

      const { error } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', sub.id)
      
      if (error) throw error
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'update_subscription_status',
        targetUserId: sub.user_id,
        details: { subscription_id: sub.id, old_status: sub.status, new_status: newStatus, company: sub.empresa_perfil.nome_exibicao }
      })
      
      success(`Status atualizado para ${newStatus}`)
      await loadSubscriptions()
    } catch (err) {
      console.error('Error updating status:', err)
      errorToast('Erro ao atualizar status')
    } finally {
      statusUpdating = false
    }
  }

  async function handleExtendTrialOnly(sub, days) {
    if (!confirm(`Estender TRIAL de ${sub.empresa_perfil.nome_exibicao} por ${days} dias?`)) return
    
    try {
      statusUpdating = true
      const currentEnd = new Date(sub.current_period_end)
      const baseDate = currentEnd < new Date() ? new Date() : currentEnd
      const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)
      
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'trialing',
          current_period_end: newEnd.toISOString(),
          last_modified_by: adminInfo.id,
          last_modified_at: new Date().toISOString()
        })
        .eq('id', sub.id)
      
      if (error) throw error
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'extend_trial',
        targetUserId: sub.user_id,
        details: { subscription_id: sub.id, days, new_expiry: newEnd.toISOString(), company: sub.empresa_perfil.nome_exibicao }
      })
      
      success(`Trial estendido até ${newEnd.toLocaleDateString('pt-BR')}`)
      await loadSubscriptions()
    } catch (err) {
      console.error('Error extending trial:', err)
      errorToast('Erro ao estender trial')
    } finally {
      statusUpdating = false
    }
  }
  
  function getStatusBadge(sub) {
    const isExpired = new Date(sub.current_period_end) < new Date()
    
    if (sub.status === 'active' && isExpired) {
      return { text: 'EXPIRADA', class: 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]' }
    }
    
    const badges = {
      active: { text: 'ATIVA', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]' },
      canceled: { text: 'CANCELADA', class: 'bg-slate-500/10 text-slate-400 border-slate-500/20 shadow-[0_0_8px_rgba(100,116,139,0.1)]' },
      past_due: { text: 'VENCIDA', class: 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_8px_rgba(249,115,22,0.1)]' },
      trialing: { text: 'TRIAL', class: 'bg-sky-500/10 text-sky-400 border-sky-500/20 shadow-[0_0_8px_rgba(14,165,233,0.1)]' }
    }
    return badges[sub.status] || { text: sub.status.toUpperCase(), class: 'bg-slate-700 text-slate-300 border-slate-600' }
  }
  
  function getDaysUntilExpiry(date) {
    const expiry = new Date(date)
    const now = new Date()
    const diff = expiry - now
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days
  }

  function getInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  
  $: filteredSubscriptions = subscriptions.filter(sub => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      sub.empresa_perfil.nome_exibicao?.toLowerCase().includes(search) ||
      sub.empresa_perfil.contato?.toLowerCase().includes(search) ||
      sub.empresa_perfil.documento?.toLowerCase().includes(search)
    )
  })
</script>

<svelte:head>
  <title>Assinaturas - Zelo Admin</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
  
  <!-- Sleek Header Area -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
    <div class="relative">
      <h2 class="text-3xl font-extrabold tracking-tight text-white mb-1">Subscriptions</h2>
      <p class="text-slate-400 text-sm font-medium">Controle de faturamento, trials e cancelamentos.</p>
      <!-- Accent Glow Line -->
      <div class="absolute -bottom-6 left-0 w-16 h-[2px] bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
    </div>
    
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      
      <!-- Plan Filter -->
      <div class="relative group w-full sm:w-auto">
        <select
          bind:value={filterPlan}
          on:change={loadSubscriptions}
          class="w-full sm:w-40 appearance-none pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-sm font-medium text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
        >
          <option value="all">Todos planos</option>
          <option value="pdv">ZeloPDV</option>
          <option value="chat">ZeloChat</option>
          <option value="bundle">Pacote G+A</option>
        </select>
        <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
          <svg class="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>

      <!-- Status Filter -->
      <div class="relative group w-full sm:w-auto">
        <select
          bind:value={filterStatus}
          on:change={loadSubscriptions}
          class="w-full sm:w-48 appearance-none pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-sm font-medium text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
        >
          <option value="all">Todas</option>
          <option value="active">Ativas</option>
          <option value="expired">🚨 Expiradas</option>
          <option value="expiring">⚠️ Em &lt; 7 Dias</option>
          <option value="canceled">Canceladas</option>
        </select>
        <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
          <svg class="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>

      <!-- Search Box -->
      <div class="relative group w-full sm:w-72">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Busca (Email/Doc)"
          class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
        />
      </div>
      
      <button
        on:click={loadSubscriptions}
        class="flex items-center justify-center shrink-0 w-11 h-11 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
        title="Atualizar"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  </div>
  
  <!-- Content Area -->
  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4" in:fade>
      <div class="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      <div class="text-sm font-medium text-slate-400">Verificando dados de assinaturas...</div>
    </div>
  {:else if filteredSubscriptions.length === 0}
    <div class="flex flex-col items-center justify-center py-24 px-4 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30" in:fade>
      <div class="w-16 h-16 mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
        <svg class="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      </div>
      <h3 class="text-lg font-medium text-slate-300">Nada encontrado.</h3>
      <p class="text-sm text-slate-500 mt-1">Sua busca ou filtro atual não resultaram em assinaturas.</p>
    </div>
  {:else}
    <!-- Desktop Table View -->
    <div class="hidden md:block overflow-hidden bg-slate-900/40 border border-slate-800/60 rounded-2xl shadow-xl backdrop-blur-sm" in:fade>
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-800 bg-slate-900/80">
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cliente</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Plano</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Vence em</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Criado em</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Ações Rápidas</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/50">
          {#each filteredSubscriptions as sub (sub.id)}
            {@const badge = getStatusBadge(sub)}
            {@const daysLeft = getDaysUntilExpiry(sub.current_period_end)}
            {@const isExpiringSoon = sub.status === 'active' && daysLeft <= 7 && daysLeft > 0}
            {@const isExpired = new Date(sub.current_period_end) < new Date()}
            
            <tr class="group hover:bg-slate-800/30 transition-colors">
              <td class="py-4 px-6">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-white shadow-inner shrink-0">
                    {getInitials(sub.empresa_perfil.nome_exibicao)}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{sub.empresa_perfil.nome_exibicao || 'S/N'}</p>
                    <p class="text-xs text-slate-500 truncate mt-0.5">{sub.empresa_perfil.contato}</p>
                  </div>
                </div>
              </td>
              <td class="py-4 px-6">
                <button
                  on:click={() => openPlanModal(sub)}
                  class="inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-md border border-slate-700/40 hover:border-slate-600 hover:bg-slate-800/40 transition-all text-left"
                  title="Mudar plano/addons"
                >
                  <span class="text-[11px] font-semibold tracking-wide {sub.plan_tier === 'bundle' ? 'text-indigo-300' : sub.plan_tier === 'chat' ? 'text-violet-300' : 'text-sky-300'}">
                    {planLabel(sub.plan_tier || 'pdv')}
                  </span>
                  {#if sub.has_mesas_addon}
                    <span class="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">+Mesas</span>
                  {/if}
                </button>
              </td>
              <td class="py-4 px-6 text-[13px] font-mono text-slate-300">
                R$ {subscriptionValue(sub).toFixed(2)}
              </td>
              <td class="py-4 px-6">
                <span class="inline-flex px-2 py-0.5 text-[10px] font-bold tracking-wide rounded-md border {badge.class}">
                  {badge.text}
                </span>
              </td>
              <td class="py-4 px-6 text-[13px]">
                <div class="{isExpired ? 'text-rose-400 font-semibold' : isExpiringSoon ? 'text-amber-400 font-semibold' : 'text-slate-300'}">
                  {new Date(sub.current_period_end).toLocaleDateString('pt-BR')}
                </div>
                {#if sub.status === 'active'}
                  <div class="text-[11px] font-medium mt-0.5 {isExpired ? 'text-rose-400/80' : isExpiringSoon ? 'text-amber-400/80' : 'text-slate-500'}">
                    {#if isExpired}
                      Em atraso há {Math.abs(daysLeft)}d
                    {:else}
                      Restam {daysLeft} dias
                    {/if}
                  </div>
                {/if}
              </td>
              <td class="py-4 px-6 text-[13px] text-slate-400">
                {new Date(sub.created_at).toLocaleDateString('pt-BR')}
              </td>
              <td class="py-4 px-6 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  
                  <!-- Status Quick Change -->
                  <div class="relative group/status mr-2">
                    <select 
                      value={sub.status} 
                      on:change={(e) => handleUpdateStatus(sub, e.target.value)}
                      disabled={statusUpdating}
                      class="appearance-none bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-600 focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                    >
                      <option value="active">ACTIVE</option>
                      <option value="trialing">TRIAL</option>
                      <option value="past_due">PAST DUE</option>
                      <option value="canceled">CANCELED</option>
                    </select>
                  </div>

                  {#if sub.status === 'trialing' || new Date(sub.current_period_end) < new Date()}
                    <button 
                      on:click={() => handleExtendTrialOnly(sub, 7)}
                      disabled={statusUpdating}
                      class="px-2 py-1.5 text-[10px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg transition-all disabled:opacity-50"
                      title="Estender Trial +7 Dias"
                    >
                      +7D Trial
                    </button>
                  {/if}

                  {#if sub.status === 'active'}
                    <!-- Extend (Accept Manual Payment) -->
                    <button on:click={() => openExtendModal(sub)} class="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all" title="Registrar Pagamento / Extensão">
                       <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                       Renovar
                    </button>
                    <!-- Cancel -->
                    <button on:click={() => handleCancelSubscription(sub)} class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20" title="Cancelar Imediatamente">
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  {:else if sub.status === 'canceled'}
                    <!-- Reactivate -->
                    <button on:click={() => handleReactivateSubscription(sub)} class="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all" title="Reativar Inscrição">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                       Reativar
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile Stacked View -->
    <div class="md:hidden space-y-4" in:fade>
      {#each filteredSubscriptions as sub (sub.id)}
        {@const badge = getStatusBadge(sub)}
        {@const daysLeft = getDaysUntilExpiry(sub.current_period_end)}
        
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div class="flex justify-between items-start mb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-100">{sub.empresa_perfil.nome_exibicao || 'S/N'}</h3>
              <p class="text-xs text-slate-500 mt-0.5">{sub.empresa_perfil.contato}</p>
            </div>
            <span class="inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border {badge.class}">
              {badge.text}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-4 text-xs py-3 border-t border-slate-800 mt-2">
            <div>
              <span class="text-slate-500 block mb-0.5">Expiração:</span>
              <span class="text-slate-300 font-medium">{new Date(sub.current_period_end).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 border-t border-slate-800 pt-3 mt-1">
             {#if sub.status === 'active'}
              <button on:click={() => openExtendModal(sub)} class="flex-1 py-1.5 bg-emerald-500/10 text-emerald-400 font-medium text-xs rounded-lg border border-emerald-500/20">
                Prorrogar
              </button>
              <button on:click={() => handleCancelSubscription(sub)} class="px-2 py-1.5 bg-slate-800 text-rose-400 hover:text-rose-300 rounded-lg border border-slate-700">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
             {:else if sub.status === 'canceled'}
              <button on:click={() => handleReactivateSubscription(sub)} class="flex-1 py-1.5 bg-emerald-500/10 text-emerald-400 font-medium text-xs rounded-lg border border-emerald-500/20">
                Reativar
              </button>
             {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Extend Subscription Glass Modal -->
{#if showExtendModal && selectedSub}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-[#0B0F19]/80" transition:fade={{ duration: 200 }}>
    <div class="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden" transition:slide={{ duration: 300, axis: 'y' }}>
      
      <!-- Glow Header -->
      <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent"></div>
      
      <div class="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
        <h3 class="text-lg font-bold text-white tracking-wide">Renovação Manual</h3>
        <button on:click={closeExtendModal} class="text-slate-500 hover:text-white transition-colors outline-none"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
      
      <div class="p-6 space-y-6">
        
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Empresa Alvo</p>
          <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
             <div class="w-8 h-8 bg-sky-500/20 text-sky-400 flex items-center justify-center rounded-full font-bold text-xs">{getInitials(selectedSub.empresa_perfil.nome_exibicao)}</div>
             <div class="text-sm font-medium text-slate-200">{selectedSub.empresa_perfil.nome_exibicao}</div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
           <div>
              <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Status Atual</p>
              <div class="text-sm font-semibold text-rose-400">
                {new Date(selectedSub.current_period_end) < new Date() ? 'Expirada' : 'Ativa'}
              </div>
           </div>
           <div>
             <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Expira(va) em</p>
             <div class="text-sm font-semibold text-slate-300">{new Date(selectedSub.current_period_end).toLocaleDateString('pt-BR')}</div>
           </div>
        </div>
        
        <div>
          <label class="block text-[13px] font-medium text-slate-400 mb-2">Ciclo de Extensão</label>
          <div class="grid grid-cols-4 gap-2">
            {#each [1, 3, 6, 12] as months}
              <button
                on:click={() => extendMonths = months}
                class="py-2.5 rounded-xl border text-sm font-bold transition-all {extendMonths === months ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-300'}"
              >
                {months === 12 ? '1 Ano' : `${months}M`}
              </button>
            {/each}
          </div>
        </div>
        
        <div>
          <label class="block text-[13px] font-medium text-slate-400 mb-2">Motivo da inserção manual <span class="text-rose-400">*</span></label>
          <textarea
            bind:value={extendReason}
            rows="2"
            placeholder="Ex: Pagamento recebido via PIX..."
            class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner resize-none"
          ></textarea>
        </div>
        
      </div>
      
      <div class="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button on:click={closeExtendModal} disabled={extending} class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
        <button on:click={handleExtendSubscription} disabled={extending || !extendReason.trim()} class="px-5 py-2 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:shadow-none flex items-center gap-2">
          {extending ? 'Registrando...' : 'Confirmar Pgto'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Plan/Addon Change Modal -->
{#if showPlanModal && selectedSub}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-[#0B0F19]/80" transition:fade={{ duration: 200 }}>
    <div class="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden" transition:slide={{ duration: 300, axis: 'y' }}>
      <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent"></div>

      <div class="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
        <h3 class="text-lg font-bold text-white tracking-wide">Plano e Addons</h3>
        <button on:click={closePlanModal} class="text-slate-500 hover:text-white transition-colors outline-none"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>

      <div class="p-6 space-y-5">
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Empresa</p>
          <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div class="w-8 h-8 bg-indigo-500/20 text-indigo-400 flex items-center justify-center rounded-full font-bold text-xs">{getInitials(selectedSub.empresa_perfil.nome_exibicao)}</div>
            <div class="text-sm font-medium text-slate-200">{selectedSub.empresa_perfil.nome_exibicao}</div>
          </div>
        </div>

        <div>
          <label class="block text-[13px] font-medium text-slate-400 mb-2">Plano</label>
          <div class="grid grid-cols-3 gap-2">
            {#each VALID_PLAN_TIERS as tier}
              <button
                type="button"
                on:click={() => editPlanTier = tier}
                class="py-3 rounded-xl border text-xs font-bold transition-all {editPlanTier === tier ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-300'}"
              >
                <div class="text-[11px] mb-0.5">{PLANS[tier].name}</div>
                <div class="text-[9px] opacity-70">R$ {PLANS[tier].price}</div>
              </button>
            {/each}
          </div>
        </div>

        <div class="pt-4 border-t border-slate-800">
          <label class="flex items-center cursor-pointer group {!isAddonAllowed(editPlanTier, 'mesas') ? 'opacity-40 cursor-not-allowed' : ''}">
            <div class="relative flex items-center justify-center">
              <input
                type="checkbox"
                bind:checked={editMesasAddon}
                disabled={!isAddonAllowed(editPlanTier, 'mesas')}
                class="sr-only peer"
              />
              <div class="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
            </div>
            <div class="ml-3">
              <span class="text-sm font-medium text-slate-300">Módulo Mesas (+R$ 30/mês)</span>
              {#if !isAddonAllowed(editPlanTier, 'mesas')}
                <p class="text-[11px] text-amber-400 mt-0.5">Indisponível em {PLANS[editPlanTier].name} (precisa de PDV).</p>
              {/if}
            </div>
          </label>
        </div>

        <div class="pt-4 border-t border-slate-800 grid grid-cols-2 gap-4">
          <div>
            <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Valor atual</p>
            <div class="text-sm font-mono font-semibold text-slate-300">R$ {subscriptionValue(selectedSub).toFixed(2)}</div>
          </div>
          <div>
            <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Novo valor</p>
            <div class="text-sm font-mono font-semibold text-emerald-300">R$ {calculateValue(editPlanTier, { mesas: editMesasAddon && isAddonAllowed(editPlanTier, 'mesas') }).toFixed(2)}</div>
          </div>
        </div>

        {#if selectedSub.payment_provider === 'stripe'}
          <div class="rounded-lg p-3 bg-indigo-500/5 border border-indigo-500/30 text-[11px] text-indigo-300 leading-relaxed">
            <strong class="block">✅ Stripe será sincronizado</strong>
            Salvar vai chamar a API do Stripe pra atualizar o plano/addon. Mudança vale a partir do próximo ciclo (sem proration).
          </div>
        {:else if selectedSub.payment_provider === 'asaas'}
          <div class="rounded-lg p-3 bg-amber-500/5 border border-amber-500/30 text-[11px] text-amber-300 leading-relaxed">
            <strong class="block">⚠️ Mudança apenas no DB</strong>
            Provedor é Asaas (legado). Valor real cobrado <strong>não será atualizado</strong>. Use só pra correção administrativa.
          </div>
        {:else}
          <div class="rounded-lg p-3 bg-emerald-500/5 border border-emerald-500/30 text-[11px] text-emerald-300 leading-relaxed">
            ℹ️ Sem provedor — alteração 100% manual. Bom pra trials/cortesias.
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button on:click={closePlanModal} disabled={planSaving} class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
        <button on:click={handleSavePlan} disabled={planSaving} class="px-5 py-2 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-400 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.4)] disabled:opacity-50">
          {planSaving ? 'Salvando...' : 'Salvar Plano'}
        </button>
      </div>
    </div>
  </div>
{/if}
