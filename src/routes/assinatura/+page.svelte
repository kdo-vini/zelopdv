<script>
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  export let params;

  let userId = '';

  onMount(async () => {
    const { data: userData } = await supabase.auth.getUser();
    userId = userData?.user?.id || '';
    email = userData?.user?.email || '';
    if (userId) {
      // Buscar assinatura do usuário e também o stripe_customer_id para o botão de portal
      const { data } = await supabase
        .from('subscriptions')
        .select('status, stripe_customer_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subStatus = data?.status || null;
      customerId = data?.stripe_customer_id || null;
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const msg = params.get('msg');
      if (msg === 'subscribe') {
        message = 'Sua assinatura não está ativa. Assine para utilizar o sistema.';
      } else if (msg === 'complete') {
        message = 'Complete o perfil da empresa para continuar.';
      }
    } catch {}
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
        const res = await fetch('/api/billing/create-checkout-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, email })
        });
        const json = await res.json();
        if (json?.url) { window.location.href = json.url; return; }
        message = json?.error || 'Falha ao iniciar checkout.';
      }
    } catch (e) {
      message = e?.message || 'Erro.';
    } finally {
      loading = false;
    }
  }

  async function gerenciar() {
    try {
      loading = true; message='';
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, email })
      });
      const json = await res.json();
      if (json?.url) { window.location.href = json.url; return; }
      message = json?.error || 'Falha ao abrir portal.';
    } catch (e) {
      message = e?.message || 'Erro.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <script async src="https://js.stripe.com/v3/buy-button.js"></script>
  </svelte:head>

<section class="max-w-xl mx-auto space-y-4">
  <h1 class="text-2xl font-bold">Assinatura Zelo PDV</h1>
  <p class="text-slate-600 dark:text-slate-300">R$ 59/mês — cancele quando quiser.</p>

  {#if subStatus === 'active'}
    <div class="p-3 bg-green-50 text-green-700 rounded">Assinatura ativa.</div>
    <div class="flex gap-3 items-center">
      <button class="btn-secondary" on:click={gerenciar} disabled={loading}>Gerenciar assinatura</button>
      <a href="/app" class="btn-primary">Entrar no sistema</a>
    </div>
  {:else}
    <div class="p-3 bg-amber-50 text-amber-800 rounded">
      {message || 'Para usar o sistema, ative sua assinatura.'}
    </div>
    {#if BUY_BUTTON_ID && PUBLISHABLE_KEY}
      <div class="mt-2">
        <stripe-buy-button buy-button-id={BUY_BUTTON_ID} publishable-key={PUBLISHABLE_KEY}></stripe-buy-button>
      </div>
    {:else}
      <button class="btn-primary" on:click={assinar} disabled={loading}>
        {loading ? 'Redirecionando…' : 'Assinar R$ 59/mês'}
      </button>
    {/if}
  {/if}

</section>
