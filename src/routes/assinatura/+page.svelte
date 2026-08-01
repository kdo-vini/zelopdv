<script>
  import OfflineIcon from '@iconify/svelte/dist/OfflineIcon.svelte';
  import pixIconData from '@iconify/icons-simple-icons/pix';
  import { supabase } from '$lib/supabaseClient';
  import { isSubscriptionActiveStrict } from '$lib/guards';
  import { onMount, onDestroy } from 'svelte';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { PLANS, calculateValue, TRIAL_DAYS } from '$lib/pricing';
  import { trackStartTrial } from '$lib/metaPixel';
  import { trackGa4Event, trackGoogleAdsInscricao } from '$lib/googleAds';
  import { capturePostHogEvent } from '$lib/posthogClient';
  import {
    CircleCheckBig,
    Hourglass,
    KeyRound,
    Monitor,
    PartyPopper,
    Table2,
    TriangleAlert,
    Zap
  } from 'lucide-svelte';


  let userId = '';
  let email = '';
  let subStatus = null;
  let loading = false;
  let pixLoading = false;
  let canceling = false;
  let message = '';
  let messageType = 'info';
  let expiryDate = null;
  let hasHadSubscription = false;
  let isActiveStrict = false;
  let trialDaysLeft = null;
  let mesasAddonOn = false;
  let acessosAddonOn = false;
  let activeMesasAddon = false;
  let activeAcessosAddon = false;
  let menuAddonOn = false;
  let activeMenuAddon = false;
  let camePromptingMesas = false;
  let camePromptingAcessos = false;
  let cameUpgradingTo = '';

  // Plano selecionado pelo user pra assinar / mudar
  let selectedPlan = 'pdv';
  // Plano atual do user (se já tem subscription)
  let activePlanTier = null;
  let pixPayment = null;
  let pixStatusLoading = false;
  let pixStatusInterval = null;
  let pixCountdownInterval = null;
  let pixNow = Date.now();
  let pixModalOpen = false;
  let pixAutoRenewing = false;
  let checkoutStep = 1;
  let pixSelectionKey = '';

  const checkoutSteps = [
    { id: 1, label: 'Plano' },
    { id: 2, label: 'Add-ons' },
    { id: 3, label: 'Pagamento' },
  ];
  const primaryPlanIds = ['pdv', 'bundle'];
  const addonCatalog = [
    {
      id: 'mesas',
      name: 'Módulo Mesas',
      priceLabel: '+R$ 30/mês',
      teaser: 'Mesas, comandas e divisão de conta sem confusão no caixa.',
      painPoint: 'Evita conta perdida, fechamento demorado e atendimento travado nas mesas.',
    },
    {
      id: 'menu',
      name: 'ZeloMenu',
      priceLabel: '+R$ 40/mês',
      teaser: 'Cardápio online com publicação no menu digital do seu negócio.',
      painPoint: 'Evita cardápio desatualizado, lista impressa e cliente sem acesso ao menu pelo celular.',
    },
    {
      id: 'acessos',
      name: 'Controle de Acessos',
      priceLabel: '+R$ 30/mês',
      teaser: 'Equipe com permissões certas, sem senha compartilhada.',
      painPoint: 'Evita acessos indevidos, alterações sem rastreio e bagunça operacional.',
    },
  ];

  $: planPrice = calculateValue(selectedPlan, {
    mesas: mesasAddonOn,
    acessos: acessosAddonOn,
    menu: menuAddonOn,
  });
  $: activePlanPrice = activePlanTier
    ? calculateValue(activePlanTier, {
        mesas: activeMesasAddon,
        acessos: activeAcessosAddon,
        menu: activeMenuAddon,
      })
    : 0;
  $: selectedPlanAllowsMesas = PLANS[selectedPlan]?.allowsMesas;
  $: selectedPlanAllowsAcessos = PLANS[selectedPlan]?.allowsAcessos;
  $: activePlanAllowsMesas = activePlanTier
    ? PLANS[activePlanTier]?.allowsMesas
    : false;
  $: activePlanAllowsAcessos = activePlanTier
    ? PLANS[activePlanTier]?.allowsAcessos
    : false;
  $: selectedPlanAllowsMenu = PLANS[selectedPlan]?.allowsMenu;
  $: activePlanAllowsMenu = activePlanTier
    ? PLANS[activePlanTier]?.allowsMenu
    : false;
  $: wizardPlanIds = isActiveStrict && activePlanTier === 'chat'
    ? ['chat', ...primaryPlanIds]
    : primaryPlanIds;
  $: selectedPlanName = PLANS[selectedPlan]?.name || 'Plano';
  $: selectedPlanTagline = PLANS[selectedPlan]?.tagline || '';
  $: selectedAddons = addonCatalog.filter((addon) => {
    if (addon.id === 'mesas') return mesasAddonOn;
    if (addon.id === 'menu') return menuAddonOn;
    if (addon.id === 'acessos') return acessosAddonOn;
    return false;
  });
  $: selectionSummary = [
    selectedPlanName,
    ...selectedAddons.map((addon) => addon.name),
  ];
  $: currentCheckoutStepLabel = checkoutSteps.find((step) => step.id === checkoutStep)?.label || 'Plano';
  $: projectedRenewalDate = getProjectedRenewalDate(expiryDate);
  $: projectedRenewalLabel = formatDate(projectedRenewalDate);
  $: expiryDateLabel = formatDate(expiryDate);
  $: activePackageChanged = isActiveStrict && (
    selectedPlan !== activePlanTier
    || !!mesasAddonOn !== !!activeMesasAddon
    || !!acessosAddonOn !== !!activeAcessosAddon
    || !!menuAddonOn !== !!activeMenuAddon
  );
  $: wizardModeLabel = isActiveStrict ? 'Mudar de plano' : 'Assinatura';
  $: wizardStepOneTitle = isActiveStrict
    ? 'Escolha como sua assinatura deve ficar'
    : 'Escolha o pacote base da sua operação';
  $: wizardStepOneCopy = isActiveStrict
    ? 'Você pode manter o pacote atual para renovar ou escolher outro pacote antes de pagar.'
    : 'Comece pelo formato do seu negócio. No próximo passo você ajusta os módulos e vê o valor final.';
  $: wizardStepTwoTitle = isActiveStrict
    ? 'Ajuste os módulos da assinatura'
    : 'Adicione só o que faz diferença';
  $: wizardStepTwoCopy = isActiveStrict
    ? 'Os módulos selecionados entram junto com a renovação quando o Pix for confirmado.'
    : 'Toque nos módulos que resolvem gargalos da sua rotina. O valor total atualiza na hora.';
  $: wizardStepThreeTitle = isActiveStrict
    ? 'Revise e confirme a renovação'
    : 'Revise e escolha como pagar';
  $: wizardStepThreeCopy = isActiveStrict
    ? `Seu pacote ${activePackageChanged ? 'ficará' : 'continua'} em R$ ${planPrice}/mês. Ao pagar, somamos 1 mês ao vencimento atual.`
    : `Seu pacote ficou em R$ ${planPrice}/mês. Escolha a forma de pagamento para liberar ou renovar seu acesso.`;
  $: pixPaymentTitle = isActiveStrict
    ? (activePackageChanged ? 'Renovar com este pacote' : 'Renovar plano atual')
    : 'Pagar com Pix';
  $: pixPaymentDescription = isActiveStrict
    ? `O novo vencimento previsto é ${projectedRenewalLabel}.`
    : 'Abra o QR Code, pague no seu banco e acompanhe a confirmação nesta tela.';
  $: pixPaymentCta = pixLoading
    ? 'Preparando Pix...'
    : isActiveStrict
      ? `Renovar com Pix - R$ ${planPrice}/mês`
      : `Pagar com Pix - R$ ${planPrice}/mês`;
  $: cardPaymentTitle = isActiveStrict
    ? (activePackageChanged ? 'Renovar no cartão com este pacote' : 'Renovar plano atual no cartão')
    : 'Pagar com cartão';
  $: cardPaymentDescription = isActiveStrict
    ? 'Finalize no checkout seguro e mantenha a renovação automática ativa.'
    : 'Finalize agora no cartão e mantenha a renovação automática ativa.';
  $: cardPaymentCta = loading
    ? 'Processando...'
    : isActiveStrict
      ? `Renovar no cartão - R$ ${planPrice}/mês`
      : `Pagar com cartão - R$ ${planPrice}/mês`;
  $: currentSelectionKey = JSON.stringify({
    selectedPlan,
    mesas: mesasAddonOn,
    acessos: acessosAddonOn,
    menu: menuAddonOn,
  });
  $: pixPaymentMatchesSelection = !pixPayment || pixSelectionKey === currentSelectionKey;
  $: pixExpiresAtMs = pixPayment?.expiresAt ? new Date(pixPayment.expiresAt).getTime() : null;
  $: pixSecondsRemaining = pixExpiresAtMs
    ? Math.max(0, Math.ceil((pixExpiresAtMs - pixNow) / 1000))
    : null;
  $: pixCountdownLabel = formatPixCountdown(pixSecondsRemaining);
  $: pixStatusLabel = getPixStatusLabel(pixPayment?.status);
  $: pixIsAwaitingPayment = pixPayment?.status === 'pending' && pixPaymentMatchesSelection;
  $: if (
    pixModalOpen
    && pixPaymentMatchesSelection
    && pixPayment?.status === 'pending'
    && pixSecondsRemaining === 0
    && !pixLoading
    && !pixAutoRenewing
  ) {
    renovarPixExpirado();
  }

  // Se selectedPlan não permite os addons, força off (UX clara)
  $: if (!selectedPlanAllowsMesas && mesasAddonOn) mesasAddonOn = false;
  $: if (!selectedPlanAllowsAcessos && acessosAddonOn) acessosAddonOn = false;
  $: if (!selectedPlanAllowsMenu && menuAddonOn) menuAddonOn = false;
  $: if (!isActiveStrict && selectedPlan === 'chat') selectedPlan = 'bundle';

  let autoStartingTrial = false;

  function stopPixStatusPolling() {
    if (pixStatusInterval) {
      clearInterval(pixStatusInterval);
      pixStatusInterval = null;
    }
  }

  function startPixClock() {
    if (typeof window === 'undefined' || pixCountdownInterval) return;
    pixCountdownInterval = window.setInterval(() => {
      pixNow = Date.now();
    }, 1000);
  }

  function stopPixClock() {
    if (pixCountdownInterval) {
      clearInterval(pixCountdownInterval);
      pixCountdownInterval = null;
    }
  }

  function goToCheckoutStep(step) {
    checkoutStep = Math.min(3, Math.max(1, step));
  }

  function buildSuccessPageUrl({ source = 'app', paymentId = '', value = null } = {}) {
    const params = new URLSearchParams({ source });
    if (paymentId) params.set('payment_id', paymentId);
    if (typeof value === 'number' && !Number.isNaN(value) && value > 0) {
      params.set('value', String(value));
    }
    return `/assinatura/sucesso?${params.toString()}`;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pt-BR');
  }

  function getProjectedRenewalDate(value) {
    const now = new Date();
    const currentEnd = value ? new Date(value) : null;
    const baseDate = currentEnd && !Number.isNaN(currentEnd.getTime()) && currentEnd > now
      ? currentEnd
      : now;
    const nextDate = new Date(baseDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  }

  function applySubscriptionState(data) {
    subStatus = data?.status || null;
    expiryDate = data?.current_period_end || null;
    hasHadSubscription = !!data;
    activeMesasAddon = !!data?.has_mesas_addon;
    activeAcessosAddon = !!data?.has_acessos_addon;
    activeMenuAddon = !!data?.has_zelo_menu;
    mesasAddonOn = activeMesasAddon;
    acessosAddonOn = activeAcessosAddon;
    menuAddonOn = activeMenuAddon;
    activePlanTier = data?.plan_tier || 'pdv';
    selectedPlan = activePlanTier;

    isActiveStrict = isSubscriptionActiveStrict(data);
    trialDaysLeft = null;
    if (subStatus === 'trialing' && expiryDate) {
      const diff = new Date(expiryDate) - new Date();
      trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
  }

  async function loadSubscriptionState() {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, created_at, current_period_end, manually_extended_until, billing_type, payment_provider, has_mesas_addon, has_acessos_addon, has_zelo_menu, plan_tier')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    applySubscriptionState(data);
    return data;
  }

  function handlePlanSelection(planId) {
    selectedPlan = planId;
  }

  function getPlanDecisionEyebrow(planId) {
    if (planId === 'chat') return 'Atendimento';
    if (planId === 'bundle') return 'Gestão + atendimento';
    return 'Gestão da operação';
  }

  function toggleAddonSelection(addonId) {
    if (addonId === 'mesas' && selectedPlanAllowsMesas) mesasAddonOn = !mesasAddonOn;
    if (addonId === 'menu' && selectedPlanAllowsMenu) menuAddonOn = !menuAddonOn;
    if (addonId === 'acessos' && selectedPlanAllowsAcessos) acessosAddonOn = !acessosAddonOn;
  }

  function addonAvailable(addonId) {
    if (addonId === 'mesas') return selectedPlanAllowsMesas;
    if (addonId === 'menu') return selectedPlanAllowsMenu;
    if (addonId === 'acessos') return selectedPlanAllowsAcessos;
    return false;
  }

  function addonSelected(addonId) {
    if (addonId === 'mesas') return mesasAddonOn;
    if (addonId === 'menu') return menuAddonOn;
    if (addonId === 'acessos') return acessosAddonOn;
    return false;
  }

  function formatPixCountdown(seconds) {
    if (seconds === null || seconds === undefined) return '';
    if (seconds <= 0) return 'Renovando Pix...';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  function getPixStatusLabel(status) {
    switch (status) {
      case 'paid':
        return 'Pagamento confirmado';
      case 'expired':
        return 'Pix vencido';
      case 'failed':
        return 'Falha no pagamento';
      case 'cancelled':
        return 'Pix cancelado';
      case 'refunded':
        return 'Pagamento estornado';
      case 'pending':
      default:
        return 'Aguardando pagamento';
    }
  }

  function closePixModal() {
    pixModalOpen = false;
  }

  function startPixStatusPolling() {
    stopPixStatusPolling();
    if (typeof window === 'undefined' || !pixPayment?.paymentId || pixPayment.status !== 'pending') return;

    pixStatusInterval = window.setInterval(() => {
      atualizarPixStatus({ silent: true });
    }, 10000);
  }

  onDestroy(() => {
    stopPixStatusPolling();
    stopPixClock();
  });

  onMount(async () => {
    startPixClock();
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id || '';
      email = userData?.user?.email || '';

      if (userId) {
        // Block sub-users from accessing subscription management
        const { data: subUserRow } = await supabase
          .from('access_users')
          .select('id')
          .eq('auth_user_id', userId)
          .eq('status', 'active')
          .maybeSingle();
        if (subUserRow) {
          window.location.href = '/gestao';
          return;
        }

        try {
          await loadSubscriptionState();

          if (hasHadSubscription && !isActiveStrict) {
            if (subStatus === 'trial_expired') {
              message = 'Seu teste gratuito expirou. Escolha um plano para continuar usando o sistema.';
              messageType = 'warning';
            } else if (expiryDate) {
              const expiry = new Date(expiryDate);
              if (expiry < new Date()) {
                message = `Sua assinatura expirou em ${expiry.toLocaleDateString('pt-BR')}. Renove para continuar usando o sistema.`;
                messageType = 'warning';
              } else if (subStatus === 'canceled') {
                message = `Sua assinatura foi cancelada e expirará em ${expiry.toLocaleDateString('pt-BR')}.`;
                messageType = 'warning';
              } else {
                message = 'Sua assinatura não está ativa. Renove para utilizar o sistema.';
                messageType = 'warning';
              }
            } else {
              message = 'Sua assinatura não está ativa. Renove para utilizar o sistema.';
              messageType = 'warning';
            }
          }
        } catch (subError) {
          console.error('[Assinatura] Erro ao carregar dados:', subError);
        }

        // Auto-start trial pra novo user — sempre como 'pdv' (eles podem fazer upgrade depois)
        if (!hasHadSubscription) {
          autoStartingTrial = true;
          try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            const token = authSession?.access_token ?? '';
            if (token) {
              const res = await fetch('/api/billing/start-trial', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              const data = await res.json();
              if (res.ok) {
                if (!data.alreadyExists) {
                  addToast(`Seu teste gratuito de ${TRIAL_DAYS} dias foi ativado!`, 'success');
                  trackStartTrial();
                  trackGa4Event('begin_trial');
                  trackGoogleAdsInscricao({ email, transactionId: userId });
                  void capturePostHogEvent('trial_auto_started', { plan: 'pdv' });
                }
                setTimeout(() => { window.location.href = '/gestao'; }, 2000);
                return;
              }
              message = data?.error || 'Erro ao ativar período de teste. Tente novamente.';
              messageType = 'warning';
            }
          } catch (e) {
            message = 'Erro ao conectar. Tente novamente ou entre em contato com o suporte.';
            messageType = 'warning';
          }
          autoStartingTrial = false;
        }
      }

      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === '1') {
          const subscribeValue = activePlanTier
            ? calculateValue(activePlanTier, {
                mesas: activeMesasAddon,
                        acessos: activeAcessosAddon,
                menu: activeMenuAddon,
              })
            : null;
          window.location.href = buildSuccessPageUrl({
            source: 'legacy',
            value: subscribeValue,
          });
          return;
        }
        if (params.get('addon') === 'mesas') {
          camePromptingMesas = true;
          if (!activeMesasAddon) mesasAddonOn = true;
          // Se user veio querendo Mesas mas tá no plano errado, sugere bundle
          if (selectedPlan === 'chat') selectedPlan = 'bundle';
          checkoutStep = 2;
        }
        if (params.get('addon') === 'acessos') {
          camePromptingAcessos = true;
          if (!activeAcessosAddon) acessosAddonOn = true;
          if (selectedPlan === 'chat') selectedPlan = 'bundle';
          checkoutStep = 2;
        }
        const upgrade = params.get('upgrade');
        if (upgrade && PLANS[upgrade]) {
          cameUpgradingTo = upgrade;
          selectedPlan = upgrade;
        }
        const msg = params.get('msg');
        if (msg === 'subscribe' && hasHadSubscription) {
          message = 'Sua assinatura não está ativa. Renove para utilizar o sistema.';
          messageType = 'warning';
        } else if (msg === 'complete') {
          message = 'Complete o perfil da empresa para continuar.';
          messageType = 'info';
        } else if (msg === 'expired') {
          message = 'Sua assinatura expirou. Renove para continuar usando o sistema.';
          messageType = 'warning';
        }
      } catch (paramError) {
        console.error('[Assinatura] Erro ao ler parâmetros:', paramError);
      }
    } catch (error) {
      console.error('[Assinatura] Erro crítico:', error);
      message = 'Erro ao carregar página. Por favor, recarregue ou entre em contato com o suporte.';
      messageType = 'warning';
    }
  });

  async function assinar() {
    if (loading) return;
    try {
      loading = true;
      message = '';

      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      if (!token) {
        message = 'Sua sessão expirou. Faça login novamente.';
        messageType = 'warning';
        return;
      }

      const res = await fetch('/api/billing/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          planTier: selectedPlan,
          addons: {
            mesas: mesasAddonOn,
                    acessos: acessosAddonOn,
            menu: menuAddonOn,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.redirect) {
          window.location.href = data.redirect;
          return;
        }
        message = data?.error || 'Falha ao criar assinatura.';
        messageType = 'warning';
        return;
      }

      // O fluxo de cartão retorna uma URL hospedada pelo provedor e segue por redirecionamento.
      if (data.url) {
        if (typeof window.fbq === 'function') {
          window.fbq('track', 'InitiateCheckout', { value: planPrice, currency: 'BRL' });
        }
        void capturePostHogEvent('subscription_checkout_started', {
          plan: selectedPlan,
          addons: { mesas: mesasAddonOn, acessos: acessosAddonOn, menu: menuAddonOn },
          amount: planPrice,
          payment_method: 'card',
          is_renewal: isActiveStrict,
        });
        window.location.href = data.url;
        return;
      }

      message = 'Resposta inesperada do servidor. Tente novamente.';
      messageType = 'warning';
    } catch (e) {
      message = e?.message || 'Erro ao conectar com o servidor de pagamento.';
      messageType = 'warning';
    } finally {
      loading = false;
    }
  }

  async function gerarPix({ autoRenew = false, renewal = false } = {}) {
    if (pixLoading) return;

    try {
      pixLoading = true;
      message = '';

      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      if (!token) {
        message = 'Sua sessão expirou. Faça login novamente.';
        messageType = 'warning';
        return;
      }

      const res = await fetch('/api/billing/pix/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          planTier: selectedPlan,
          addons: {
            mesas: mesasAddonOn,
                    acessos: acessosAddonOn,
            menu: menuAddonOn,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.redirect) {
          window.location.href = data.redirect;
          return;
        }
        message = data?.error || 'Falha ao gerar cobrança Pix.';
        messageType = 'warning';
        return;
      }

      pixPayment = data;
      pixSelectionKey = currentSelectionKey;
      pixModalOpen = true;
      goToCheckoutStep(3);
      startPixStatusPolling();
      if (!data.reused) {
        void capturePostHogEvent('pix_payment_initiated', {
          plan: selectedPlan,
          addons: { mesas: mesasAddonOn, acessos: acessosAddonOn, menu: menuAddonOn },
          amount: planPrice,
          is_renewal: isActiveStrict,
        });
      }
      messageType = 'info';
      if (autoRenew) {
        message = 'O Pix venceu e uma nova cobrança foi gerada automaticamente.';
      } else if (renewal) {
        message = data?.reused
          ? 'Você já tinha um Pix de renovação em aberto. Mantivemos a cobrança atual.'
          : 'Pix de renovação gerado. Ao confirmar o pagamento, somamos 1 mês ao vencimento atual.';
      } else {
        message = data?.reused
          ? 'Você já tinha um Pix em aberto. Mantivemos a cobrança atual.'
          : 'Pix gerado com sucesso. Faça o pagamento e acompanhe a confirmação nesta tela.';
      }
    } catch (e) {
      message = e?.message || 'Erro ao conectar com o servidor de pagamento.';
      messageType = 'warning';
    } finally {
      pixLoading = false;
    }
  }

  async function atualizarPixStatus({ silent = false } = {}) {
    if (!pixPayment?.paymentId || pixStatusLoading) return;

    try {
      const shouldStayOnPageAfterPayment = isActiveStrict && hasHadSubscription;
      pixStatusLoading = true;

      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      if (!token) {
        if (!silent) {
          message = 'Sua sessão expirou. Faça login novamente.';
          messageType = 'warning';
        }
        return;
      }

      const res = await fetch(`/api/billing/pix/status/${pixPayment.paymentId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        if (!silent) {
          message = data?.error || 'Falha ao consultar status do Pix.';
          messageType = 'warning';
        }
        return;
      }

      pixPayment = data;
      if (data.status === 'pending') {
        pixSelectionKey = currentSelectionKey;
      }

      if (data.status === 'paid') {
        stopPixStatusPolling();
        message = 'Pagamento confirmado. Redirecionando…';
        messageType = 'success';
        setTimeout(() => {
          window.location.href = buildSuccessPageUrl({
            source: shouldStayOnPageAfterPayment ? 'pix-renewal' : 'pix',
            paymentId: pixPayment?.paymentId || data.paymentId || '',
            value: planPrice,
          });
        }, 1200);
        return;
      }

      if (data.status === 'expired') {
        stopPixStatusPolling();
        if (pixModalOpen && pixPaymentMatchesSelection && !pixAutoRenewing) {
          await renovarPixExpirado();
          return;
        }
        if (!silent) {
          message = 'Este Pix venceu. Geramos uma nova cobrança para continuar.';
          messageType = 'warning';
        }
        return;
      }

      if (['failed', 'cancelled', 'refunded'].includes(data.status)) {
        stopPixStatusPolling();
        if (!silent) {
          message = 'Não foi possível confirmar este Pix. Gere uma nova cobrança para continuar.';
          messageType = 'warning';
        }
        return;
      }

      if (!silent) {
        message = 'Cobrança Pix ainda aguardando pagamento.';
        messageType = 'info';
      }
    } catch (e) {
      if (!silent) {
        message = e?.message || 'Erro ao consultar status do Pix.';
        messageType = 'warning';
      }
    } finally {
      pixStatusLoading = false;
    }
  }

  async function renovarPixExpirado() {
    if (pixAutoRenewing || pixLoading) return;

    pixAutoRenewing = true;
    try {
      await gerarPix({ autoRenew: true });
    } finally {
      pixAutoRenewing = false;
    }
  }

  async function cancelarAssinatura() {
    const confirmed = await confirmAction(
      'Cancelar Assinatura',
      'Tem certeza que deseja cancelar sua assinatura? Você perderá acesso ao sistema ao final do período atual.'
    );
    if (!confirmed) return;

    try {
      canceling = true;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';

      const res = await fetch('/api/billing/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const json = await res.json();
      if (!res.ok) {
        addToast(json?.error || 'Falha ao cancelar.', 'error');
        return;
      }

      addToast('Assinatura cancelada.', 'info');
      subStatus = 'canceled';
    } catch (e) {
      addToast('Erro ao cancelar assinatura.', 'error');
    } finally {
      canceling = false;
    }
  }

  $: defaultMessage = hasHadSubscription
    ? 'Renove sua assinatura para continuar usando o sistema.'
    : `${TRIAL_DAYS} dias grátis! Escolha o plano que faz sentido pro seu negócio.`;

  $: if (pixPayment && pixSelectionKey && pixSelectionKey !== currentSelectionKey) {
    stopPixStatusPolling();
  }
</script>

<svelte:head>
  <title>Assinatura — Zelo</title>
  <meta name="description" content="Monte seu plano ZeloPDV, escolha add-ons e pague com Pix ou cartão no fluxo de assinatura do Zelo.">
</svelte:head>

<section class="assinatura-container">
  <p class="breadcrumb">Conta / Assinatura</p>
  <h1 class="text-xl font-bold text-slate-100 tracking-tight">Sua assinatura Zelo</h1>
  <p class="subtitle">Escolha o pacote, ajuste os módulos e finalize com Pix ou cartão em poucos passos.</p>

  {#if camePromptingMesas}
    <div class="status-card info">
      <div class="status-icon"><Table2 class="size-6" aria-hidden="true" /></div>
      <div>
          <strong>Você quer ativar o Módulo Mesas</strong>
          <div class="status-detail">
            {#if isActiveStrict && activePlanAllowsMesas && !activeMesasAddon}
            Marque "Módulo Mesas" no wizard abaixo e confirme a renovação.
          {:else if isActiveStrict && !activePlanAllowsMesas}
            O Módulo Mesas precisa de um plano com PDV. Mude pra ZeloPDV ou Pacote Gestão + Atendimento.
          {:else if activeMesasAddon}
            Já está ativo. Acesse <a href="/app/mesas" style="color: var(--primary);">/app/mesas</a>.
          {:else}
            Marque "Módulo Mesas" no formulário de assinatura abaixo.
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if camePromptingAcessos}
    <div class="status-card info">
      <div class="status-icon"><KeyRound class="size-6" aria-hidden="true" /></div>
      <div>
          <strong>Você quer ativar Controle de Acessos</strong>
          <div class="status-detail">
            {#if isActiveStrict && activePlanAllowsAcessos && !activeAcessosAddon}
            Marque "Controle de Acessos" no wizard abaixo e confirme a renovação.
          {:else if isActiveStrict && !activePlanAllowsAcessos}
            Controle de Acessos precisa de um plano com PDV. Mude pra ZeloPDV ou Pacote Gestão + Atendimento.
          {:else if activeAcessosAddon}
            Já está ativo.
          {:else}
            Marque "Controle de Acessos" no formulário de assinatura abaixo.
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if cameUpgradingTo && cameUpgradingTo !== activePlanTier}
    <div class="status-card info" style="border-color: rgba(99, 102, 241, 0.45);">
      <div class="status-icon"><Zap class="size-6" aria-hidden="true" /></div>
      <div>
        <strong>Upgrade para {PLANS[cameUpgradingTo].name}</strong>
        <div class="status-detail">
          {#if isActiveStrict}
            Confirme abaixo. Novo valor entra na próxima cobrança.
          {:else}
            Selecione o plano e finalize sua assinatura.
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if isActiveStrict}
    <!-- ACTIVE / TRIALING — show current plan + plan switcher + addon controls -->

    <!-- Sem teto de dias: `trialing` já delimita o aviso. O antigo `<= 30` era sempre
         verdadeiro no trial de 30 dias, mas virou filtro real ao cair pra 14 e escondia
         o aviso de quem ainda tem trial longo (conta antiga ou extensão manual). -->
    {#if subStatus === 'trialing' && trialDaysLeft !== null}
      <div class="status-card warning">
        <div class="status-icon"><Hourglass class="size-6" aria-hidden="true" /></div>
        <div>
          <strong>
            {trialDaysLeft === 0 ? 'Seu teste termina hoje!' : `Teste termina em ${trialDaysLeft} dia${trialDaysLeft === 1 ? '' : 's'}`}
          </strong>
          {#if expiryDate}
            <div class="status-detail">Válido até {new Date(expiryDate).toLocaleDateString('pt-BR')}.</div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="status-card active">
        <div class="status-icon"><CircleCheckBig class="size-6" aria-hidden="true" /></div>
        <div>
          <strong>Assinatura ativa — {PLANS[activePlanTier]?.name || 'Plano'}</strong>
          {#if expiryDate}
            <div class="status-detail">Próxima renovação: {new Date(expiryDate).toLocaleDateString('pt-BR')} · R$ {activePlanPrice}/mês</div>
          {/if}
        </div>
      </div>
    {/if}

    <a href="/app" class="btn-secondary" style="text-align:center; text-decoration:none;">Entrar no sistema</a>

    <div class="checkout-flow">
      <div class="checkout-steps" aria-label="Etapas para mudar ou renovar assinatura">
        {#each checkoutSteps as step}
          <button
            type="button"
            class="step-chip"
            class:active={checkoutStep === step.id}
            class:done={checkoutStep > step.id}
            on:click={() => goToCheckoutStep(step.id)}
          >
            <span class="step-chip-number">{step.id}</span>
            <span>{step.label}</span>
          </button>
        {/each}
      </div>

      <div class="mobile-step-pagination" aria-label="Etapa atual da renovação">
        <div class="mobile-step-copy">
          <span class="mobile-step-kicker">Etapa {checkoutStep} de {checkoutSteps.length}</span>
          <strong>{currentCheckoutStepLabel}</strong>
        </div>
        <div class="mobile-step-dots" aria-hidden="true">
          {#each checkoutSteps as step}
            <button
              type="button"
              class="mobile-step-dot"
              class:active={checkoutStep === step.id}
              on:click={() => goToCheckoutStep(step.id)}
              aria-label={`Ir para ${step.label}`}
            ></button>
          {/each}
        </div>
      </div>

      <div class="checkout-shell">
        <div class="checkout-track" style={`transform: translateX(-${(checkoutStep - 1) * 100}%);`}>
          <section class="checkout-step-panel" aria-hidden={checkoutStep !== 1}>
            <div class="step-panel-header step-panel-header-large">
              <p class="step-kicker">{wizardModeLabel}</p>
              <h2 class="selector-title selector-title-large">{wizardStepOneTitle}</h2>
              <p class="step-copy">{wizardStepOneCopy}</p>
            </div>

            <div class="plan-focus-grid plan-focus-grid-large">
              {#each wizardPlanIds as planId}
                <button
                  type="button"
                  class="plan-card plan-card-primary plan-card-decision"
                  class:selected={selectedPlan === planId}
                  class:current={planId === activePlanTier}
                  class:bundle={planId === 'bundle'}
                  on:click={() => handlePlanSelection(planId)}
                >
                  {#if planId === 'bundle'}<span class="plan-badge">Mais popular</span>{/if}
                  <span class="decision-eyebrow">{getPlanDecisionEyebrow(planId)}</span>
                  <div class="plan-name">{PLANS[planId].name}</div>
                  <div class="plan-price">R$ {PLANS[planId].price}<span class="plan-cycle">/mês</span></div>
                  {#if PLANS[planId].bundleSavings}<div class="plan-savings">Economize R$ {PLANS[planId].bundleSavings}</div>{/if}
                  <div class="plan-tagline">{PLANS[planId].tagline}</div>
                  <div class="plan-cta">
                    {#if selectedPlan === planId}
                      {planId === activePlanTier ? 'Plano atual selecionado' : 'Novo pacote selecionado'}
                    {:else}
                      Escolher pacote
                    {/if}
                  </div>
                </button>
              {/each}
            </div>

            <div class="step-actions">
              <button type="button" class="btn-primary step-continue" on:click={() => goToCheckoutStep(2)}>
                Continuar
              </button>
            </div>
          </section>

          <section class="checkout-step-panel" aria-hidden={checkoutStep !== 2}>
            <div class="step-panel-header">
              <p class="step-kicker">{wizardModeLabel}</p>
              <h2 class="selector-title">{wizardStepTwoTitle}</h2>
              <p class="step-copy">{wizardStepTwoCopy}</p>
            </div>

            <div class="addons-grid">
              {#each addonCatalog as addon}
                <button
                  type="button"
                  class="addon-choice"
                  class:selected={addonSelected(addon.id)}
                  class:disabled={!addonAvailable(addon.id)}
                  on:click={() => toggleAddonSelection(addon.id)}
                  disabled={!addonAvailable(addon.id)}
                >
                  <div class="addon-choice-top">
                    <div class="addon-choice-title">
                      <strong>{addon.name}</strong>
                      <span>{addon.priceLabel}</span>
                    </div>
                    <span class="addon-pill" class:on={addonSelected(addon.id)}>
                      {#if addonAvailable(addon.id)}
                        {addonSelected(addon.id) ? 'Selecionado' : 'Opcional'}
                      {:else}
                        Não disponível
                      {/if}
                    </span>
                  </div>
                  <p class="addon-choice-copy">
                    {#if addonAvailable(addon.id)}
                      {addon.teaser}
                    {:else}
                      Disponível apenas em planos com ZeloPDV.
                    {/if}
                  </p>
                  {#if addonAvailable(addon.id)}
                    <span class="addon-pain">Resolve: {addon.painPoint}</span>
                  {/if}
                  <span class="addon-tooltip">{addon.painPoint}</span>
                </button>
              {/each}
            </div>

            <div class="step-actions step-actions-between">
              <button type="button" class="btn-secondary" on:click={() => goToCheckoutStep(1)}>
                Voltar
              </button>
              <button type="button" class="btn-primary step-continue" on:click={() => goToCheckoutStep(3)}>
                Revisar e pagar
              </button>
            </div>
          </section>

          <section class="checkout-step-panel" aria-hidden={checkoutStep !== 3}>
            <div class="step-panel-header">
              <p class="step-kicker">{wizardModeLabel}</p>
              <h2 class="selector-title">{wizardStepThreeTitle}</h2>
              <p class="step-copy">{wizardStepThreeCopy}</p>
            </div>

            <div class="step-total-spotlight">
              <span class="step-total-label">{activePackageChanged ? 'Novo pacote' : 'Pacote atual'}</span>
              <strong>R$ {planPrice}/mês</strong>
              <p>{selectedAddons.length ? selectionSummary.join(' + ') : selectedPlanTagline}</p>
            </div>

            <div class="renewal-summary">
              <span>Vencimento atual: <strong>{expiryDateLabel || 'não definido'}</strong></span>
              <span>Após o pagamento: <strong>{projectedRenewalLabel}</strong></span>
            </div>

            <div class="payment-grid">
              <button class="payment-card" type="button" on:click={() => gerarPix({ renewal: true })} disabled={loading || pixLoading}>
                <div class="payment-card-head">
                  <span class="payment-card-icon" aria-hidden="true">
                    <OfflineIcon icon={pixIconData} />
                  </span>
                  <span class="payment-card-kicker">Pix</span>
                </div>
                <strong>{pixPaymentTitle}</strong>
                <span>{pixPaymentDescription}</span>
                <span class="payment-card-cta">{pixPaymentCta}</span>
              </button>

              <button class="payment-card" type="button" on:click={assinar} disabled={loading || pixLoading}>
                <div class="payment-card-head">
                  <span class="payment-card-icon" aria-hidden="true">
                    <svg viewBox="0 0 64 64" role="presentation" focusable="false">
                      <rect x="8" y="14" width="48" height="36" rx="8" fill="none" stroke="currentColor" stroke-width="4" />
                      <rect x="12" y="22" width="40" height="8" rx="2" fill="currentColor" opacity="0.9" />
                      <rect x="16" y="38" width="12" height="4" rx="2" fill="currentColor" opacity="0.55" />
                      <rect x="32" y="38" width="16" height="4" rx="2" fill="currentColor" opacity="0.35" />
                    </svg>
                  </span>
                  <span class="payment-card-kicker">Cartão</span>
                </div>
                <strong>{cardPaymentTitle}</strong>
                <span>{cardPaymentDescription}</span>
                <span class="payment-card-cta">{cardPaymentCta}</span>
              </button>
            </div>

            {#if pixPayment && !pixPaymentMatchesSelection}
              <div class="status-card warning compact-status">
                <div class="status-icon"><TriangleAlert class="size-6" aria-hidden="true" /></div>
                <div>Você alterou o plano ou os add-ons depois de gerar o Pix. Gere uma nova cobrança para continuar com a seleção atual.</div>
              </div>
            {/if}

            <div class="step-actions step-actions-between">
              <button type="button" class="btn-secondary" on:click={() => goToCheckoutStep(2)}>
                Voltar
              </button>
            </div>
          </section>
        </div>
      </div>

      {#if checkoutStep < 3}
        <div class="mobile-sticky-summary" aria-label="Resumo do pacote selecionado">
          <div class="mobile-sticky-copy">
            <span>{selectedPlanName}</span>
            <strong>R$ {planPrice}/mês</strong>
          </div>
          <button
            type="button"
            class="btn-primary mobile-sticky-action"
            on:click={() => goToCheckoutStep(checkoutStep + 1)}
          >
            {checkoutStep === 1 ? 'Continuar' : 'Revisar e pagar'}
          </button>
        </div>
      {/if}

      <div class="checkout-summary">
        <div>
          <p class="summary-kicker">{activePackageChanged ? 'Pacote selecionado' : 'Renovação do pacote atual'}</p>
          <h2 class="summary-title">{selectedPlanName}</h2>
          <p class="summary-copy">
            {#if selectedAddons.length}
              {selectionSummary.join(' + ')}
            {:else}
              {selectedPlanTagline}
            {/if}
          </p>
        </div>
        <div class="summary-total">
          <span>Total mensal</span>
          <strong>R$ {planPrice}</strong>
        </div>
      </div>
    </div>

    <div class="actions-row">
      <button class="btn-danger-outline" on:click={cancelarAssinatura} disabled={canceling}>
        {canceling ? 'Cancelando…' : 'Cancelar assinatura'}
      </button>
    </div>

  {:else if autoStartingTrial}
    <div class="status-card info">
      <div class="status-icon"><Hourglass class="size-6" aria-hidden="true" /></div>
      <div>
        <strong>Ativando seu teste gratuito de {TRIAL_DAYS} dias…</strong>
        <div class="status-detail">Você será redirecionado em instantes.</div>
      </div>
    </div>

  {:else}
    <!-- NOT-ACTIVE — step-by-step checkout -->
    {#if messageType === 'warning' && message}
      <div class="status-card warning">
        <div class="status-icon"><TriangleAlert class="size-6" aria-hidden="true" /></div>
        <div>{message}</div>
      </div>
    {:else}
      <div class="status-card info">
        <div class="status-icon"><PartyPopper class="size-6" aria-hidden="true" /></div>
        <div>
          <div class="font-medium">{message || defaultMessage}</div>
        </div>
      </div>
    {/if}

    <div class="checkout-flow">
      <div class="checkout-steps" aria-label="Etapas da assinatura">
        {#each checkoutSteps as step}
          <button
            type="button"
            class="step-chip"
            class:active={checkoutStep === step.id}
            class:done={checkoutStep > step.id}
            on:click={() => goToCheckoutStep(step.id)}
          >
            <span class="step-chip-number">{step.id}</span>
            <span>{step.label}</span>
          </button>
        {/each}
      </div>

      <div class="mobile-step-pagination" aria-label="Etapa atual da assinatura">
        <div class="mobile-step-copy">
          <span class="mobile-step-kicker">Etapa {checkoutStep} de {checkoutSteps.length}</span>
          <strong>{currentCheckoutStepLabel}</strong>
        </div>
        <div class="mobile-step-dots" aria-hidden="true">
          {#each checkoutSteps as step}
            <button
              type="button"
              class="mobile-step-dot"
              class:active={checkoutStep === step.id}
              on:click={() => goToCheckoutStep(step.id)}
              aria-label={`Ir para ${step.label}`}
            ></button>
          {/each}
        </div>
      </div>

      <div class="checkout-shell">
        <div class="checkout-track" style={`transform: translateX(-${(checkoutStep - 1) * 100}%);`}>
          <section class="checkout-step-panel" aria-hidden={checkoutStep !== 1}>
            <div class="step-panel-header step-panel-header-large">
              <p class="step-kicker">Etapa 1</p>
              <h2 class="selector-title selector-title-large">Escolha o pacote base da sua operação</h2>
              <p class="step-copy">Comece pelo formato do seu negócio. No próximo passo você ajusta os módulos e vê o valor final.</p>
            </div>

            <div class="plan-focus-grid plan-focus-grid-large">
              {#each primaryPlanIds as planId}
                <button
                  type="button"
                  class="plan-card plan-card-primary plan-card-decision"
                  class:selected={selectedPlan === planId}
                  class:bundle={planId === 'bundle'}
                  on:click={() => handlePlanSelection(planId)}
                >
                  {#if planId === 'bundle'}<span class="plan-badge">Mais popular</span>{/if}
                  <span class="decision-eyebrow">
                    {#if planId === 'pdv'}
                      Gestão da operação
                    {:else}
                      Gestão + atendimento
                    {/if}
                  </span>
                  <div class="plan-name">{PLANS[planId].name}</div>
                  <div class="plan-price">R$ {PLANS[planId].price}<span class="plan-cycle">/mês</span></div>
                  {#if PLANS[planId].bundleSavings}<div class="plan-savings">Economize R$ {PLANS[planId].bundleSavings}</div>{/if}
                  <div class="plan-tagline">{PLANS[planId].tagline}</div>
                  <div class="plan-cta">{selectedPlan === planId ? 'Pacote selecionado' : 'Escolher pacote'}</div>
                </button>
              {/each}
            </div>

            <div class="step-actions">
              <button type="button" class="btn-primary step-continue" on:click={() => goToCheckoutStep(2)}>
                Continuar
              </button>
            </div>
          </section>

          <section class="checkout-step-panel" aria-hidden={checkoutStep !== 2}>
            <div class="step-panel-header">
              <p class="step-kicker">Etapa 2</p>
              <h2 class="selector-title">Adicione só o que faz diferença</h2>
              <p class="step-copy">Toque nos módulos que resolvem gargalos da sua rotina. O valor total atualiza na hora.</p>
            </div>

            <div class="addons-grid">
              {#each addonCatalog as addon}
                <button
                  type="button"
                  class="addon-choice"
                  class:selected={addonSelected(addon.id)}
                  class:disabled={!addonAvailable(addon.id)}
                  on:click={() => toggleAddonSelection(addon.id)}
                  disabled={!addonAvailable(addon.id)}
                >
                  <div class="addon-choice-top">
                    <div class="addon-choice-title">
                      <strong>{addon.name}</strong>
                      <span>{addon.priceLabel}</span>
                    </div>
                    <span class="addon-pill" class:on={addonSelected(addon.id)}>
                      {#if addonAvailable(addon.id)}
                        {addonSelected(addon.id) ? 'Selecionado' : 'Opcional'}
                      {:else}
                        Não disponível
                      {/if}
                    </span>
                  </div>
                  <p class="addon-choice-copy">
                    {#if addonAvailable(addon.id)}
                      {addon.teaser}
                    {:else}
                      Disponível apenas em planos com ZeloPDV.
                    {/if}
                  </p>
                  {#if addonAvailable(addon.id)}
                    <span class="addon-pain">Resolve: {addon.painPoint}</span>
                  {/if}
                  <span class="addon-tooltip">{addon.painPoint}</span>
                </button>
              {/each}
            </div>

            <div class="step-actions step-actions-between">
              <button type="button" class="btn-secondary" on:click={() => goToCheckoutStep(1)}>
                Voltar
              </button>
              <button type="button" class="btn-primary step-continue" on:click={() => goToCheckoutStep(3)}>
                Revisar e pagar
              </button>
            </div>
          </section>

          <section class="checkout-step-panel" aria-hidden={checkoutStep !== 3}>
            <div class="step-panel-header">
              <p class="step-kicker">Etapa 3</p>
              <h2 class="selector-title">Revise e escolha como pagar</h2>
              <p class="step-copy">Seu pacote ficou em R$ {planPrice}/mês. Escolha a forma de pagamento para liberar ou renovar seu acesso.</p>
            </div>

            <div class="step-total-spotlight">
              <span class="step-total-label">Total do seu pacote</span>
              <strong>R$ {planPrice}/mês</strong>
              <p>{selectedAddons.length ? selectionSummary.join(' + ') : selectedPlanTagline}</p>
            </div>

            <div class="payment-grid">
              <button class="payment-card" type="button" on:click={gerarPix} disabled={loading || pixLoading}>
                <div class="payment-card-head">
                  <span class="payment-card-icon" aria-hidden="true">
                    <OfflineIcon icon={pixIconData} />
                  </span>
                  <span class="payment-card-kicker">Pix</span>
                </div>
                <strong>Pagar com Pix</strong>
                <span>Abra o QR Code, pague no seu banco e acompanhe a confirmação nesta tela.</span>
                <span class="payment-card-cta">
                  {pixLoading ? 'Preparando Pix…' : `Pagar com Pix — R$ ${planPrice}/mês`}
                </span>
              </button>

              <button class="payment-card" type="button" on:click={assinar} disabled={loading || pixLoading}>
                <div class="payment-card-head">
                  <span class="payment-card-icon" aria-hidden="true">
                    <svg viewBox="0 0 64 64" role="presentation" focusable="false">
                      <rect x="8" y="14" width="48" height="36" rx="8" fill="none" stroke="currentColor" stroke-width="4" />
                      <rect x="12" y="22" width="40" height="8" rx="2" fill="currentColor" opacity="0.9" />
                      <rect x="16" y="38" width="12" height="4" rx="2" fill="currentColor" opacity="0.55" />
                      <rect x="32" y="38" width="16" height="4" rx="2" fill="currentColor" opacity="0.35" />
                    </svg>
                  </span>
                  <span class="payment-card-kicker">Cartão</span>
                </div>
                <strong>Pagar com cartão</strong>
                <span>Finalize agora no cartão e mantenha a renovação automática ativa.</span>
                <span class="payment-card-cta">
                  {loading ? 'Processando…' : `Pagar com cartão — R$ ${planPrice}/mês`}
                </span>
              </button>
            </div>

            {#if pixPayment && !pixPaymentMatchesSelection}
              <div class="status-card warning compact-status">
                <div class="status-icon"><TriangleAlert class="size-6" aria-hidden="true" /></div>
                <div>Você alterou o plano ou os add-ons depois de gerar o Pix. Gere uma nova cobrança para continuar com a seleção atual.</div>
              </div>
            {/if}

            <div class="step-actions step-actions-between">
              <button type="button" class="btn-secondary" on:click={() => goToCheckoutStep(2)}>
                Voltar
              </button>
            </div>
          </section>
        </div>
      </div>

      {#if checkoutStep < 3}
        <div class="mobile-sticky-summary" aria-label="Resumo do pacote selecionado">
          <div class="mobile-sticky-copy">
            <span>{selectedPlanName}</span>
            <strong>R$ {planPrice}/mês</strong>
          </div>
          <button
            type="button"
            class="btn-primary mobile-sticky-action"
            on:click={() => goToCheckoutStep(checkoutStep + 1)}
          >
            {checkoutStep === 1 ? 'Continuar' : 'Revisar e pagar'}
          </button>
        </div>
      {/if}

      <div class="checkout-summary">
        <div>
          <p class="summary-kicker">Resumo do pacote</p>
          <h2 class="summary-title">{selectedPlanName}</h2>
          <p class="summary-copy">
            {#if selectedAddons.length}
              {selectionSummary.join(' + ')}
            {:else}
              {selectedPlanTagline}
            {/if}
          </p>
        </div>
        <div class="summary-total">
          <span>Total mensal</span>
          <strong>R$ {planPrice}</strong>
        </div>
      </div>
    </div>

    <p class="legal-text">
      Ao assinar, você concorda com nossos <a href="/termos">Termos de Uso</a> e <a href="/privacidade">Política de Privacidade</a>.
      Pagamento via cartão ou Pix.
      {#if !hasHadSubscription}
        A cobrança de R$ {planPrice}/mês será iniciada após o período de teste de {TRIAL_DAYS} dias.
      {:else}
        A cobrança de R$ {planPrice}/mês será iniciada imediatamente.
      {/if}
    </p>
  {/if}
</section>

{#if pixModalOpen && pixPayment && pixPaymentMatchesSelection}
  <div class="pix-modal-layer">
    <button type="button" class="pix-modal-backdrop" aria-label="Fechar Pix" on:click={closePixModal}></button>
    <div
      class="pix-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pix-modal-title"
      tabindex="-1"
    >
      <button type="button" class="pix-modal-close" aria-label="Fechar Pix" on:click={closePixModal}>
        ×
      </button>

      <div class="pix-modal-header">
        <span class="pix-modal-icon" aria-hidden="true">
          <OfflineIcon icon={pixIconData} />
        </span>
        <div>
          <p class="step-kicker">Pagamento Pix</p>
          <h2 id="pix-modal-title" class="pix-modal-title">{pixStatusLabel}</h2>
          <p class="pix-detail">Valor: R$ {planPrice}/mês</p>
        </div>
      </div>

      <div class="pix-waiting-line" class:confirmed={pixPayment.status === 'paid'}>
        {#if pixIsAwaitingPayment || pixAutoRenewing}
          <span class="spinner" aria-hidden="true"></span>
          <span>{pixAutoRenewing ? 'Renovando QR Code Pix...' : 'Aguardando confirmação do pagamento...'}</span>
        {:else}
          <span>{pixStatusLabel}</span>
        {/if}
      </div>

      {#if pixPayment.expiresAt && pixIsAwaitingPayment}
        <div class="pix-countdown">
          <span>QR Code válido por</span>
          <strong>{pixCountdownLabel}</strong>
          <small>Quando vencer, um novo Pix será gerado automaticamente.</small>
        </div>
      {/if}

      {#if pixAutoRenewing || pixLoading}
        <div class="pix-renewing-state">
          <span class="spinner large" aria-hidden="true"></span>
          <strong>Preparando novo Pix</strong>
        </div>
      {:else}
        {#if pixPayment.qrCodeBase64}
          <img class="pix-qrcode" src={pixPayment.qrCodeBase64} alt="QR Code Pix" />
        {/if}

        {#if pixPayment.brCode}
          <label class="pix-copy-field">
            <span>Copia e cola</span>
            <textarea readonly rows="4">{pixPayment.brCode}</textarea>
          </label>
          <div class="pix-actions">
            <button
              type="button"
              class="btn-primary"
              on:click={() => {
                navigator.clipboard?.writeText(pixPayment.brCode);
                addToast('Código Pix copiado.', 'success');
              }}
            >
              Copiar código Pix
            </button>
            <button
              type="button"
              class="btn-secondary"
              on:click={() => atualizarPixStatus()}
              disabled={pixStatusLoading}
            >
              {#if pixStatusLoading}
                Atualizando...
              {:else}
                Já paguei
              {/if}
            </button>
          </div>
        {/if}
      {/if}

      <p class="legal-text pix-legal">
        Esta tela acompanha o pagamento automaticamente. Você pode fechar e voltar depois; o acesso será liberado quando o Pix for confirmado.
      </p>
    </div>
  </div>
{/if}

<style>
  .assinatura-container {
    max-width: 920px;
    margin: 2rem auto;
    padding: 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .breadcrumb {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--text-muted);
    margin: 0;
  }

  .title {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--text-main);
    margin: 0;
  }

  .subtitle {
    font-size: 0.95rem;
    color: var(--text-label);
    margin: 0;
  }

  .status-card {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 1rem 1.25rem;
    border-radius: 10px;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .status-card.active {
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
    color: var(--status-success-text);
  }
  .status-card.warning {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    color: var(--status-warning-text);
  }
  .status-card.info {
    background: rgba(14, 165, 233, 0.08);
    border: 1px solid rgba(14, 165, 233, 0.25);
    color: var(--primary);
  }
  .status-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .status-detail { font-size: 0.85rem; margin-top: 0.25rem; opacity: 0.8; }

  .actions-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    background: var(--primary);
    color: var(--primary-text);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.2s;
  }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1.25rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-secondary:hover { background: var(--bg-card); }

  .btn-danger-outline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1.25rem;
    background: transparent;
    color: var(--error, #dc2626);
    border: 1px solid var(--error, #dc2626);
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-danger-outline:hover { background: rgba(220, 38, 38, 0.08); }
  .btn-danger-outline:disabled { opacity: 0.5; cursor: not-allowed; }

  .plan-card {
    position: relative;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 1.1rem 1rem 1rem;
    border: 2px solid var(--border-subtle);
    border-radius: 12px;
    background: var(--bg-card);
    color: var(--text-main);
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .plan-card:hover:not(:disabled) { border-color: var(--primary); transform: translateY(-1px); }
  .plan-card.selected { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
  .plan-card.current { border-color: var(--success, #16a34a); background: rgba(34,197,94,0.04); }
  .plan-card.current:hover { transform: none; }
  .plan-card.bundle { border-color: rgba(99, 102, 241, 0.5); }
  .plan-card.bundle.selected { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
  .plan-card:disabled { cursor: default; opacity: 0.85; }

  .plan-badge {
    position: absolute;
    top: -10px;
    right: 12px;
    background: var(--primary);
    color: var(--primary-text);
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
  }
  .plan-name { font-size: 1rem; font-weight: 800; }
  .plan-price {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text-main);
    line-height: 1;
  }
  .plan-cycle { font-size: 0.85rem; font-weight: 500; color: var(--text-muted); }
  .plan-savings {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--primary);
    background: rgba(99, 102, 241, 0.1);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    align-self: flex-start;
  }
  .plan-tagline { font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }
  .plan-cta {
    margin-top: 0.4rem;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--primary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .plan-card.current .plan-cta { color: var(--success, #16a34a); }
  .plan-card:disabled .plan-cta { color: var(--text-muted); }

  .selector-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0 0 0.6rem 0;
  }

  .checkout-flow {
    display: grid;
    gap: 1rem;
  }

  .checkout-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .mobile-step-pagination {
    display: none;
  }

  .mobile-sticky-summary {
    display: none;
  }

  .step-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-label);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
  }

  .step-chip-number {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    background: var(--bg-input);
    flex-shrink: 0;
  }

  .step-chip.active,
  .step-chip.done {
    border-color: var(--primary);
    color: var(--text-main);
  }

  .step-chip.active .step-chip-number,
  .step-chip.done .step-chip-number {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--button-text, var(--bg-card));
  }

  .checkout-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-card);
  }

  .summary-kicker,
  .step-kicker {
    margin: 0 0 0.25rem 0;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .summary-title {
    margin: 0;
    font-size: 1.15rem;
    color: var(--text-main);
  }

  .summary-copy,
  .step-copy {
    margin: 0;
    color: var(--text-label);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .summary-total {
    display: grid;
    gap: 0.15rem;
    text-align: right;
    color: var(--text-label);
    font-size: 0.82rem;
  }

  .summary-total strong {
    font-size: 1.7rem;
    line-height: 1;
    color: var(--text-main);
  }

  .renewal-summary {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .renewal-summary span {
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    background: var(--bg-input);
  }

  .renewal-summary strong {
    color: var(--text-main);
  }

  .checkout-shell {
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    background: var(--bg-card);
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  }

  .checkout-track {
    display: flex;
    width: 100%;
    transition: transform 0.3s ease;
  }

  .checkout-step-panel {
    width: 100%;
    flex: 0 0 100%;
    padding: 1.5rem;
    display: grid;
    gap: 1.25rem;
    align-content: start;
    min-height: 500px;
  }

  .step-panel-header {
    display: grid;
    gap: 0.25rem;
  }

  .step-panel-header-large {
    text-align: center;
    justify-items: center;
    gap: 0.4rem;
  }

  .plan-focus-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .plan-focus-grid-large {
    margin-top: 0.25rem;
  }

  .plan-card-primary {
    min-height: 220px;
    justify-content: center;
  }

  .plan-card-decision {
    min-height: 280px;
    padding: 1.5rem;
    gap: 0.7rem;
    border-width: 2px;
    border-radius: 14px;
  }

  .decision-eyebrow {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .selector-title-large {
    font-size: clamp(1.45rem, 3vw, 2rem);
    margin: 0;
    text-align: center;
  }

  .plan-card-decision .plan-name {
    font-size: 1.2rem;
  }

  .plan-card-decision .plan-price {
    font-size: 2rem;
  }

  .plan-card-decision .plan-tagline {
    font-size: 0.95rem;
    line-height: 1.55;
    max-width: 28ch;
  }

  .plan-card-decision .plan-cta {
    margin-top: auto;
    font-size: 0.9rem;
  }

  .addons-grid,
  .payment-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .addon-choice,
  .payment-card {
    position: relative;
    display: grid;
    gap: 0.7rem;
    align-content: start;
    padding: 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-main);
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
  }

  .addon-choice:hover,
  .addon-choice:focus-visible,
  .payment-card:hover,
  .payment-card:focus-visible {
    border-color: var(--primary);
    background: var(--bg-card);
    transform: translateY(-1px);
  }

  .addon-choice.selected {
    border-color: var(--primary);
    background: var(--bg-card);
    box-shadow: 0 0 0 1px var(--primary);
  }

  .addon-choice.disabled {
    cursor: not-allowed;
    opacity: 0.68;
    transform: none;
  }

  .addon-choice-top {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .addon-choice-title {
    display: grid;
    gap: 0.15rem;
  }

  .addon-choice-title strong {
    font-size: 0.98rem;
  }

  .addon-choice-title span,
  .addon-choice-copy,
  .payment-card span:not(.payment-card-kicker):not(.payment-card-cta) {
    color: var(--text-label);
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .addon-pill {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .addon-pill.on {
    color: var(--primary);
    border-color: var(--primary);
  }

  .addon-pain {
    display: block;
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .addon-tooltip {
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: calc(100% + 0.5rem);
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-main);
    font-size: 0.82rem;
    line-height: 1.45;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 2;
  }

  .addon-choice:hover .addon-tooltip,
  .addon-choice:focus-visible .addon-tooltip {
    opacity: 1;
    transform: translateY(0);
  }

  .payment-card {
    min-height: 220px;
    padding: 1.15rem;
  }

  .payment-card-head {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .payment-card-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    color: var(--primary);
    flex-shrink: 0;
  }

  .payment-card-icon svg {
    width: 1.7rem;
    height: 1.7rem;
  }

  .payment-card-icon :global(svg) {
    width: 1.7rem;
    height: 1.7rem;
  }

  .payment-card-kicker {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .payment-card strong {
    font-size: 1.12rem;
  }

  .payment-card-cta {
    margin-top: auto;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--primary);
  }

  .step-total-spotlight {
    display: grid;
    gap: 0.2rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    background: var(--bg-input);
  }

  .step-total-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .step-total-spotlight strong {
    font-size: 1.7rem;
    line-height: 1;
    color: var(--text-main);
  }

  .step-total-spotlight p {
    margin: 0.2rem 0 0;
    color: var(--text-label);
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .step-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: auto;
  }

  .step-actions-between {
    justify-content: space-between;
  }

  .step-continue {
    min-width: 220px;
  }

  .pix-detail {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .pix-qrcode {
    width: min(100%, 280px);
    aspect-ratio: 1;
    object-fit: contain;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-card);
    padding: 0.75rem;
    justify-self: center;
  }

  .pix-copy-field {
    display: grid;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .pix-copy-field textarea {
    width: 100%;
    resize: vertical;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-main);
    padding: 0.85rem;
    font: inherit;
    line-height: 1.4;
  }

  .pix-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .compact-status {
    margin-top: 0.25rem;
  }

  .pix-legal {
    text-align: left;
    margin-top: 0;
  }

  .pix-modal-layer {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .pix-modal-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: rgba(2, 6, 23, 0.68);
    backdrop-filter: blur(6px);
    cursor: pointer;
  }

  .pix-modal {
    position: relative;
    z-index: 1;
    width: min(100%, 520px);
    max-height: min(92vh, 760px);
    overflow: auto;
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--border-subtle);
    border-radius: 18px;
    background: var(--bg-card);
    color: var(--text-main);
    box-shadow: var(--shadow-modal);
  }

  .pix-modal-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 2.35rem;
    height: 2.35rem;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .pix-modal-header {
    display: flex;
    align-items: center;
    gap: 0.95rem;
    padding-right: 2.5rem;
  }

  .pix-modal-icon {
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .pix-modal-icon :global(svg) {
    width: 1.8rem;
    height: 1.8rem;
  }

  .pix-modal-title {
    margin: 0;
    color: var(--text-main);
    font-size: 1.35rem;
    line-height: 1.15;
  }

  .pix-waiting-line {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.8rem 0.9rem;
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text-label);
    font-size: 0.9rem;
  }

  .pix-waiting-line.confirmed {
    color: var(--success, #16a34a);
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--primary);
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .spinner.large {
    width: 2rem;
    height: 2rem;
    border-width: 3px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .pix-countdown {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.2rem 0.8rem;
    align-items: center;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    background: var(--bg-input);
  }

  .pix-countdown span {
    color: var(--text-label);
    font-size: 0.86rem;
  }

  .pix-countdown strong {
    color: var(--text-main);
    font-size: 1.35rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .pix-countdown small {
    grid-column: 1 / -1;
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .pix-renewing-state {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    color: var(--text-label);
  }

  .legal-text { font-size: 0.78rem; color: var(--text-muted); text-align: center; line-height: 1.5; }
  .legal-text a { color: var(--primary); text-decoration: underline; }

  :global(.dark) .status-card.active { color: var(--status-success-text); }
  :global(.dark) .status-card.warning { color: var(--status-warning-text); }
  :global(.dark) .status-card.info { color: var(--primary); }

  @media (max-width: 760px) {
    .checkout-summary,
    .plan-focus-grid,
    .addons-grid,
    .payment-grid {
      grid-template-columns: 1fr;
    }

    .summary-total {
      text-align: left;
    }

    .step-actions-between {
      justify-content: flex-end;
    }
  }

  @media (max-width: 560px) {
    .assinatura-container {
      padding: 0 0.75rem 6.5rem;
    }

    .checkout-steps {
      display: none;
    }

    .mobile-step-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.95rem 1rem;
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      background: var(--bg-card);
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
    }

    .mobile-step-copy {
      display: grid;
      gap: 0.15rem;
    }

    .mobile-step-kicker {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .mobile-step-copy strong {
      font-size: 1rem;
      color: var(--text-main);
    }

    .mobile-step-dots {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      flex-shrink: 0;
    }

    .mobile-step-dot {
      width: 0.7rem;
      height: 0.7rem;
      padding: 0;
      border: none;
      border-radius: 999px;
      background: var(--border-subtle);
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease;
    }

    .mobile-step-dot.active {
      width: 1.6rem;
      background: var(--primary);
    }

    .mobile-sticky-summary {
      position: fixed;
      left: 0.75rem;
      right: 0.75rem;
      bottom: calc(0.75rem + var(--mobile-bottom-nav-offset));
      z-index: 20;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.85rem;
      align-items: center;
      padding: 0.85rem;
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      background: var(--bg-card);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.26);
    }

    .mobile-sticky-copy {
      min-width: 0;
      display: grid;
      gap: 0.12rem;
    }

    .mobile-sticky-copy span {
      color: var(--text-label);
      font-size: 0.78rem;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-sticky-copy strong {
      color: var(--text-main);
      font-size: 1.15rem;
      line-height: 1;
    }

    .mobile-sticky-action {
      width: auto;
      min-width: 9.5rem;
      white-space: nowrap;
    }

    .addon-choice-top {
      flex-direction: column;
      align-items: flex-start;
    }

    .pix-actions,
    .step-actions,
    .step-actions-between {
      flex-direction: column;
    }

    .step-continue,
    .payment-card,
    .btn-primary,
    .btn-secondary {
      width: 100%;
    }

    .checkout-step-panel {
      min-height: auto;
      padding: 1.2rem;
    }

    .checkout-shell {
      border-radius: 18px;
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.16);
    }

    .step-panel-header-large {
      text-align: left;
      justify-items: start;
    }

    .plan-card-decision,
    .payment-card {
      min-height: 0;
    }

    .plan-card-decision {
      padding: 1.25rem;
      gap: 0.8rem;
    }

    .selector-title-large {
      font-size: 1.7rem;
      line-height: 1.12;
    }

    .step-copy {
      font-size: 0.95rem;
    }

    .step-total-spotlight {
      padding: 1rem;
    }

    .step-total-spotlight strong {
      font-size: 1.9rem;
    }

    .payment-card {
      gap: 0.8rem;
      padding: 1rem;
    }

    .payment-card strong {
      font-size: 1.18rem;
    }

    .addon-tooltip {
      display: none;
    }

    .pix-modal-layer {
      align-items: end;
      padding: 0.75rem;
    }

    .pix-modal {
      width: 100%;
      max-height: 94vh;
      padding: 1rem;
      border-radius: 18px;
    }

    .pix-modal-header {
      align-items: flex-start;
    }

    .pix-modal-title {
      font-size: 1.2rem;
    }

    .pix-qrcode {
      width: min(100%, 240px);
    }

    .pix-countdown {
      grid-template-columns: 1fr;
    }

    .pix-actions {
      width: 100%;
    }
  }
</style>
