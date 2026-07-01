<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseClient'
  import { logAdminAction } from '$lib/logger'
  import { success, error as errorToast } from '$lib/toast'
  import { confirmDialog } from '$lib/confirmDialog'
  import { fade, slide } from 'svelte/transition'
  import { PLANS, VALID_PLAN_TIERS, calculateValue, isAddonAllowed, planLabel, subscriptionValue } from '$lib/pricing'
  import { getEffectiveExpiry, getDaysUntilEffectiveExpiry, isSubscriptionExpired, hasActiveManualExtension, parseSubscriptionDate, formatSubscriptionDate, getEntitlement, getSubscriptionAdminStatus } from '$lib/subscriptionHelpers'
  import { generatePdfReport, formatBRL, formatNumber } from '$lib/pdfReport'

  // Base do app principal (onde rodam os endpoints /api/admin/billing/*)
  const API_BASE = import.meta.env.DEV ? 'http://localhost:5173' : 'https://www.zelopdv.com.br'

  let subscriptions = []
  let loading = true
  let searchTerm = ''
  let showFilters = false
  let filterStatus = 'all'
  let filterPlan = 'all' // 'all', 'pdv', 'chat', 'bundle'
  let filterProvider = 'all'
  let filterAddon = 'all'
  let filterEntitlement = 'all' // 'all', 'divergent', 'pdv_only', 'chat_only', 'both'
  let adminInfo = null

  const statusFilters = [
    { value: 'all', label: 'Todas' },
    { value: 'active', label: 'Ativas' },
    { value: 'trialing', label: 'Trial' },
    { value: 'trial_expired', label: 'Trial vencido' },
    { value: 'past_due', label: 'Past due' },
    { value: 'canceled', label: 'Canceladas' },
    { value: 'expired', label: 'Expiradas' },
    { value: 'expiring_7', label: 'Vencem em 7d' },
    { value: 'expiring_15', label: 'Vencem em 15d' },
    { value: 'expiring_30', label: 'Vencem em 30d' },
    { value: 'manual_extension', label: 'Com extensão' },
    { value: 'cancel_at_period_end', label: 'Cancela no fim' },
  ]

  const planFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'pdv', label: 'ZeloPDV' },
    { value: 'chat', label: 'ZeloChat' },
    { value: 'bundle', label: 'Pacote G+A' },
  ]

  const providerFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'manual', label: 'Manual' },
    { value: 'abacatepay', label: 'Abacate Pay' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'none', label: 'Sem provedor' },
  ]

  const addonFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'with_any', label: 'Com addon' },
    { value: 'none', label: 'Sem addon' },
    { value: 'mesas', label: 'Mesas' },
    { value: 'pedidos', label: 'Pedidos' },
    { value: 'acessos', label: 'Acessos' },
  ]

  const entitlementFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'divergent', label: 'Divergentes' },
    { value: 'pdv_only', label: 'Só PDV' },
    { value: 'chat_only', label: 'Só Chat' },
    { value: 'both', label: 'Ambos ativos' },
  ]

  // Modal states
  let showExtendModal = false
  let showPlanModal = false
  let selectedSub = null
  let extendTargetDate = ''
  let extendReason = ''
  let extending = false
  let statusUpdating = false
  let planSaving = false
  let editPlanTier = 'pdv'
  let editMesasAddon = false
  let editPedidosAddon = false
  let editAcessosAddon = false
  let editZeloMenuAddon = false
  
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

    const { data: admins } = await supabase.from('super_admins').select('user_id')
    const adminIds = new Set((admins || []).map(a => a.user_id))

    let query = supabase
      .from('subscriptions')
      .select(`
        id,
        user_id,
        status,
        current_period_end,
        manually_extended_until,
        created_at,
        updated_at,
        plan_tier,
        has_mesas_addon,
        has_pedidos_addon,
        has_acessos_addon,
        has_zelo_menu,
        payment_provider,
        provider_subscription_id,
        provider_customer_id,
        billing_type,
        cancel_at_period_end
      `)
      .order('created_at', { ascending: false })

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

      let merged = subs
        .filter(sub => !adminIds.has(sub.user_id))
        .map(sub => ({
          ...sub,
          empresa_perfil: profiles?.find(p => p.user_id === sub.user_id) || {
            nome_exibicao: 'Sem perfil',
            contato: 'N/A',
            documento: 'N/A'
          }
        }))

      subscriptions = merged
    } else {
      subscriptions = []
    }

    loading = false
  }
  
  function openExtendModal(sub) {
    selectedSub = sub
    extendReason = ''
    extendTargetDate = formatDateInputValue(getDefaultExtensionTargetDate(sub))
    showExtendModal = true
  }

  function closeExtendModal() {
    showExtendModal = false
    selectedSub = null
    extendTargetDate = ''
    extendReason = ''
  }

  let showPixModal = false
  let pixSub = null
  let pixResult = null
  let generatingPix = false
  let pixError = ''
  let pixWhatsappSent = false

  function openPixModal(sub) {
    pixSub = sub
    pixResult = null
    pixError = ''
    pixWhatsappSent = false
    showPixModal = true
  }

  function closePixModal() {
    showPixModal = false
    pixSub = null
    pixResult = null
    pixError = ''
    pixWhatsappSent = false
  }

  async function handlePixCreate() {
    if (!pixSub || generatingPix) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { pixError = 'Sessão expirada.'; return }

    generatingPix = true
    pixError = ''
    pixResult = null
    pixWhatsappSent = false

    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/pix/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: pixSub.user_id }),
      })
      const data = await res.json()

      if (!res.ok) {
        pixError = data.error || 'Falha ao gerar PIX.'
        return
      }

      pixResult = data
      pixWhatsappSent = !!data.whatsappSent
      if (data.whatsappError) pixError = data.whatsappError
    } catch (err) {
      pixError = err?.message || 'Erro de conexão ao gerar PIX.'
    } finally {
      generatingPix = false
    }
  }

  async function handleResendWhatsApp() {
    if (!pixResult?.payment?.brCode || !pixSub) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { pixError = 'Sessão expirada.'; return }

    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/pix/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: pixSub.user_id, resendOnly: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        pixError = data.error || 'Falha ao reenviar WhatsApp.'
        return
      }

      pixWhatsappSent = !!data.whatsappSent
      pixError = data.whatsappError || ''
    } catch (err) {
      pixError = err?.message || 'Erro de conexão ao reenviar WhatsApp.'
    }
  }

  function openPlanModal(sub) {
    selectedSub = sub
    editPlanTier = sub.plan_tier || 'pdv'
    editMesasAddon = !!sub.has_mesas_addon
    editPedidosAddon = !!sub.has_pedidos_addon
    editAcessosAddon = !!sub.has_acessos_addon
    editZeloMenuAddon = !!sub.has_zelo_menu
    showPlanModal = true
  }

  function closePlanModal() {
    showPlanModal = false
    selectedSub = null
    editPlanTier = 'pdv'
    editMesasAddon = false
    editPedidosAddon = false
    editAcessosAddon = false
  }

  function getProviderLabel(provider) {
    if (provider === 'stripe') return 'Stripe'
    if (provider === 'abacatepay') return 'Abacate Pay'
    if (provider === 'manual') return 'Manual'
    return 'Sem provedor'
  }

  function getProviderTone(provider) {
    if (provider === 'stripe') return 'text-indigo-300'
    if (provider === 'abacatepay') return 'text-emerald-300'
    if (provider === 'manual') return 'text-amber-300'
    return 'text-slate-300'
  }

  function getProviderPlanHint(sub) {
    const provider = sub?.payment_provider
    if (provider === 'stripe') {
      return {
        className: 'bg-indigo-500/5 border-indigo-500/30 text-indigo-300',
        title: 'Stripe será sincronizado',
        body: 'Salvar vai chamar a API do Stripe para atualizar plano e add-ons. Mudança vale no provedor e no banco.',
      }
    }
    if (provider === 'abacatepay') {
      return {
        className: 'bg-emerald-500/5 border-emerald-500/30 text-emerald-300',
        title: 'Abacate Pay identificado',
        body: 'Esta assinatura veio do fluxo Pix via Abacate Pay. Plano e add-ons serão ajustados só no banco; o provedor não mantém catálogo de assinatura para sincronizar.',
      }
    }
    if (provider === 'manual') {
      return {
        className: 'bg-amber-500/5 border-amber-500/30 text-amber-300',
        title: 'Assinatura manual',
        body: 'Alteração 100% manual no banco. Use para cortesias, migrações e clientes fora de automação.',
      }
    }
    return {
      className: 'bg-slate-500/5 border-slate-500/30 text-slate-300',
      title: 'Sem provedor vinculado',
      body: 'Essa linha está sem `payment_provider` no banco. A alteração será aplicada direto no DB.',
    }
  }

  function addDays(date, days) {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
  }

  function formatDateInputValue(value) {
    const date = parseSubscriptionDate(value)
    if (!date) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function getDefaultExtensionTargetDate(sub) {
    const base = getEffectiveExpiry(sub) || new Date()
    const reference = base > new Date() ? base : new Date()
    return addDays(reference, 30)
  }

  function getExtensionPreviewDate(sub) {
    if (!sub) return null
    return parseSubscriptionDate(extendTargetDate)
  }

  $: selectedSubProviderHint = selectedSub ? getProviderPlanHint(selectedSub) : null

  // Admin muda plano e addons. Para subs Stripe, chama endpoint que sincroniza com Stripe API
  // (igual o user faria via /assinatura). Para subs manual/sem provedor, update direto no DB.
  async function handleSavePlan() {
    if (!selectedSub || !VALID_PLAN_TIERS.includes(editPlanTier)) {
      errorToast('Plano inválido.')
      return
    }
    const finalMesas = isAddonAllowed(editPlanTier, 'mesas') && editMesasAddon
    const finalPedidos = isAddonAllowed(editPlanTier, 'pedidos') && editPedidosAddon
    const finalAcessos = isAddonAllowed(editPlanTier, 'acessos') && editAcessosAddon
    // chat/bundle incluem ZeloMenu por política (D-014) — sempre true; pdv via addon menu.
    const finalZeloMenu = (editPlanTier === 'chat' || editPlanTier === 'bundle')
      ? true
      : (isAddonAllowed(editPlanTier, 'menu') && editZeloMenuAddon)

    if (editMesasAddon && !isAddonAllowed(editPlanTier, 'mesas')) {
      const ok = await confirmDialog({
        title: 'Add-on incompatível',
        message: `O plano ${planLabel(editPlanTier)} não suporta o Módulo Mesas. Vamos desativar o add-on. Continuar?`,
        confirmStyle: 'warning',
      })
      if (!ok) return
    }
    if (editPedidosAddon && !isAddonAllowed(editPlanTier, 'pedidos')) {
      const ok = await confirmDialog({
        title: 'Add-on incompatível',
        message: `O plano ${planLabel(editPlanTier)} não suporta Pedidos + Cozinha. Vamos desativar o add-on. Continuar?`,
        confirmStyle: 'warning',
      })
      if (!ok) return
    }
    if (editAcessosAddon && !isAddonAllowed(editPlanTier, 'acessos')) {
      const ok = await confirmDialog({
        title: 'Add-on incompatível',
        message: `O plano ${planLabel(editPlanTier)} não suporta Controle de Acessos. Vamos desativar o add-on. Continuar?`,
        confirmStyle: 'warning',
      })
      if (!ok) return
    }

    try {
      planSaving = true
      const provider = selectedSub.payment_provider

      if (provider === 'stripe' && selectedSub.provider_subscription_id) {
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
            addons: { mesas: finalMesas, pedidos: finalPedidos, acessos: finalAcessos },
            // back-compat com versões antigas do endpoint:
            hasMesasAddon: finalMesas,
            hasPedidosAddon: finalPedidos,
            hasAcessosAddon: finalAcessos,
          }),
        })
        const body = await res.json().catch(() => ({}))

        if (res.status === 422 && body.code === 'stripe_resource_missing') {
          const ok = await confirmDialog({
            title: 'Subscription não existe no Stripe',
            message:
              `A subscription ${body.providerSubscriptionId || ''} não existe no Stripe (provavelmente ID legado de migração). ` +
              `Reclassificar como "manual" pra desbloquear edição direta no DB?`,
            confirmLabel: 'Reclassificar',
            confirmStyle: 'warning',
          })
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
            old: {
              plan_tier: selectedSub.plan_tier,
              has_mesas_addon: selectedSub.has_mesas_addon,
              has_pedidos_addon: selectedSub.has_pedidos_addon,
              has_acessos_addon: selectedSub.has_acessos_addon,
            },
            new: {
              plan_tier: editPlanTier,
              has_mesas_addon: finalMesas,
              has_pedidos_addon: finalPedidos,
              has_acessos_addon: finalAcessos,
            },
            stripe_updated: body.stripeUpdated,
          },
        })

        success(`Plano alterado para ${planLabel(editPlanTier)}${body.stripeUpdated ? ' (Stripe sincronizado)' : ' (sem mudança no Stripe)'}.`)
        closePlanModal()
        await loadSubscriptions()
        return
      }

      // Abacate/manual/sem provedor: update direto no DB
      const updatePayload = {
        plan_tier: editPlanTier,
        has_mesas_addon: finalMesas,
        has_pedidos_addon: finalPedidos,
        has_acessos_addon: finalAcessos,
        has_zelo_menu: finalZeloMenu,
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
          old: {
            plan_tier: selectedSub.plan_tier,
            has_mesas_addon: selectedSub.has_mesas_addon,
            has_pedidos_addon: selectedSub.has_pedidos_addon,
            has_acessos_addon: selectedSub.has_acessos_addon,
          },
          new: {
            plan_tier: editPlanTier,
            has_mesas_addon: finalMesas,
            has_pedidos_addon: finalPedidos,
            has_acessos_addon: finalAcessos,
          },
          provider: provider || 'none',
        },
      })

      success(`Plano alterado para ${planLabel(editPlanTier)} (ajuste direto no DB — ${getProviderLabel(provider)}).`)
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
    if (!selectedSub || !extendTargetDate) {
      errorToast('Escolha a data final do acesso.')
      return
    }
    if (!extendReason.trim()) {
      errorToast('Informe o motivo da extensão.')
      return
    }
    
    extending = true
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        errorToast('Sessão expirada. Faça login novamente.')
        return
      }

      const response = await fetch(`${API_BASE}/api/admin/billing/extend-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscriptionId: selectedSub.id,
          targetDate: extendTargetDate,
          reason: extendReason,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        errorToast(body.error || 'Erro ao atualizar vencimento')
        return
      }

      const wasExpired = body.wasExpired ? ' (assinatura estava expirada)' : ''
      const modeLabel = `Data final ajustada para ${formatSubscriptionDate(body.newExpiry)}`

      await logAdminAction({
        adminId: adminInfo.id,
        action: 'extend_subscription_admin_dashboard',
        targetUserId: selectedSub.user_id,
        details: {
          subscription_id: selectedSub.id,
          company: selectedSub.empresa_perfil.nome_exibicao,
          reason: extendReason,
          mode: body.mode,
          target_date: body.targetDate,
          previous_expiry: body.previousExpiry,
          previous_current_period_end: body.previousCurrentPeriodEnd,
          previous_manual_extension: body.previousManualExtension,
          new_expiry: body.newExpiry,
          provider: body.provider,
          billing_type: body.billingType,
        }
      })

      success(`Vencimento atualizado. ${modeLabel}${wasExpired}`)
      closeExtendModal()
      await loadSubscriptions()
    } catch (err) {
      console.error('Error extending subscription:', err)
      errorToast('Erro ao atualizar vencimento')
    } finally {
      extending = false
    }
  }
  
  async function handleCancelSubscription(sub) {
    const ok = await confirmDialog({
      title: 'Cancelar assinatura',
      message: `Têm certeza que deseja cancelar a assinatura de ${sub.empresa_perfil.nome_exibicao}?`,
      confirmLabel: 'Cancelar agora',
      cancelLabel: 'Voltar',
      confirmStyle: 'danger',
    })
    if (!ok) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        errorToast('Sessão expirada. Faça login novamente.')
        return
      }

      const res = await fetch(`${API_BASE}/api/admin/billing/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscriptionId: sub.id,
          status: 'canceled',
          expireImmediately: true,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        errorToast(body.error || 'Erro ao cancelar assinatura')
        return
      }

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
    const ok = await confirmDialog({
      title: 'Reativar assinatura',
      message: `Reativar assinatura de ${sub.empresa_perfil.nome_exibicao}?`,
      confirmLabel: 'Reativar',
    })
    if (!ok) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        errorToast('Sessão expirada. Faça login novamente.')
        return
      }

      const res = await fetch(`${API_BASE}/api/admin/billing/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscriptionId: sub.id,
          status: 'active',
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        errorToast(body.error || 'Erro ao reativar assinatura')
        return
      }

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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        errorToast('Sessão expirada. Faça login novamente.')
        return
      }

      const res = await fetch(`${API_BASE}/api/admin/billing/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscriptionId: sub.id,
          status: newStatus,
          expireImmediately: newStatus === 'canceled',
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        errorToast(body.error || 'Erro ao atualizar status')
        return
      }

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
    const ok = await confirmDialog({
      title: 'Estender trial',
      message: `Estender TRIAL de ${sub.empresa_perfil.nome_exibicao} por ${days} dias?`,
      confirmLabel: `+${days} dias`,
    })
    if (!ok) return

    try {
      statusUpdating = true
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        errorToast('Sessão expirada. Faça login novamente.')
        return
      }

      const res = await fetch(`${API_BASE}/api/admin/billing/extend-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscriptionId: sub.id,
          days,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        errorToast(body.error || 'Erro ao estender trial')
        return
      }

      await logAdminAction({
        adminId: adminInfo.id,
        action: 'extend_trial',
        targetUserId: sub.user_id,
        details: { subscription_id: sub.id, days, new_expiry: body.newExpiry, company: sub.empresa_perfil.nome_exibicao }
      })

      success(`Trial estendido até ${new Date(body.newExpiry).toLocaleDateString('pt-BR')}`)
      await loadSubscriptions()
    } catch (err) {
      console.error('Error extending trial:', err)
      errorToast('Erro ao estender trial')
    } finally {
      statusUpdating = false
    }
  }
  
  function getStatusBadge(sub) {
    const adminStatus = getSubscriptionAdminStatus(sub)

    const badges = {
      active: { text: 'ATIVA', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]' },
      expired: { text: 'EXPIRADA', class: 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]' },
      trial_expired: { text: 'TRIAL VENCIDO', class: 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]' },
      canceled: { text: 'CANCELADA', class: 'bg-slate-500/10 text-slate-400 border-slate-500/20 shadow-[0_0_8px_rgba(100,116,139,0.1)]' },
      past_due: { text: 'VENCIDA', class: 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_8px_rgba(249,115,22,0.1)]' },
      trialing: { text: 'TRIAL', class: 'bg-sky-500/10 text-sky-400 border-sky-500/20 shadow-[0_0_8px_rgba(14,165,233,0.1)]' }
    }
    return badges[adminStatus] || { text: adminStatus.toUpperCase(), class: 'bg-slate-700 text-slate-300 border-slate-600' }
  }

  function getInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  function getFilterLabel(options, value) {
    return options.find(option => option.value === value)?.label || 'Todos'
  }

  function subscriptionMatchesStatus(sub) {
    const days = getDaysUntilEffectiveExpiry(sub)

    if (filterStatus === 'all') return true
    if (filterStatus === 'expired') return isSubscriptionExpired(sub)
    if (filterStatus === 'expiring_7') return days > 0 && days <= 7
    if (filterStatus === 'expiring_15') return days > 0 && days <= 15
    if (filterStatus === 'expiring_30') return days > 0 && days <= 30
    if (filterStatus === 'manual_extension') return hasActiveManualExtension(sub)
    if (filterStatus === 'cancel_at_period_end') return !!sub.cancel_at_period_end
    return getSubscriptionAdminStatus(sub) === filterStatus
  }

  function subscriptionMatchesProvider(sub) {
    if (filterProvider === 'all') return true
    if (filterProvider === 'none') return !sub.payment_provider
    return sub.payment_provider === filterProvider
  }

  function subscriptionMatchesAddon(sub) {
    const hasAnyAddon = !!(sub.has_mesas_addon || sub.has_pedidos_addon || sub.has_acessos_addon)

    if (filterAddon === 'all') return true
    if (filterAddon === 'with_any') return hasAnyAddon
    if (filterAddon === 'none') return !hasAnyAddon
    if (filterAddon === 'mesas') return !!sub.has_mesas_addon
    if (filterAddon === 'pedidos') return !!sub.has_pedidos_addon
    if (filterAddon === 'acessos') return !!sub.has_acessos_addon
    return true
  }

  function resetFilters() {
    filterStatus = 'all'
    filterPlan = 'all'
    filterProvider = 'all'
    filterAddon = 'all'
    filterEntitlement = 'all'
    searchTerm = ''
  }

  $: activeFilterCount = [
    filterStatus !== 'all',
    filterPlan !== 'all',
    filterProvider !== 'all',
    filterAddon !== 'all',
    filterEntitlement !== 'all',
    searchTerm.trim(),
  ].filter(Boolean).length
  
  function exportFinancialPdf() {
    const list = filteredSubscriptions
    const activeSubs   = list.filter(s => getSubscriptionAdminStatus(s) === 'active')
    const trialSubs    = list.filter(s => getSubscriptionAdminStatus(s) === 'trialing')
    const canceledSubs = list.filter(s => s.status === 'canceled')
    const expiredSubs  = list.filter(s => isSubscriptionExpired(s))

    const mrr = activeSubs.reduce((sum, s) => sum + subscriptionValue(s), 0)
    const arr = mrr * 12
    const arpu = activeSubs.length ? mrr / activeSubs.length : 0

    // Distribuição por plano (apenas ativas — receita real)
    const planBuckets = {}
    for (const s of activeSubs) {
      const tier = s.plan_tier || 'pdv'
      if (!planBuckets[tier]) planBuckets[tier] = { count: 0, mrr: 0 }
      planBuckets[tier].count++
      planBuckets[tier].mrr += subscriptionValue(s)
    }
    const planRows = Object.entries(planBuckets).map(([tier, b]) => ({
      plan: planLabel(tier),
      count: b.count,
      mrr: b.mrr,
      share: mrr > 0 ? Math.round(b.mrr / mrr * 100) : 0,
    })).sort((a, b) => b.mrr - a.mrr)

    // Add-ons receita
    const addonRevenue = activeSubs.reduce((acc, s) => {
      if (s.has_mesas_addon)   acc.mesas   += 30
      if (s.has_pedidos_addon) acc.pedidos += 30
      if (s.has_acessos_addon) acc.acessos += 30
      return acc
    }, { mesas: 0, pedidos: 0, acessos: 0 })

    // Filtro aplicado
    const filterDesc = [
      filterStatus !== 'all' ? `status=${filterStatus}` : null,
      filterPlan !== 'all'   ? `plano=${filterPlan}`     : null,
      searchTerm.trim()      ? `busca="${searchTerm}"`   : null,
    ].filter(Boolean).join(' · ') || 'sem filtros'

    generatePdfReport({
      title: 'Relatório Financeiro',
      subtitle: `Assinaturas, receita recorrente e status de cobrança · Filtros: ${filterDesc}`,
      generatedBy: adminInfo?.email,
      kpis: [
        { label: 'MRR',                value: formatBRL(mrr),  hint: 'Receita mensal recorrente' },
        { label: 'ARR Projetada',      value: formatBRL(arr),  hint: 'MRR × 12' },
        { label: 'ARPU',               value: formatBRL(arpu), hint: 'Receita média por cliente' },
        { label: 'Clientes Pagantes',  value: formatNumber(activeSubs.length), hint: `${trialSubs.length} em trial` },
        { label: 'Cancelados',         value: formatNumber(canceledSubs.length) },
        { label: 'Expiradas',          value: formatNumber(expiredSubs.length), hint: 'Pagamento atrasado' },
        { label: 'Receita Add-ons/mês',value: formatBRL(addonRevenue.mesas + addonRevenue.pedidos + addonRevenue.acessos) },
        { label: 'Total Analisado',    value: formatNumber(list.length) },
      ],
      sections: [
        {
          type: 'table',
          title: 'Receita por Plano',
          description: 'Composição do MRR — apenas assinaturas ativas e não expiradas',
          columns: [
            { key: 'plan',  label: 'Plano' },
            { key: 'count', label: 'Clientes', align: 'right', format: v => formatNumber(v) },
            { key: 'mrr',   label: 'MRR',      align: 'right', format: v => formatBRL(v) },
            { key: 'share', label: 'Share',    align: 'right', format: v => `${v}%` },
          ],
          rows: planRows,
          footer: [
            { label: 'Total MRR', value: formatBRL(mrr) },
          ],
        },
        {
          type: 'table',
          title: 'Receita de Add-ons',
          description: 'Receita mensal recorrente proveniente de módulos opcionais',
          columns: [
            { key: 'addon', label: 'Módulo' },
            { key: 'count', label: 'Clientes', align: 'right', format: v => formatNumber(v) },
            { key: 'mrr',   label: 'MRR',      align: 'right', format: v => formatBRL(v) },
          ],
          rows: [
            { addon: 'Módulo Mesas',         count: activeSubs.filter(s => s.has_mesas_addon).length,   mrr: addonRevenue.mesas },
            { addon: 'Pedidos + Cozinha',    count: activeSubs.filter(s => s.has_pedidos_addon).length, mrr: addonRevenue.pedidos },
            { addon: 'Controle de Acessos',  count: activeSubs.filter(s => s.has_acessos_addon).length, mrr: addonRevenue.acessos },
          ],
          footer: [
            { label: 'Total Add-ons', value: formatBRL(addonRevenue.mesas + addonRevenue.pedidos + addonRevenue.acessos) },
          ],
        },
        {
          type: 'table',
          title: 'Detalhamento de Assinaturas',
          description: 'Lista completa de todas as assinaturas conforme filtros aplicados',
          columns: [
            { key: 'cliente', label: 'Cliente' },
            { key: 'plano',   label: 'Plano' },
            { key: 'status',  label: 'Status' },
            { key: 'valor',   label: 'Valor/mês', align: 'right', format: v => formatBRL(v) },
            { key: 'vence',   label: 'Vence em' },
            { key: 'criado',  label: 'Criado em' },
          ],
          rows: list.map(s => {
            const eff = getEffectiveExpiry(s)
            const addons = [
              s.has_mesas_addon   ? 'Mesas'   : null,
              s.has_pedidos_addon ? 'Pedidos' : null,
              s.has_acessos_addon ? 'Acessos' : null,
            ].filter(Boolean).join(', ')
            return {
              cliente: s.empresa_perfil.nome_exibicao || 'S/N',
              plano: planLabel(s.plan_tier || 'pdv') + (addons ? ` (+${addons})` : ''),
              status: getStatusBadge(s).text,
              valor: subscriptionValue(s),
              vence: formatSubscriptionDate(eff),
              criado: formatSubscriptionDate(s.created_at),
            }
          }),
          footer: [
            { label: `Total de assinaturas: ${list.length} · MRR ativo`, value: formatBRL(mrr) },
          ],
        },
      ],
    })
  }

  $: filteredSubscriptions = subscriptions.filter(sub => {
    if (filterPlan !== 'all' && sub.plan_tier !== filterPlan) return false
    if (!subscriptionMatchesStatus(sub)) return false
    if (!subscriptionMatchesProvider(sub)) return false
    if (!subscriptionMatchesAddon(sub)) return false
    // Entitlement filter (PDV × Chat)
    if (filterEntitlement !== 'all') {
      const ent = getEntitlement(sub);
      if (filterEntitlement === 'divergent') {
        if (!ent.divergent) return false;
      } else if (filterEntitlement === 'pdv_only') {
        if (!ent.pdv.active || ent.chat.active) return false;
      } else if (filterEntitlement === 'chat_only') {
        if (!ent.chat.active || ent.pdv.active) return false;
      } else if (filterEntitlement === 'both') {
        if (!ent.pdv.active || !ent.chat.active) return false;
      }
    }
    if (!searchTerm.trim()) return true

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

<div class="max-w-[1400px] mx-auto space-y-4 animate-in fade-in duration-500">
  
  <!-- Sleek Header Area -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
    <div>
      <h2 class="text-xl font-bold tracking-tight text-white">Assinaturas</h2>
      <p class="text-xs text-slate-500">{filteredSubscriptions.length} de {subscriptions.length} registros</p>
    </div>
    
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      
      <!-- Search Box -->
      <div class="relative group w-full sm:w-72">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Busca (Email/Doc)"
          class="w-full pl-9 pr-3 h-9 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50 transition-all"
        />
      </div>

      <div class="relative">
        <button
          on:click={() => showFilters = !showFilters}
          class="relative flex items-center justify-center shrink-0 w-9 h-9 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-300 hover:text-white transition-all focus:outline-hidden focus:ring-2 focus:ring-slate-700"
          title="Filtros"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          {#if activeFilterCount > 0}
            <span class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-indigo-500 text-[10px] leading-4 font-bold text-white">{activeFilterCount}</span>
          {/if}
        </button>

        {#if showFilters}
          <div class="absolute right-0 top-11 z-30 w-[min(92vw,420px)] rounded-xl border border-slate-800 bg-slate-950 shadow-2xl p-3" transition:fade={{ duration: 120 }}>
            <div class="flex items-center justify-between gap-3 mb-3">
              <div class="text-xs font-semibold text-slate-300">Filtros</div>
              <button on:click={resetFilters} class="text-[11px] text-slate-500 hover:text-slate-200">Limpar</button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label class="space-y-1">
                <span class="text-[10px] uppercase font-bold text-slate-500">Status</span>
                <select bind:value={filterStatus} class="w-full h-9 bg-slate-900 border border-slate-800 rounded-lg px-2 text-xs text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50">
                  {#each statusFilters as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>

              <label class="space-y-1">
                <span class="text-[10px] uppercase font-bold text-slate-500">Plano</span>
                <select bind:value={filterPlan} class="w-full h-9 bg-slate-900 border border-slate-800 rounded-lg px-2 text-xs text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50">
                  {#each planFilters as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>

              <label class="space-y-1">
                <span class="text-[10px] uppercase font-bold text-slate-500">Origem</span>
                <select bind:value={filterProvider} class="w-full h-9 bg-slate-900 border border-slate-800 rounded-lg px-2 text-xs text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50">
                  {#each providerFilters as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>

              <label class="space-y-1">
                <span class="text-[10px] uppercase font-bold text-slate-500">Add-on</span>
                <select bind:value={filterAddon} class="w-full h-9 bg-slate-900 border border-slate-800 rounded-lg px-2 text-xs text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50">
                  {#each addonFilters as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>

              <label class="space-y-1">
                <span class="text-[10px] uppercase font-bold text-slate-500">PDV×Chat</span>
                <select bind:value={filterEntitlement} class="w-full h-9 bg-slate-900 border border-slate-800 rounded-lg px-2 text-xs text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50">
                  {#each entitlementFilters as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
            </div>

            <div class="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
              <span class="px-2 py-1 rounded-md bg-slate-900 border border-slate-800">Status: {getFilterLabel(statusFilters, filterStatus)}</span>
              <span class="px-2 py-1 rounded-md bg-slate-900 border border-slate-800">Plano: {getFilterLabel(planFilters, filterPlan)}</span>
              <span class="px-2 py-1 rounded-md bg-slate-900 border border-slate-800">Origem: {getFilterLabel(providerFilters, filterProvider)}</span>
              <span class="px-2 py-1 rounded-md bg-slate-900 border border-slate-800">Add-on: {getFilterLabel(addonFilters, filterAddon)}</span>
              <span class="px-2 py-1 rounded-md bg-slate-900 border border-slate-800">PDV×Chat: {getFilterLabel(entitlementFilters, filterEntitlement)}</span>
            </div>
          </div>
        {/if}
      </div>
      
      <button
        on:click={loadSubscriptions}
        class="flex items-center justify-center shrink-0 w-9 h-9 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-300 hover:text-white transition-all focus:outline-hidden focus:ring-2 focus:ring-slate-700"
        title="Atualizar"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <button
        on:click={exportFinancialPdf}
        disabled={loading || filteredSubscriptions.length === 0}
        class="flex items-center justify-center gap-2 shrink-0 px-3 h-9 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 rounded-lg text-emerald-400 hover:text-emerald-300 font-medium text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-hidden focus:ring-2 focus:ring-emerald-500/40"
        title="Exportar relatório financeiro em PDF"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        PDF
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
    <div class="hidden md:block overflow-hidden bg-slate-900/30 border border-slate-800/60 rounded-lg" in:fade>
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-800 bg-slate-900/80">
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase">Cliente</th>
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase">Plano</th>
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase">Valor</th>
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase">Status</th>
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase" title="PDV × ZeloChat — dots verdes = ativo, vermelhos = bloqueado">Entit.</th>
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase">Vence</th>
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase">Criado</th>
            <th class="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/50">
          {#each filteredSubscriptions as sub (sub.id)}
            {@const badge = getStatusBadge(sub)}
            {@const daysLeft = getDaysUntilEffectiveExpiry(sub)}
            {@const isExpiringSoon = ['active', 'trialing'].includes(getSubscriptionAdminStatus(sub)) && daysLeft <= 7 && daysLeft > 0}
            {@const isExpired = isSubscriptionExpired(sub)}
            {@const effectiveExpiry = getEffectiveExpiry(sub)}
            {@const onManualExt = hasActiveManualExtension(sub)}
            
            <tr class="group hover:bg-slate-800/30 transition-colors">
              <td class="py-3 px-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {getInitials(sub.empresa_perfil.nome_exibicao)}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{sub.empresa_perfil.nome_exibicao || 'S/N'}</p>
                    <div class="flex items-center gap-2 mt-0.5 min-w-0">
                      <p class="text-xs text-slate-500 truncate">{sub.empresa_perfil.contato}</p>
                      <span class={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${getProviderTone(sub.payment_provider)}`}>
                        {getProviderLabel(sub.payment_provider)}
                      </span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="py-3 px-4">
                <button
                  on:click={() => openPlanModal(sub)}
                  class="inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-md border border-slate-700/40 hover:border-slate-600 hover:bg-slate-800/40 transition-all text-left"
                  title="Mudar plano/addons"
                >
                  <span class="text-[11px] font-semibold tracking-wide {sub.plan_tier === 'bundle' ? 'text-indigo-300' : sub.plan_tier === 'chat' ? 'text-violet-300' : 'text-sky-300'}">
                    {planLabel(sub.plan_tier || 'pdv')}
                  </span>
                  {#if sub.has_mesas_addon || sub.has_pedidos_addon || sub.has_acessos_addon}
                    <span class="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                      {[
                        sub.has_mesas_addon ? '+Mesas' : null,
                        sub.has_pedidos_addon ? '+Pedidos' : null,
                        sub.has_acessos_addon ? '+Acessos' : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  {/if}
                </button>
              </td>
              <td class="py-3 px-4 text-xs font-mono text-slate-300">
                R$ {subscriptionValue(sub).toFixed(2)}
              </td>
              <td class="py-3 px-4">
                <span class="inline-flex px-2 py-0.5 text-[10px] font-bold tracking-wide rounded-md border {badge.class}">
                  {badge.text}
                </span>
              </td>
              <td class="py-3 px-4">
                <!-- PDV × Chat entitlement dots -->
                {#if true}
                {@const ent = getEntitlement(sub)}
                <div class="flex items-center gap-1.5" title="{ent.divergent ? 'DIVERGENTE: ' : ''}PDV: {ent.pdv.reason} | Chat: {ent.chat.reason}">
                  <span class="inline-block w-2.5 h-2.5 rounded-full {ent.pdv.active ? 'bg-emerald-400' : 'bg-rose-500'}" title="ZeloPDV: {ent.pdv.active ? 'Ativo' : 'Inativo'} — {ent.pdv.reason}"></span>
                  <span class="inline-block w-2.5 h-2.5 rounded-full {ent.chat.active ? 'bg-emerald-400' : 'bg-rose-500'}" title="ZeloChat: {ent.chat.active ? 'Ativo' : 'Inativo'} — {ent.chat.reason}"></span>
                  {#if ent.divergent}
                    <span class="text-[9px] font-bold text-amber-400 uppercase tracking-wider">!</span>
                  {/if}
                </div>
                {/if}
              </td>
              <td class="py-3 px-4 text-xs">
                <div class="{isExpired ? 'text-rose-400 font-semibold' : isExpiringSoon ? 'text-amber-400 font-semibold' : 'text-slate-300'} flex items-center gap-1.5">
                  {formatSubscriptionDate(effectiveExpiry)}
                  {#if onManualExt}
                    <span
                      class="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold tracking-wider rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      title={`Extensão manual ativa até ${formatSubscriptionDate(sub.manually_extended_until)}. Período pago vence em ${formatSubscriptionDate(sub.current_period_end)}.`}
                    >
                      +EXT
                    </span>
                  {/if}
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
              <td class="py-3 px-4 text-xs text-slate-400">
                {formatSubscriptionDate(sub.created_at)}
              </td>
              <td class="py-3 px-4 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  
                  <!-- Status Quick Change -->
                  <div class="relative group/status mr-2">
                    <select 
                      value={sub.status} 
                      on:change={(e) => handleUpdateStatus(sub, e.target.value)}
                      disabled={statusUpdating}
                      class="appearance-none bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-600 focus:outline-hidden transition-all cursor-pointer disabled:opacity-50"
                    >
                      <option value="active">ACTIVE</option>
                      <option value="trialing">TRIAL</option>
                      <option value="trial_expired">TRIAL EXPIRED</option>
                      <option value="past_due">PAST DUE</option>
                      <option value="canceled">CANCELED</option>
                    </select>
                  </div>

                  {#if sub.status === 'trialing' || isExpired}
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
                    <!-- PIX -->
                    <button on:click={() => openPixModal(sub)} class="px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg transition-all" title="Gerar PIX de renovação">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg>
                      PIX
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
                    <!-- PIX -->
                    <button on:click={() => openPixModal(sub)} class="px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg transition-all" title="Gerar PIX de renovação">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg>
                      PIX
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
        {@const daysLeft = getDaysUntilEffectiveExpiry(sub)}
        {@const effectiveExpiry = getEffectiveExpiry(sub)}
        {@const onManualExt = hasActiveManualExtension(sub)}
        {@const isExpiringSoon = ['active', 'trialing'].includes(getSubscriptionAdminStatus(sub)) && daysLeft <= 7 && daysLeft > 0}
        {@const isExpired = isSubscriptionExpired(sub)}
        {@const ent = getEntitlement(sub)}

        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <!-- Header: name + badge -->
          <div class="flex justify-between items-start mb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-100">{sub.empresa_perfil.nome_exibicao || 'S/N'}</h3>
              <div class="flex items-center gap-2 mt-0.5">
                <p class="text-xs text-slate-500">{sub.empresa_perfil.contato}</p>
                <span class={`text-[10px] font-semibold uppercase tracking-wide ${getProviderTone(sub.payment_provider)}`}>
                  {getProviderLabel(sub.payment_provider)}
                </span>
              </div>
            </div>
            <span class="inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm border {badge.class}">
              {badge.text}
            </span>
          </div>

          <!-- Grid: entit + plan + value -->
          <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs py-3 border-t border-slate-800 mt-2">
            <!-- Entitlement dots -->
            <div>
              <span class="text-slate-500 block mb-1">Entitlement:</span>
              <div class="flex items-center gap-1.5" title="{ent.divergent ? 'DIVERGENTE: ' : ''}PDV: {ent.pdv.reason} | Chat: {ent.chat.reason}">
                <span class="inline-block w-2.5 h-2.5 rounded-full {ent.pdv.active ? 'bg-emerald-400' : 'bg-rose-500'}" title="ZeloPDV: {ent.pdv.active ? 'Ativo' : 'Inativo'}"></span>
                <span class="inline-block w-2.5 h-2.5 rounded-full {ent.chat.active ? 'bg-emerald-400' : 'bg-rose-500'}" title="ZeloChat: {ent.chat.active ? 'Ativo' : 'Inativo'}"></span>
                {#if ent.divergent}
                  <span class="text-[9px] font-bold text-amber-400 uppercase tracking-wider">!</span>
                {/if}
              </div>
            </div>
            <!-- Value -->
            <div class="text-right">
              <span class="text-slate-500 block mb-1">Valor:</span>
              <span class="font-mono text-slate-200 font-medium">R$ {subscriptionValue(sub).toFixed(2)}</span>
            </div>
            <!-- Plan pill (clickable) -->
            <div class="col-span-2">
              <span class="text-slate-500 block mb-1">Plano:</span>
              <button
                on:click={() => openPlanModal(sub)}
                class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-700/40 hover:border-slate-600 hover:bg-slate-800/40 transition-all text-left"
                title="Mudar plano/addons"
              >
                <span class="text-[11px] font-semibold tracking-wide {sub.plan_tier === 'bundle' ? 'text-indigo-300' : sub.plan_tier === 'chat' ? 'text-violet-300' : 'text-sky-300'}">
                  {planLabel(sub.plan_tier || 'pdv')}
                </span>
                {#if sub.has_mesas_addon || sub.has_pedidos_addon || sub.has_acessos_addon}
                  <span class="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                    {[
                      sub.has_mesas_addon ? '+Mesas' : null,
                      sub.has_pedidos_addon ? '+Pedidos' : null,
                      sub.has_acessos_addon ? '+Acessos' : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                {/if}
              </button>
            </div>
            <!-- Expiry -->
            <div class="col-span-2">
              <span class="text-slate-500 block mb-0.5">Expiração:</span>
              <span class="text-slate-300 font-medium inline-flex items-center gap-1.5">
                <span class="{isExpired ? 'text-rose-400 font-semibold' : isExpiringSoon ? 'text-amber-400 font-semibold' : 'text-slate-300'}">{formatSubscriptionDate(effectiveExpiry)}</span>
                {#if onManualExt}
                  <span class="inline-flex px-1 py-0.5 text-[8px] font-bold rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">+EXT</span>
                {/if}
              </span>
              {#if sub.status === 'active'}
                <div class="text-[11px] font-medium mt-0.5 {isExpired ? 'text-rose-400/80' : isExpiringSoon ? 'text-amber-400/80' : 'text-slate-500'}">
                  {#if isExpired}
                    Em atraso há {Math.abs(daysLeft)}d
                  {:else}
                    Restam {daysLeft} dias
                  {/if}
                </div>
              {/if}
            </div>
          </div>

          <!-- Status quick change -->
          <div class="flex items-center justify-between border-t border-slate-800 pt-3 mt-1">
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status:</span>
              <select
                value={sub.status}
                on:change={(e) => handleUpdateStatus(sub, e.target.value)}
                disabled={statusUpdating}
                class="appearance-none bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-600 focus:outline-hidden transition-all cursor-pointer disabled:opacity-50"
              >
                <option value="active">ACTIVE</option>
                <option value="trialing">TRIAL</option>
                <option value="trial_expired">TRIAL EXPIRED</option>
                <option value="past_due">PAST DUE</option>
                <option value="canceled">CANCELED</option>
              </select>
            </div>

            <!-- +7D Trial button -->
            {#if sub.status === 'trialing' || isExpired}
              <button
                on:click={() => handleExtendTrialOnly(sub, 7)}
                disabled={statusUpdating}
                class="px-2 py-1.5 text-[10px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg transition-all disabled:opacity-50"
              >
                +7D Trial
              </button>
            {/if}
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-2 border-t border-slate-800 pt-3 mt-2">
            {#if sub.status === 'active'}
              <!-- Renovar / Extend -->
              <button on:click={() => openExtendModal(sub)} class="flex-1 py-1.5 bg-emerald-500/10 text-emerald-400 font-medium text-xs rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                Renovar
              </button>
              <!-- Gerar PIX -->
              <button
                on:click={() => openPixModal(sub)}
                class="flex-1 py-1.5 bg-sky-500/10 text-sky-400 font-medium text-xs rounded-lg border border-sky-500/20 hover:bg-sky-500/20 transition-all"
                title="Gerar PIX de renovação"
              >
                Gerar PIX
              </button>
              <!-- Cancel -->
              <button on:click={() => handleCancelSubscription(sub)} class="px-2 py-1.5 bg-slate-800 text-rose-400 hover:text-rose-300 rounded-lg border border-slate-700 hover:border-rose-500/20 transition-all">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            {:else if sub.status === 'canceled'}
              <!-- Reativar -->
              <button on:click={() => handleReactivateSubscription(sub)} class="flex-1 py-1.5 bg-emerald-500/10 text-emerald-400 font-medium text-xs rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                Reativar
              </button>
              <!-- Gerar PIX (also for canceled) -->
              <button
                on:click={() => openPixModal(sub)}
                class="flex-1 py-1.5 bg-sky-500/10 text-sky-400 font-medium text-xs rounded-lg border border-sky-500/20 hover:bg-sky-500/20 transition-all"
                title="Gerar PIX de renovação"
              >
                Gerar PIX
              </button>
            {:else}
              <!-- Gerar PIX for other statuses -->
              <button
                on:click={() => openPixModal(sub)}
                class="flex-1 py-1.5 bg-sky-500/10 text-sky-400 font-medium text-xs rounded-lg border border-sky-500/20 hover:bg-sky-500/20 transition-all"
                title="Gerar PIX de renovação"
              >
                Gerar PIX
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
      <div class="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-emerald-500/60 to-transparent"></div>
      
      <div class="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
        <h3 class="text-lg font-bold text-white tracking-wide">Renovação Manual</h3>
        <button on:click={closeExtendModal} class="text-slate-500 hover:text-white transition-colors outline-hidden"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
      
      <div class="p-6 space-y-6">
        
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Empresa Alvo</p>
          <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
             <div class="w-8 h-8 bg-sky-500/20 text-sky-400 flex items-center justify-center rounded-full font-bold text-xs">{getInitials(selectedSub.empresa_perfil.nome_exibicao)}</div>
             <div>
               <div class="text-sm font-medium text-slate-200">{selectedSub.empresa_perfil.nome_exibicao}</div>
               <div class={`text-[11px] font-semibold uppercase tracking-wide ${getProviderTone(selectedSub.payment_provider)}`}>
                 {getProviderLabel(selectedSub.payment_provider)}
               </div>
             </div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
           <div>
              <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Status Atual</p>
              <div class="text-sm font-semibold text-rose-400">
                {isSubscriptionExpired(selectedSub) ? 'Expirada' : 'Ativa'}
              </div>
           </div>
           <div>
             <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Expira(va) em</p>
             <div class="text-sm font-semibold text-slate-300 inline-flex items-center gap-1.5">
               {formatSubscriptionDate(getEffectiveExpiry(selectedSub))}
               {#if hasActiveManualExtension(selectedSub)}
                 <span class="text-[9px] font-bold text-amber-400" title="Extensão manual ativa">(+ext)</span>
               {/if}
             </div>
           </div>
        </div>
        
        <div>
          <label for="extend-target-date" class="block text-[13px] font-medium text-slate-400 mb-2">Data final do acesso</label>
          <input
            id="extend-target-date"
            type="date"
            bind:value={extendTargetDate}
            class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white focus:outline-hidden focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
          />
          <p class="mt-2 text-[11px] text-slate-500">
            O admin grava exatamente essa data no vencimento real da assinatura.
          </p>
        </div>

        <div>
          <label for="extend-reason" class="block text-[13px] font-medium text-slate-400 mb-2">Motivo da extensão <span class="text-rose-400">*</span></label>
          <textarea
            id="extend-reason"
            bind:value={extendReason}
            placeholder="Ex: cortesia por instabilidade, extensão contratual, adjuste manual..."
            rows="2"
            class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-sky-500 transition-all shadow-inner resize-none"
          ></textarea>
        </div>

        <div class="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
          <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Novo vencimento efetivo</p>
          <div class="text-base font-semibold text-emerald-300">
            {formatSubscriptionDate(getExtensionPreviewDate(selectedSub))}
          </div>
          <p class="mt-2 text-[11px] text-slate-500">
            Esse ajuste grava `current_period_end` e `manually_extended_until` no banco.
          </p>
        </div>
        
      </div>
      
      <div class="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button on:click={closeExtendModal} disabled={extending} class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
        <button on:click={handleExtendSubscription} disabled={extending || !extendTargetDate || !extendReason.trim()} class="px-5 py-2 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:shadow-none flex items-center gap-2">
          {extending ? 'Salvando...' : 'Salvar data'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Plan/Addon Change Modal -->
{#if showPlanModal && selectedSub}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-[#0B0F19]/80" transition:fade={{ duration: 200 }}>
    <div class="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden" transition:slide={{ duration: 300, axis: 'y' }}>
      <div class="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-indigo-500/60 to-transparent"></div>

      <div class="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
        <h3 class="text-lg font-bold text-white tracking-wide">Plano e Addons</h3>
        <button on:click={closePlanModal} class="text-slate-500 hover:text-white transition-colors outline-hidden"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>

      <div class="p-6 space-y-5">
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Empresa</p>
          <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div class="w-8 h-8 bg-indigo-500/20 text-indigo-400 flex items-center justify-center rounded-full font-bold text-xs">{getInitials(selectedSub.empresa_perfil.nome_exibicao)}</div>
            <div>
              <div class="text-sm font-medium text-slate-200">{selectedSub.empresa_perfil.nome_exibicao}</div>
              <div class={`text-[11px] font-semibold uppercase tracking-wide ${getProviderTone(selectedSub.payment_provider)}`}>
                {getProviderLabel(selectedSub.payment_provider)}
              </div>
            </div>
          </div>
        </div>

        <div>
          <p class="block text-[13px] font-medium text-slate-400 mb-2">Plano</p>
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

        <div class="pt-4 border-t border-slate-800 space-y-3">
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

          <label class="flex items-center cursor-pointer group {!isAddonAllowed(editPlanTier, 'pedidos') ? 'opacity-40 cursor-not-allowed' : ''}">
            <div class="relative flex items-center justify-center">
              <input
                type="checkbox"
                bind:checked={editPedidosAddon}
                disabled={!isAddonAllowed(editPlanTier, 'pedidos')}
                class="sr-only peer"
              />
              <div class="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 shadow-inner"></div>
            </div>
            <div class="ml-3">
              <span class="text-sm font-medium text-slate-300">Pedidos + Cozinha (+R$ 30/mês)</span>
              {#if !isAddonAllowed(editPlanTier, 'pedidos')}
                <p class="text-[11px] text-amber-400 mt-0.5">Indisponível em {PLANS[editPlanTier].name} (precisa de PDV).</p>
              {/if}
            </div>
          </label>

          <label class="flex items-center cursor-pointer group {!isAddonAllowed(editPlanTier, 'acessos') ? 'opacity-40 cursor-not-allowed' : ''}">
            <div class="relative flex items-center justify-center">
              <input
                type="checkbox"
                bind:checked={editAcessosAddon}
                disabled={!isAddonAllowed(editPlanTier, 'acessos')}
                class="sr-only peer"
              />
              <div class="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500 shadow-inner"></div>
            </div>
            <div class="ml-3">
              <span class="text-sm font-medium text-slate-300">Controle de Acessos (+R$ 30/mês)</span>
              {#if !isAddonAllowed(editPlanTier, 'acessos')}
                <p class="text-[11px] text-amber-400 mt-0.5">Indisponível em {PLANS[editPlanTier].name} (precisa de PDV).</p>
              {/if}
            </div>
          </label>

          <label class="flex items-center cursor-pointer group {(editPlanTier === 'chat' || editPlanTier === 'bundle' || !isAddonAllowed(editPlanTier, 'menu')) ? 'opacity-40 cursor-not-allowed' : ''}">
            <div class="relative flex items-center justify-center">
              <input
                type="checkbox"
                bind:checked={editZeloMenuAddon}
                disabled={editPlanTier === 'chat' || editPlanTier === 'bundle' || !isAddonAllowed(editPlanTier, 'menu')}
                class="sr-only peer"
              />
              <div class="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500 shadow-inner"></div>
            </div>
            <div class="ml-3">
              <span class="text-sm font-medium text-slate-300">ZeloMenu (+R$ 40/mês)</span>
              {#if editPlanTier === 'chat' || editPlanTier === 'bundle'}
                <p class="text-[11px] text-emerald-400 mt-0.5">Já incluso no {PLANS[editPlanTier].name}.</p>
              {:else if !isAddonAllowed(editPlanTier, 'menu')}
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
            <div class="text-sm font-mono font-semibold text-emerald-300">R$ {calculateValue(editPlanTier, {
              mesas: editMesasAddon && isAddonAllowed(editPlanTier, 'mesas'),
              pedidos: editPedidosAddon && isAddonAllowed(editPlanTier, 'pedidos'),
              acessos: editAcessosAddon && isAddonAllowed(editPlanTier, 'acessos'),
              menu: editZeloMenuAddon && isAddonAllowed(editPlanTier, 'menu'),
            }).toFixed(2)}</div>
          </div>
        </div>

        <div class={`rounded-lg p-3 border text-[11px] leading-relaxed ${selectedSubProviderHint.className}`}>
          <strong class="block">{selectedSubProviderHint.title}</strong>
          {selectedSubProviderHint.body}
        </div>
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

<!-- Pix Modal -->
{#if showPixModal && pixSub}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-[#0B0F19]/80" transition:fade={{ duration: 200 }}>
    <div class="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden" transition:slide={{ duration: 300, axis: 'y' }}>
      <div class="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-sky-500/60 to-transparent"></div>

      <div class="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
        <h3 class="text-lg font-bold text-white tracking-wide">PIX de Renovação</h3>
        <button on:click={closePixModal} class="text-slate-500 hover:text-white transition-colors outline-hidden"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>

      <div class="p-6 space-y-5">
        <!-- Cliente info -->
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Empresa</p>
          <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div class="w-8 h-8 bg-sky-500/20 text-sky-400 flex items-center justify-center rounded-full font-bold text-xs">{getInitials(pixSub.empresa_perfil.nome_exibicao)}</div>
            <div>
              <div class="text-sm font-medium text-slate-200">{pixSub.empresa_perfil.nome_exibicao}</div>
              <div class={`text-[11px] font-semibold uppercase tracking-wide ${getProviderTone(pixSub.payment_provider)}`}>
                {getProviderLabel(pixSub.payment_provider)}
              </div>
            </div>
          </div>
        </div>

        {#if pixResult}
          <!-- QR Code -->
          <div class="flex flex-col items-center space-y-3">
            <div class="relative w-48 h-48 bg-white rounded-xl p-3 shadow-lg">
              {#if pixResult.payment?.qrCodeBase64}
                <img src={pixResult.payment.qrCodeBase64} alt="QR Code PIX" class="w-full h-full object-contain" />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-slate-400 text-xs">QR indisponível</div>
              {/if}
            </div>
            <p class="text-[11px] text-slate-400 font-medium">Escaneie o QR com o app do seu banco</p>
          </div>

          <!-- Copia e Cola -->
          {#if pixResult.payment?.brCode}
            <div>
              <p class="text-[11px] font-medium text-slate-500 mb-1.5">Código Copia e Cola</p>
              <div class="relative">
                <textarea
                  readonly
                  rows="3"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-[11px] font-mono text-slate-300 resize-none focus:outline-hidden"
                >{pixResult.payment.brCode}</textarea>
                <button
                  on:click={async (e) => { try { await navigator.clipboard.writeText(pixResult.payment.brCode); } catch { const ta = e.currentTarget.parentElement.querySelector('textarea'); if (ta) { ta.select(); document.execCommand('copy'); } } }}
                  class="absolute top-2 right-2 px-2 py-1 text-[9px] font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-md transition-colors"
                  title="Copiar código"
                >
                  Copiar
                </button>
              </div>
            </div>
          {/if}

          <!-- Value -->
          <div class="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
            <span class="text-sm text-slate-400">Valor</span>
            <span class="text-lg font-mono font-bold text-slate-100">
              R$ {((pixResult.payment?.amountCents || 0) / 100).toFixed(2).replace('.', ',')}
            </span>
          </div>

          <!-- Vencimento -->
          {#if pixResult.payment?.expiresAt}
            <div class="text-xs text-slate-500 text-center">
              Vence em {new Date(pixResult.payment.expiresAt).toLocaleString('pt-BR')}
            </div>
          {/if}

          <!-- Aviso Stripe -->
          {#if pixSub.payment_provider === 'stripe'}
            <div class="rounded-lg p-3 border border-amber-500/20 bg-amber-500/5 text-[11px] leading-relaxed text-amber-300">
              <strong class="block">Atenção: cliente Stripe</strong>
              Essa assinatura é gerenciada pelo Stripe. O PIX de renovação pode ser usado como pagamento avulso, mas a cobrança recorrente continuará no Stripe até que o plano seja alterado para Abacate Pay.
            </div>
          {/if}

          <!-- WhatsApp status -->
          <div class="flex items-center gap-3 p-3 rounded-xl border {pixWhatsappSent ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-800/30 border-slate-700/30'}">
            {#if pixWhatsappSent}
              <svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-emerald-400">WhatsApp enviado</p>
                <p class="text-[10px] text-slate-500 mt-0.5 truncate">PIX enviado para o WhatsApp da empresa</p>
              </div>
            {:else if pixError}
              <svg class="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-rose-400">Falha no WhatsApp</p>
                <p class="text-[10px] text-rose-400/60 mt-0.5 truncate">{pixError}</p>
              </div>
            {:else}
              <svg class="w-5 h-5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-slate-400">WhatsApp não enviado</p>
                <p class="text-[10px] text-slate-500 mt-0.5">Disparo manual disponível</p>
              </div>
            {/if}
            {#if pixResult.payment?.brCode}
              <button on:click={handleResendWhatsApp} class="px-2.5 py-1.5 text-[10px] font-semibold text-white bg-emerald-500/80 hover:bg-emerald-500 rounded-lg transition-colors shrink-0">
                Reenviar
              </button>
            {/if}
          </div>

          <!-- Reused info -->
          {#if pixResult.reused}
            <div class="text-xs text-amber-400/80 bg-amber-500/5 rounded-lg px-3 py-2 border border-amber-500/10 text-center">
              PIX pendente reutilizado — mesma cobrança já existente.
            </div>
          {/if}
        {:else}
          <!-- Loading / Initial State -->
          <div class="py-8 text-center space-y-4">
            <div class="w-16 h-16 mx-auto rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <svg class="w-8 h-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
            <p class="text-sm text-slate-400">Gere um PIX de renovação para esta assinatura.</p>
            <p class="text-xs text-slate-500">O código será enviado por WhatsApp para o contato da empresa.</p>
          </div>

          {#if pixError}
            <div class="rounded-lg p-3 border border-rose-500/20 bg-rose-500/5 text-xs text-rose-400">
              {pixError}
            </div>
          {/if}
        {/if}
      </div>

      <div class="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button on:click={closePixModal} disabled={generatingPix} class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50">Fechar</button>
        {#if !pixResult}
          <button on:click={handlePixCreate} disabled={generatingPix} class="px-5 py-2 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-xl transition-all shadow-[0_0_15px_rgba(14,165,233,0.4)] disabled:opacity-50 disabled:shadow-none flex items-center gap-2">
            {#if generatingPix}
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Gerando...
            {:else}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg>
              Gerar PIX
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
