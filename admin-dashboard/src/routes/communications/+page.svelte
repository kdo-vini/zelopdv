<script>
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { supabase } from '$lib/supabaseClient'
  import { success, error as errorToast, warning } from '$lib/toast'
  import { confirmDialog } from '$lib/confirmDialog'
  import {
    COMMUNICATION_PLACEHOLDERS,
    TECHNE_WHATSAPP_NUMBER,
    applyCommunicationPlaceholders,
  } from '$lib/communicationPlaceholders'

  const API_BASE = import.meta.env.DEV ? 'http://localhost:5173' : 'https://www.zelopdv.com.br'

  const SOURCE_FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'zelopdv', label: 'ZeloPDV' },
    { key: 'zelochat', label: 'ZeloChat' },
    { key: 'both', label: 'Ambos' },
  ]

  let loading = true
  let users = []
  let searchTerm = ''
  let sourceFilter = 'all'
  let selectedUser = null
  let selectedUserIds = []
  let mode = 'email'
  let sending = false

  let emailSubject = 'Oi {{primeiro_nome}}'
  let emailBody =
    'Quero falar com você sobre o Zelo PDV.\n\n' +
    'Se precisar, você também pode acessar sua conta em {{link_login}}.\n\n' +
    'Abraço.'

  let whatsappBody =
    'Oi {{primeiro_nome}}, tudo bem?\n\n' +
    'Quero falar com você sobre o Zelo PDV.\n\n' +
    'Se precisar acessar sua conta: {{link_login}}'

  let headerCheckbox
  let emailSubjectRef
  let emailBodyRef
  let whatsappBodyRef
  let focusedField = 'emailBody'

  onMount(async () => {
    await loadUsers()
    loading = false
  })

  async function loadUsers() {
    const [{ data: allUsers, error: usersError }, { data: admins }] = await Promise.all([
      supabase.rpc('admin_get_all_auth_users'),
      supabase.from('super_admins').select('user_id'),
    ])

    if (usersError) {
      console.error('[Communications] Error loading users:', usersError)
      users = []
      return
    }

    const adminIds = new Set((admins || []).map((admin) => admin.user_id))
    const baseUsers = (allUsers || [])
      .filter((user) => !adminIds.has(user.user_id))
      .map((user) => ({
        user_id: user.user_id,
        nome_exibicao: user.nome_exibicao || user.raw_user_meta_data?.full_name || null,
        email: user.email || '',
        phone: user.contato || '',
        documento: user.documento || '',
        created_at: user.profile_created_at || user.auth_created_at || null,
        has_zelopdv: !!user.modulo_pdv_ativo,
      }))

    let profileRows = []
    let subscriptionRows = []
    if (baseUsers.length > 0) {
      const [{ data: profileData, error: profileError }, { data: subscriptionData, error: subscriptionError }] = await Promise.all([
        supabase
          .from('empresa_perfil')
          .select('user_id, whatsmiau_instance, zelochat_onboarding_done')
          .in('user_id', baseUsers.map((user) => user.user_id)),
        supabase
          .from('subscriptions')
          .select('user_id, plan_tier, updated_at')
          .in('user_id', baseUsers.map((user) => user.user_id))
          .order('updated_at', { ascending: false }),
      ])

      if (profileError) {
        console.warn('[Communications] Error loading profile source flags:', profileError)
      }
      if (subscriptionError) {
        console.warn('[Communications] Error loading subscription tiers:', subscriptionError)
      }

      profileRows = profileData || []
      subscriptionRows = subscriptionData || []
    }

    const profileMap = Object.fromEntries(profileRows.map((row) => [row.user_id, row]))
    const latestSubscriptionMap = {}
    for (const row of subscriptionRows) {
      if (!latestSubscriptionMap[row.user_id]) {
        latestSubscriptionMap[row.user_id] = row
      }
    }

    users = baseUsers.map((user) => {
      const profile = profileMap[user.user_id] || {}
      const subscription = latestSubscriptionMap[user.user_id] || {}
      const planTier = subscription.plan_tier || null
      const hasZeloPdv = user.has_zelopdv || ['pdv', 'bundle'].includes(planTier)
      const hasZelochat =
        !!profile.whatsmiau_instance ||
        profile.zelochat_onboarding_done === true ||
        ['chat', 'bundle'].includes(planTier)
      const sourceType = hasZeloPdv && hasZelochat
        ? 'both'
        : hasZeloPdv
          ? 'zelopdv'
          : hasZelochat
            ? 'zelochat'
            : 'none'

      return {
        ...user,
        has_zelopdv: hasZeloPdv,
        has_zelochat: hasZelochat,
        plan_tier: planTier,
        source_type: sourceType,
      }
    })

    selectedUser = users[0] || null
  }

  function normalizeSearch(value) {
    return String(value || '').toLowerCase()
  }

  function formatPhone(value) {
    const digits = String(value || '').replace(/\D/g, '')
    if (!digits) return 'Sem WhatsApp'
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+${digits}`
    }
    return digits
  }

  function getSourceLabel(user) {
    if (user.source_type === 'both') return 'Ambos'
    if (user.source_type === 'zelopdv') return 'ZeloPDV'
    if (user.source_type === 'zelochat') return 'ZeloChat'
    return 'Sem origem'
  }

  function getSourceBadgeClass(user) {
    if (user.source_type === 'both') {
      return 'border-violet-500/20 bg-violet-500/10 text-violet-300'
    }
    if (user.source_type === 'zelopdv') {
      return 'border-sky-500/20 bg-sky-500/10 text-sky-300'
    }
    if (user.source_type === 'zelochat') {
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    }
    return 'border-slate-700 bg-slate-800/60 text-slate-400'
  }

  function isRecipientEligible(user) {
    return mode === 'email' ? !!user?.email : !!user?.phone
  }

  function sameIds(a = [], b = []) {
    return a.length === b.length && a.every((value, index) => value === b[index])
  }

  function setMode(nextMode) {
    mode = nextMode
    focusedField = nextMode === 'email' ? 'emailBody' : 'whatsappBody'
  }

  function getActiveFieldRef() {
    if (focusedField === 'emailSubject') return emailSubjectRef
    if (focusedField === 'whatsappBody') return whatsappBodyRef
    return emailBodyRef
  }

  function insertPlaceholder(token) {
    const ref = getActiveFieldRef()

    if (ref && typeof ref.selectionStart === 'number') {
      const start = ref.selectionStart
      const end = ref.selectionEnd
      const currentValue = ref.value || ''
      const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`

      if (focusedField === 'emailSubject') {
        emailSubject = nextValue
      } else if (focusedField === 'whatsappBody') {
        whatsappBody = nextValue
      } else {
        emailBody = nextValue
      }

      requestAnimationFrame(() => {
        ref.focus()
        ref.setSelectionRange(start + token.length, start + token.length)
      })
      return
    }

    if (focusedField === 'emailSubject') {
      emailSubject = `${emailSubject}${token}`
    } else if (focusedField === 'whatsappBody') {
      whatsappBody = `${whatsappBody}${token}`
    } else {
      emailBody = `${emailBody}${token}`
    }
  }

  function toggleRecipientSelection(userId, checked) {
    if (checked) {
      selectedUserIds = Array.from(new Set([...selectedUserIds, userId]))
      return
    }
    selectedUserIds = selectedUserIds.filter((id) => id !== userId)
  }

  function toggleVisibleSelection(checked) {
    selectedUserIds = checked ? visibleEligibleRecipientIds.slice() : []
  }

  function getRowClass(user) {
    const isFocused = selectedUser?.user_id === user.user_id
    const isChecked = selectedUserIds.includes(user.user_id)

    if (isFocused) return 'bg-slate-800/60'
    if (isChecked) return 'bg-slate-800/35'
    return 'hover:bg-slate-800/30'
  }

  async function sendCommunication() {
    const recipients = selectedRecipients.length > 0
      ? selectedRecipients
      : selectedUser && isRecipientEligible(selectedUser)
        ? [selectedUser]
        : []

    if (recipients.length === 0) {
      errorToast(mode === 'email' ? 'Selecione destinatários com email.' : 'Selecione destinatários com WhatsApp.')
      return
    }

    if (recipients.length > 1) {
      const confirmed = await confirmDialog({
        title: 'Enviar em lote',
        message: `Enviar ${mode === 'email' ? 'email' : 'WhatsApp'} para ${recipients.length} destinatários?`,
        confirmLabel: `Enviar ${recipients.length}`,
      })
      if (!confirmed) return
    }

    sending = true

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const payload = {
        mode,
        recipient: recipients.length === 1 ? recipients[0] : null,
        recipients: recipients.length > 1 ? recipients : null,
        subject: emailSubject,
        body: mode === 'email' ? emailBody : whatsappBody,
      }

      const response = await fetch(`${API_BASE}/api/admin/communications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || 'Falha ao enviar comunicação.')
      }

      if (body.failedCount > 0) {
        warning(`${body.sentCount} enviados, ${body.failedCount} falharam.`)
      } else if (body.sentCount > 1) {
        success(`${body.sentCount} envios concluídos.`)
      } else {
        success(mode === 'email' ? 'Email enviado.' : 'WhatsApp enviado.')
      }

      selectedUserIds = []
    } catch (err) {
      console.error('[Communications] send error:', err)
      errorToast(err?.message || 'Falha ao enviar comunicação.')
    } finally {
      sending = false
    }
  }

  $: filteredUsers = users.filter((user) => {
    const search = normalizeSearch(searchTerm)
    const matchesSource =
      sourceFilter === 'all' ||
      (sourceFilter === 'both' && user.has_zelopdv && user.has_zelochat) ||
      (sourceFilter === 'zelopdv' && user.has_zelopdv) ||
      (sourceFilter === 'zelochat' && user.has_zelochat)

    if (!matchesSource) return false
    if (!search) return true

    return (
      normalizeSearch(user.nome_exibicao).includes(search) ||
      normalizeSearch(user.email).includes(search) ||
      normalizeSearch(user.phone).includes(search) ||
      normalizeSearch(user.documento).includes(search)
    )
  })

  $: sourceCounts = SOURCE_FILTERS.reduce((acc, filter) => {
    acc[filter.key] = users.filter((user) => {
      if (filter.key === 'all') return true
      if (filter.key === 'both') return user.has_zelopdv && user.has_zelochat
      if (filter.key === 'zelopdv') return user.has_zelopdv
      if (filter.key === 'zelochat') return user.has_zelochat
      return false
    }).length
    return acc
  }, {})

  $: usersById = Object.fromEntries(users.map((user) => [user.user_id, user]))
  $: visibleRecipientIds = new Set(filteredUsers.map((user) => user.user_id))
  $: visibleEligibleRecipientIds = filteredUsers.filter(isRecipientEligible).map((user) => user.user_id)
  $: {
    const nextSelectedUserIds = selectedUserIds.filter((id, index) => {
      return visibleRecipientIds.has(id) && isRecipientEligible(usersById[id]) && selectedUserIds.indexOf(id) === index
    })

    if (!sameIds(nextSelectedUserIds, selectedUserIds)) {
      selectedUserIds = nextSelectedUserIds
    }
  }
  $: allVisibleSelected =
    visibleEligibleRecipientIds.length > 0 &&
    visibleEligibleRecipientIds.every((id) => selectedUserIds.includes(id))
  $: someVisibleSelected = visibleEligibleRecipientIds.some((id) => selectedUserIds.includes(id))
  $: if (headerCheckbox) {
    headerCheckbox.indeterminate = someVisibleSelected && !allVisibleSelected
  }
  $: selectedRecipients = selectedUserIds.map((id) => usersById[id]).filter(Boolean)
  $: previewUser = selectedRecipients[0] || selectedUser || null
  $: if (selectedUser && !filteredUsers.some((user) => user.user_id === selectedUser.user_id)) {
    selectedUser = filteredUsers[0] || null
  }
  $: if (!selectedUser && filteredUsers.length > 0) {
    selectedUser = filteredUsers[0]
  }
  $: resolvedEmailSubject = previewUser
    ? applyCommunicationPlaceholders(emailSubject, previewUser)
    : emailSubject
  $: resolvedEmailBody = previewUser
    ? applyCommunicationPlaceholders(emailBody, previewUser)
    : emailBody
  $: resolvedWhatsappBody = previewUser
    ? applyCommunicationPlaceholders(whatsappBody, previewUser)
    : whatsappBody
</script>

<svelte:head>
  <title>Comunicação - Admin Zelo</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-500">
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">
        Admin / Comunicação
      </p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Comunicação</h1>
    </div>

    <button
      type="button"
      on:click={sendCommunication}
      disabled={
        sending ||
        (selectedRecipients.length === 0 && (!selectedUser || !isRecipientEligible(selectedUser)))
      }
      class="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sm font-medium text-sky-300 transition-all hover:border-sky-500/50 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 2L11 13" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 2L15 22L11 13L2 9L22 2Z" />
      </svg>
      {#if sending}
        Enviando...
      {:else if selectedRecipients.length > 1}
        Enviar {selectedRecipients.length}
      {:else}
        {mode === 'email' ? 'Enviar email' : 'Enviar WhatsApp'}
      {/if}
    </button>
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4" in:fade>
      <div class="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div>
      <div class="text-sm font-medium text-slate-400">Carregando destinatários...</div>
    </div>
  {:else}
    <div class="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
      <section class="overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 shadow-xl backdrop-blur-xs" in:fade>
        <div class="border-b border-slate-800 p-4 space-y-4">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              bind:value={searchTerm}
              placeholder="Buscar por nome, email ou WhatsApp..."
              aria-label="Buscar destinatário"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            {#each SOURCE_FILTERS as filter}
              <button
                type="button"
                on:click={() => (sourceFilter = filter.key)}
                aria-pressed={sourceFilter === filter.key}
                class="inline-flex items-center gap-2 px-3 h-8 rounded-lg border text-xs font-medium transition-all {sourceFilter === filter.key ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:text-white'}"
              >
                {filter.label}
                <span class="inline-flex min-w-5 justify-center rounded-full bg-slate-800/90 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {sourceCounts[filter.key] || 0}
                </span>
              </button>
            {/each}
          </div>

          {#if selectedRecipients.length > 0}
            <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <div class="text-sm font-medium text-slate-200">
                {selectedRecipients.length} selecionado(s)
              </div>
              <button
                type="button"
                on:click={() => (selectedUserIds = [])}
                class="text-xs font-medium text-slate-400 transition-colors hover:text-white"
              >
                Limpar
              </button>
            </div>
          {/if}
        </div>

        <div class="border-b border-slate-800/60 px-4 py-3">
          <div class="flex items-center gap-3">
            <input
              bind:this={headerCheckbox}
              class="themed-checkbox compact"
              type="checkbox"
              checked={allVisibleSelected}
              disabled={visibleEligibleRecipientIds.length === 0}
              aria-label="Selecionar destinatários visíveis"
              on:change={(event) => toggleVisibleSelection(event.currentTarget.checked)}
            />
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {mode === 'email' ? 'Email' : 'WhatsApp'} · {visibleEligibleRecipientIds.length} elegíveis
            </div>
          </div>
        </div>

        <div class="max-h-[720px] overflow-y-auto">
          {#if filteredUsers.length === 0}
            <div class="px-5 py-12 text-center text-sm text-slate-500">Nenhum destinatário.</div>
          {:else}
            {#each filteredUsers as user (user.user_id)}
              <div class="border-b border-slate-800/60 transition-colors {getRowClass(user)}">
                <div class="flex items-start gap-3 px-4 py-4">
                  <input
                    class="themed-checkbox compact mt-1"
                    type="checkbox"
                    checked={selectedUserIds.includes(user.user_id)}
                    disabled={!isRecipientEligible(user)}
                    aria-label={`Selecionar ${user.nome_exibicao || user.email || 'destinatário'}`}
                    on:click|stopPropagation
                    on:change={(event) => toggleRecipientSelection(user.user_id, event.currentTarget.checked)}
                  />

                  <button
                    type="button"
                    on:click={() => (selectedUser = user)}
                    class="flex-1 min-w-0 text-left"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-slate-100 truncate">{user.nome_exibicao || 'Sem nome'}</p>
                        <p class="text-xs text-slate-400 truncate mt-1">{user.email || 'Sem email'}</p>
                        <p class="text-xs text-slate-500 truncate mt-1">{formatPhone(user.phone)}</p>
                      </div>

                      <div class="flex flex-col items-end gap-1 shrink-0">
                        <span class="inline-flex px-2 py-0.5 rounded-md border text-[10px] font-medium {getSourceBadgeClass(user)}">
                          {getSourceLabel(user)}
                        </span>
                        {#if !isRecipientEligible(user)}
                          <span class="text-[10px] text-slate-500">
                            {mode === 'email' ? 'Sem email' : 'Sem WhatsApp'}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <section class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 shadow-xl backdrop-blur-xs space-y-5" in:fade>
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1">
              {selectedRecipients.length > 0 ? 'Seleção' : 'Destinatário'}
            </p>
            {#if selectedRecipients.length > 0}
              <div class="text-sm font-semibold text-slate-100">{selectedRecipients.length} destinatário(s)</div>
              <div class="text-xs text-slate-400 truncate mt-1">
                Preview com {previewUser?.nome_exibicao || previewUser?.email || 'destinatário'}
              </div>
            {:else if selectedUser}
              <div class="text-sm font-semibold text-slate-100 truncate">{selectedUser.nome_exibicao || 'Sem nome'}</div>
              <div class="text-xs text-slate-400 truncate mt-1">{selectedUser.email || 'Sem email'} {selectedUser.phone ? `· ${formatPhone(selectedUser.phone)}` : ''}</div>
            {:else}
              <div class="text-sm text-slate-500">Selecione um destinatário.</div>
            {/if}
          </div>

          <div class="inline-flex items-center rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            <button
              type="button"
              on:click={() => setMode('email')}
              aria-pressed={mode === 'email'}
              class="px-3.5 h-9 rounded-lg text-sm font-medium transition-all {mode === 'email' ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20' : 'text-slate-400 hover:text-white'}"
            >
              Email
            </button>
            <button
              type="button"
              on:click={() => setMode('whatsapp')}
              aria-pressed={mode === 'whatsapp'}
              class="px-3.5 h-9 rounded-lg text-sm font-medium transition-all {mode === 'whatsapp' ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20' : 'text-slate-400 hover:text-white'}"
            >
              WhatsApp
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          {#each COMMUNICATION_PLACEHOLDERS as placeholder}
            <button
              type="button"
              on:click={() => insertPlaceholder(placeholder.token)}
              class="inline-flex items-center px-2.5 h-8 rounded-lg border border-slate-800 bg-slate-950/70 text-xs font-medium text-slate-300 transition-all hover:border-slate-700 hover:text-white"
              title={placeholder.token}
            >
              {placeholder.label}
            </button>
          {/each}
        </div>

        {#if mode === 'email'}
          <div class="space-y-4">
            <div class="space-y-1.5">
              <label for="communication-email-subject" class="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Assunto</label>
              <input
                id="communication-email-subject"
                bind:this={emailSubjectRef}
                bind:value={emailSubject}
                on:focus={() => (focusedField = 'emailSubject')}
                class="w-full px-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white focus:outline-hidden focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
              />
            </div>

            <div class="space-y-1.5">
              <label for="communication-email-body" class="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Mensagem</label>
              <textarea
                id="communication-email-body"
                bind:this={emailBodyRef}
                bind:value={emailBody}
                rows="12"
                on:focus={() => (focusedField = 'emailBody')}
                class="w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white resize-y focus:outline-hidden focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
              ></textarea>
            </div>

            <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Preview</p>
              <p class="text-sm font-semibold text-slate-100 wrap-break-word">{resolvedEmailSubject}</p>
              <div class="text-sm leading-6 text-slate-300 whitespace-pre-wrap wrap-break-word">{resolvedEmailBody}</div>
            </div>
          </div>
        {:else}
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <label for="communication-whatsapp-body" class="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Mensagem</label>
              <span class="text-xs text-slate-500">Saída: {TECHNE_WHATSAPP_NUMBER}</span>
            </div>

            <textarea
              id="communication-whatsapp-body"
              bind:this={whatsappBodyRef}
              bind:value={whatsappBody}
              rows="16"
              on:focus={() => (focusedField = 'whatsappBody')}
              class="w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white resize-y focus:outline-hidden focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
            ></textarea>

            <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Preview</p>
              <div class="text-sm leading-6 text-slate-300 whitespace-pre-wrap wrap-break-word">{resolvedWhatsappBody}</div>
            </div>
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>
