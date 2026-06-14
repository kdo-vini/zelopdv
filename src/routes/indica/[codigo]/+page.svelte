<script>
  import { onMount } from 'svelte';
  import { persistReferralAttribution } from '$lib/referrals/client';
  import { capturePostHogEvent } from '$lib/posthogClient';

  export let data;

  onMount(() => {
    if (data?.valid) {
      persistReferralAttribution({ code: data.code, referralId: data.referralId });
      void capturePostHogEvent('referral_landing_viewed', { referral_id: data.referralId });
    }
  });
</script>

<svelte:head>
  <title>Indicação ZeloPDV</title>
  <meta name="description" content="Você foi convidado para testar o ZeloPDV e organizar vendas, caixa e estoque do seu negócio.">
</svelte:head>

<section class="referral-page">
  <div class="shell">
    <a class="brand" href="/" aria-label="ZeloPDV">
      <img src="/logo-horizontal.webp" alt="ZeloPDV" />
    </a>

    {#if data.valid}
      <div class="content">
        <p class="eyebrow">Convite de cliente</p>
        <h1>Você foi convidado para testar o ZeloPDV.</h1>
        <p class="lead">
          Organize vendas, caixa, estoque e comprovantes em um sistema simples para pequeno comércio.
          Quem entra por indicação pode receber uma condição especial configurada pelo time ZeloPDV,
          como ajuda inicial na configuração ou teste estendido.
        </p>
        <div class="actions">
          <a class="primary" href={`/cadastro?ref=${encodeURIComponent(data.code)}&referral_id=${encodeURIComponent(data.referralId)}`}>
            Criar conta
          </a>
          <a class="secondary" href={`/login?ref=${encodeURIComponent(data.code)}&referral_id=${encodeURIComponent(data.referralId)}`}>
            Já tenho conta
          </a>
        </div>
        <p class="fine-print">Código de indicação: <strong>{data.code}</strong></p>
      </div>
    {:else}
      <div class="content">
        <p class="eyebrow">Link não encontrado</p>
        <h1>Este convite não está disponível.</h1>
        <p class="lead">Confira se o link foi copiado corretamente ou crie sua conta diretamente pelo ZeloPDV.</p>
        <div class="actions">
          <a class="primary" href="/cadastro">Criar conta</a>
          <a class="secondary" href="/">Conhecer o ZeloPDV</a>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .referral-page {
    min-height: 100vh;
    background: var(--bg-app);
    color: var(--text-main);
    display: grid;
    place-items: center;
    padding: 1.5rem;
  }

  .shell {
    width: min(100%, 720px);
    display: grid;
    gap: 2rem;
  }

  .brand img {
    width: 170px;
    height: auto;
  }

  .content {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: clamp(1.5rem, 5vw, 3rem);
  }

  .eyebrow {
    margin: 0 0 0.75rem;
    color: var(--primary);
    text-transform: uppercase;
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 7vw, 3.75rem);
    line-height: 1.02;
    color: var(--text-main);
    max-width: 11ch;
  }

  .lead {
    margin: 1.25rem 0 0;
    color: var(--text-muted);
    font-size: 1.05rem;
    line-height: 1.65;
    max-width: 58ch;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1.75rem;
  }

  .primary,
  .secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-weight: 800;
    text-decoration: none;
  }

  .primary {
    background: var(--primary);
    color: var(--primary-text);
  }

  .secondary {
    background: var(--bg-input);
    color: var(--text-label);
    border: 1px solid var(--border-subtle);
  }

  .fine-print {
    margin: 1rem 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
</style>
