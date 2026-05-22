<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { translateSubscriptionStatus } from '$lib/errorUtils';
  import { page } from '$app/stores';
  import { requiredOk as requiredOkUtil, buildPayload, isValidImage, normalizeLarguraBobina, PLATAFORMAS_PRESET } from '$lib/profileUtils';
  import { maskPhone, maskDocumento } from '$lib/masks';
  import { addToast } from '$lib/stores/ui';
  import OnboardingWizard from '$lib/components/OnboardingWizard.svelte';
  import { pairPrinter, unpairPrinter, printerStatus, isWebUsbSupported } from '$lib/printer';
  import { printTeste } from '$lib/printService';
  import { getAccessContext } from '$lib/accessControl';
  import {
    detectZeloImpressao,
    getConfig as getZeloImpressaoConfig,
    getPrinters as getZeloImpressaoPrinters,
    getZeloImpressaoFriendlyMessage,
    pairZeloImpressao,
    saveConfig as saveZeloImpressaoConfig,
    sendTestPrint as sendZeloImpressaoTestPrint,
    ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL,
    ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL,
  } from '$lib/zeloImpressaoClient.js';
  export let params;
  const zeloImpressaoDownloadUrl = ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL;
  const zeloImpressaoDownloadPageUrl = ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL;

  // Sub-user state (populated in onMount if user is a sub-user)
  let isSubUser = false;
  let ownerCompanyName = '';
  let subUserRoleName = '';
  let resettingPassword = false;

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
  let showOnboardingWizard = false;

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
  let tabelasPrecoAtivo = false;
  let nomeTabela1 = 'Tabela 1';
  let nomeTabela2 = 'Tabela 2';
  let nomeTabela3 = 'Tabela 3';

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

  // ── Impressora USB ──────────────────────────────────────────────────────────
  let printerPairing = false;
  let printerUnpairing = false;
  let printerTesting = false;
  let printerPairError = '';
  let printerTestResult = null; // 'ok' | 'fail' | null
  let localPrintLoading = false;
  let localPrintStatus = 'desconectado';
  let localPrintMessage = 'Verificando Zelo Impressão...';
  let localPrintPrinters = [];
  let localPrintSelectedPrinterId = '';
  let localPrintPairCode = '';
  let localPrintTesting = false;
  let localPrintSaving = false;
  let localPrintPairing = false;

  async function refreshLocalPrint() {
    localPrintLoading = true;
    try {
      const detection = await detectZeloImpressao();
      if (!detection.running) {
        localPrintStatus = 'nao_instalado';
        localPrintMessage = detection.message;
        localPrintPrinters = [];
        return;
      }
      if (!detection.paired) {
        localPrintStatus = 'desconectado';
        localPrintMessage = 'Conecte este navegador ao Zelo Impressão usando o código exibido no aplicativo.';
        localPrintPrinters = [];
        return;
      }
      const [printers, config] = await Promise.all([
        getZeloImpressaoPrinters(),
        getZeloImpressaoConfig(),
      ]);
      localPrintStatus = 'conectado';
      localPrintMessage = 'Zelo Impressão conectado neste computador.';
      localPrintPrinters = printers;
      localPrintSelectedPrinterId = config?.selectedPrinterId || printers.find((p) => p.isDefault)?.id || printers[0]?.id || '';
    } catch (e) {
      localPrintStatus = 'desconectado';
      localPrintMessage = getZeloImpressaoFriendlyMessage(e);
    } finally {
      localPrintLoading = false;
    }
  }

  async function handlePairLocalPrint() {
    if (!localPrintPairCode.trim()) {
      addToast('Digite o código exibido no Zelo Impressão.', 'warning');
      return;
    }
    localPrintPairing = true;
    try {
      await pairZeloImpressao(localPrintPairCode);
      localPrintPairCode = '';
      addToast('Zelo Impressão conectado.', 'success');
      await refreshLocalPrint();
    } catch (e) {
      addToast(getZeloImpressaoFriendlyMessage(e), 'error');
    } finally {
      localPrintPairing = false;
    }
  }

  async function handleSaveLocalPrintConfig() {
    localPrintSaving = true;
    try {
      const printer = localPrintPrinters.find((p) => p.id === localPrintSelectedPrinterId);
      await saveZeloImpressaoConfig({
        selectedPrinterId: printer?.id || null,
        selectedPrinterName: printer?.name || null,
      });
      addToast('Impressora selecionada para impressão automática.', 'success');
      await refreshLocalPrint();
    } catch (e) {
      addToast(getZeloImpressaoFriendlyMessage(e), 'error');
    } finally {
      localPrintSaving = false;
    }
  }

  async function handleLocalTestPrint() {
    localPrintTesting = true;
    try {
      await sendZeloImpressaoTestPrint(localPrintSelectedPrinterId || undefined);
      addToast('Teste enviado pelo Zelo Impressão.', 'success');
    } catch (e) {
      addToast(getZeloImpressaoFriendlyMessage(e), 'error');
    } finally {
      localPrintTesting = false;
    }
  }

  async function handlePairPrinter() {
    printerPairing = true;
    printerPairError = '';
    try {
      await pairPrinter();
      addToast('Impressora pareada com sucesso!', 'success');
    } catch (e) {
      printerPairError = e?.message || 'Falha ao parear.';
    } finally {
      printerPairing = false;
    }
  }

  async function handleUnpairPrinter() {
    printerUnpairing = true;
    try {
      await unpairPrinter();
      addToast('Impressora desconectada.', 'info');
    } catch (e) {
      addToast('Erro ao desconectar: ' + (e?.message || e), 'error');
    } finally {
      printerUnpairing = false;
    }
  }

  async function handleTestPrint() {
    printerTesting = true;
    printerTestResult = null;
    try {
      const ok = await printTeste({
        nome_exibicao,
        largura_bobina,
        contato,
        endereco,
        documento,
      });
      printerTestResult = ok ? 'ok' : 'fail';
      if (!ok) addToast('Nenhuma impressora pareada. Pareie a impressora primeiro.', 'warning');
    } catch (e) {
      printerTestResult = 'fail';
      addToast('Falha ao imprimir teste: ' + (e?.message || e), 'error');
    } finally {
      printerTesting = false;
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = '/login'; return; }
    userId = session.user.id;
    email = session.user.email || '';

    // Sub-users see a stripped-down "Minha conta" view — they can't manage the
    // company profile, subscription, plataformas, etc. Detect early and skip
    // the owner data loading entirely.
    try {
      const accessCtx = await getAccessContext();
      if (accessCtx?.isSubUser) {
        isSubUser = true;
        const [{ data: owner }, roleResult] = await Promise.all([
          supabase
            .from('empresa_perfil')
            .select('nome_exibicao, razao_social')
            .eq('user_id', accessCtx.ownerUserId)
            .maybeSingle(),
          accessCtx.roleId
            ? supabase.from('access_roles').select('name').eq('id', accessCtx.roleId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        ownerCompanyName = owner?.nome_exibicao || owner?.razao_social || '';
        subUserRoleName = roleResult?.data?.name || '';
        loading = false;
        return;
      }
    } catch (e) {
      console.warn('[perfil] sub-user detection failed:', e?.message || e);
    }

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
      tabelasPrecoAtivo = !!data.tabelas_preco_ativo;
      nomeTabela1       = data.tabela_preco_1_nome || 'Tabela 1';
      nomeTabela2       = data.tabela_preco_2_nome || 'Tabela 2';
      nomeTabela3       = data.tabela_preco_3_nome || 'Tabela 3';

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
      showOnboardingWizard = true;
    }
    loading = false;
    void refreshLocalPrint();
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
      payload.tabelas_preco_ativo = tabelasPrecoAtivo;
      payload.tabela_preco_1_nome = nomeTabela1;
      payload.tabela_preco_2_nome = nomeTabela2;
      payload.tabela_preco_3_nome = nomeTabela3;

      const { error } = await supabase.from('empresa_perfil').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch('/api/referrals/code', {
          headers: { authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      }

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

{#if isSubUser}
  <div class="max-w-2xl">
    <div class="mb-6">
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Conta / Meu Perfil</p>
      <h1 class="text-2xl font-semibold" style="color: var(--text-main);">Minha conta</h1>
      <p class="mt-1 text-sm" style="color: var(--text-muted);">Você está acessando como funcionário. Apenas o titular pode editar o perfil da empresa.</p>
    </div>

    {#if loading}
      <p class="text-sm" style="color: var(--text-muted);">Carregando…</p>
    {:else}
      <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
        <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Seus dados</h2>

        <div class="grid gap-3 text-sm">
          <div>
            <span class="block text-xs mb-0.5" style="color: var(--text-muted);">E-mail</span>
            <span style="color: var(--text-main);">{email}</span>
          </div>
          <div>
            <span class="block text-xs mb-0.5" style="color: var(--text-muted);">Empresa</span>
            <span style="color: var(--text-main);">{ownerCompanyName || '—'}</span>
          </div>
          <div>
            <span class="block text-xs mb-0.5" style="color: var(--text-muted);">Cargo</span>
            <span style="color: var(--text-main);">{subUserRoleName || '—'}</span>
          </div>
        </div>

        <div class="pt-3" style="border-top: 1px solid var(--border-subtle);">
          <button
            type="button"
            class="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60 transition-colors"
            style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
            disabled={resettingPassword}
            on:click={async () => {
              resettingPassword = true;
              try { await resetPassword(); } finally { resettingPassword = false; }
            }}
          >
            {resettingPassword ? 'Enviando…' : 'Trocar senha por e-mail'}
          </button>
          <p class="text-xs mt-2" style="color: var(--text-muted);">Enviaremos um link para {email} para você redefinir a senha.</p>
        </div>
      </section>
    {/if}
  </div>
{:else}
{#if showOnboardingWizard}
  <OnboardingWizard show={showOnboardingWizard} userId={userId} email={email} />
{/if}

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
      <nav class="flex gap-1 border-b mb-6 overflow-x-auto whitespace-nowrap" style="border-color: var(--border-subtle);">
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
                <option value="80mm">Térmica 80 mm — padrão</option>
                <option value="58mm">Térmica 58 mm — estreita</option>
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

          <!-- Tabelas de Preço -->
          <section class="rounded-lg p-5 grid gap-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
            <div>
              <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Tabelas de Preço</h2>
              <p class="text-xs mt-1" style="color: var(--text-muted);">Ative para trabalhar com até 3 preços por produto (ex: Balcão, Revenda, Atacado). O seletor aparece no topo do PDV.</p>
            </div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium" style="color: var(--text-main);">Ativar tabelas de preço</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={tabelasPrecoAtivo}
                on:click={() => tabelasPrecoAtivo = !tabelasPrecoAtivo}
                class="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer"
                style="background: {tabelasPrecoAtivo ? 'var(--primary)' : 'var(--bg-input)'}; border-color: {tabelasPrecoAtivo ? 'var(--primary)' : 'var(--border-subtle)'};"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full shadow transition duration-200"
                  style="background: var(--text-main); transform: translateX({tabelasPrecoAtivo ? '20px' : '0px'});"
                ></span>
              </button>
            </div>

            {#if tabelasPrecoAtivo}
              <div class="grid sm:grid-cols-3 gap-3" style="border-top: 1px solid var(--border-subtle); padding-top: 1rem;">
                <label class="block">
                  <span class="block mb-1 text-xs" style="color: var(--text-label);">Nome Tabela 1</span>
                  <input
                    class="w-full rounded-md px-3 py-2 text-sm"
                    style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                    bind:value={nomeTabela1} placeholder="Ex: Balcão"
                  />
                </label>
                <label class="block">
                  <span class="block mb-1 text-xs" style="color: var(--text-label);">Nome Tabela 2</span>
                  <input
                    class="w-full rounded-md px-3 py-2 text-sm"
                    style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                    bind:value={nomeTabela2} placeholder="Ex: Revenda"
                  />
                </label>
                <label class="block">
                  <span class="block mb-1 text-xs" style="color: var(--text-label);">Nome Tabela 3</span>
                  <input
                    class="w-full rounded-md px-3 py-2 text-sm"
                    style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                    bind:value={nomeTabela3} placeholder="Ex: Atacado"
                  />
                </label>
              </div>
            {/if}
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

          <!-- Zelo Impressão -->
          <section class="rounded-xl overflow-hidden" style="background: var(--bg-card); border: 1px solid var(--border-card);">

            <!-- Header do card -->
            <div class="p-5 flex items-center gap-4">
              <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--primary) 12%, transparent);">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-base font-semibold" style="color: var(--text-main);">Zelo Impressão</h2>
                  {#if localPrintStatus === 'conectado'}
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success);">● Conectado</span>
                  {:else if localPrintStatus === 'nao_instalado'}
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning);">Não instalado</span>
                  {:else}
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-muted);">Desconectado</span>
                  {/if}
                </div>
                <p class="text-sm mt-0.5 truncate" style="color: var(--text-muted);">
                  Impressão automática pelo Windows — sem precisar de WebUSB
                </p>
              </div>
              <button
                type="button"
                on:click={refreshLocalPrint}
                disabled={localPrintLoading}
                class="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style="background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border-subtle);"
              >{localPrintLoading ? 'Verificando…' : 'Atualizar'}</button>
            </div>

            <!-- Corpo dinâmico por estado -->
            <div style="border-top: 1px solid var(--border-subtle);">

              {#if localPrintStatus === 'nao_instalado'}
                <!-- Estado: não instalado -->
                <div class="p-5 grid gap-4">
                  <div class="flex flex-wrap gap-2">
                    <a
                      href={zeloImpressaoDownloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                      style="background: var(--primary); color: var(--primary-text, #fff);"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Baixar para Windows
                    </a>
                    <a
                      href={zeloImpressaoDownloadPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                      style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
                    >Ver instruções</a>
                  </div>
                  <div style="border-top: 1px solid var(--border-subtle); padding-top: 1rem;">
                    <p class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--text-muted);">Como configurar</p>
                    <ol class="grid gap-2.5">
                      <li class="flex items-start gap-3">
                        <span class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style="background: var(--bg-input); color: var(--text-muted);">1</span>
                        <span class="text-sm" style="color: var(--text-label);">Baixe e instale o aplicativo.</span>
                      </li>
                      <li class="flex items-start gap-3">
                        <span class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style="background: var(--bg-input); color: var(--text-muted);">2</span>
                        <span class="text-sm" style="color: var(--text-label);">Abra o Zelo Impressão e deixe o programa rodando.</span>
                      </li>
                      <li class="flex items-start gap-3">
                        <span class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style="background: var(--bg-input); color: var(--text-muted);">3</span>
                        <span class="text-sm" style="color: var(--text-label);">Volte aqui para conectar com o código de 6 números.</span>
                      </li>
                    </ol>
                  </div>
                </div>

              {:else if localPrintStatus === 'desconectado'}
                <!-- Estado: instalado mas não pareado -->
                <div class="p-5 grid gap-4">
                  <div>
                    <p class="text-sm font-medium mb-1" style="color: var(--text-main);">Conectar ao Zelo Impressão</p>
                    <p class="text-xs" style="color: var(--text-muted);">Digite o código de 6 dígitos exibido no aplicativo.</p>
                  </div>
                  <div class="flex gap-2">
                    <input
                      id="zelo-impressao-code"
                      bind:value={localPrintPairCode}
                      inputmode="numeric"
                      maxlength="6"
                      placeholder="000000"
                      class="flex-1 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-center"
                      style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                    />
                    <button
                      type="button"
                      on:click={handlePairLocalPrint}
                      disabled={localPrintPairing}
                      class="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                      style="background: var(--primary); color: var(--primary-text, #fff);"
                    >{localPrintPairing ? 'Conectando…' : 'Conectar'}</button>
                  </div>
                  <div class="flex flex-wrap gap-2 pt-1" style="border-top: 1px solid var(--border-subtle);">
                    <a
                      href={zeloImpressaoDownloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-xs font-medium transition-opacity hover:opacity-80"
                      style="color: var(--primary);"
                    >Baixar instalador</a>
                    <span style="color: var(--border-subtle);">·</span>
                    <a
                      href={zeloImpressaoDownloadPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-xs font-medium transition-opacity hover:opacity-80"
                      style="color: var(--text-muted);"
                    >Ver instruções</a>
                  </div>
                </div>

              {:else if localPrintStatus === 'conectado'}
                <!-- Estado: conectado -->
                <div class="p-5 grid gap-4">
                  <div class="flex items-center gap-3 p-3 rounded-lg" style="background: color-mix(in srgb, var(--success) 7%, transparent); border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--success);">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <p class="text-sm font-medium" style="color: var(--success);">Pronto para imprimir neste computador</p>
                  </div>

                  <div class="grid gap-2">
                    <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted);" for="zelo-impressao-printer">Impressora</label>
                    <select
                      id="zelo-impressao-printer"
                      bind:value={localPrintSelectedPrinterId}
                      class="rounded-lg px-3 py-2 text-sm"
                      style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                    >
                      {#each localPrintPrinters as printer}
                        <option value={printer.id}>{printer.name}{printer.isDefault ? ' (padrão)' : ''}{printer.isOffline ? ' — offline' : ''}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      on:click={handleSaveLocalPrintConfig}
                      disabled={localPrintSaving || !localPrintSelectedPrinterId}
                      class="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                      style="background: var(--primary); color: var(--primary-text, #fff);"
                    >{localPrintSaving ? 'Salvando…' : 'Salvar impressora'}</button>
                    <button
                      type="button"
                      on:click={handleLocalTestPrint}
                      disabled={localPrintTesting}
                      class="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                      style="background: var(--bg-input); color: var(--text-label); border: 1px solid var(--border-subtle);"
                    >{localPrintTesting ? 'Imprimindo…' : 'Imprimir teste'}</button>
                  </div>
                </div>
              {/if}

            </div>

            <!-- Rodapé -->
            <div class="px-5 py-3 flex items-center gap-2" style="background: color-mix(in srgb, var(--text-muted) 4%, transparent); border-top: 1px solid var(--border-subtle);">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <p class="text-xs" style="color: var(--text-muted);">
                Se o Zelo Impressão estiver offline, o PDV continua usando o diálogo do navegador para não travar a venda.
              </p>
            </div>

          </section>
        </div>
      {/if}

    {/if}
  </form>
{/if}
