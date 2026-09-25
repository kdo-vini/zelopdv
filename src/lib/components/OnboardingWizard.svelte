<script>
  import { tick, onMount } from 'svelte';
  import { Check, MessageCircle } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { maskPhone } from '$lib/masks';
  import {
    ONBOARDING_TOTAL_STEPS,
    buildOnboardingStepPayload,
    buildOnboardingWhatsAppHelpHref,
    computeOnboardingDotsState,
    deriveOnboardingResumeStep,
    validateOnboardingStep,
  } from '$lib/onboardingWizard';
  import { TRIAL_DAYS } from '$lib/pricing';
  import { trackStartTrial } from '$lib/metaPixel';
  import { trackGa4Event, trackGoogleAdsInscricao, waitForGtag } from '$lib/googleAds';
  import { getStoredAcquisitionOrigin } from '$lib/attribution/client';
  import { HEARD_FROM_OPTIONS, buildHeardFromPayload } from '$lib/attribution/heardFrom';
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

  // Estado de chegada: mostrado no mesmo card, depois do passo 2, assim que
  // o trial responde OK. `trackingPromise` guarda o tracking de conversão
  // que passa a rodar em segundo plano depois da troca de estado — os
  // cliques dos botões aguardam o que faltar dela (teto de 1s) antes de
  // navegar, pra nenhuma conversão deixar de disparar.
  let arrived = false;
  let trackingPromise = null;

  // Pergunta auto-declarada "Como conheceu o Zelo?" — opcional e pulável, só
  // aparece no estado de chegada e só quando o metadado ainda não existe.
  // Nunca bloqueia a navegação: os CTAs de "arrived" continuam funcionando
  // com ou sem resposta.
  let heardFromAlready = false;
  let heardFromChoice = '';
  let heardFromSkipped = false;
  $: showHeardFromPrompt = arrived && !heardFromAlready && !heardFromChoice && !heardFromSkipped;
  $: showHeardFromThanks = arrived && !!heardFromChoice;

  let nomeInput;
  let contatoInput;
  let welcomeTitleEl;

  $: dotsState = computeOnboardingDotsState({ step, totalSteps, arrived });

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

    try {
      const { data } = await supabase.auth.getUser();
      heardFromAlready = !!data?.user?.user_metadata?.heard_from;
    } catch (userError) {
      console.warn('[OnboardingWizard] heard_from check failed:', userError?.message || userError);
    }
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

  // Roda o tracking de conversão depois que o card já trocou pro estado de
  // chegada. Não bloqueia a UI — a Promise fica guardada em trackingPromise
  // e os cliques dos botões aguardam o que faltar dela (teto de 1s).
  async function runBackgroundTracking(trialPayload) {
    if (trialPayload?.alreadyExists) return;

    // gtag carrega async; sem esperar, a conversão de inscrição se perde
    // silenciosamente. Teto curto: com bloqueador de anúncio isso nunca
    // aparece, então não vale segurar a pessoa por mais que isso.
    const gtagReady = await waitForGtag({ attempts: 10, intervalMs: 150 });
    if (!gtagReady) console.warn('[tracking] gtag indisponível no fim do onboarding');
    trackStartTrial(trialPayload?.metaEventId ? { eventID: trialPayload.metaEventId } : {});
    trackGa4Event('begin_trial');
    // Com gtag pronto, espera o event_callback real do Google Ads (o
    // beacon saiu de verdade) em vez de um tempo fixo — teto de 1s pro
    // caso do callback nunca disparar.
    await trackGoogleAdsInscricao({
      email,
      transactionId: userId,
      timeoutMs: gtagReady ? 1000 : undefined,
    });
  }

  // Espera o que faltar do tracking em segundo plano antes de navegar, com
  // teto de 1000ms — nunca trava o clique além disso.
  function waitForBackgroundTracking() {
    if (!trackingPromise) return Promise.resolve();
    return Promise.race([
      trackingPromise,
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
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

      // Trial OK (inclusive alreadyExists): troca pro estado de chegada no
      // mesmo card. Não navega sozinho — só os botões do estado de chegada
      // navegam. O tracking de conversão roda depois, em segundo plano.
      saving = false;
      arrived = true;
      void capturePostHogEvent('onboarding_welcome_viewed', { total_steps: totalSteps });
      await tick();
      welcomeTitleEl?.focus();

      trackingPromise = runBackgroundTracking(trialPayload);
    } catch (e) {
      console.error('[OnboardingWizard] save error:', e);
      error = 'Não deu pra salvar agora. Confira sua internet e tente de novo.';
      saving = false;
    }
  }

  // Fire-and-forget: nunca trava a navegação por causa dessa resposta opcional.
  function selectHeardFrom(id) {
    if (heardFromChoice) return;
    heardFromChoice = id;

    const payload = buildHeardFromPayload(id);
    if (payload && supabase) {
      supabase.auth.updateUser({ data: payload }).catch((err) => {
        console.warn('[OnboardingWizard] heard_from update failed:', err?.message || err);
      });
    }

    void capturePostHogEvent('acquisition_self_reported', { heard_from: id, $set: { heard_from: id } });
  }

  function skipHeardFrom() {
    heardFromSkipped = true;
  }

  async function irParaPrimeiraVenda() {
    void capturePostHogEvent('onboarding_welcome_cta_clicked', { cta: 'first_sale' });
    await waitForBackgroundTracking();
    window.location.href = '/app';
  }

  async function pedirAjudaWhatsApp() {
    void capturePostHogEvent('onboarding_welcome_cta_clicked', { cta: 'whatsapp' });
    const helpHref = buildOnboardingWhatsAppHelpHref(nome);
    window.open(helpHref, '_blank', 'noopener,noreferrer');
    await waitForBackgroundTracking();
    window.location.href = '/app';
  }
</script>

{#if show}
<div
  role="dialog"
  aria-modal="true"
  aria-label={arrived ? 'Conta pronta' : 'Configuração inicial'}
  class="wizard-backdrop"
>
  <div class="wizard-card">

    <!-- Top: logo + progress -->
    <div class="wizard-header">
      <span class="wizard-brand">Zelo PDV</span>
      <div class="wizard-dots" role="presentation">
        {#each dotsState as dotStatus}
          <div class="dot" class:completed={dotStatus === 'completed'} class:current={dotStatus === 'current'}></div>
        {/each}
      </div>
    </div>

    <!-- Step content -->
    <div class="wizard-body">
      {#if arrived}
        <div class="step-content">
          <div class="welcome-badge" aria-hidden="true">
            <Check class="size-5" />
          </div>
          <h2 class="step-title" tabindex="-1" bind:this={welcomeTitleEl}>Boas-vindas ao Zelo, {nome}.</h2>
          <p class="step-hint">Seu teste de {TRIAL_DAYS} dias começou. Se quiser, cadastramos seus produtos junto com você pelo WhatsApp — uns 15 minutos.</p>

          {#if showHeardFromPrompt}
            <div class="heard-from">
              <div class="heard-from-header">
                <p class="heard-from-question">Como você conheceu o Zelo?</p>
                <button type="button" class="heard-from-skip" on:click={skipHeardFrom}>Pular</button>
              </div>
              <div class="heard-from-chips">
                {#each HEARD_FROM_OPTIONS as option}
                  <button type="button" class="heard-from-chip" on:click={() => selectHeardFrom(option.id)}>
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>
          {:else if showHeardFromThanks}
            <p class="heard-from-thanks">Valeu por contar!</p>
          {/if}
        </div>
      {:else if step === 1}
        <div class="step-content">
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
        </div>

      {:else if step === 2}
        <div class="step-content">
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
        </div>
      {/if}

      {#if error}
        <p class="wizard-error" role="alert">{error}</p>
      {/if}
    </div>

    <!-- Footer: back + advance, ou CTAs do estado de chegada -->
    {#if arrived}
      <div class="wizard-footer wizard-footer-stacked">
        <button type="button" class="btn-advance btn-block" on:click={irParaPrimeiraVenda}>
          Fazer primeira venda
        </button>
        <button type="button" class="btn-outline btn-block" on:click={pedirAjudaWhatsApp}>
          <MessageCircle class="size-4" aria-hidden="true" />
          Ajuda no WhatsApp
        </button>
      </div>
    {:else}
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
    {/if}

  </div>
</div>
{/if}

<style>
  .wizard-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--shadow-color) 60%, transparent);
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
    border-radius: 16px;
    width: 100%;
    max-width: 400px;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
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
    border: 1.5px solid transparent;
    box-sizing: border-box;
    transition: background 0.25s, border-color 0.25s, transform 0.25s;
  }

  /* Concluído: bolinha preenchida. Atual: contorno primário, miolo vazio. */
  .dot.completed {
    background: var(--primary);
    transform: scale(1.2);
  }

  .dot.current {
    background: var(--bg-panel);
    border-color: var(--primary);
    transform: scale(1.3);
  }

  /* Body */
  .wizard-body {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .step-content {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    animation: wizard-step-in 150ms ease-out;
  }

  @keyframes wizard-step-in {
    from {
      opacity: 0;
      transform: translateX(8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .welcome-badge {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    margin-bottom: 0.1rem;
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
    outline: none;
  }

  .step-hint {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
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

  /* Pergunta "Como conheceu o Zelo?" — opcional, no estado de chegada */
  .heard-from {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 0.4rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--border-subtle);
  }

  .heard-from-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .heard-from-question {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-main);
    margin: 0;
  }

  .heard-from-skip {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.2rem 0.3rem;
    transition: color 0.15s;
  }

  .heard-from-skip:hover {
    color: var(--text-main);
  }

  .heard-from-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .heard-from-chip {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-label);
    background: var(--bg-input);
    border: 1.5px solid var(--border-subtle);
    border-radius: 999px;
    padding: 0.4rem 0.85rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }

  .heard-from-chip:hover {
    border-color: var(--primary);
    color: var(--text-main);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  .heard-from-thanks {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin: 0.4rem 0 0;
    padding-top: 0.9rem;
    border-top: 1px solid var(--border-subtle);
  }

  /* Footer */
  .wizard-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.25rem;
  }

  /* Estado de chegada: botões empilhados, largura total, sem Voltar. */
  .wizard-footer-stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }

  .btn-block {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .btn-outline {
    background: transparent;
    color: var(--text-main);
    border: 1.5px solid var(--border-subtle);
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .btn-outline:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 6%, transparent);
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 10rem;
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

  @media (prefers-reduced-motion: reduce) {
    .step-content {
      animation: none;
    }

    .dot,
    .wizard-input,
    .btn-back,
    .btn-advance,
    .btn-outline {
      transition: none;
    }

    .dot.completed,
    .dot.current {
      transform: none;
    }
  }
</style>
