<script>
  import { tick, onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { maskPhone } from '$lib/masks';
  import {
    ONBOARDING_TOTAL_STEPS,
    buildOnboardingStepPayload,
    deriveOnboardingResumeStep,
    validateOnboardingStep,
  } from '$lib/onboardingWizard';
  import { trackStartTrial } from '$lib/metaPixel';
  import { trackGa4Event, trackGoogleAdsInscricao, waitForGtag } from '$lib/googleAds';
  import { getStoredAcquisitionOrigin } from '$lib/attribution/client';
  import { capturePostHogEvent } from '$lib/posthogClient';

  export let show = false;
  export let userId = '';
  export let email = '';

  let step = 1;
  const totalSteps = ONBOARDING_TOTAL_STEPS;

  let nome = '';
  let contato = '';
  const largura_bobina = '80mm';

  let error = '';
  let saving = false;

  let nomeInput;
  let contatoInput;

  $: if (show || step) {
    tick().then(() => {
      if (step === 1) nomeInput?.focus();
      else if (step === 2) contatoInput?.focus();
    });
  }

  // Baseline "antes" da Fase 3 (docs/projects/onboarding-dois-passos.md): o
  // wizard de 4 passos nunca disse EM QUAL passo as pessoas desistiam, porque
  // so existia um upsert no fim. Nomes/propriedades pensados pra continuar
  // fazendo sentido quando totalSteps virar 2. Nunca manda o valor digitado —
  // so metadado de step, nunca nome/telefone/CPF.
  function trackStepViewed(currentStep) {
    void capturePostHogEvent('onboarding_wizard_step_viewed', { step: currentStep, total_steps: totalSteps });
  }

  onMount(async () => {
    if (!supabase || !userId) {
      trackStepViewed(step);
      return;
    }

    try {
      const { data: perfil, error: profileError } = await supabase
        .from('empresa_perfil')
        .select('nome_exibicao, contato')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (perfil) {
        nome = perfil.nome_exibicao || '';
        contato = maskPhone(perfil.contato || '');
        step = deriveOnboardingResumeStep(perfil);
      }
    } catch (loadError) {
      console.warn('[OnboardingWizard] profile resume failed:', loadError?.message || loadError);
    }
    trackStepViewed(step);
  });

  function validate() {
    const result = validateOnboardingStep(step, { nome, contato });
    error = result.error;
    return result;
  }

  function trackValidationFailure(validation) {
    if (!validation.valid) {
      void capturePostHogEvent('onboarding_wizard_validation_failed', {
        step,
        total_steps: totalSteps,
        field: validation.field,
      });
    }
  }

  async function saveStep(currentStep) {
    const perfilPayload = buildOnboardingStepPayload({
      step: currentStep,
      userId,
      nome,
      contato,
      origemAquisicao: getStoredAcquisitionOrigin(),
    });

    const { error: dbError } = await supabase
      .from('empresa_perfil')
      .upsert(perfilPayload, { onConflict: 'user_id' });

    if (dbError) {
      void capturePostHogEvent('onboarding_wizard_save_failed', { step: currentStep, total_steps: totalSteps });
      throw dbError;
    }
  }

  async function avancar() {
    if (saving) return;

    const validation = validate();
    if (!validation.valid) {
      trackValidationFailure(validation);
      return;
    }

    saving = true;
    try {
      await saveStep(step);
      void capturePostHogEvent('onboarding_wizard_step_completed', { step, total_steps: totalSteps });
      step += 1;
      trackStepViewed(step);
    } catch (saveError) {
      console.error('[OnboardingWizard] step save error:', saveError);
      error = 'Não deu pra salvar agora. Confira sua internet e tente de novo.';
    } finally {
      saving = false;
    }
  }

  function voltar() {
    if (saving) return;

    const fromStep = step;
    step -= 1;
    error = '';
    void capturePostHogEvent('onboarding_wizard_step_back', { from_step: fromStep });
    trackStepViewed(step);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !saving) {
      e.preventDefault();
      step < totalSteps ? avancar() : finalizar();
    }
  }

  async function finalizar() {
    if (saving) return;

    const validation = validate();
    if (!validation.valid) {
      trackValidationFailure(validation);
      return;
    }

    saving = true;
    error = '';
    try {
      await saveStep(step);

      void capturePostHogEvent('onboarding_wizard_step_completed', { step, total_steps: totalSteps });
      void capturePostHogEvent('onboarding_wizard_completed', { total_steps: totalSteps, largura_bobina });

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
        // gtag carrega async; sem esperar, a conversão de inscrição se perde
        // silenciosamente. Teto curto: com bloqueador de anúncio isso nunca
        // aparece, então não vale segurar a pessoa por mais que isso.
        const gtagReady = await waitForGtag({ attempts: 10, intervalMs: 150 });
        if (!gtagReady) console.warn('[tracking] gtag indisponível no fim do onboarding');
        const trackedMetaTrial = trackStartTrial();
        trackGa4Event('begin_trial');
        // Com gtag pronto, espera o event_callback real do Google Ads (o
        // beacon saiu de verdade) em vez de um tempo fixo — teto de 1s pro
        // caso do callback nunca disparar.
        const trackedGoogleTrial = await trackGoogleAdsInscricao({
          email,
          transactionId: userId,
          timeoutMs: gtagReady ? 1000 : undefined,
        });
        didTrackTrial = trackedMetaTrial || trackedGoogleTrial;
      }
      // Meta não tem callback de envio; teto curto só pra dar tempo do beacon
      // sair antes de navegar, e só quando algo foi de fato disparado.
      setTimeout(() => { window.location.href = '/gestao'; }, didTrackTrial ? 800 : 0);
    } catch (e) {
      console.error('[OnboardingWizard] save error:', e);
      error = 'Não deu pra salvar agora. Confira sua internet e tente de novo.';
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
        <div class="step-label">Passo 1 de 2</div>
        <h2 class="step-title">Como se chama sua loja?</h2>
        <p class="step-hint">É o nome que vai no recibo do seu cliente.</p>
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
        <div class="step-label">Passo 2 de 2</div>
        <h2 class="step-title">Qual o seu WhatsApp?</h2>
        <p class="step-hint">É por onde a gente te ajuda. Se quiser, cadastramos seus produtos junto com você — uns 15 minutos, sem custo.</p>
        <input
          bind:this={contatoInput}
          bind:value={contato}
          on:keydown={handleKeydown}
          on:input={(e) => { contato = maskPhone(e.target.value); e.target.value = contato; }}
          type="tel"
          inputmode="numeric"
          placeholder="(11) 98765-4321"
          class="wizard-input"
          class:input-error={error}
        />
      {/if}

      {#if error}
        <p class="wizard-error" role="alert">{error}</p>
      {/if}
    </div>

    <!-- Footer: back + advance -->
    <div class="wizard-footer">
      {#if step > 1}
        <button type="button" class="btn-back" disabled={saving} on:click={voltar}>
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
        {saving ? 'Salvando…' : step < totalSteps ? 'Continuar' : 'Começar a usar'}
      </button>
    </div>

  </div>
</div>
{/if}

<style>
  .wizard-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--text-inverse) 60%, transparent);
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
    border-radius: 14px;
    width: 100%;
    max-width: 400px;
    padding: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: var(--shadow-modal);
  }

  /* Header */
  .wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .wizard-brand {
    font-size: 0.625rem;
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
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .step-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0.1rem 0 0;
    line-height: 1.3;
  }

  .step-hint {
    font-size: 0.875rem;
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
    font-size: 0.875rem;
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
    font-size: 0.875rem;
    color: var(--error);
    margin: 0.2rem 0 0;
  }

  /* Footer */
  .wizard-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.25rem;
  }

  .btn-back {
    font-size: 0.875rem;
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

  .btn-back:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-advance {
    padding: 0.5rem 1.25rem;
    background: var(--primary);
    color: var(--primary-text);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.875rem;
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
