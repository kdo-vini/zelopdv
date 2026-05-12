<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { logAdminAction } from '$lib/logger'
  import { fade, slide } from 'svelte/transition'
  import { PLANS, VALID_PLAN_TIERS, calculateValue, isAddonAllowed, planLabel, subscriptionValue } from '$lib/pricing'
  import { getEffectiveExpiry, hasActiveManualExtension } from '$lib/subscriptionHelpers'

  let users = []
  let loading = true
  let searchTerm = ''
  let adminInfo = null
  let isEditing = false
  let editForm = {}
  let editSub = null
  let subLoading = false
  let editPlanTier = 'pdv'
  let editMesasAddon = false
  let editPedidosAddon = false
  
  onMount(async () => {
    try {
      await loadAdminInfo()
      await loadUsers()
    } catch (err) {
      console.error('[Users] Unexpected error in onMount:', err)
    } finally {
      loading = false
    }
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
  
  async function loadUsers() {
    loading = true

    const { data: allUsers, error: usersError } = await supabase.rpc('admin_get_all_auth_users')

    if (usersError) {
      console.error('Error loading users:', usersError)
      users = []
      loading = false
      return
    }

    if (allUsers && allUsers.length > 0) {
      const userIds = allUsers.map(u => u.user_id)

      const [subsResult, aiResult, salesResult, lastSeenResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('id, user_id, status, current_period_end, manually_extended_until, plan_tier, has_mesas_addon, has_pedidos_addon, provider_subscription_id')
          .in('user_id', userIds)
          .order('updated_at', { ascending: false }),
        supabase
          .from('ai_usage_logs')
          .select('user_id')
          .in('user_id', userIds),
        supabase.rpc('admin_get_sales_counts', { days_ago: 30 }),
        supabase.rpc('admin_get_users_last_seen'),
      ])

      const aiCountMap = {}
      for (const row of aiResult.data || []) {
        if (row.user_id) aiCountMap[row.user_id] = (aiCountMap[row.user_id] || 0) + 1
      }
      const salesCountMap = {}
      for (const row of salesResult.data || []) {
        if (row.id_usuario) salesCountMap[row.id_usuario] = Number(row.sales_count)
      }
      const lastSeenMap = {}
      for (const row of lastSeenResult.data || []) {
        lastSeenMap[row.user_id] = row.effective_last_seen
      }

      users = allUsers.map(u => ({
        user_id: u.user_id,
        nome_exibicao: u.nome_exibicao || u.raw_user_meta_data?.full_name || null,
        email: u.email,            // auth email — used for mailto / password reset
        phone: u.contato || null,  // empresa_perfil.contato = WhatsApp phone
        documento: u.documento || null,
        modulo_pdv_ativo: u.modulo_pdv_ativo ?? false,
        created_at: u.profile_created_at || u.auth_created_at,
        last_seen_at: u.last_seen_at,
        has_profile: !!u.nome_exibicao,
        subscriptions: subsResult.data?.filter(s => s.user_id === u.user_id).slice(0, 1) || [],
        ai_interactions: aiCountMap[u.user_id] || 0,
        sales_last_30d: salesCountMap[u.user_id] || 0,
        effective_last_seen: lastSeenMap[u.user_id] || null,
      }))
    } else {
      users = []
    }

    loading = false
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

  function getWhatsAppUrl(user) {
    if (!user.phone) return null
    const digits = user.phone.replace(/\D/g, '')
    const phone = digits.startsWith('55') ? digits : `55${digits}`
    const nome = (user.nome_exibicao || 'você').split(' ')[0]
    const msg =
      `Oi ${nome}, tudo bem? Faz um tempo que você criou sua conta no ZeloPDV e queria passar pra saber como está sendo a experiência. ` +
      `Já conseguiu configurar o cardápio e fazer seus primeiros pedidos? ` +
      `Se tiver alguma dúvida ou dificuldade, pode falar comigo à vontade. ` +
      `Estou aqui pra ajudar no que precisar. — Vinicius, ZeloPDV`
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  }

  async function handleResetPassword(user) {
    if (!confirm(`Enviar email de reset de senha para ${user.email}?`)) return

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'https://zelopdv.com.br/reset-password'
      })

      if (error) throw error

      await logAdminAction({
        adminId: adminInfo.id,
        action: 'reset_password',
        targetUserId: user.user_id,
        details: { email: user.email, company: user.nome_exibicao }
      })
      
      alert('Email de reset enviado com sucesso!')
    } catch (err) {
      console.error('Error resetting password:', err)
      alert('Erro ao enviar email de reset')
    }
  }

  function openEdit(user) {
    editForm = { ...user }
    editSub = user.subscriptions?.[0] || null
    editPlanTier = editSub?.plan_tier || 'pdv'
    editMesasAddon = !!editSub?.has_mesas_addon
    editPedidosAddon = !!editSub?.has_pedidos_addon
    isEditing = true
  }

  function closeEdit() {
    isEditing = false
    editForm = {}
    editSub = null
    editPlanTier = 'pdv'
    editMesasAddon = false
    editPedidosAddon = false
  }

  async function saveEdit() {
    try {
      subLoading = true
      // Update profile
      const { error: profileError } = await supabase
        .from('empresa_perfil')
        .update({
          nome_exibicao: editForm.nome_exibicao,
          contato: editForm.phone ?? null,
        })
        .eq('user_id', editForm.user_id)
      
      if (profileError) throw profileError
      
      // Update subscription if status, plan_tier, or addon changed
      const originalSub = users.find(u => u.user_id === editForm.user_id)?.subscriptions?.[0]
      const finalMesas = isAddonAllowed(editPlanTier, 'mesas') && editMesasAddon
      const finalPedidos = isAddonAllowed(editPlanTier, 'pedidos') && editPedidosAddon
      const subChanged = editSub && originalSub && (
        editSub.status !== originalSub.status ||
        editPlanTier !== (originalSub.plan_tier || 'pdv') ||
        finalMesas !== !!originalSub.has_mesas_addon ||
        finalPedidos !== !!originalSub.has_pedidos_addon
      )

      if (subChanged) {
        const updateData = {
          status: editSub.status,
          plan_tier: editPlanTier,
          has_mesas_addon: finalMesas,
          has_pedidos_addon: finalPedidos,
          last_modified_by: adminInfo.id,
          last_modified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        // Se cancelar, expira a data imediatamente
        if (editSub.status === 'canceled') {
          updateData.current_period_end = new Date().toISOString()
        }

        const { error: subError } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('user_id', editForm.user_id)

        if (subError) throw subError

        await logAdminAction({
          adminId: adminInfo.id,
          action: 'admin_edit_subscription',
          targetUserId: editForm.user_id,
          details: {
            old: {
              status: originalSub.status,
              plan_tier: originalSub.plan_tier,
              has_mesas_addon: originalSub.has_mesas_addon,
              has_pedidos_addon: originalSub.has_pedidos_addon,
            },
            new: {
              status: editSub.status,
              plan_tier: editPlanTier,
              has_mesas_addon: finalMesas,
              has_pedidos_addon: finalPedidos,
            },
            company: editForm.nome_exibicao,
            warning: originalSub.provider_subscription_id ? 'Stripe value NOT synced — use /subscriptions page for Stripe sync' : null,
          },
        })
      }
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'edit_user',
        targetUserId: editForm.user_id,
        details: { email: editForm.email, company: editForm.nome_exibicao }
      })
      
      alert('Dados salvos com sucesso!')
      closeEdit()
      await loadUsers()
    } catch (err) {
      console.error('Save error:', err)
      alert('Erro ao salvar os dados: ' + err.message)
    } finally {
      subLoading = false
    }
  }

  async function handleQuickExtendTrial(days) {
    if (!editSub) {
      alert('Usuário não possui uma assinatura/trial ativo para estender.')
      return
    }

    if (!confirm(`Estender trial de ${editForm.nome_exibicao} por mais ${days} dias?`)) return
    
    try {
      subLoading = true
      const currentEnd = new Date(editSub.current_period_end)
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
        .eq('user_id', editForm.user_id)
      
      if (error) throw error
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'extend_trial',
        targetUserId: editForm.user_id,
        details: { days, new_expiry: newEnd.toISOString(), company: editForm.nome_exibicao }
      })
      
      alert(`Trial estendido até ${newEnd.toLocaleDateString('pt-BR')}!`)
      editSub.current_period_end = newEnd.toISOString()
      editSub.status = 'trialing'
      await loadUsers()
    } catch (err) {
      console.error('Extend trial error:', err)
      alert('Erro ao estender trial')
    } finally {
      subLoading = false
    }
  }

  async function handleCancelSub() {
    if (!editSub) return
    if (!confirm(`Tem certeza que deseja CANCELAR a assinatura/trial de ${editForm.nome_exibicao}?`)) return
    
    try {
      subLoading = true
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          current_period_end: new Date().toISOString(), // Expira data imediatamente
          last_modified_by: adminInfo.id,
          last_modified_at: new Date().toISOString()
        })
        .eq('user_id', editForm.user_id)
      
      if (error) throw error
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'cancel_subscription',
        targetUserId: editForm.user_id,
        details: { subscription_id: editSub.id, company: editForm.nome_exibicao }
      })
      
      alert('Assinatura cancelada com sucesso.')
      editSub.status = 'canceled'
      await loadUsers()
    } catch (err) {
      console.error('Cancel sub error:', err)
      alert('Erro ao cancelar assinatura')
    } finally {
      subLoading = false
    }
  }

  async function handleDeleteUser(user) {
    if (!adminInfo) return
    const confirmation = prompt(`Tem certeza que deseja apagar a conta de ${user.nome_exibicao}? Esta ação é IRREVERSÍVEL. Para confirmar, digite "delete":`)
    
    if (confirmation !== 'delete') {
      if (confirmation !== null) alert('Código de exclusão incorreto. Ação cancelada.')
      return
    }
    
    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: user.user_id,
        target_user_email: user.contato || 'unknown',
        action_details: {
            company: user.nome_exibicao,
            deleted_by: adminInfo.email
        }
      })
      
      if (error) throw error
      
      alert('Conta excluída definitivamente (Cascade).')
      await loadUsers()
    } catch (err) {
      console.error('Delete error', err)
      alert(`Erro ao excluir: ${err.message}`)
    }
  }
  
  function getUserStatus(user) {
    const sub = user.subscriptions?.[0]
    if (!sub) return { text: 'Inativo', class: 'bg-slate-500/10 text-slate-400 border border-slate-500/20 shadow-[0_0_8px_rgba(100,116,139,0.1)]' }
    
    if (sub.status === 'active') {
      return { text: 'Ativo', class: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.2)]' }
    } else if (sub.status === 'canceled') {
      return { text: 'Cancelado', class: 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.2)]' }
    }
    
    return { text: sub.status, class: 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.2)]' }
  }

  function getInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  
  $: filteredUsers = users.filter(user => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      user.nome_exibicao?.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search) ||
      user.phone?.toLowerCase().includes(search)
    )
  })
