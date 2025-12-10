<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { logAdminAction } from '$lib/logger'
  import { success, error as errorToast } from '$lib/toast'
  
  let subscriptions = []
  let loading = true
  let searchTerm = ''
  let filterStatus = 'all' // 'all', 'active', 'canceled', 'expiring'
  let adminInfo = null
  
  // Modal states
  let showExtendModal = false
  let selectedSub = null
  let extendMonths = 1
  let extendReason = ''
  let extending = false
  
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
    
    console.log('[Subscriptions] Loading with filter:', filterStatus)
    
    // Get subscriptions with user info
    let query = supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
    
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
      // Show subscriptions that are active but expired
      query = query
        .eq('status', 'active')
        .lt('current_period_end', new Date().toISOString())
    }
    
    const { data: subs, error } = await query
    
    console.log('[Subscriptions] Query result:', { subs, error })
    
    if (error) {
      console.error('Error loading subscriptions:', error)
      subscriptions = []
      loading = false
      return
    }
    
    // Get empresa_perfil for each subscription
    if (subs && subs.length > 0) {
      console.log('[Subscriptions] Found', subs.length, 'subscriptions')
      const userIds = subs.map(s => s.user_id)
      const { data: profiles, error: profileError } = await supabase
        .from('empresa_perfil')
        .select('user_id, nome_exibicao, contato, documento')
        .in('user_id', userIds)
      
      console.log('[Subscriptions] Profiles:', { profiles, profileError })
      
      // Merge profiles with subscriptions
      subscriptions = subs.map(sub => ({
        ...sub,
        empresa_perfil: profiles?.find(p => p.user_id === sub.user_id) || {
          nome_exibicao: 'Sem perfil',
          contato: 'N/A',
          documento: 'N/A'
        }
      }))
      
      console.log('[Subscriptions] Final subscriptions:', subscriptions)
    } else {
      console.log('[Subscriptions] No subscriptions found')
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
  
  async function handleExtendSubscription() {
    if (!selectedSub || !extendReason.trim()) {
      errorToast('Por favor, preencha o motivo do pagamento')
      return
    }
    
    extending = true
    
    try {
      // Call the database function
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
    if (!confirm(`Tem certeza que deseja cancelar a assinatura de ${sub.empresa_perfil.nome_exibicao}?`)) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
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
  
  function getStatusBadge(sub) {
    // Check if expired (even if status is active)
    const isExpired = new Date(sub.current_period_end) < new Date()
    
    if (sub.status === 'active' && isExpired) {
      return { text: '⚠️ EXPIRADA', class: 'bg-red-900/30 text-red-400 border-red-700' }
    }
    
    const badges = {
      active: { text: 'Ativa', class: 'bg-green-900/30 text-green-400 border-green-700' },
      canceled: { text: 'Cancelada', class: 'bg-red-900/30 text-red-400 border-red-700' },
      past_due: { text: 'Vencida', class: 'bg-amber-900/30 text-amber-400 border-amber-700' },
      trialing: { text: 'Trial', class: 'bg-blue-900/30 text-blue-400 border-blue-700' }
    }
    return badges[sub.status] || { text: sub.status, class: 'bg-slate-700 text-slate-300 border-slate-600' }
  }
  
  function getDaysUntilExpiry(date) {
    const expiry = new Date(date)
    const now = new Date()
    const diff = expiry - now
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days
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

<div class="space-y-6">
  <!-- Header -->
  <div class="flex justify-between items-center">
    <div>
      <h2 class="text-2xl font-bold">Assinaturas</h2>
      <p class="text-slate-400 mt-1">Gerenciar todas as assinaturas</p>
    </div>
    
    <button
      on:click={loadSubscriptions}
      class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
    >
      🔄 Atualizar
    </button>
  </div>
  
  <!-- Filters -->
  <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Search -->
      <div>
        <label class="block text-sm text-slate-400 mb-2">Buscar</label>
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Nome, email ou documento..."
          class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>
      
      <!-- Status Filter -->
      <div>
        <label class="block text-sm text-slate-400 mb-2">Status</label>
        <select
          bind:value={filterStatus}
          on:change={loadSubscriptions}
          class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">Todas</option>
          <option value="active">Ativas</option>
          <option value="expired">⚠️ Expiradas</option>
          <option value="expiring">Expirando (7 dias)</option>
          <option value="canceled">Canceladas</option>
        </select>
      </div>
    </div>
  </div>
  
  <!-- Subscriptions List -->
  {#if loading}
    <div class="text-center py-12">
      <div class="text-slate-400">Carregando assinaturas...</div>
    </div>
  {:else if filteredSubscriptions.length === 0}
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
      <div class="text-slate-400">Nenhuma assinatura encontrada</div>
    </div>
  {:else}
    <div class="space-y-4">
      {#each filteredSubscriptions as sub (sub.id)}
        {@const badge = getStatusBadge(sub)}
        {@const daysLeft = getDaysUntilExpiry(sub.current_period_end)}
        {@const isExpiringSoon = sub.status === 'active' && daysLeft <= 7 && daysLeft > 0}
        {@const isExpired = new Date(sub.current_period_end) < new Date()}
        
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-white mb-1">
                {sub.empresa_perfil.nome_exibicao || 'Sem nome'}
              </h3>
              <div class="text-sm text-slate-400 space-y-1">
                <div>📧 {sub.empresa_perfil.contato}</div>
                <div>📄 {sub.empresa_perfil.documento || 'N/A'}</div>
              </div>
            </div>
            
            <div class="text-right">
              <span class="inline-block px-3 py-1 text-sm border rounded-full {badge.class}">
                {badge.text}
              </span>
            </div>
          </div>
          
          <!-- Subscription Details -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
            <div>
              <div class="text-slate-400">Expira em</div>
              <div class="font-medium {isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-white'}">
                {new Date(sub.current_period_end).toLocaleDateString('pt-BR')}
                {#if sub.status === 'active'}
                  {#if isExpired}
                    <span class="text-xs">(EXPIROU há {Math.abs(daysLeft)}d)</span>
                  {:else}
                    <span class="text-xs">({daysLeft}d)</span>
                  {/if}
                {/if}
              </div>
            </div>
            
            <div>
              <div class="text-slate-400">Criada em</div>
              <div class="font-medium text-white">
                {new Date(sub.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
            
            {#if sub.admin_notes}
              <div class="col-span-2">
                <div class="text-slate-400">Notas</div>
                <div class="font-medium text-white text-xs">{sub.admin_notes}</div>
              </div>
            {/if}
          </div>
          
          <!-- Actions -->
          <div class="flex gap-2 flex-wrap">
            {#if sub.status === 'active'}
              <button
                on:click={() => openExtendModal(sub)}
                class="px-4 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-700 rounded-lg transition text-sm"
              >
                💰 Registrar Pagamento
              </button>
              
              <button
                on:click={() => handleCancelSubscription(sub)}
                class="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700 rounded-lg transition text-sm"
              >
                ❌ Cancelar
              </button>
            {:else if sub.status === 'canceled'}
              <button
                on:click={() => handleReactivateSubscription(sub)}
                class="px-4 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-700 rounded-lg transition text-sm"
              >
                ✅ Reativar
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Extend Modal -->
{#if showExtendModal && selectedSub}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
      <h3 class="text-xl font-bold mb-4">Registrar Pagamento Manual</h3>
      
      <div class="mb-4">
        <div class="text-sm text-slate-400">Empresa</div>
        <div class="font-medium">{selectedSub.empresa_perfil.nome_exibicao}</div>
      </div>
      
      <div class="mb-4">
        <div class="text-sm text-slate-400">Expira atualmente em</div>
        <div class="font-medium">
          {new Date(selectedSub.current_period_end).toLocaleDateString('pt-BR')}
        </div>
      </div>
      
      <div class="mb-4">
        <label class="block text-sm text-slate-400 mb-2">Período pago</label>
        <div class="grid grid-cols-4 gap-2">
          <button
            on:click={() => extendMonths = 1}
            class="px-3 py-2 rounded-lg border transition {extendMonths === 1 ? 'bg-sky-600 border-sky-500' : 'bg-slate-700 border-slate-600'}"
          >
            1 mês
          </button>
          <button
            on:click={() => extendMonths = 3}
            class="px-3 py-2 rounded-lg border transition {extendMonths === 3 ? 'bg-sky-600 border-sky-500' : 'bg-slate-700 border-slate-600'}"
          >
            3 meses
          </button>
          <button
            on:click={() => extendMonths = 6}
            class="px-3 py-2 rounded-lg border transition {extendMonths === 6 ? 'bg-sky-600 border-sky-500' : 'bg-slate-700 border-slate-600'}"
          >
            6 meses
          </button>
          <button
            on:click={() => extendMonths = 12}
            class="px-3 py-2 rounded-lg border transition {extendMonths === 12 ? 'bg-sky-600 border-sky-500' : 'bg-slate-700 border-slate-600'}"
          >
            1 ano
          </button>
        </div>
      </div>
      
      <div class="mb-4">
        <label class="block text-sm text-slate-400 mb-2">Motivo (obrigatório)</label>
        <textarea
          bind:value={extendReason}
          rows="3"
          placeholder="Ex: Extensão promocional para early adopter"
          class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
        ></textarea>
      </div>
      
      <div class="flex gap-2">
        <button
          on:click={closeExtendModal}
          disabled={extending}
          class="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          on:click={handleExtendSubscription}
          disabled={extending || !extendReason.trim()}
          class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition disabled:opacity-50"
        >
          {extending ? 'Estendendo...' : 'Estender'}
        </button>
      </div>
    </div>
  </div>
{/if}
