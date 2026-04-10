<script>
  import { supabase } from '$lib/supabaseClient';
  import { isSubscriptionActiveStrict } from '$lib/guards';
  import { onMount, onDestroy } from 'svelte';
  import { addToast, confirmAction } from '$lib/stores/ui';

  let userId = '';
  let email = '';
  let subStatus = null;
  let loading = false;
  let canceling = false;
  let message = '';
  let messageType = 'info';
  let expiryDate = null;
  let hasHadSubscription = false;
  let isActiveStrict = false;
  let billingType = 'CREDIT_CARD';
  let trialDaysLeft = null;

  // PIX data after subscription creation
  let pixQrImage = null;
  let pixCopyPaste = null;
  let invoiceUrl = null;
  let trialEnd = null;
  let subscriptionCreated = false;
  let pollInterval = null;
  let pollStartTime = null;
  const POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos
  let pixPollingExpired = false;
  let autoStartingTrial = false;

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  onMount(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id || '';
      email = userData?.user?.email || '';

      if (userId) {
        try {
          const { data } = await supabase
            .from('subscriptions')
            .select('status, current_period_end, manually_extended_until, billing_type, payment_provider')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          subStatus = data?.status || null;
          expiryDate = data?.current_period_end || null;
          hasHadSubscription = !!data;
          billingType = data?.billing_type || 'PIX';

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

        // Auto-start trial for new users (zero friction)
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
                addToast('Seu teste gratuito de 30 dias foi ativado! 🎉', 'success');
                setTimeout(() => { window.location.href = '/gestao'; }, 600);
                return; // autoStartingTrial stays true — redirect is in-flight
              }
              message = data?.error || 'Erro ao ativar período de teste. Tente novamente.';
              messageType = 'warning';
            }
          } catch (e) {
            message = 'Erro ao conectar. Tente novamente ou entre em contato com o suporte.';
            messageType = 'warning';
          }
          autoStartingTrial = false; // only reset on failure
        }
      }

      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === '1' && isActiveStrict) {
          setTimeout(() => { window.location.href = '/gestao'; }, 800);
        }
        const msg = params.get('msg');
        if (msg === 'subscribe') {
          if (hasHadSubscription) {
            message = 'Sua assinatura não está ativa. Renove para utilizar o sistema.';
            messageType = 'warning';
          }
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
        body: JSON.stringify({ billingType }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json?.redirect) {
          window.location.href = json.redirect;
          return;
        }
        message = json?.error || 'Falha ao criar assinatura.';
        messageType = 'warning';
        return;
      }

      // Success!
      subscriptionCreated = true;
      trialEnd = json.trialEnd;
      invoiceUrl = json.invoiceUrl;

      if (json.pix?.encodedImage) {
        pixQrImage = `data:image/png;base64,${json.pix.encodedImage}`;
        pixCopyPaste = json.pix.payload;
      }

      // For PIX, show QR code inline
      addToast('Assinatura criada com sucesso! 🎉', 'success');

      // Reload subscription status
      const { data: newSub } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newSub) {
        subStatus = newSub.status;
        expiryDate = newSub.current_period_end;
        isActiveStrict = isSubscriptionActiveStrict(newSub);

        // Zero fricção: se ganhou trial, manda pro gestao direto
        if (subStatus === 'trialing' && isActiveStrict) {
            addToast('Trial de 30 dias ativado! Aproveite. 🎉', 'success');
            setTimeout(() => { window.location.href = '/gestao'; }, 600);
            return;
        }

        // Se for PIX e não estiver ativo, inicia polling para redirecionar automaticamente quando o webhook bater
        if (billingType === 'PIX' && !isActiveStrict) {
            startPixPolling();
        }

        // Cartão de crédito: redireciona para fatura do Asaas
        if (billingType === 'CREDIT_CARD' && invoiceUrl) {
            window.location.href = invoiceUrl;
        }
      }

    } catch (e) {
      message = e?.message || 'Erro ao conectar com o servidor de pagamento.';
      messageType = 'warning';
    } finally {
      loading = false;
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

  function startPixPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollStartTime = Date.now();
    pixPollingExpired = false;

    pollInterval = setInterval(async () => {
      if (!userId) return;

      // Timeout: encerra polling após 15 minutos
      if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
        clearInterval(pollInterval);
        pollInterval = null;
        pixPollingExpired = true;
        return;
      }

      const { data: pollSub } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pollSub && isSubscriptionActiveStrict(pollSub)) {
        clearInterval(pollInterval);
        addToast('Pagamento confirmado! Redirecionando...', 'success');
        isActiveStrict = true;
        subStatus = pollSub.status;
        expiryDate = pollSub.current_period_end;
        setTimeout(() => { window.location.href = '/gestao'; }, 600);
      }
    }, 4000);
  }

  function copyPix() {
    if (pixCopyPaste) {
      navigator.clipboard.writeText(pixCopyPaste);
      addToast('Código PIX copiado!', 'success');
    }
  }

  $: defaultMessage = hasHadSubscription
    ? 'Renove sua assinatura para continuar usando o sistema.'
    : '30 dias grátis! Escolha como pagar após o período de teste.';
