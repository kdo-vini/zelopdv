<script>
  import { supabase } from '$lib/supabaseClient';
  import { isSubscriptionActiveStrict } from '$lib/guards';
  import { onMount } from 'svelte';

  let userId = '';
  let email = '';
  let subStatus = null;
  let loading = false;
  let message = '';
  let messageType = 'info'; // 'info' = convidativo, 'warning' = expiração/problema
  let expiryDate = null;
  let hasHadSubscription = false; // true se usuário já teve assinatura antes
  let isActiveStrict = false; // true apenas se status ativo E não expirado

  onMount(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id || '';
      email = userData?.user?.email || '';

      if (userId) {
        try {
          const { data } = await supabase
            .from('subscriptions')
            .select('status, current_period_end, manually_extended_until')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          subStatus = data?.status || null;
          expiryDate = data?.current_period_end || null;
          hasHadSubscription = !!data;

          isActiveStrict = isSubscriptionActiveStrict(data);

          // Check if expired (para quem já teve assinatura E está inativa)
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
      }

      try {
        const params = new URLSearchParams(window.location.search);

        // Após pagamento bem-sucedido, redirecionar para o app automaticamente
        if (params.get('success') === '1' && isActiveStrict) {
          setTimeout(() => { window.location.href = '/app'; }, 2500);
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

  const PAYMENT_LINK = import.meta.env.VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL || '';
  const BUY_BUTTON_ID = import.meta.env.VITE_PUBLIC_STRIPE_BUY_BUTTON_ID || '';
  const PUBLISHABLE_KEY = import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

  async function assinar() {
    try {
      loading = true; message='';
      if (PAYMENT_LINK) {
        window.location.href = PAYMENT_LINK;
        return;
      } else {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token ?? '';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let res;
        try {
          res = await fetch('/api/billing/create-checkout-session', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({}),
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeout);
        }
        const json = await res.json();
        if (json?.url) { window.location.href = json.url; return; }
        if (res.status === 401) {
          message = 'Sua sessão expirou. Faça login novamente.';
        } else if (res.status >= 500) {
          message = 'Erro no servidor de pagamento. Tente novamente em instantes.';
        } else {
          message = json?.error || 'Falha ao iniciar checkout.';
        }
        messageType = 'warning';
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        message = 'A conexão com o servidor de pagamento demorou demais. Verifique sua internet e tente novamente.';
      } else {
        message = e?.message || 'Erro ao conectar com o servidor de pagamento.';
      }
      messageType = 'warning';
    } finally {
      loading = false;
    }
  }

  async function gerenciar() {
    try {
      loading = true; message='';
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? '';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let res;
      try {
        res = await fetch('/api/billing/create-portal-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({}),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const json = await res.json();
      if (json?.url) { window.location.href = json.url; return; }
      if (res.status === 401) {
        message = 'Sua sessão expirou. Faça login novamente.';
      } else if (res.status >= 500) {
        message = 'Erro no servidor. Tente novamente em instantes.';
      } else {
        message = json?.error || 'Falha ao abrir portal.';
      }
      messageType = 'warning';
    } catch (e) {
      if (e?.name === 'AbortError') {
        message = 'Conexão demorou demais. Verifique sua internet e tente novamente.';
      } else {
        message = e?.message || 'Erro ao conectar com o servidor.';
      }
      messageType = 'warning';
    } finally {
      loading = false;
    }
  }

  // Mensagem padrão para novos usuários (sem histórico de assinatura)
  $: defaultMessage = hasHadSubscription
    ? 'Renove sua assinatura para continuar usando o sistema.'
    : 'Comece seu período de teste grátis e experimente todas as funcionalidades!';
</script>

<svelte:head>
  {#if BUY_BUTTON_ID && PUBLISHABLE_KEY}
    <script async src="https://js.stripe.com/v3/buy-button.js"></script>
  {/if}
</svelte:head>

<section class="max-w-xl mx-auto space-y-4">
  <p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Conta / Assinatura</p>
  <h1 class="text-2xl font-bold">Assinatura Zelo PDV</h1>
  <p class="text-slate-600 dark:text-slate-300">7 dias grátis, depois R$ 59/mês — cancele quando quiser.</p>

  {#if isActiveStrict}
    <div class="p-3 bg-green-50 text-green-700 rounded">
      {#if subStatus === 'trialing'}
        Período de teste ativo. Você tem acesso completo ao sistema!
      {:else}
        Assinatura ativa.
      {/if}
    </div>
    <div class="flex gap-3 items-center">
      <button class="btn-secondary" on:click={gerenciar} disabled={loading}>Gerenciar assinatura</button>
      <a href="/app" class="btn-primary">Entrar no sistema</a>
    </div>
  {:else}
    <!-- Mensagem diferenciada: warning (amarelo) vs info (azul/verde claro) -->
    {#if messageType === 'warning' && message}
      <div class="p-3 bg-amber-50 text-amber-800 rounded border border-amber-200">
        ⚠️ {message}
      </div>
    {:else}
      <div class="p-4 bg-sky-50 text-sky-800 rounded border border-sky-200">
        <div class="flex items-start gap-3">
          <span class="text-2xl">🎉</span>
          <div>
            <div class="font-medium">{message || defaultMessage}</div>
            <div class="text-sm mt-1 text-sky-600">Sem compromisso. Cancele a qualquer momento.</div>
          </div>
        </div>
      </div>
    {/if}
    {#if BUY_BUTTON_ID && PUBLISHABLE_KEY}
      <div class="mt-2">
        <stripe-buy-button buy-button-id={BUY_BUTTON_ID} publishable-key={PUBLISHABLE_KEY}></stripe-buy-button>
      </div>
    {:else}
      <button class="btn-primary" on:click={assinar} disabled={loading}>
        {loading ? 'Redirecionando…' : 'Iniciar período de teste grátis'}
      </button>
    {/if}
  {/if}

</section>
