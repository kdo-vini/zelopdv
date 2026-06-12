<script>
  import { tick } from 'svelte';
  import { Printer } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import {
    isValidBrazilianTaxId,
    maskPhone,
    maskDocumento,
    normalizeBrazilianPhone,
    normalizeBrazilianTaxId,
  } from '$lib/masks';
  import { trackStartTrial } from '$lib/metaPixel';
  import { trackGa4Event, trackGoogleAdsInscricao, waitForGtag } from '$lib/googleAds';

  export let show = false;
  export let userId = '';
  export let email = '';

  let step = 1;
  const totalSteps = 4;

  let nome = '';
  let contato = '';
  let documento = '';
  let largura_bobina = '80mm';

  let error = '';
  let saving = false;

  let nomeInput;
  let contatoInput;
  let documentoInput;

  $: if (show || step) {
    tick().then(() => {
      if (step === 1) nomeInput?.focus();
      else if (step === 2) contatoInput?.focus();
      else if (step === 3) documentoInput?.focus();
    });
  }

  function validate() {
    error = '';
    if (step === 1 && !nome.trim()) { error = 'Informe o nome da loja.'; return false; }
    if (step === 2 && !normalizeBrazilianPhone(contato)) { error = 'Informe um WhatsApp válido com DDD.'; return false; }
    if (step === 3 && !isValidBrazilianTaxId(documento)) { error = 'Informe um CPF ou CNPJ válido.'; return false; }
    return true;
  }

  function avancar() {
    if (!validate()) return;
    step += 1;
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      step < totalSteps ? avancar() : finalizar();
    }
  }

  async function finalizar() {
    saving = true;
    error = '';
    try {
      const { error: dbError } = await supabase
        .from('empresa_perfil')
        .upsert({
          user_id: userId,
          nome_exibicao: nome.trim(),
          documento: normalizeBrazilianTaxId(documento),
          contato: normalizeBrazilianPhone(contato),
          largura_bobina,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (dbError) throw dbError;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sua sessão expirou. Faça login novamente.');
      }

      const trialResponse = await fetch('/api/billing/start-trial', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const trialPayload = await trialResponse.json().catch(() => ({}));

      if (!trialResponse.ok) {
        throw new Error(trialPayload?.error || 'Erro ao ativar período de teste.');
      }

      let didTrackTrial = false;
      if (!trialPayload?.alreadyExists) {
        // gtag carrega async; sem esperar, a conversão de inscrição se perde silenciosamente
        const gtagReady = await waitForGtag();
        if (!gtagReady) console.warn('[tracking] gtag indisponível no fim do onboarding');
        const trackedMetaTrial = trackStartTrial();
        trackGa4Event('begin_trial');
        const trackedGoogleTrial = await trackGoogleAdsInscricao({
          email,
          transactionId: userId,
        });
        didTrackTrial = trackedMetaTrial || trackedGoogleTrial;
      }
      setTimeout(() => { window.location.href = '/gestao'; }, didTrackTrial ? 2000 : 0);
    } catch (e) {
      error = e.message || 'Erro ao salvar. Tente novamente.';
      saving = false;
    }
  }
</script>

{#if show}
<div
  role="dialog"
  aria-modal="true"
  aria-label="Configuração inicial"
  class="wizard-backdrop"
>
  <div class="wizard-card">

    <!-- Top: logo + progress -->
    <div class="wizard-header">
      <span class="wizard-brand">Zelo PDV</span>
      <div class="wizard-dots">
        {#each Array(totalSteps) as _, i}
          <div class="dot" class:active={i < step}></div>
        {/each}
      </div>
    </div>

    <!-- Step content -->
    <div class="wizard-body">
      {#if step === 1}
        <div class="step-label">Passo 1 de 4</div>
        <h2 class="step-title">Como se chama sua loja?</h2>
        <p class="step-hint">Aparecerá nos seus recibos.</p>
        <input
          bind:this={nomeInput}
          bind:value={nome}
          on:keydown={handleKeydown}
          type="text"
          placeholder="Ex: Lanchonete do João"
          class="wizard-input"
          class:input-error={error}
        />

      {:else if step === 2}
        <div class="step-label">Passo 2 de 4</div>
        <h2 class="step-title">Qual o telefone?</h2>
        <p class="step-hint">Para contato e notificações via WhatsApp.</p>
        <input
          bind:this={contatoInput}
          bind:value={contato}
          on:keydown={handleKeydown}
          on:input={(e) => { contato = maskPhone(e.target.value); e.target.value = contato; }}
          type="tel"
          inputmode="numeric"
          placeholder="(00) 00000-0000"
          class="wizard-input"
          class:input-error={error}
        />

      {:else if step === 3}
        <div class="step-label">Passo 3 de 4</div>
        <h2 class="step-title">Qual o CPF ou CNPJ?</h2>
        <p class="step-hint">Vai aparecer no recibo e ajuda a identificar sua loja. O Zelo PDV ainda não emite NFC-e.</p>
        <input
          bind:this={documentoInput}
          bind:value={documento}
          on:keydown={handleKeydown}
          on:input={(e) => { documento = maskDocumento(e.target.value); e.target.value = documento; }}
          type="text"
          inputmode="numeric"
          placeholder="000.000.000-00"
          class="wizard-input"
          class:input-error={error}
        />

      {:else if step === 4}
        <div class="step-label">Passo 4 de 4</div>
        <h2 class="step-title">Tipo de impressora?</h2>
        <p class="step-hint">80 mm é o padrão da maioria das impressoras térmicas de balcão. Use 58 mm só se sua impressora for o modelo menor (papel estreito).</p>
        <div class="printer-options">
          <button
            type="button"
            class="printer-card"
            class:printer-selected={largura_bobina === '80mm'}
            on:click={() => (largura_bobina = '80mm')}
            aria-pressed={largura_bobina === '80mm'}
          >
            <span class="printer-icon"><Printer class="size-6" aria-hidden="true" /></span>
            <strong>80 mm</strong>
            <span class="printer-sub">Mais comum</span>
          </button>
          <button
            type="button"
            class="printer-card"
            class:printer-selected={largura_bobina === '58mm'}
            on:click={() => (largura_bobina = '58mm')}
            aria-pressed={largura_bobina === '58mm'}
          >
            <span class="printer-icon"><Printer class="size-6" aria-hidden="true" /></span>
            <strong>58 mm</strong>
            <span class="printer-sub">Estreita</span>
          </button>
        </div>
      {/if}

      {#if error}
        <p class="wizard-error" role="alert">{error}</p>
      {/if}
    </div>

    <!-- Footer: back + advance -->
    <div class="wizard-footer">
      {#if step > 1}
        <button type="button" class="btn-back" on:click={() => { step -= 1; error = ''; }}>
          ← Voltar
        </button>
      {:else}
        <span></span>
      {/if}

      <button
        type="button"
        class="btn-advance"
        disabled={saving}
        on:click={step < totalSteps ? avancar : finalizar}
      >
        {saving ? 'Salvando…' : step < totalSteps ? 'Avançar →' : 'Finalizar'}
      </button>
    </div>

  </div>
</div>
{/if}

<style>
  .wizard-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .wizard-card {
    background: var(--bg-panel);
    border: 1px solid var(--border-card);
    border-radius: 18px;
    width: 100%;
    max-width: 400px;
    padding: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }

  /* Header */
  .wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .wizard-brand {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--primary);
  }

  .wizard-dots {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--border-subtle);
    transition: background 0.25s, transform 0.25s;
  }

  .dot.active {
    background: var(--primary);
    transform: scale(1.2);
  }

  /* Body */
  .wizard-body {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .step-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .step-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0.1rem 0 0;
    line-height: 1.3;
  }

  .step-hint {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin: 0 0 0.6rem;
  }

  .wizard-input {
    width: 100%;
    padding: 0.65rem 0.9rem;
    background: var(--bg-input);
    border: 1.5px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-main);
    font-size: 0.95rem;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .wizard-input:focus {
    border-color: var(--primary);
  }

  .wizard-input.input-error {
    border-color: var(--error);
  }

  .wizard-error {
    font-size: 0.78rem;
    color: var(--error);
    margin: 0.2rem 0 0;
  }

  /* Printer cards */
  .printer-options {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.25rem;
  }

  .printer-card {
    flex: 1;
    padding: 0.85rem 0.5rem;
    border: 1.5px solid var(--border-subtle);
    border-radius: 10px;
    cursor: pointer;
    text-align: center;
    background: var(--bg-input);
    transition: border-color 0.15s, background 0.15s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-main);
  }

  .printer-card:hover {
    border-color: var(--primary);
  }

  .printer-card.printer-selected {
    border-color: var(--primary);
    background: var(--bg-card);
  }

  .printer-icon {
    font-size: 1.4rem;
  }

  .printer-card strong {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .printer-sub {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  /* Footer */
  .wizard-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.25rem;
  }

  .btn-back {
    font-size: 0.82rem;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.4rem 0;
    transition: color 0.15s;
  }

  .btn-back:hover {
    color: var(--text-main);
  }

  .btn-advance {
    padding: 0.5rem 1.25rem;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 7px;
    font-weight: 600;
    font-size: 0.88rem;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
  }

  .btn-advance:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-advance:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .wizard-card {
      border-radius: 14px;
      padding: 1.5rem;
    }
  }
</style>