</script>

<svelte:head>
  <title>Assinatura — Zelo PDV</title>
  <meta name="description" content="Assine o Zelo PDV. R$ 59/mês. Pague com PIX ou cartão de crédito.">
</svelte:head>

<section class="assinatura-container">
  <p class="breadcrumb">Conta / Assinatura</p>
  <h1 class="title">Assinatura Zelo PDV</h1>
  <p class="subtitle">Apenas R$ 59/mês. Pague com PIX ou cartão de crédito.</p>

  {#if isActiveStrict}
    <!-- ACTIVE SUBSCRIPTION STATE -->
    {#if subStatus === 'trialing' && trialDaysLeft !== null && trialDaysLeft <= 30}
      <!-- Trial ending soon: show warning + subscription form -->
      <div class="status-card warning">
        <div class="status-icon">⚠️</div>
        <div>
          <strong>
            {trialDaysLeft === 0 ? 'Seu teste termina hoje!' : `Teste termina em ${trialDaysLeft} dia${trialDaysLeft === 1 ? '' : 's'}`}
          </strong>
          {#if expiryDate}
            <div class="status-detail">Válido até {new Date(expiryDate).toLocaleDateString('pt-BR')}. Assine abaixo para não perder o acesso.</div>
          {/if}
        </div>
      </div>

      <a href="/app" class="btn-secondary" style="text-align:center; text-decoration:none;">Entrar no sistema agora</a>

      <!-- BILLING TYPE SELECTOR -->
      <div class="billing-selector">
        <h2 class="selector-title">Assine para continuar após o teste</h2>
        <div class="billing-options">
          <label class="billing-option" class:selected={billingType === 'PIX'}>
            <input type="radio" bind:group={billingType} value="PIX" />
            <span class="option-icon">🟢</span>
            <div>
              <strong>PIX</strong>
              <span class="option-detail">Aprovação instantânea</span>
            </div>
          </label>

          <label class="billing-option" class:selected={billingType === 'CREDIT_CARD'}>
            <input type="radio" bind:group={billingType} value="CREDIT_CARD" />
            <span class="option-icon">💳</span>
            <div>
              <strong>Cartão de Crédito</strong>
              <span class="option-detail">Renovação automática</span>
            </div>
          </label>
        </div>
      </div>

      <button class="btn-primary btn-subscribe" on:click={assinar} disabled={loading}>
        {#if loading}
          Processando…
        {:else}
          Assinar agora — R$ 59/mês
        {/if}
      </button>

      <p class="legal-text">
        Ao assinar, você concorda com nossos <a href="/termos">Termos de Uso</a> e <a href="/privacidade">Política de Privacidade</a>.
        A cobrança de R$ 59/mês será iniciada imediatamente.
      </p>

    {:else}
      <!-- Normal active/trialing state -->
      <div class="status-card active">
        <div class="status-icon">✅</div>
        <div>
          {#if subStatus === 'trialing'}
            <strong>Período de teste ativo</strong> — Você tem acesso completo ao sistema!
            {#if expiryDate}
              <div class="status-detail">Teste válido até {new Date(expiryDate).toLocaleDateString('pt-BR')}</div>
            {/if}
          {:else}
            <strong>Assinatura ativa</strong>
            {#if expiryDate}
              <div class="status-detail">Próxima renovação: {new Date(expiryDate).toLocaleDateString('pt-BR')}</div>
            {/if}
          {/if}
        </div>
      </div>

      <div class="actions-row">
        <a href="/app" class="btn-primary">Entrar no sistema</a>
        <button class="btn-danger-outline" on:click={cancelarAssinatura} disabled={canceling}>
          {canceling ? 'Cancelando…' : 'Cancelar assinatura'}
        </button>
      </div>
    {/if}

  {:else if subscriptionCreated && billingType === 'PIX'}
    <!-- PIX QR CODE DISPLAY -->
    <div class="status-card info">
      <div class="status-icon">⏳</div>
      <div>
        <strong>Aguardando pagamento PIX…</strong>
        <div class="status-detail">
          Seu acesso será liberado automaticamente após a confirmação.
        </div>
      </div>
    </div>

    {#if pixQrImage}
      <div class="pix-card">
        <h2 class="pix-title">PIX para pagamento</h2>
        <img src={pixQrImage} alt="QR Code PIX" class="pix-qr" />
        {#if pixCopyPaste}
          <button class="btn-secondary pix-copy-btn" on:click={copyPix}>
            📋 Copiar código PIX
          </button>
          <p class="pix-code">{pixCopyPaste.substring(0, 40)}…</p>
        {/if}
      </div>
    {/if}

    {#if pixPollingExpired}
      <div class="status-card warning" style="margin-top: 1rem; font-size: 0.85rem;">
        ⚠️ Não detectamos o pagamento automaticamente. Se você pagou, aguarde alguns minutos e recarregue a página.
      </div>
    {:else}
      <div class="status-card active" style="margin-top: 1rem; opacity: 0.7; font-size: 0.85rem;">
        ℹ️ O sistema detectará o pagamento em instantes.
      </div>
    {/if}

  {:else if autoStartingTrial}
    <div class="status-card info">
      <div class="status-icon">⏳</div>
      <div>
        <strong>Ativando seu teste gratuito de 30 dias…</strong>
        <div class="status-detail">Você será redirecionado em instantes.</div>
      </div>
    </div>

  {:else}
    <!-- SUBSCRIBE STATE -->
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

    <!-- BILLING TYPE SELECTOR -->
    <div class="billing-selector">
      <h2 class="selector-title">Como quer pagar?</h2>
      <div class="billing-options">
        <label class="billing-option" class:selected={billingType === 'PIX'}>
          <input type="radio" bind:group={billingType} value="PIX" />
          <span class="option-icon">🟢</span>
          <div>
            <strong>PIX</strong>
            <span class="option-detail">Aprovação instantânea</span>
          </div>
        </label>

        <label class="billing-option" class:selected={billingType === 'CREDIT_CARD'}>
          <input type="radio" bind:group={billingType} value="CREDIT_CARD" />
          <span class="option-icon">💳</span>
          <div>
            <strong>Cartão de Crédito</strong>
            <span class="option-detail">Renovação automática</span>
          </div>
        </label>
      </div>
    </div>

    <button class="btn-primary btn-subscribe" on:click={assinar} disabled={loading}>
      {#if loading}
        Processando…
      {:else}
        Assinar agora
      {/if}
    </button>

    <p class="legal-text">
      Ao assinar, você concorda com nossos <a href="/termos">Termos de Uso</a> e <a href="/privacidade">Política de Privacidade</a>.
      {#if !hasHadSubscription}
        A cobrança de R$ 59/mês será iniciada após o período de teste.
      {:else}
        A cobrança de R$ 59/mês será iniciada imediatamente.
      {/if}
    </p>
  {/if}
</section>

<style>
  .assinatura-container {
    max-width: 540px;
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

  /* Status cards */
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

  .status-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .status-detail {
    font-size: 0.85rem;
    margin-top: 0.25rem;
    opacity: 0.8;
  }

  /* Actions */
  .actions-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

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

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-subscribe {
    width: 100%;
    padding: 1rem;
    font-size: 1.1rem;
  }

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

  .btn-secondary:hover {
    background: var(--bg-card);
  }

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

  .btn-danger-outline:hover {
    background: rgba(220, 38, 38, 0.08);
  }

  .btn-danger-outline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Billing type selector */
  .billing-selector {
    margin-top: 0.5rem;
  }

  .selector-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main);
    margin: 0 0 0.75rem 0;
  }

  .billing-options {
    display: flex;
    gap: 0.5rem;
  }

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

  .billing-option input[type="radio"] {
    display: none;
  }

  .billing-option:hover {
    border-color: var(--primary);
    background: rgba(var(--primary-rgb, 59, 130, 246), 0.04);
  }

  .billing-option.selected {
    border-color: var(--primary);
    background: rgba(var(--primary-rgb, 59, 130, 246), 0.08);
    box-shadow: 0 0 0 1px var(--primary);
  }

  .option-icon {
    font-size: 1.5rem;
  }

  .billing-option strong {
    font-size: 0.85rem;
    color: var(--text-main);
  }

  .option-detail {
    font-size: 0.72rem;
    color: var(--text-muted);
    display: block;
  }

  /* PIX QR Code */
  .pix-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;
  }

  .pix-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0 0 0.25rem 0;
    color: var(--text-main);
  }

  .pix-subtitle {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0 0 1rem 0;
  }

  .pix-qr {
    max-width: 220px;
    margin: 0 auto 1rem;
    display: block;
    border-radius: 8px;
  }

  .pix-copy-btn {
    width: 100%;
    margin-bottom: 0.5rem;
  }

  .pix-code {
    font-size: 0.7rem;
    color: var(--text-muted);
    word-break: break-all;
    font-family: monospace;
    margin: 0;
  }

  /* Legal text */
  .legal-text {
    font-size: 0.78rem;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.5;
  }

  .legal-text a {
    color: var(--primary);
    text-decoration: underline;
  }

  /* Dark mode adjustments */
  :global(.dark) .status-card.active {
    color: #bbf7d0;
  }
  :global(.dark) .status-card.warning {
    color: #fde68a;
  }
  :global(.dark) .status-card.info {
    color: #bae6fd;
  }

  .billing-option-disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
    filter: grayscale(0.5);
  }

  .option-manutencao {
    display: inline-block;
    font-size: 0.65rem;
    font-weight: 600;
    color: #92400e;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 4px;
    padding: 1px 5px;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  @media (max-width: 480px) {
    .billing-options {
      flex-direction: column;
    }
    .billing-option {
      flex-direction: row;
      text-align: left;
      gap: 0.75rem;
    }
  }
</style>
