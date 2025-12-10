<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { logAdminAction } from '$lib/logger'
  
  let users = []
  let loading = true
  let searchTerm = ''
  let adminInfo = null
  
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
    
    // Get all empresa_perfil
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
    
    // Get subscriptions for these users
    if (profiles && profiles.length > 0) {
      const userIds = profiles.map(p => p.user_id)
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('user_id, status, current_period_end, manually_extended_until')
        .in('user_id', userIds)
        .order('updated_at', { ascending: false })
      
      // Merge subscriptions with profiles (only most recent per user)
      users = profiles.map(profile => ({
        ...profile,
        subscriptions: subs?.filter(s => s.user_id === profile.user_id).slice(0, 1) || []
      }))
    } else {
      users = []
    }
    
    loading = false
  }
  
  async function handleResetPassword(user) {
    if (!confirm(`Enviar email de reset de senha para ${user.contato}?`)) {
      return
    }
    
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
  
  function getUserStatus(user) {
    const sub = user.subscriptions?.[0]
    if (!sub) return { text: 'Sem assinatura', class: 'bg-slate-700 text-slate-300 border-slate-600' }
    
    if (sub.status === 'active') {
      return { text: 'Ativo', class: 'bg-green-900/30 text-green-400 border-green-700' }
    } else if (sub.status === 'canceled') {
      return { text: 'Cancelado', class: 'bg-red-900/30 text-red-400 border-red-700' }
    }
    
    return { text: sub.status, class: 'bg-slate-700 text-slate-300 border-slate-600' }
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
  <title>Usuários - Zelo Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex justify-between items-center">
    <div>
      <h2 class="text-2xl font-bold">Usuários</h2>
      <p class="text-slate-400 mt-1">Gerenciar contas de empresas</p>
    </div>
    
    <button
      on:click={loadUsers}
      class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
    >
      🔄 Atualizar
    </button>
  </div>
  
  <!-- Search -->
  <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
    <label class="block text-sm text-slate-400 mb-2">Buscar</label>
    <input
      type="text"
      bind:value={searchTerm}
      placeholder="Nome, email ou documento..."
      class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
    />
  </div>
  
  <!-- Users List -->
  {#if loading}
    <div class="text-center py-12">
      <div class="text-slate-400">Carregando usuários...</div>
    </div>
  {:else if filteredUsers.length === 0}
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
      <div class="text-slate-400">Nenhum usuário encontrado</div>
    </div>
  {:else}
    <div class="space-y-4">
      {#each filteredUsers as user (user.user_id)}
        {@const status = getUserStatus(user)}
        {@const sub = user.subscriptions?.[0]}
        
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-white mb-1">
                {user.nome_exibicao || 'Sem nome'}
              </h3>
              <div class="text-sm text-slate-400 space-y-1">
                <div>📧 {user.contato}</div>
                <div>📄 {user.documento || 'N/A'}</div>
                <div>📱 {user.telefone || 'N/A'}</div>
              </div>
            </div>
            
            <div class="text-right">
              <span class="inline-block px-3 py-1 text-sm border rounded-full {status.class}">
                {status.text}
              </span>
            </div>
          </div>
          
          <!-- User Details -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 text-sm">
            <div>
              <div class="text-slate-400">Cadastrado em</div>
              <div class="font-medium text-white">
                {new Date(user.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
            
            {#if sub}
              <div>
                <div class="text-slate-400">Assinatura expira</div>
                <div class="font-medium text-white">
                  {new Date(sub.current_period_end).toLocaleDateString('pt-BR')}
                </div>
              </div>
            {/if}
            
            <div>
              <div class="text-slate-400">Largura Bobina</div>
              <div class="font-medium text-white">{user.largura_bobina || 'N/A'}</div>
            </div>
          </div>
          
          <!-- Actions -->
          <div class="flex gap-2 flex-wrap">
            <button
              on:click={() => handleResetPassword(user)}
              class="px-4 py-2 bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 border border-amber-700 rounded-lg transition text-sm"
            >
              🔑 Reset Senha
            </button>
            
            <a
              href="/subscriptions?user={user.user_id}"
              class="px-4 py-2 bg-sky-900/30 hover:bg-sky-900/50 text-sky-400 border border-sky-700 rounded-lg transition text-sm inline-block"
            >
              📋 Ver Assinatura
            </a>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
