<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabaseClient'
  import { logAdminAction } from '$lib/logger'
  import { success, error as errorToast } from '$lib/toast'
  import { confirmDialog, promptDialog } from '$lib/confirmDialog'

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

  const REJECTION_LABELS = {
    same_empresa: 'Autoindicação',
    duplicate: 'Duplicada',
    payment_not_confirmed: 'Pagamento não confirmado',
    fraud_suspected: 'Fraude ou suspeita',
    team_request: 'Pedido do time',
    other: 'Outro motivo manual',
    same_email: 'Mesmo e-mail do indicador',
    same_phone: 'Mesmo telefone',
    same_documento: 'Mesmo documento',
  }

  const ACTIONS = {
    mark_signed_up: {
      label: 'Marcar como cadastro',
      logAction: 'referral_mark_signed_up',
      defaultNotes: 'Cadastro confirmado manualmente.',
    },
    mark_trial_started: {
      label: 'Marcar como teste iniciado',
      logAction: 'referral_mark_trial_started',
      defaultNotes: 'Teste iniciado confirmado manualmente.',
    },
    mark_pending_payment: {
      label: 'Marcar como pendente de pagamento',
      logAction: 'referral_mark_pending_payment',
      defaultNotes: 'Aguardando primeiro pagamento confirmado manualmente.',
    },
    confirm_payment: {
      label: 'Confirmar pagamento e aprovar recompensa',
      logAction: 'referral_payment_confirmed',
      defaultNotes: 'Primeiro pagamento confirmado manualmente.',
    },
    mark_reward_applied: {
      label: 'Marcar recompensa como aplicada',
      logAction: 'referral_reward_applied',
      defaultNotes: 'Crédito aplicado manualmente na conta.',
    },
    reopen_signed_up: {
      label: 'Reabrir para cadastro',
      logAction: 'referral_reopened_signed_up',
      defaultNotes: 'Indicação reaberta para fase de cadastro.',
    },
    reopen_trial_started: {
      label: 'Reabrir para teste iniciado',
      logAction: 'referral_reopened_trial_started',
      defaultNotes: 'Indicação reaberta para fase de teste iniciado.',
    },
    reopen_pending_payment: {
      label: 'Reabrir para pendente de pagamento',
      logAction: 'referral_reopened_pending_payment',
      defaultNotes: 'Indicação reaberta para revisão antes da confirmação do pagamento.',
    },
    reject_same_empresa: {
      label: 'Rejeitar: autoindicação',
      logAction: 'referral_rejected_same_empresa',
      defaultNotes: 'Rejeitada por autoindicação.',
    },
    reject_duplicate: {
      label: 'Rejeitar: duplicada',
      logAction: 'referral_rejected_duplicate',
      defaultNotes: 'Rejeitada por duplicidade.',
    },
    reject_payment_not_confirmed: {
      label: 'Rejeitar: pagamento não confirmado',
      logAction: 'referral_rejected_payment_not_confirmed',
      defaultNotes: 'Rejeitada porque o primeiro pagamento não foi confirmado.',
    },
    reject_fraud_suspected: {
      label: 'Rejeitar: fraude ou suspeita',
      logAction: 'referral_rejected_fraud_suspected',
      defaultNotes: 'Rejeitada por suspeita de fraude.',
    },
    reject_team_request: {
      label: 'Rejeitar: pedido do time',
      logAction: 'referral_rejected_team_request',
      defaultNotes: 'Rejeitada por decisão operacional do time.',
    },
    reject_other: {
      label: 'Rejeitar: outro motivo',
      logAction: 'referral_rejected_other',
      defaultNotes: 'Rejeitada manualmente.',
    },
  }

  let loading = true
  let referrals = []
  let rewardsByReferralId = {}
  let profilesByUserId = {}
  let adminInfo = null
  let statusFilter = 'all'
  let actionLoading = ''
  let selectedActionByReferralId = {}

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

  function availableActions(referral, reward) {
    const options = []
    const isRejected = referral.status === 'rejected'
    const hasApprovedReward = reward && reward.status === 'approved'
    const hasAppliedReward = reward && reward.status === 'applied'

    if (referral.status === 'clicked') {
      options.push('mark_signed_up', 'mark_trial_started', 'mark_pending_payment')
    }

    if (referral.status === 'signed_up') {
      options.push('mark_trial_started', 'mark_pending_payment')
    }

    if (referral.status === 'trial_started') {
      options.push('mark_pending_payment')
    }

    if (referral.referred_empresa_id && !isRejected && !hasApprovedReward && !hasAppliedReward) {
      options.push('confirm_payment')
    }

    if (hasApprovedReward) {
      options.push('mark_reward_applied')
    }

    if (isRejected || hasApprovedReward || hasAppliedReward || ['paid_manual_confirmed', 'reward_applied'].includes(referral.status)) {
      options.push('reopen_pending_payment', 'reopen_trial_started', 'reopen_signed_up')
    }

    if (!isRejected) {
      options.push(
        'reject_same_empresa',
        'reject_duplicate',
        'reject_payment_not_confirmed',
        'reject_fraud_suspected',
        'reject_team_request',
        'reject_other',
      )
    }

    return Array.from(new Set(options))
  }

  function defaultNotesFor(action) {
    return ACTIONS[action]?.defaultNotes || 'Ajuste manual de indicação.'
  }

  function formatRejectionReason(reason) {
    return REJECTION_LABELS[reason] || reason || '-'
  }

  async function runAction(referral, reward) {
    const action = selectedActionByReferralId[referral.id]
    if (!action) return

    const actionMeta = ACTIONS[action]
    if (!actionMeta) return

    const rewardWillBeCancelled = reward && ['approved', 'applied'].includes(reward.status)
      && ['reopen_pending_payment', 'reopen_trial_started', 'reopen_signed_up', 'reject_same_empresa', 'reject_duplicate', 'reject_payment_not_confirmed', 'reject_fraud_suspected', 'reject_team_request', 'reject_other'].includes(action)

    if (rewardWillBeCancelled) {
      const ok = await confirmDialog({
        title: 'Cancelar recompensa atual',
        message: 'Essa ação vai cancelar a recompensa atual para manter a auditoria consistente. Deseja continuar?',
        confirmStyle: 'warning',
      })
      if (!ok) return
    }

    const notes = await promptDialog({
      title: actionMeta.label,
      message: `Observação para "${actionMeta.label}":`,
      defaultValue: defaultNotesFor(action),
      multiline: true,
      placeholder: 'Adicione contexto da decisão...',
    })
    if (notes === null) return

    try {
      actionLoading = referral.id
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_BASE}/api/admin/referrals/manual-action`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          referralId: referral.id,
          action,
          notes,
          rewardType: 'credit',
          amountCents: 3000,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Falha ao executar ação')

      await logAdminAction({
        adminId: adminInfo?.id,
        action: actionMeta.logAction,
        targetUserId: referral.referrer_empresa_id,
        details: {
          referral_id: referral.id,
          reward_id: reward?.id || null,
          manual_action: action,
          notes,
        },
      })

      selectedActionByReferralId = { ...selectedActionByReferralId, [referral.id]: '' }
      success(`Ação executada: ${actionMeta.label}.`)
      await loadReferrals()
    } catch (err) {
      errorToast(err.message || 'Erro ao executar ação manual.')
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
      <p class="text-slate-400 mt-2">Confirmação manual, reabertura, rejeição e auditoria das indicações.</p>
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
              <th class="px-5 py-4">Auditoria</th>
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
                  {#if referral.rejection_reason}
                    <div class="text-xs text-rose-300 mt-2">{formatRejectionReason(referral.rejection_reason)}</div>
                  {/if}
                </td>
                <td class="px-5 py-4">
                  {#if reward}
                    <div class="text-slate-200">{reward.reward_type === 'credit' ? fmtMoney(reward.amount_cents) : `${reward.addon_key} grátis`}</div>
                    <div class="text-xs text-slate-500">{REWARD_LABELS[reward.status] || reward.status}</div>
                    {#if reward.reason}
                      <div class="text-xs text-slate-500 mt-2 break-words">{reward.reason}</div>
                    {/if}
                  {:else}
                    <span class="text-slate-500 text-sm">Sem recompensa</span>
                  {/if}
                </td>
                <td class="px-5 py-4">
                  <div class="text-xs text-slate-500 whitespace-pre-line break-words max-w-[300px]">
                    {referral.admin_notes || '-'}
                  </div>
                </td>
                <td class="px-5 py-4 text-slate-400 text-sm">{fmtDate(referral.created_at)}</td>
                <td class="px-5 py-4">
                  <div class="flex justify-end gap-2 min-w-[320px]">
                    <select
                      class="w-full max-w-[240px] rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                      value={selectedActionByReferralId[referral.id] || ''}
                      on:change={(event) => {
                        selectedActionByReferralId = {
                          ...selectedActionByReferralId,
                          [referral.id]: event.currentTarget.value,
                        }
                      }}
                    >
                      <option value="">Escolha uma ação</option>
                      {#each availableActions(referral, reward) as action}
                        <option value={action}>{ACTIONS[action].label}</option>
                      {/each}
                    </select>
                    <button
                      class="px-3 py-2 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 text-sm font-bold disabled:opacity-50"
                      disabled={actionLoading === referral.id || !selectedActionByReferralId[referral.id]}
                      on:click={() => runAction(referral, reward)}
                    >
                      Executar
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="8" class="px-5 py-10 text-center text-slate-500">Nenhuma indicação encontrada.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
