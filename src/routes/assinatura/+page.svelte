<script>
  import { supabase } from '$lib/supabaseClient';
  import { isSubscriptionActiveStrict } from '$lib/guards';
  import { onMount, onDestroy } from 'svelte';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { PLANS, ADDONS, calculateValue } from '$lib/pricing';
  import { trackStartTrial, trackSubscribe } from '$lib/metaPixel';


  let userId = '';
  let email = '';
  let subStatus = null;
  let loading = false;
  let canceling = false;
  let changingPlan = false;
  let message = '';
  let messageType = 'info';
  let expiryDate = null;
  let hasHadSubscription = false;
  let isActiveStrict = false;
  let trialDaysLeft = null;
  let mesasAddonOn = false;
  let pedidosAddonOn = false;
  let acessosAddonOn = false;
  let activeMesasAddon = false;
  let activePedidosAddon = false;
  let activeAcessosAddon = false;
  let togglingAddon = false;
  let camePromptingMesas = false;
  let camePromptingPedidos = false;
  let camePromptingAcessos = false;
  let cameUpgradingTo = '';

  // Plano selecionado pelo user pra assinar / mudar
  let selectedPlan = 'pdv';
  // Plano atual do user (se já tem subscription)
  let activePlanTier = null;

  $: planPrice = calculateValue(selectedPlan, {
    mesas: mesasAddonOn,
    pedidos: pedidosAddonOn,
    acessos: acessosAddonOn,
  });
  $: activePlanPrice = activePlanTier
    ? calculateValue(activePlanTier, {
        mesas: activeMesasAddon,
        pedidos: activePedidosAddon,
        acessos: activeAcessosAddon,
      })
    : 0;
  $: selectedPlanAllowsMesas = PLANS[selectedPlan]?.allowsMesas;
  $: selectedPlanAllowsPedidos = PLANS[selectedPlan]?.allowsPedidos;
  $: selectedPlanAllowsAcessos = PLANS[selectedPlan]?.allowsAcessos;
  $: activePlanAllowsMesas = activePlanTier
    ? PLANS[activePlanTier]?.allowsMesas
    : false;
  $: activePlanAllowsPedidos = activePlanTier
    ? PLANS[activePlanTier]?.allowsPedidos
    : false;
  $: activePlanAllowsAcessos = activePlanTier
    ? PLANS[activePlanTier]?.allowsAcessos
    : false;

  // Se selectedPlan não permite os addons, força off (UX clara)
  $: if (!selectedPlanAllowsMesas && mesasAddonOn) mesasAddonOn = false;
  $: if (!selectedPlanAllowsPedidos && pedidosAddonOn) pedidosAddonOn = false;
  $: if (!selectedPlanAllowsAcessos && acessosAddonOn) acessosAddonOn = false;

  let autoStartingTrial = false;

  onDestroy(() => {});

  onMount(async () => {
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
          const { data } = await supabase
            .from('subscriptions')
            .select('status, current_period_end, manually_extended_until, billing_type, payment_provider, has_mesas_addon, has_pedidos_addon, has_acessos_addon, plan_tier')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          subStatus = data?.status || null;
          expiryDate = data?.current_period_end || null;
          hasHadSubscription = !!data;
          activeMesasAddon = !!data?.has_mesas_addon;
          activePedidosAddon = !!data?.has_pedidos_addon;
          activeAcessosAddon = !!data?.has_acessos_addon;
          mesasAddonOn = activeMesasAddon;
          pedidosAddonOn = activePedidosAddon;
          acessosAddonOn = activeAcessosAddon;
          activePlanTier = data?.plan_tier || 'pdv';
          selectedPlan = activePlanTier;

          isActiveStrict = isSubscriptionActiveStrict(data);

          if (subStatus === 'trialing' && expiryDate) {
            const diff = new Date(expiryDate) - new Date();
            trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
          }

          if (hasHadSubscription && !isActiveStrict) {
            if (expiryDate) {
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
                  addToast('Seu teste gratuito de 30 dias foi ativado!', 'success');
                  trackStartTrial();
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
        if (params.get('success') === '1' && isActiveStrict) {
          const subscribeValue = activePlanTier
            ? calculateValue(activePlanTier, { mesas: activeMesasAddon, pedidos: activePedidosAddon })
            : 0;
          trackSubscribe({ value: subscribeValue });
          // Remove ?success=1 from URL immediately so a page refresh doesn't re-fire the pixel
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('success');
          history.replaceState({}, '', cleanUrl.toString());
          setTimeout(() => { window.location.href = '/gestao'; }, 800);
        }
        if (params.get('addon') === 'mesas') {
          camePromptingMesas = true;
          if (!activeMesasAddon) mesasAddonOn = true;
          // Se user veio querendo Mesas mas tá no plano errado, sugere bundle
          if (selectedPlan === 'chat') selectedPlan = 'bundle';
        }
        if (params.get('addon') === 'pedidos') {
          camePromptingPedidos = true;
          if (!activePedidosAddon) pedidosAddonOn = true;
          if (selectedPlan === 'chat') selectedPlan = 'bundle';
        }
        if (params.get('addon') === 'acessos') {
          camePromptingAcessos = true;
          if (!activeAcessosAddon) acessosAddonOn = true;
          if (selectedPlan === 'chat') selectedPlan = 'bundle';
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
            pedidos: pedidosAddonOn,
            acessos: acessosAddonOn,
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

      // Stripe Checkout retorna URL hospedada — redireciona pra lá pra completar o pagamento.
      if (data.url) {
        if (typeof window.fbq === 'function') {
          window.fbq('track', 'InitiateCheckout', { value: planPrice, currency: 'BRL' });
        }
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

  async function trocarPlano(targetTier) {
    if (changingPlan || !targetTier || targetTier === activePlanTier) return;

    const targetPlan = PLANS[targetTier];
    const willLoseMesas = activeMesasAddon && !targetPlan.allowsMesas;
    const willLosePedidos = activePedidosAddon && !targetPlan.allowsPedidos;
    const willLoseAcessos = activeAcessosAddon && !targetPlan.allowsAcessos;
    const newValue = calculateValue(targetTier, {
      mesas: activeMesasAddon && targetPlan.allowsMesas,
      pedidos: activePedidosAddon && targetPlan.allowsPedidos,
      acessos: activeAcessosAddon && targetPlan.allowsAcessos,
    });
    const lostAddonNames = [
      willLoseMesas ? ADDONS.mesas.name : null,
      willLosePedidos ? ADDONS.pedidos.name : null,
      willLoseAcessos ? ADDONS.acessos.name : null,
    ].filter(Boolean);
    const message = lostAddonNames.length
      ? `Trocar para ${targetPlan.name} (R$ ${newValue}/mês)? ${lostAddonNames.join(' e ')} será desativado pois esse plano não inclui PDV.`
      : `Trocar para ${targetPlan.name} (R$ ${newValue}/mês)? O novo valor entra na próxima cobrança.`;

    const ok = await confirmAction('Mudar de plano', message);
    if (!ok) return;

    try {
      changingPlan = true;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      if (!token) {
        addToast('Sessão expirou. Faça login.', 'warning');
        return;
      }

      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ targetTier }),
      });
      const json = await res.json();

      if (!res.ok) {
        addToast(json?.error || 'Falha ao mudar plano.', 'error');
        return;
      }

      addToast(json?.message || 'Plano alterado.', 'success');
      activePlanTier = targetTier;
      selectedPlan = targetTier;
      if (willLoseMesas) {
        activeMesasAddon = false;
        mesasAddonOn = false;
      }
      if (willLosePedidos) {
        activePedidosAddon = false;
        pedidosAddonOn = false;
      }
      if (willLoseAcessos) {
        activeAcessosAddon = false;
        acessosAddonOn = false;
      }
    } catch (e) {
      addToast('Erro ao trocar plano.', 'error');
    } finally {
      changingPlan = false;
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

  async function toggleMesasAddon() {
    if (!activePlanAllowsMesas) {
      addToast('Mesas não está disponível para o plano ZeloChat. Mude pra ZeloPDV ou Pacote Gestão + Atendimento.', 'warning');
      return;
    }
    const turningOn = !activeMesasAddon;
    const previewValue = calculateValue(activePlanTier, {
      mesas: turningOn,
      pedidos: activePedidosAddon,
    });
    const confirmed = await confirmAction(
      turningOn ? 'Ativar Módulo Mesas' : 'Desativar Módulo Mesas',
      `O valor da próxima cobrança ${turningOn ? 'passará' : 'voltará'} para R$ ${previewValue}/mês. A cobrança atual não é alterada.`
    );
    if (!confirmed) return;

    try {
      togglingAddon = true;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      if (!token) {
        addToast('Sua sessão expirou. Faça login novamente.', 'warning');
        return;
      }

      const res = await fetch('/api/billing/toggle-addon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ addon: 'mesas', enabled: turningOn }),
      });
      const json = await res.json();

      if (!res.ok) {
        addToast(json?.error || 'Falha ao alterar add-on.', 'error');
        return;
      }

      activeMesasAddon = turningOn;
      mesasAddonOn = turningOn;
      addToast(json?.message || 'Add-on atualizado.', 'success');
    } catch (e) {
      addToast('Erro ao conectar. Tente novamente.', 'error');
    } finally {
      togglingAddon = false;
    }
  }

  async function togglePedidosAddon() {
    if (!activePlanAllowsPedidos) {
      addToast('Pedidos + Cozinha não está disponível para o plano ZeloChat. Mude pra ZeloPDV ou Pacote Gestão + Atendimento.', 'warning');
      return;
    }
    const turningOn = !activePedidosAddon;
    const previewValue = calculateValue(activePlanTier, {
      mesas: activeMesasAddon,
      pedidos: turningOn,
    });
    const confirmed = await confirmAction(
      turningOn ? 'Ativar Pedidos + Cozinha' : 'Desativar Pedidos + Cozinha',
      `O valor da próxima cobrança ${turningOn ? 'passará' : 'voltará'} para R$ ${previewValue}/mês. A cobrança atual não é alterada.`
    );
    if (!confirmed) return;

    try {
      togglingAddon = true;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      if (!token) {
        addToast('Sua sessão expirou. Faça login novamente.', 'warning');
        return;
      }

      const res = await fetch('/api/billing/toggle-addon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ addon: 'pedidos', enabled: turningOn }),
      });
      const json = await res.json();

      if (!res.ok) {
        addToast(json?.error || 'Falha ao alterar add-on.', 'error');
        return;
      }

      activePedidosAddon = turningOn;
      pedidosAddonOn = turningOn;
      addToast(json?.message || 'Add-on atualizado.', 'success');
    } catch (e) {
      addToast('Erro ao conectar. Tente novamente.', 'error');
    } finally {
      togglingAddon = false;
    }
  }

  async function toggleAcessosAddon() {
    if (!activePlanAllowsAcessos) {
      addToast('Controle de Acessos não está disponível para o plano ZeloChat. Mude pra ZeloPDV ou Pacote Gestão + Atendimento.', 'warning');
      return;
    }
    const turningOn = !activeAcessosAddon;
    const previewValue = calculateValue(activePlanTier, {
      mesas: activeMesasAddon,
      pedidos: activePedidosAddon,
      acessos: turningOn,
    });
    const confirmed = await confirmAction(
      turningOn ? 'Ativar Controle de Acessos' : 'Desativar Controle de Acessos',
      `O valor da próxima cobrança ${turningOn ? 'passará' : 'voltará'} para R$ ${previewValue}/mês. A cobrança atual não é alterada.`
    );
    if (!confirmed) return;

    try {
      togglingAddon = true;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      if (!token) {
        addToast('Sua sessão expirou. Faça login novamente.', 'warning');
        return;
      }

      const res = await fetch('/api/billing/toggle-addon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ addon: 'acessos', enabled: turningOn }),
      });
      const json = await res.json();

      if (!res.ok) {
        addToast(json?.error || 'Falha ao alterar add-on.', 'error');
        return;
      }

      activeAcessosAddon = turningOn;
      acessosAddonOn = turningOn;
      addToast(json?.message || 'Add-on atualizado.', 'success');
    } catch (e) {
      addToast('Erro ao conectar. Tente novamente.', 'error');
    } finally {
      togglingAddon = false;
    }
  }

  $: defaultMessage = hasHadSubscription
    ? 'Renove sua assinatura para continuar usando o sistema.'
    : '30 dias grátis! Escolha o plano que faz sentido pro seu negócio.';
</script>

<svelte:head>
  <title>Assinatura — Zelo</title>
  <meta name="description" content="Assine ZeloPDV (R$ 59), ZeloChat (R$ 97) ou o Pacote Gestão + Atendimento (R$ 147). Cartão de crédito.">
</svelte:head>

<section class="assinatura-container">
  <p class="breadcrumb">Conta / Assinatura</p>
  <h1 class="title">Sua assinatura Zelo</h1>
  <p class="subtitle">Escolha o plano. ZeloPDV (gestão completa), ZeloChat (atendimento com IA), ou os dois no Pacote Gestão + Atendimento com R$ 9 de desconto.</p>

  {#if camePromptingMesas}
    <div class="status-card info">
      <div class="status-icon">🪑</div>
      <div>
        <strong>Você quer ativar o Módulo Mesas</strong>
        <div class="status-detail">
          {#if isActiveStrict && activePlanAllowsMesas && !activeMesasAddon}
            Use "Ativar Módulo Mesas" abaixo.
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

  {#if camePromptingPedidos}
    <div class="status-card info">
      <div class="status-icon">PC</div>
      <div>
        <strong>Você quer ativar Pedidos + Cozinha</strong>
        <div class="status-detail">
          {#if isActiveStrict && activePlanAllowsPedidos && !activePedidosAddon}
            Use "Ativar Pedidos + Cozinha" abaixo.
          {:else if isActiveStrict && !activePlanAllowsPedidos}
            Pedidos + Cozinha precisa de um plano com PDV. Mude pra ZeloPDV ou Pacote Gestão + Atendimento.
          {:else if activePedidosAddon}
            Já está ativo.
          {:else}
            Marque "Pedidos + Cozinha" no formulário de assinatura abaixo.
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if camePromptingAcessos}
    <div class="status-card info">
      <div class="status-icon">🔑</div>
      <div>
        <strong>Você quer ativar Controle de Acessos</strong>
        <div class="status-detail">
          {#if isActiveStrict && activePlanAllowsAcessos && !activeAcessosAddon}
            Use "Ativar Controle de Acessos" abaixo.
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
      <div class="status-icon">⚡</div>
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

    {#if subStatus === 'trialing' && trialDaysLeft !== null && trialDaysLeft <= 30}
      <div class="status-card warning">
        <div class="status-icon">⏳</div>
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
        <div class="status-icon">✅</div>
        <div>
          <strong>Assinatura ativa — {PLANS[activePlanTier]?.name || 'Plano'}</strong>
          {#if expiryDate}
            <div class="status-detail">Próxima renovação: {new Date(expiryDate).toLocaleDateString('pt-BR')} · R$ {activePlanPrice}/mês</div>
          {/if}
        </div>
      </div>
    {/if}

    <a href="/app" class="btn-secondary" style="text-align:center; text-decoration:none;">Entrar no sistema</a>

    <h2 class="selector-title" style="margin-top: 1rem;">Mudar de plano</h2>
    <div class="plans-grid">
      {#each Object.values(PLANS) as plan}
        <button
          type="button"
          class="plan-card"
          class:current={plan.id === activePlanTier}
          class:bundle={plan.id === 'bundle'}
          on:click={() => trocarPlano(plan.id)}
          disabled={changingPlan || plan.id === activePlanTier}
        >
          {#if plan.id === 'bundle'}<span class="plan-badge">Mais popular</span>{/if}
          <div class="plan-name">{plan.name}</div>
          <div class="plan-price">R$ {plan.price}<span class="plan-cycle">/mês</span></div>
          {#if plan.bundleSavings}<div class="plan-savings">Economize R$ {plan.bundleSavings}</div>{/if}
          <div class="plan-tagline">{plan.tagline}</div>
          <div class="plan-cta">
            {#if plan.id === activePlanTier}Plano atual{:else if changingPlan}Mudando…{:else}Mudar para este plano{/if}
          </div>
        </button>
      {/each}
    </div>

    {#if activePlanAllowsMesas}
      <div class="addon-card">
        <div class="addon-card-header">
          <strong>Módulo Mesas</strong>
          <span class="addon-status" class:on={activeMesasAddon}>
            {activeMesasAddon ? 'Ativo' : 'Não ativo'}
          </span>
        </div>
        <p class="addon-card-detail">
          {#if activeMesasAddon}
            Você está pagando R$ {activePlanPrice}/mês (plano + add-ons). Desativar volta o valor para R$ {calculateValue(activePlanTier, { mesas: false, pedidos: activePedidosAddon })}/mês na próxima cobrança.
          {:else}
            Adicione mesas, comandas e divisão de conta. +R$ 30/mês — total R$ {calculateValue(activePlanTier, { mesas: true, pedidos: activePedidosAddon })}/mês.
          {/if}
        </p>
        <button
          class="btn-secondary"
          on:click={toggleMesasAddon}
          disabled={togglingAddon}
        >
          {#if togglingAddon}
            Atualizando…
          {:else if activeMesasAddon}
            Desativar Módulo Mesas
          {:else}
            Ativar Módulo Mesas (+R$ 30/mês)
          {/if}
        </button>
      </div>
    {/if}

    {#if activePlanAllowsPedidos}
      <div class="addon-card">
        <div class="addon-card-header">
          <strong>Pedidos + Cozinha</strong>
          <span class="addon-status" class:on={activePedidosAddon}>
            {activePedidosAddon ? 'Ativo' : 'Não ativo'}
          </span>
        </div>
        <p class="addon-card-detail">
          {#if activePedidosAddon}
            Você está pagando R$ {activePlanPrice}/mês (plano + add-ons). Desativar volta o valor para R$ {calculateValue(activePlanTier, { mesas: activeMesasAddon, pedidos: false })}/mês na próxima cobrança.
          {:else}
            Adicione pedidos, delivery e painel de cozinha. +R$ 30/mês - total R$ {calculateValue(activePlanTier, { mesas: activeMesasAddon, pedidos: true })}/mês.
          {/if}
        </p>
        <button
          class="btn-secondary"
          on:click={togglePedidosAddon}
          disabled={togglingAddon}
        >
          {#if togglingAddon}
            Atualizando...
          {:else if activePedidosAddon}
            Desativar Pedidos + Cozinha
          {:else}
            Ativar Pedidos + Cozinha (+R$ 30/mês)
          {/if}
        </button>
      </div>
    {/if}

    {#if activePlanAllowsAcessos}
      <div class="addon-card">
        <div class="addon-card-header">
          <strong>Controle de Acessos</strong>
          <span class="addon-status" class:on={activeAcessosAddon}>
            {activeAcessosAddon ? 'Ativo' : 'Não ativo'}
          </span>
        </div>
        <p class="addon-card-detail">
          {#if activeAcessosAddon}
            Você está pagando R$ {activePlanPrice}/mês (plano + add-ons). Desativar volta o valor para R$ {calculateValue(activePlanTier, { mesas: activeMesasAddon, pedidos: activePedidosAddon, acessos: false })}/mês na próxima cobrança.
          {:else}
            Gerencie usuários e permissões de acesso ao sistema. +R$ 30/mês — total R$ {calculateValue(activePlanTier, { mesas: activeMesasAddon, pedidos: activePedidosAddon, acessos: true })}/mês.
          {/if}
        </p>
        <button
          class="btn-secondary"
          on:click={toggleAcessosAddon}
          disabled={togglingAddon}
        >
          {#if togglingAddon}
            Atualizando…
          {:else if activeAcessosAddon}
            Desativar Controle de Acessos
          {:else}
            Ativar Controle de Acessos (+R$ 30/mês)
          {/if}
        </button>
      </div>
    {/if}

    <div class="actions-row">
      <button class="btn-danger-outline" on:click={cancelarAssinatura} disabled={canceling}>
        {canceling ? 'Cancelando…' : 'Cancelar assinatura'}
      </button>
    </div>

  {:else if autoStartingTrial}
    <div class="status-card info">
      <div class="status-icon">⏳</div>
      <div>
        <strong>Ativando seu teste gratuito de 30 dias…</strong>
        <div class="status-detail">Você será redirecionado em instantes.</div>
      </div>
    </div>

  {:else}
    <!-- NOT-ACTIVE — show plan picker + addon + payment form -->
    {#if messageType === 'warning' && message}
      <div class="status-card warning">
        <div class="status-icon">⚠️</div>
        <div>{message}</div>
      </div>
    {:else}
      <div class="status-card info">
        <div class="status-icon">🎉</div>
        <div>
          <div class="font-medium">{message || defaultMessage}</div>
        </div>
      </div>
    {/if}

    <h2 class="selector-title">Escolha seu plano</h2>
    <div class="plans-grid">
      {#each Object.values(PLANS) as plan}
        <button
          type="button"
          class="plan-card"
          class:selected={selectedPlan === plan.id}
          class:bundle={plan.id === 'bundle'}
          on:click={() => selectedPlan = plan.id}
        >
          {#if plan.id === 'bundle'}<span class="plan-badge">Mais popular</span>{/if}
          <div class="plan-name">{plan.name}</div>
          <div class="plan-price">R$ {plan.price}<span class="plan-cycle">/mês</span></div>
          {#if plan.bundleSavings}<div class="plan-savings">Economize R$ {plan.bundleSavings}</div>{/if}
          <div class="plan-tagline">{plan.tagline}</div>
        </button>
      {/each}
    </div>

    {#if selectedPlanAllowsMesas}
      <label class="addon-toggle">
        <input type="checkbox" bind:checked={mesasAddonOn} />
        <div class="addon-info">
          <strong>Módulo Mesas <span class="addon-price">+R$ 30/mês</span></strong>
          <span class="addon-detail">Mesas, comandas e divisão de conta para bares e lanchonetes.</span>
        </div>
      </label>
    {:else}
      <p class="legal-text" style="margin: -0.4rem 0 0;">Módulo Mesas só está disponível em planos com ZeloPDV.</p>
    {/if}

    {#if selectedPlanAllowsPedidos}
      <label class="addon-toggle">
        <input type="checkbox" bind:checked={pedidosAddonOn} />
        <div class="addon-info">
          <strong>Pedidos + Cozinha <span class="addon-price">+R$ 30/mês</span></strong>
          <span class="addon-detail">Pedidos, delivery e painel de cozinha para separar atendimento e produção.</span>
        </div>
      </label>
    {:else}
      <p class="legal-text" style="margin: -0.4rem 0 0;">Pedidos + Cozinha só está disponível em planos com ZeloPDV.</p>
    {/if}

    {#if selectedPlanAllowsAcessos}
      <label class="addon-toggle">
        <input type="checkbox" bind:checked={acessosAddonOn} />
        <div class="addon-info">
          <strong>Controle de Acessos <span class="addon-price">+R$ 30/mês</span></strong>
          <span class="addon-detail">Gerencie usuários e defina permissões de acesso ao sistema para sua equipe.</span>
        </div>
      </label>
    {:else}
      <p class="legal-text" style="margin: -0.4rem 0 0;">Controle de Acessos só está disponível em planos com ZeloPDV.</p>
    {/if}

    <button class="btn-primary btn-subscribe" on:click={assinar} disabled={loading}>
      {#if loading}
        Processando…
      {:else}
        Assinar {PLANS[selectedPlan].name} — R$ {planPrice}/mês
      {/if}
    </button>

    <p class="legal-text">
      Ao assinar, você concorda com nossos <a href="/termos">Termos de Uso</a> e <a href="/privacidade">Política de Privacidade</a>.
      Pagamento via cartão de crédito (Stripe).
      {#if !hasHadSubscription}
        A cobrança de R$ {planPrice}/mês será iniciada após o período de teste de 30 dias.
      {:else}
        A cobrança de R$ {planPrice}/mês será iniciada imediatamente.
      {/if}
    </p>
  {/if}
</section>

<style>
  .assinatura-container {
    max-width: 720px;
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
    color: #166534;
  }
  .status-card.warning {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    color: #92400e;
  }
  .status-card.info {
    background: rgba(14, 165, 233, 0.08);
    border: 1px solid rgba(14, 165, 233, 0.25);
    color: #0c4a6e;
  }
  .status-icon { font-size: 1.5rem; flex-shrink: 0; }
  .status-detail { font-size: 0.85rem; margin-top: 0.25rem; opacity: 0.8; }

  .actions-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    background: var(--primary);
    color: #fff;
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
  .btn-subscribe { width: 100%; padding: 1rem; font-size: 1.1rem; }

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

  /* Plans grid */
  .plans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-top: 0.25rem;
  }
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
  .plan-card.bundle.selected { border-color: rgb(99, 102, 241); box-shadow: 0 0 0 1px rgb(99, 102, 241); }
  .plan-card:disabled { cursor: default; opacity: 0.85; }

  .plan-badge {
    position: absolute;
    top: -10px;
    right: 12px;
    background: rgb(99, 102, 241);
    color: #fff;
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
    color: rgb(99, 102, 241);
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

  .billing-selector { margin-top: 0.5rem; }
  .selector-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0 0 0.6rem 0;
  }

  .billing-options { display: flex; gap: 0.5rem; }
  .billing-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 0.85rem 0.5rem;
    border: 2px solid var(--border-subtle);
    border-radius: 10px;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s;
    background: var(--bg-card);
  }
  .billing-option input[type="radio"] { display: none; }
  .billing-option:hover { border-color: var(--primary); background: rgba(var(--primary-rgb, 59, 130, 246), 0.04); }
  .billing-option.selected {
    border-color: var(--primary);
    background: rgba(var(--primary-rgb, 59, 130, 246), 0.08);
    box-shadow: 0 0 0 1px var(--primary);
  }
  .option-icon { font-size: 1.5rem; }
  .billing-option strong { font-size: 0.85rem; color: var(--text-main); }
  .option-detail { font-size: 0.72rem; color: var(--text-muted); display: block; }

  .pix-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;
  }
  .pix-title { font-size: 1.1rem; font-weight: 700; margin: 0 0 0.25rem 0; color: var(--text-main); }
  .pix-qr { max-width: 220px; margin: 0 auto 1rem; display: block; border-radius: 8px; }
  .pix-copy-btn { width: 100%; margin-bottom: 0.5rem; }
  .pix-code { font-size: 0.7rem; color: var(--text-muted); word-break: break-all; font-family: monospace; margin: 0; }

  .legal-text { font-size: 0.78rem; color: var(--text-muted); text-align: center; line-height: 1.5; }
  .legal-text a { color: var(--primary); text-decoration: underline; }

  :global(.dark) .status-card.active { color: #bbf7d0; }
  :global(.dark) .status-card.warning { color: #fde68a; }
  :global(.dark) .status-card.info { color: #bae6fd; }

  .billing-option-disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
    filter: grayscale(0.5);
  }

  .addon-toggle {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border: 2px solid var(--border-subtle);
    border-radius: 10px;
    cursor: pointer;
    background: var(--bg-card);
    transition: all 0.2s;
  }
  .addon-toggle:hover { border-color: var(--primary); }
  .addon-toggle input[type="checkbox"] {
    margin-top: 0.2rem;
    accent-color: var(--primary);
    width: 1rem;
    height: 1rem;
  }
  .addon-info { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
  .addon-info strong { color: var(--text-main); font-size: 0.95rem; }
  .addon-price { color: var(--primary); font-size: 0.85rem; margin-left: 0.35rem; }
  .addon-detail { font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }

  .addon-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem 1.15rem;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    background: var(--bg-card);
  }
  .addon-card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .addon-card-header strong { font-size: 1rem; color: var(--text-main); }
  .addon-status {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .addon-status.on {
    background: rgba(34, 197, 94, 0.15);
    color: #166534;
    border-color: rgba(34, 197, 94, 0.35);
  }
  .addon-card-detail { font-size: 0.85rem; color: var(--text-label); margin: 0; line-height: 1.5; }

  @media (max-width: 480px) {
    .billing-options { flex-direction: column; }
    .billing-option { flex-direction: row; text-align: left; gap: 0.75rem; }
  }
</style>
