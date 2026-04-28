<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { logAdminAction } from '$lib/logger'
  import { fade, slide } from 'svelte/transition'
  import { PLANS, VALID_PLAN_TIERS, calculateValue, isAddonAllowed, planLabel, subscriptionValue } from '$lib/pricing'

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
  
  onMount(async () => {
    await loadAdminInfo()
    await loadUsers()
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
  
  async function loadUsers() {
    loading = true

    const { data: profiles, error: profileError } = await supabase
      .from('empresa_perfil')
      .select('*')
      .order('created_at', { ascending: false })

    if (profileError) {
      console.error('Error loading users:', profileError)
      users = []
      loading = false
      return
    }

    if (profiles && profiles.length > 0) {
      const userIds = profiles.map(p => p.user_id)

      // Run queries in parallel
      const [subsResult, aiResult, salesResult, lastSeenResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('id, user_id, status, current_period_end, manually_extended_until, plan_tier, has_mesas_addon, provider_subscription_id')
          .in('user_id', userIds)
          .order('updated_at', { ascending: false }),
        supabase
          .from('ai_usage_logs')
          .select('user_id')
          .in('user_id', userIds),
        supabase.rpc('admin_get_sales_counts', { days_ago: 30 }),
        supabase.rpc('admin_get_users_last_seen'),
      ])

      // Build per-user lookup maps
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

      users = profiles.map(profile => ({
        ...profile,
        subscriptions: subsResult.data?.filter(s => s.user_id === profile.user_id).slice(0, 1) || [],
        ai_interactions: aiCountMap[profile.user_id] || 0,
        sales_last_30d: salesCountMap[profile.user_id] || 0,
        effective_last_seen: lastSeenMap[profile.user_id] || null,
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

  async function handleResetPassword(user) {
    if (!confirm(`Enviar email de reset de senha para ${user.contato}?`)) return
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.contato, {
        redirectTo: 'https://zelopdv.com.br/reset-password'
      })
      
      if (error) throw error
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'reset_password',
        targetUserId: user.user_id,
        details: { email: user.contato, company: user.nome_exibicao }
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
    isEditing = true
  }

  function closeEdit() {
    isEditing = false
    editForm = {}
    editSub = null
    editPlanTier = 'pdv'
    editMesasAddon = false
  }

  async function saveEdit() {
    try {
      subLoading = true
      // Update profile
      const { error: profileError } = await supabase
        .from('empresa_perfil')
        .update({
          nome_exibicao: editForm.nome_exibicao,
          documento: editForm.documento,
          contato: editForm.contato,
          modulo_pdv_ativo: editForm.modulo_pdv_ativo
        })
        .eq('user_id', editForm.user_id)
      
      if (profileError) throw profileError
      
      // Update subscription if status, plan_tier, or addon changed
      const originalSub = users.find(u => u.user_id === editForm.user_id)?.subscriptions?.[0]
      const finalMesas = isAddonAllowed(editPlanTier, 'mesas') && editMesasAddon
      const subChanged = editSub && originalSub && (
        editSub.status !== originalSub.status ||
        editPlanTier !== (originalSub.plan_tier || 'pdv') ||
        finalMesas !== !!originalSub.has_mesas_addon
      )

      if (subChanged) {
        const updateData = {
          status: editSub.status,
          plan_tier: editPlanTier,
          has_mesas_addon: finalMesas,
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
            old: { status: originalSub.status, plan_tier: originalSub.plan_tier, has_mesas_addon: originalSub.has_mesas_addon },
            new: { status: editSub.status, plan_tier: editPlanTier, has_mesas_addon: finalMesas },
            company: editForm.nome_exibicao,
            warning: originalSub.provider_subscription_id ? 'Asaas value NOT synced' : null,
          },
        })
      }
      
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'edit_user',
        targetUserId: editForm.user_id,
        details: { email: editForm.contato, company: editForm.nome_exibicao }
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
      user.contato?.toLowerCase().includes(search) ||
      user.documento?.toLowerCase().includes(search)
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
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Documento</th>
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
                    <p class="text-xs text-slate-500 truncate mt-0.5">{user.contato}</p>
                  </div>
                </div>
              </td>
              <td class="py-4 px-6">
                <span class="inline-flex px-2.5 py-1 text-[11px] font-medium tracking-wide rounded-md {status.class}">
                  {status.text}
                </span>
              </td>
              <td class="py-4 px-6 text-sm text-slate-400">
                {#if sub && sub.current_period_end}
                  {new Date(sub.current_period_end).toLocaleDateString('pt-BR')}
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
              <td class="py-4 px-6 text-sm text-slate-400 font-mono text-xs">
                {user.documento || '-'}
              </td>
              <td class="py-4 px-6 text-right">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  
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

          <div class="flex items-center gap-4 border-t border-slate-800 pt-4 mt-2">
            <button on:click={() => handleResetPassword(user)} class="p-2 text-slate-400 bg-slate-800 rounded-lg hover:text-white" title="Reset Senha">
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
          <label class="block text-[13px] font-medium text-slate-400">Email de Contato</label>
          <input 
            type="email" 
            bind:value={editForm.contato} 
            class="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
          />
        </div>

        <div class="pt-2">
          <label class="flex items-center cursor-pointer group">
            <div class="relative flex items-center justify-center">
              <input type="checkbox" bind:checked={editForm.modulo_pdv_ativo} class="sr-only peer" />
              <div class="w-10 h-5.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-sky-500 shadow-inner"></div>
            </div>
            <span class="ml-3 text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Acesso ao Módulo PDV</span>
          </label>
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
