<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseAdmin'
  import { logAdminAction } from '$lib/logger'
  import { success, error as errorToast } from '$lib/toast'

  const API_BASE = import.meta.env.DEV ? 'http://localhost:5173' : 'https://www.zelopdv.com.br'

  const REFERRAL_LABELS = {
    clicked: 'Clique',
    signed_up: 'Cadastro',
    trial_started: 'Teste iniciado',
    pending_payment: 'Pendente pagamento',
    paid_manual_confirmed: 'Pagamento confirmado',
    reward_approved: 'Recompensa aprovada',
    reward_applied: 'Recompensa aplicada',
    rejected: 'Rejeitada',
  }

  const REWARD_LABELS = {
    pending: 'Pendente',
    approved: 'Aprovada',
    applied: 'Aplicada',
    cancelled: 'Cancelada',
  }

  let loading = true
  let referrals = []
  let rewardsByReferralId = {}
  let profilesByUserId = {}
  let adminInfo = null
  let statusFilter = 'all'
  let actionLoading = ''

  $: filteredReferrals = statusFilter === 'all'
    ? referrals
    : referrals.filter(r => r.status === statusFilter)

  onMount(async () => {
    await loadAdminInfo()
    await loadReferrals()
    loading = false
  })

  async function loadAdminInfo() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase
      .from('super_admins')
      .select('*')
      .eq('user_id', session.user.id)
      .single()
    adminInfo = data
  }

  async function loadReferrals() {
    loading = true
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      errorToast('Erro ao carregar indicações: ' + error.message)
      referrals = []
      loading = false
      return
    }

    referrals = data || []
    const userIds = Array.from(new Set(referrals.flatMap(r => [r.referrer_empresa_id, r.referred_empresa_id]).filter(Boolean)))
    const referralIds = referrals.map(r => r.id)

    const [profilesRes, rewardsRes] = await Promise.all([
      userIds.length
        ? supabase
            .from('empresa_perfil')
            .select('user_id, nome_exibicao, contato, documento, referral_code')
            .in('user_id', userIds)
        : { data: [] },
      referralIds.length
        ? supabase
            .from('referral_rewards')
            .select('*')
            .in('referral_id', referralIds)
        : { data: [] },
    ])

    profilesByUserId = Object.fromEntries((profilesRes.data || []).map(p => [p.user_id, p]))
    rewardsByReferralId = Object.fromEntries((rewardsRes.data || []).map(r => [r.referral_id, r]))
    loading = false
  }

  function companyName(userId) {
    return profilesByUserId[userId]?.nome_exibicao || (userId ? userId.slice(0, 8) : 'N/A')
  }

  function fmtDate(value) {
    return value ? new Date(value).toLocaleString('pt-BR') : '-'
  }

  function fmtMoney(cents) {
    if (!cents) return '-'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }

  async function approveReferral(referral) {
    const notes = prompt('Observação para aprovação manual:', 'Primeiro pagamento confirmado manualmente.')
    if (notes === null) return

    try {
      actionLoading = referral.id
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_BASE}/api/admin/referrals/confirm-payment-manual`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          referralId: referral.id,
          rewardType: 'credit',
          amountCents: 3000,
          notes,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Falha ao aprovar')

      await logAdminAction({
        adminId: adminInfo?.id,
        action: 'referral_reward_approved',
        targetUserId: referral.referrer_empresa_id,
        details: { referral_id: referral.id, notes },
      })
      success('Pagamento confirmado e recompensa aprovada.')
      await loadReferrals()
    } catch (err) {
      errorToast(err.message || 'Erro ao aprovar indicação.')
    } finally {
      actionLoading = ''
    }
  }

  async function markApplied(reward, referral) {
    const notes = prompt('Observação da aplicação manual:', 'Crédito aplicado manualmente na conta.')
    if (notes === null) return

    try {
      actionLoading = reward.id
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_BASE}/api/admin/referrals/apply-reward-manual`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ rewardId: reward.id, notes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Falha ao aplicar')

      await logAdminAction({
        adminId: adminInfo?.id,
        action: 'referral_reward_applied',
        targetUserId: referral.referrer_empresa_id,
        details: { referral_id: referral.id, reward_id: reward.id, notes },
      })
      success('Recompensa marcada como aplicada.')
      await loadReferrals()
    } catch (err) {
      errorToast(err.message || 'Erro ao aplicar recompensa.')
    } finally {
      actionLoading = ''
    }
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
    <div>
      <p class="text-sky-400 text-xs font-bold uppercase tracking-[0.2em] mb-2">Cliente indica Cliente</p>
      <h1 class="text-3xl font-extrabold text-white">Indicações</h1>
      <p class="text-slate-400 mt-2">Confirmação manual de pagamento e controle de créditos internos.</p>
    </div>

    <div class="flex gap-2 flex-wrap">
      {#each ['all', 'clicked', 'signed_up', 'trial_started', 'pending_payment', 'paid_manual_confirmed', 'reward_applied', 'rejected'] as status}
        <button
          class="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors {statusFilter === status ? 'bg-sky-500/20 border-sky-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}"
          on:click={() => statusFilter = status}
        >
          {status === 'all' ? 'Todos' : REFERRAL_LABELS[status]}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-8 text-slate-400">Carregando indicações...</div>
  {:else}
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th class="px-5 py-4">Indicador</th>
              <th class="px-5 py-4">Indicado</th>
              <th class="px-5 py-4">Código</th>
              <th class="px-5 py-4">Status</th>
              <th class="px-5 py-4">Recompensa</th>
              <th class="px-5 py-4">Criado</th>
              <th class="px-5 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            {#each filteredReferrals as referral}
              {@const reward = rewardsByReferralId[referral.id]}
              <tr class="hover:bg-slate-800/40">
                <td class="px-5 py-4">
                  <div class="text-white font-semibold">{companyName(referral.referrer_empresa_id)}</div>
                  <div class="text-xs text-slate-500">{referral.referrer_empresa_id}</div>
                </td>
                <td class="px-5 py-4">
                  <div class="text-slate-200 font-medium">{companyName(referral.referred_empresa_id)}</div>
                  <div class="text-xs text-slate-500">{referral.referred_email || referral.referred_phone || 'Ainda não identificado'}</div>
                </td>
                <td class="px-5 py-4 text-slate-300 font-mono text-sm">{referral.referral_code}</td>
                <td class="px-5 py-4">
                  <span class="inline-flex px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold">
                    {REFERRAL_LABELS[referral.status] || referral.status}
                  </span>
                </td>
                <td class="px-5 py-4">
                  {#if reward}
                    <div class="text-slate-200">{reward.reward_type === 'credit' ? fmtMoney(reward.amount_cents) : `${reward.addon_key} grátis`}</div>
                    <div class="text-xs text-slate-500">{REWARD_LABELS[reward.status] || reward.status}</div>
                  {:else}
                    <span class="text-slate-500 text-sm">Sem recompensa</span>
                  {/if}
                </td>
                <td class="px-5 py-4 text-slate-400 text-sm">{fmtDate(referral.created_at)}</td>
                <td class="px-5 py-4">
                  <div class="flex justify-end gap-2">
                    {#if referral.referred_empresa_id && !reward && referral.status !== 'rejected'}
                      <button
                        class="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-sm font-bold disabled:opacity-50"
                        disabled={actionLoading === referral.id}
                        on:click={() => approveReferral(referral)}
                      >
                        Aprovar
                      </button>
                    {/if}
                    {#if reward && reward.status === 'approved'}
                      <button
                        class="px-3 py-2 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 text-sm font-bold disabled:opacity-50"
                        disabled={actionLoading === reward.id}
                        on:click={() => markApplied(reward, referral)}
                      >
                        Marcar aplicada
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="7" class="px-5 py-10 text-center text-slate-500">Nenhuma indicação encontrada.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