</script>

<svelte:head>
  <title>Usuários - Admin Zelo</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
  
  <!-- Sleek Header Area -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
    <div class="relative">
      <h2 class="text-3xl font-extrabold tracking-tight text-white mb-1">Users Management</h2>
      <p class="text-slate-400 text-sm font-medium">Controle total de clientes, acessos e auditoria.</p>
      <!-- Accent Glow Line -->
      <div class="absolute -bottom-6 left-0 w-16 h-[2px] bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
    </div>
    
    <div class="flex items-center gap-3">
      <div class="relative group w-full md:w-80">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-sky-400 transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Buscar por nome, doc ou email..."
          class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all shadow-inner"
        />
      </div>
      
      <button
        on:click={loadUsers}
        class="flex items-center justify-center w-11 h-11 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
        title="Atualizar"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  </div>
  
  <!-- Data Grid / List -->
  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4" in:fade>
      <div class="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div>
      <div class="text-sm font-medium text-slate-400">Sincronizando banco de dados...</div>
    </div>
  {:else if filteredUsers.length === 0}
    <div class="flex flex-col items-center justify-center py-24 px-4 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30" in:fade>
      <div class="w-16 h-16 mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
        <svg class="w-8 h-8 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-slate-300">Nenhum resultado</h3>
      <p class="text-sm text-slate-500 mt-1 max-w-sm">Tente ajustar seus termos de busca para encontrar o usuário.</p>
    </div>
  {:else}
    <!-- Desktop Table View -->
    <div class="hidden md:block overflow-hidden bg-slate-900/40 border border-slate-800/60 rounded-2xl shadow-xl backdrop-blur-sm" in:fade>
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-800 bg-slate-900/80">
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cliente</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Assinatura Expira</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Último Acesso</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Inter. IA</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/50">
          {#each filteredUsers as user (user.user_id)}
            {@const status = getUserStatus(user)}
            {@const sub = user.subscriptions?.[0]}
            
            <tr class="group hover:bg-slate-800/30 transition-colors">
              <td class="py-4 px-6">
                <div class="flex items-center gap-4">
                  <!-- Avatar -->
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-white shadow-inner shrink-0">
                    {getInitials(user.nome_exibicao)}
                  </div>
                  <!-- Name & Email -->
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{user.nome_exibicao || 'Sem Nome'}</p>
                    <p class="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
                  </div>
                </div>
              </td>
              <td class="py-4 px-6">
                <span class="inline-flex px-2.5 py-1 text-[11px] font-medium tracking-wide rounded-md {status.class}">
                  {status.text}
                </span>
              </td>
              <td class="py-4 px-6 text-sm text-slate-400">
                {#if sub}
                  {@const effExpiry = getEffectiveExpiry(sub)}
                  {#if effExpiry}
                    <span class="inline-flex items-center gap-1.5">
                      {effExpiry.toLocaleDateString('pt-BR')}
                      {#if hasActiveManualExtension(sub)}
                        <span class="inline-flex px-1 py-0.5 text-[8px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20" title={`Extensão manual ativa até ${new Date(sub.manually_extended_until).toLocaleDateString('pt-BR')}`}>+EXT</span>
                      {/if}
                    </span>
                  {:else}
                    <span class="text-slate-600">-</span>
                  {/if}
                {:else}
                  <span class="text-slate-600">-</span>
                {/if}
              </td>
              <td class="py-4 px-6 text-xs text-slate-400">
                {formatLastSeen(user.effective_last_seen)}
              </td>
              <td class="py-4 px-6 text-xs text-slate-400 text-center">
                {user.ai_interactions || 0}
              </td>
              <td class="py-4 px-6 text-right">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                  <!-- Mailto -->
                  <a href="mailto:{user.email}" class="p-2 text-slate-400 hover:text-sky-400 hover:bg-sky-400/10 rounded-lg transition-colors" title="Enviar e-mail">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </a>

                  <!-- WhatsApp follow-up -->
                  {#if getWhatsAppUrl(user)}
                    <a href={getWhatsAppUrl(user)} target="_blank" rel="noopener noreferrer" class="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors" title="Follow-up WhatsApp">
                      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </a>
                  {/if}

                  <button on:click={() => handleResetPassword(user)} class="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors" title="Reset de Senha">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  </button>

                  <a href="/subscriptions?user={user.user_id}" class="p-2 text-slate-400 hover:text-sky-400 hover:bg-sky-400/10 rounded-lg transition-colors" title="Assinatura">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </a>

                  <button on:click={() => openEdit(user)} class="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Editar">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>

                  <button on:click={() => handleDeleteUser(user)} class="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors ml-2" title="Excluir Definitivamente">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>

                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile Stacked View -->
    <div class="md:hidden space-y-4" in:fade>
      {#each filteredUsers as user (user.user_id)}
        {@const status = getUserStatus(user)}
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1 h-full {status.class.split(' ')[0]}"></div>
          
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-base font-bold text-slate-100">{user.nome_exibicao || 'Sem Nome'}</h3>
              <p class="text-sm text-slate-400 mt-0.5">{user.contato}</p>
            </div>
            <span class="inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded {status.class}">
              {status.text}
            </span>
          </div>

          <div class="flex items-center gap-2 border-t border-slate-800 pt-4 mt-2">
            <a href="mailto:{user.email}" class="p-2 text-slate-400 bg-slate-800 rounded-lg hover:text-sky-400" title="E-mail">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </a>
            {#if getWhatsAppUrl(user)}
              <a href={getWhatsAppUrl(user)} target="_blank" rel="noopener noreferrer" class="p-2 text-slate-400 bg-slate-800 rounded-lg hover:text-emerald-400" title="Follow-up WhatsApp">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            {/if}
            <button on:click={() => handleResetPassword(user)} class="p-2 text-slate-400 bg-slate-800 rounded-lg hover:text-amber-400" title="Reset Senha">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            </button>
            <button on:click={() => openEdit(user)} class="p-2 text-slate-400 bg-slate-800 rounded-lg hover:text-white" title="Editar">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <div class="flex-1"></div>
            <button on:click={() => handleDeleteUser(user)} class="p-2 text-rose-400 bg-rose-500/10 rounded-lg" title="Excluir">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Super Modern Glass Edit Modal -->
{#if isEditing}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-[#0B0F19]/80" transition:fade={{ duration: 200 }}>
    <div 
      class="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden"
      transition:slide={{ duration: 300, axis: 'y' }}
    >
      <!-- Top Glow -->
      <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/50 to-transparent"></div>
      
      <div class="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
        <h3 class="text-lg font-bold text-white tracking-wide">Editar Perfil</h3>
        <button on:click={closeEdit} class="text-slate-500 hover:text-white transition-colors">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="p-6 space-y-5">
        <div class="space-y-1.5">
          <label class="block text-[13px] font-medium text-slate-400">Nome de Exibição / Empresa</label>
          <input 
            type="text" 
            bind:value={editForm.nome_exibicao} 
            class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
          />
        </div>
        
        <div class="space-y-1.5">
          <label class="block text-[13px] font-medium text-slate-400">Documento (CPF/CNPJ)</label>
          <input 
            type="text" 
            bind:value={editForm.documento} 
            class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-[13px] font-medium text-slate-400">Email (auth)</label>
          <input
            type="email"
            value={editForm.email}
            disabled
            class="w-full px-4 py-2.5 bg-slate-800/30 border border-slate-700/50 rounded-xl text-sm text-slate-500 cursor-not-allowed shadow-inner"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-[13px] font-medium text-slate-400">Telefone WhatsApp</label>
          <input
            type="text"
            bind:value={editForm.phone}
            placeholder="5511999999999"
            class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
          />
        </div>

        {#if editSub}
          <div class="pt-4 border-t border-slate-800 space-y-4">
            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest">Controle de Assinatura</h4>
            
            <div class="space-y-1.5">
              <label class="block text-[13px] font-medium text-slate-400">Status da Conta</label>
              <select 
                bind:value={editSub.status}
                class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500 transition-all shadow-inner"
              >
                <option value="active">Ativo (Lançamento Manual/Assinado)</option>
                <option value="trialing">Trial (Período de Teste)</option>
                <option value="past_due">Vencido (Atraso no Pagamento)</option>
                <option value="canceled">Cancelado (Sem Acesso)</option>
              </select>
            </div>

            <div class="flex flex-col gap-2">
              <p class="text-[11px] font-medium text-slate-500">Ações Rápidas de Trial</p>
              <div class="flex gap-2">
                <button 
                  on:click={() => handleQuickExtendTrial(7)}
                  disabled={subLoading}
                  class="flex-1 py-2 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  +7 Dias Trial
                </button>
                <button 
                  on:click={() => handleQuickExtendTrial(15)}
                  disabled={subLoading}
                  class="flex-1 py-2 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  +15 Dias Trial
                </button>
              </div>
            </div>

            <button 
              on:click={handleCancelSub}
              disabled={subLoading}
              class="w-full py-2.5 text-xs font-bold text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl hover:bg-rose-500/10 transition-all disabled:opacity-50"
            >
              Cancelar Inscrição Imediatamente
            </button>
          </div>
        {:else}
           <div class="pt-4 border-t border-slate-800">
             <p class="text-xs text-slate-500 italic text-center">Nenhum registro de assinatura encontrado para este usuário.</p>
           </div>
        {/if}
      </div>

      <div class="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button on:click={closeEdit} disabled={subLoading} class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50">
          Cancelar
        </button>
        <button on:click={saveEdit} disabled={subLoading} class="px-5 py-2 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-xl transition-all shadow-[0_0_15px_rgba(14,165,233,0.4)] disabled:opacity-50">
          {subLoading ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  </div>
{/if}
