<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { translateSubscriptionStatus } from '$lib/errorUtils';
  import { page } from '$app/stores';
  import { requiredOk as requiredOkUtil, buildPayload, isValidImage, normalizeLarguraBobina, PLATAFORMAS_PRESET } from '$lib/profileUtils';
  import { maskPhone, maskDocumento } from '$lib/masks';
  import { addToast } from '$lib/stores/ui';
  export let params;

  const tabs = [
    { id: 'perfil',       label: 'Perfil' },
    { id: 'empresa',      label: 'Empresa' },
    { id: 'assinatura',   label: 'Assinatura' },
    { id: 'preferencias', label: 'Preferências' },
    { id: 'integracoes',  label: 'Integrações' },
  ];
  let activeTab = 'perfil';

  // PIN Management
  let showChangePin = false;
  let newPin = '';
  let savingPin = false;
  let showPinBubble = false;
  let pinBubbleTimer;

  function triggerPinBubble() {
    showPinBubble = true;
    clearTimeout(pinBubbleTimer);
    pinBubbleTimer = setTimeout(() => (showPinBubble = false), 2000);
  }

  async function saveNewPin() {
    if (newPin.length !== 4) return;
    savingPin = true;
    try {
      const { error } = await supabase
        .from('empresa_perfil')
        .update({ pin_admin: newPin })
        .eq('user_id', userId);
      if (error) throw error;
      adminPin = newPin;
      showChangePin = false;
      newPin = '';
      addToast('PIN atualizado com sucesso!', 'success');
    } catch (e) {
      addToast('Erro ao atualizar PIN: ' + e.message, 'error');
    } finally {
      savingPin = false;
    }
  }

  async function resetPassword() {
    if (!email) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      addToast('E-mail de redefinição enviado para ' + email, 'success');
    } catch (e) {
      addToast('Erro: ' + e.message, 'error');
    }
  }

  let msg = '';
  let loading = true;
  let saving = false;
  let userId = null;
  let email = '';

  // Subscription state
  let subLoading = true;
  let subStatus = null;
  let providerCustomerId = null;
  let cancelAtPeriodEnd = false;
  let currentPeriodEnd = null;

  // Form fields — Aba Perfil
  let nome_exibicao = '';
  let logo_url = '';
  let pendingLogoUrl = null;
  let logoFile = null;
  let adminPin = '';

  // Form fields — Aba Empresa
  let razao_social = '';
  let documento = '';
  let inscricao_estadual = '';
  let contato = '';
  let endereco = '';
  let rodape_recibo = 'Obrigado pela preferência!';

  // Form fields — Aba Preferências
  let largura_bobina = '80mm';
  let notifEstoqueBaixo = false;
  let notifFechamentoCaixa = false;

  // Plataformas de pagamento
  let plataformas_pagamento = PLATAFORMAS_PRESET.map(p => ({ ...p, ativo: false }));

  let canSave = false;
  $: canSave = requiredOkUtil({ nome_exibicao, documento, contato, largura_bobina });

  let dirty = false;
  function markDirty() { dirty = true; }
  function clearDirty() { dirty = false; }

  // Trial days remaining
  $: trialDaysLeft = (() => {
    if (subStatus !== 'trialing' || !currentPeriodEnd) return null;
    const diff = new Date(currentPeriodEnd) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();
  $: trialProgressPct = trialDaysLeft !== null ? Math.min(100, Math.max(0, Math.round(((30 - trialDaysLeft) / 30) * 100))) : 0;

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = '/login'; return; }
    userId = session.user.id;
    email = session.user.email || '';

    // Load preferences from localStorage
    notifEstoqueBaixo = localStorage.getItem('zelo_notif_estoque') === 'true';
    notifFechamentoCaixa = localStorage.getItem('zelo_notif_caixa') === 'true';

    // Load subscription
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, provider_customer_id, cancel_at_period_end, current_period_end')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subStatus = sub?.status ?? null;
      providerCustomerId = sub?.provider_customer_id ?? null;
      cancelAtPeriodEnd = !!sub?.cancel_at_period_end;
      currentPeriodEnd = sub?.current_period_end ?? null;
    } catch (e) {
      console.warn('Falha ao carregar assinatura:', e?.message || e);
    } finally {
      subLoading = false;
    }

    // Load profile
    const { data, error } = await supabase
      .from('empresa_perfil')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      addToast('Erro ao carregar perfil: ' + error.message, 'error');
      msg = 'Erro ao carregar perfil.';
    } else if (data) {
      nome_exibicao     = data.nome_exibicao ?? '';
      razao_social      = data.razao_social ?? '';
      documento         = maskDocumento(data.documento ?? '');
      contato           = maskPhone(data.contato ?? '');
      inscricao_estadual = data.inscricao_estadual ?? '';
      endereco          = data.endereco ?? '';
      largura_bobina    = normalizeLarguraBobina(data.largura_bobina ?? '80mm');
      logo_url          = data.logo_url ?? '';
      rodape_recibo     = data.rodape_recibo ?? 'Obrigado pela preferência!';
      adminPin          = data.pin_admin || '';

      // Load plataformas: merge saved data with presets (to handle new presets)
      const saved = data.plataformas_pagamento ?? [];
      plataformas_pagamento = PLATAFORMAS_PRESET.map(preset => {
        const s = saved.find(x => x.id === preset.id);
        return s ? { ...preset, ...s } : { ...preset, ativo: false };
      });
      // Add any custom platforms from saved that aren't in preset
      const presetIds = PLATAFORMAS_PRESET.map(p => p.id);
      const customSaved = saved.filter(x => !presetIds.includes(x.id));
      plataformas_pagamento = [...plataformas_pagamento, ...customSaved];
    }

    const urlParams = new URLSearchParams($page.url.search);
    if (urlParams.get('msg') === 'complete' && !requiredOkUtil({ nome_exibicao, documento, contato, largura_bobina })) {
      msg = 'Complete as informações da sua empresa antes de continuar.';
    }
    loading = false;
  });

  function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidImage(file)) {
      addToast('Imagem inválida. Use PNG/JPG até 1.5MB.', 'error');
      return;
    }
    logoFile = file;
    pendingLogoUrl = URL.createObjectURL(file);
    markDirty();
  }

  // openManageSubscription removed - user manages via /assinatura

  async function salvar() {
    if (!canSave) return;
    saving = true;
    try {
      let finalUrl = logo_url;
      if (logoFile) {
        const fileName = `${userId}.png`;
        const { error: upErr } = await supabase.storage
          .from('logos')
          .upload(fileName, logoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage
          .from('logos')
          .getPublicUrl(fileName);
        finalUrl = `${publicUrl}?t=${Date.now()}`;
      }

      const payload = buildPayload({
        userId,
        nome_exibicao,
        razao_social,
        documento,
        contato,
        inscricao_estadual,
        endereco,
        rodape_recibo,
        largura_bobina,
        logo_url: finalUrl,
        pendingLogoUrl: null,
        plataformas_pagamento,
      });

      const { error } = await supabase.from('empresa_perfil').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;

      addToast('Perfil salvo com sucesso!', 'success');
      logo_url = finalUrl;
      logoFile = null;
      pendingLogoUrl = null;
      clearDirty();

      // Se for primeiro setup (veio via ?msg=complete), redirecionar para assinar
      const urlParams = new URLSearchParams($page.url.search);
      if (urlParams.get('msg') === 'complete') {
        window.location.href = '/assinatura';
      }
    } catch (e) {
      console.error('[perfil] salvar failed:', e);
      addToast('Erro ao salvar: ' + e.message, 'error');
    } finally {
      saving = false;
    }
  }

  function salvarPreferencias() {
    localStorage.setItem('zelo_notif_estoque', String(notifEstoqueBaixo));
    localStorage.setItem('zelo_notif_caixa', String(notifFechamentoCaixa));
    // largura_bobina needs DB save
    salvar();
  }

  // Status tag helper
  function statusTag(status) {
    if (status === 'active')   return { label: 'Ativo',     color: 'var(--success)',  bg: 'color-mix(in srgb, var(--success) 15%, transparent)' };
    if (status === 'trialing') return { label: 'Em Teste',  color: 'var(--warning)',  bg: 'color-mix(in srgb, var(--warning) 15%, transparent)' };
    if (status === 'past_due') return { label: 'Inadimplente', color: 'var(--error)', bg: 'color-mix(in srgb, var(--error) 15%, transparent)' };
    if (status === 'canceled') return { label: 'Cancelado', color: 'var(--error)',    bg: 'color-mix(in srgb, var(--error) 15%, transparent)' };
    return { label: translateSubscriptionStatus(status) ?? 'Desconhecido', color: 'var(--text-muted)', bg: 'var(--bg-input)' };
  }
  $: tag = subStatus ? statusTag(subStatus) : null;
</script>

<form on:submit|preventDefault={salvar}>

    <!-- Page header -->
    <div class="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div>
        <p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Conta / Meu Perfil</p>
        <h1 class="text-2xl font-semibold" style="color: var(--text-main);">Configurações da Conta</h1>
      </div>
      {#if activeTab !== 'assinatura' && activeTab !== 'integracoes'}
        <button
          type={activeTab === 'preferencias' ? 'button' : 'submit'}
          on:click={activeTab === 'preferencias' ? salvarPreferencias : undefined}
          class="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60 transition-colors"
          style="background: var(--primary); color: var(--primary-text);"
          disabled={activeTab !== 'preferencias' && (!canSave || saving)}
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      {/if}
    </div>

    {#if msg}
      <div class="mb-4 text-sm rounded-md px-3 py-2" style="color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);">{msg}</div>
    {/if}

    {#if loading}
      <p class="text-sm" style="color: var(--text-muted);">Carregando…</p>
    {:else}

      <!-- Tab nav -->
      <nav class="flex gap-1 border-b mb-6" style="border-color: var(--border-subtle);">
        {#each tabs as t}
          <button
            type="button"
            on:click={() => (activeTab = t.id)}
            class="px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors"
            style="
              border-color: {activeTab === t.id ? 'var(--primary)' : 'transparent'};
              color: {activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)'};
            "
          >{t.label}</button>
        {/each}
      </nav>

      <!-- ─── Aba 1: Perfil ──────────────────────────────── -->
      {#if activeTab === 'perfil'}
        <div class="grid gap-5 max-w-2xl">

          <!-- Logotipo -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Logotipo</h2>
            <div class="flex items-center gap-5">
              <div class="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style="background: var(--bg-input); border: 1px solid var(--border-subtle);">
                {#if pendingLogoUrl || logo_url}
                  <img src={pendingLogoUrl || logo_url} alt="Logo" class="w-full h-full object-contain" />
                {:else}
                  <span class="text-2xl" style="color: var(--text-muted);">?</span>
                {/if}
              </div>
              <div class="flex flex-col gap-2">
                <label
                  class="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors"
                  style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
                  on:mouseenter={e => (e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)')}
                  on:mouseleave={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                >
                  Escolher imagem
                  <input type="file" accept="image/*" class="sr-only" on:change={uploadLogo} />
                </label>
                <span class="text-xs" style="color: var(--text-muted);">PNG/JPG quadrado, até 1.5 MB</span>
              </div>
            </div>
          </section>

          <!-- Dados básicos -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Dados básicos</h2>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">Nome exibido no recibo *</span>
              <input
                class="w-full rounded-md px-3 py-2 text-sm"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                bind:value={nome_exibicao} on:input={markDirty}
              />
            </label>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">E-mail</span>
              <input
                class="w-full rounded-md px-3 py-2 text-sm cursor-not-allowed"
                style="background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border-subtle); opacity: 0.65;"
                value={email} readonly
              />
            </label>
          </section>

          <!-- Segurança -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Segurança</h2>

            <div class="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p class="text-sm font-medium" style="color: var(--text-main);">Senha</p>
                <p class="text-xs mt-0.5" style="color: var(--text-muted);">Enviaremos um link de redefinição para {email}.</p>
              </div>
              <button type="button" on:click={resetPassword}
                class="flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
                on:mouseenter={e => (e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)')}
                on:mouseleave={e => (e.currentTarget.style.background = 'var(--bg-input)')}
              >Redefinir Senha</button>
            </div>

            <div class="pt-4 grid gap-3" style="border-top: 1px solid var(--border-subtle);">
              <div class="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p class="text-sm font-medium" style="color: var(--text-main);">PIN Administrativo</p>
                  <p class="text-xs mt-0.5" style="color: var(--text-muted);">Protege áreas sensíveis como Relatórios e Despesas.</p>
                </div>
                <button type="button" on:click={() => (showChangePin = !showChangePin)}
                  class="flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
                  on:mouseenter={e => (e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)')}
                  on:mouseleave={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                >Alterar PIN</button>
              </div>
              {#if showChangePin}
                <div class="rounded-md p-4 grid gap-3" style="background: var(--bg-input); border: 1px solid var(--border-subtle);">
                  <label class="block">
                    <span class="block mb-1 text-sm" style="color: var(--text-label);">Novo PIN (4 dígitos)</span>
                    <div class="relative">
                      <input type="password" maxlength="4" inputmode="numeric" pattern="[0-9]*"
                        class="w-full rounded-md px-3 py-2 text-sm text-center tracking-[0.5em] font-mono"
                        style="background: var(--bg-panel); color: var(--text-main); border: 1px solid var(--border-subtle);"
                        placeholder="0000" bind:value={newPin}
                        on:input={(e) => { if (/\D/.test(e.currentTarget.value)) { triggerPinBubble(); newPin = e.currentTarget.value.replace(/\D/g, ''); } }}
                      />
                      {#if showPinBubble}
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 text-xs font-bold rounded shadow-xl whitespace-nowrap z-50" style="background: var(--warning); color: #fff;">
                          Números apenas!
                          <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent" style="border-top-color: var(--warning);"></div>
                        </div>
                      {/if}
                    </div>
                  </label>
                  <button type="button" on:click={saveNewPin}
                    class="w-full px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
                    style="background: var(--primary); color: var(--primary-text);"
                    disabled={newPin.length !== 4 || savingPin}
                  >{savingPin ? 'Salvando…' : 'Atualizar PIN'}</button>
                </div>
              {/if}
            </div>
          </section>

        </div>
      {/if}

      <!-- ─── Aba 2: Empresa ────────────────────────────── -->
      {#if activeTab === 'empresa'}
        <div class="grid gap-5 max-w-2xl">

          <!-- Informações Fiscais -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Informações Fiscais</h2>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">Nome Fantasia *</span>
              <input
                class="w-full rounded-md px-3 py-2 text-sm"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                bind:value={nome_exibicao} on:input={markDirty}
                placeholder="Como a empresa é conhecida"
              />
            </label>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">Razão Social</span>
              <input
                class="w-full rounded-md px-3 py-2 text-sm"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                bind:value={razao_social} on:input={markDirty}
                placeholder="Nome jurídico da empresa"
              />
            </label>

            <div class="grid sm:grid-cols-2 gap-4">
              <label class="block">
                <span class="block mb-1 text-sm" style="color: var(--text-label);">CNPJ / CPF *</span>
                <input
                  class="w-full rounded-md px-3 py-2 text-sm"
                  style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                  value={documento}
                  inputmode="numeric"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  on:input={(e) => { documento = maskDocumento(e.target.value); e.target.value = documento; markDirty(); }}
                />
              </label>
              <label class="block">
                <span class="block mb-1 text-sm" style="color: var(--text-label);">Inscrição Estadual</span>
                <input
                  class="w-full rounded-md px-3 py-2 text-sm"
                  style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                  placeholder="ISENTO quando aplicável"
                  bind:value={inscricao_estadual} on:input={markDirty}
                />
              </label>
            </div>
          </section>

          <!-- Contato e Endereço -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Contato e Endereço</h2>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">Telefone da loja *</span>
              <input
                class="w-full rounded-md px-3 py-2 text-sm"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                value={contato}
                inputmode="numeric"
                placeholder="(00) 00000-0000"
                on:input={(e) => { contato = maskPhone(e.target.value); e.target.value = contato; markDirty(); }}
              />
            </label>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">Endereço completo</span>
              <input
                class="w-full rounded-md px-3 py-2 text-sm"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                bind:value={endereco} on:input={markDirty}
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </label>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">Mensagem de rodapé do recibo</span>
              <textarea
                class="w-full rounded-md px-3 py-2 text-sm resize-none"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle); min-height: 72px;"
                bind:value={rodape_recibo} on:input={markDirty}
              />
            </label>
          </section>

        </div>
      {/if}

      <!-- ─── Aba 3: Assinatura ─────────────────────────── -->
      {#if activeTab === 'assinatura'}
        <div class="grid gap-5 max-w-2xl">

          <!-- Status card -->
          <section class="rounded-xl p-6" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            {#if subLoading}
              <p class="text-sm" style="color: var(--text-muted);">Carregando status…</p>
            {:else}
              <div class="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider mb-1" style="color: var(--text-muted);">Seu plano</p>
                  <p class="text-lg font-bold" style="color: var(--text-main);">Plano Zelo PDV</p>
                  <p class="text-sm mt-0.5" style="color: var(--text-muted);">R$ 59,00 / mês</p>
                </div>
                {#if tag}
                  <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide" style="color: {tag.color}; background: {tag.bg};">
                    {tag.label}
                  </span>
                {:else}
                  <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide" style="color: var(--text-muted); background: var(--bg-input);">
                    Sem assinatura
                  </span>
                {/if}
              </div>

              <!-- Trial progress bar -->
              {#if subStatus === 'trialing' && trialDaysLeft !== null}
                <div class="mb-4">
                  <div class="flex items-center justify-between text-xs mb-1.5" style="color: var(--text-muted);">
                    <span>Período de teste gratuito</span>
                    <span class="font-semibold" style="color: var(--warning);">Faltam {trialDaysLeft} {trialDaysLeft === 1 ? 'dia' : 'dias'}</span>
                  </div>
                  <div class="w-full rounded-full h-2" style="background: var(--bg-input);">
                    <div
                      class="h-2 rounded-full transition-all"
                      style="width: {trialProgressPct}%; background: var(--warning);"
                    ></div>
                  </div>
                </div>
              {/if}

              <!-- Renewal date -->
              {#if subStatus === 'active' && currentPeriodEnd && !cancelAtPeriodEnd}
                <p class="text-sm mb-4" style="color: var(--text-muted);">
                  Renova automaticamente em <span class="font-semibold" style="color: var(--text-main);">{new Date(currentPeriodEnd).toLocaleDateString('pt-BR')}</span>.
                </p>
              {/if}

              <!-- Cancel warning -->
              {#if cancelAtPeriodEnd && currentPeriodEnd}
                <div class="rounded-md px-3 py-2 mb-4 text-sm" style="color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);">
                  A renovação automática está desativada. Sua assinatura encerra em <strong>{new Date(currentPeriodEnd).toLocaleDateString('pt-BR')}</strong>.
                </div>
              {/if}

              <!-- Actions -->
              <div class="flex items-center gap-3 flex-wrap">
                <a href="/assinatura"
                  class="px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60"
                  style="background: var(--primary); color: var(--primary-text);"
                >Gerenciar Assinatura</a>
              </div>
            {/if}
          </section>

          <!-- Invoice history -->
          <section class="rounded-lg p-5 grid gap-3" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Histórico de faturas</h2>
            <p class="text-sm" style="color: var(--text-muted);">
              As opções de renovação e informações da assinatura podem ser acompanhadas na nova área de Gerenciamento.
            </p>
            <a href="/assinatura"
              class="self-start px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
              on:mouseenter={e => (e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)')}
              on:mouseleave={e => (e.currentTarget.style.background = 'var(--bg-input)')}
            >Gerenciar Pagamentos</a>
          </section>

        </div>
      {/if}

      <!-- ─── Aba 4: Preferências ───────────────────────── -->
      {#if activeTab === 'preferencias'}
        <div class="grid gap-5 max-w-2xl">

          <!-- Impressão -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Impressão</h2>

            <label class="block">
              <span class="block mb-1 text-sm" style="color: var(--text-label);">Tipo de impressora</span>
              <select
                class="w-full rounded-md px-3 py-2 text-sm"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                bind:value={largura_bobina}
                on:change={() => { largura_bobina = normalizeLarguraBobina(largura_bobina); markDirty(); }}
              >
                <option value="80mm">Térmica 80 mm</option>
                <option value="58mm">Térmica 58 mm</option>
              </select>
            </label>
          </section>

          <!-- Plataformas de Venda -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <div>
              <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Plataformas de Venda</h2>
              <p class="text-xs mt-1" style="color: var(--text-muted);">Ative as plataformas que você usa e defina a taxa (%). Elas aparecerão como forma de pagamento na venda.</p>
            </div>

            {#each plataformas_pagamento as plat, i}
              <div class="flex items-center justify-between gap-4 flex-wrap" style="{i > 0 ? 'border-top: 1px solid var(--border-subtle); padding-top: 1rem;' : ''}">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <span class="text-xl flex-shrink-0">{plat.icone}</span>
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate" style="color: var(--text-main);">{plat.nome}</p>
                    {#if plat.ativo}
                      <p class="text-xs" style="color: var(--text-muted);">Taxa: {plat.taxa_pct}%</p>
                    {/if}
                  </div>
                </div>

                <div class="flex items-center gap-3 flex-shrink-0">
                  {#if plat.ativo}
                    <div class="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        class="w-20 rounded-md px-2 py-1.5 text-sm text-center"
                        style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                        bind:value={plataformas_pagamento[i].taxa_pct}
                        on:input={markDirty}
                      />
                      <span class="text-xs font-medium" style="color: var(--text-muted);">%</span>
                    </div>
                  {/if}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={plat.ativo}
                    on:click={() => { plataformas_pagamento[i].ativo = !plataformas_pagamento[i].ativo; plataformas_pagamento = plataformas_pagamento; markDirty(); }}
                    class="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer"
                    style="background: {plat.ativo ? 'var(--primary)' : 'var(--bg-input)'}; border-color: {plat.ativo ? 'var(--primary)' : 'var(--border-subtle)'};"
                  >
                    <span
                      class="inline-block h-5 w-5 transform rounded-full shadow transition duration-200"
                      style="background: var(--text-main); transform: translateX({plat.ativo ? '20px' : '0px'});"
                    ></span>
                  </button>
                </div>
              </div>
            {/each}
          </section>

          <!-- Notificações -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Notificações</h2>

            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium" style="color: var(--text-main);">Alerta de estoque baixo</p>
                <p class="text-xs mt-0.5" style="color: var(--text-muted);">Avisa quando um produto atinge o nível crítico.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifEstoqueBaixo}
                on:click={() => (notifEstoqueBaixo = !notifEstoqueBaixo)}
                class="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer"
                style="background: {notifEstoqueBaixo ? 'var(--primary)' : 'var(--bg-input)'}; border-color: {notifEstoqueBaixo ? 'var(--primary)' : 'var(--border-subtle)'};"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full shadow transition duration-200"
                  style="background: var(--text-main); transform: translateX({notifEstoqueBaixo ? '20px' : '0px'});"
                ></span>
              </button>
            </div>

            <div class="flex items-center justify-between gap-4" style="border-top: 1px solid var(--border-subtle); padding-top: 1rem;">
              <div>
                <p class="text-sm font-medium" style="color: var(--text-main);">Lembrete de fechamento de caixa</p>
                <p class="text-xs mt-0.5" style="color: var(--text-muted);">Notifica ao final do dia se o caixa ainda está aberto.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifFechamentoCaixa}
                on:click={() => (notifFechamentoCaixa = !notifFechamentoCaixa)}
                class="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer"
                style="background: {notifFechamentoCaixa ? 'var(--primary)' : 'var(--bg-input)'}; border-color: {notifFechamentoCaixa ? 'var(--primary)' : 'var(--border-subtle)'};"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full shadow transition duration-200"
                  style="background: var(--text-main); transform: translateX({notifFechamentoCaixa ? '20px' : '0px'});"
                ></span>
              </button>
            </div>
          </section>

        </div>
      {/if}

      <!-- ─── Aba 5: Integrações ──────────────────────────── -->
      {#if activeTab === 'integracoes'}
        <div class="grid gap-5 max-w-2xl">

          <!-- QZ Tray -->
          <section class="rounded-lg p-5 grid gap-5" style="background: var(--bg-card); border: 1px solid var(--border-card);">

            <!-- Header -->
            <div class="flex items-start gap-4">
              <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--primary) 12%, transparent);">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
              </div>
              <div>
                <h2 class="text-base font-semibold" style="color: var(--text-main);">QZ Tray — Impressão Direta</h2>
                <p class="text-sm mt-1" style="color: var(--text-muted);">
                  Imprime recibos diretamente na impressora térmica, sem abrir o diálogo do navegador.
                  Instale uma vez no computador e pronto — as próximas impressões saem automáticas.
                </p>
              </div>
            </div>

            <!-- Download button -->
            <a
              href="https://github.com/qzind/tray/releases/download/v2.2.5/qz-tray-2.2.5-x86_64.exe"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold w-fit transition-opacity hover:opacity-90"
              style="background: var(--primary); color: var(--primary-text);"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Baixar QZ Tray
            </a>

            <!-- Step-by-step -->
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--text-muted);">Como configurar</p>
              <ol class="grid gap-3">
                {#each [
                  { text: 'Clique em "Baixar QZ Tray" e instale o programa no computador.' },
                  { text: 'Abra o QZ Tray — ele ficará ativo na bandeja do sistema (canto inferior direito da tela).' },
                  { text: 'Defina sua impressora térmica como <strong>impressora padrão</strong> no Windows: <em>Configurações → Bluetooth e dispositivos → Impressoras → [sua impressora] → Definir como padrão</em>.' },
                  { text: 'Na primeira impressão pelo Zelo PDV, um popup aparecerá pedindo permissão. Clique em <strong>Allow</strong> e marque <strong>Remember this decision (Lembrar essa decisão)</strong>.' },
                  { text: 'Pronto! As próximas impressões saem diretas, sem nenhum diálogo.' },
                ] as step, i}
                  <li class="flex gap-3 text-sm" style="color: var(--text-label);">
                    <span
                      class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                      style="background: color-mix(in srgb, var(--primary) 15%, transparent); color: var(--primary);"
                    >{i + 1}</span>
                    <span>{@html step.text}</span>
                  </li>
                {/each}
              </ol>
            </div>

            <p class="text-xs" style="color: var(--text-muted);">
              QZ Tray é gratuito e de código aberto. Precisa estar aberto em segundo plano enquanto o Zelo PDV está em uso. Se fechar o QZ Tray, a impressão volta a usar o diálogo do navegador automaticamente.
            </p>

          </section>
        </div>
      {/if}

    {/if}
  </form>
