import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ONBOARDING_TOTAL_STEPS,
  buildOnboardingStepPayload,
  buildOnboardingWhatsAppHelpHref,
  buildOnboardingWhatsAppHelpMessage,
  computeOnboardingDotsState,
  deriveOnboardingResumeStep,
  validateOnboardingStep,
} from '../src/lib/onboardingWizard.js';

describe('onboardingWizard', () => {
  it('mantém o contrato fechado de dois passos', () => {
    expect(ONBOARDING_TOTAL_STEPS).toBe(2);
  });

  it('valida nome e WhatsApp inclusive no clique final', () => {
    expect(validateOnboardingStep(1, { nome: '   ' })).toEqual({
      valid: false,
      field: 'nome',
      error: 'Coloque o nome da loja.',
    });
    expect(validateOnboardingStep(2, { contato: '' })).toEqual({
      valid: false,
      field: 'contato',
      error: 'Faltou o DDD. Escreva os 11 números: (11) 98765-4321',
    });
    expect(validateOnboardingStep(2, { contato: '(11) 98765-4321' }).valid).toBe(true);
  });

  it('salva o nome no passo 1 sem apagar documento ou contato existentes', () => {
    expect(buildOnboardingStepPayload({
      step: 1,
      userId: 'user-1',
      nome: '  Loja da Ana  ',
      contato: '(11) 98765-4321',
      origemAquisicao: 'google',
      updatedAt: '2026-09-15T00:00:00.000Z',
    })).toEqual({
      user_id: 'user-1',
      nome_exibicao: 'Loja da Ana',
      origem_aquisicao: 'google',
      updated_at: '2026-09-15T00:00:00.000Z',
    });
  });

  it('salva o WhatsApp normalizado e o default da bobina no passo 2 sem mandar documento', () => {
    const payload = buildOnboardingStepPayload({
      step: 2,
      userId: 'user-1',
      nome: 'Loja da Ana',
      contato: '(11) 98765-4321',
      updatedAt: '2026-09-15T00:00:00.000Z',
    });

    expect(payload).toEqual({
      user_id: 'user-1',
      nome_exibicao: 'Loja da Ana',
      contato: '5511987654321',
      largura_bobina: '80mm',
      updated_at: '2026-09-15T00:00:00.000Z',
    });
    expect(payload).not.toHaveProperty('documento');
  });

  it('retoma no WhatsApp quando o nome já foi salvo por passo', () => {
    expect(deriveOnboardingResumeStep({ nome_exibicao: 'Loja', contato: '' })).toBe(2);
    expect(deriveOnboardingResumeStep({ nome_exibicao: '', contato: '' })).toBe(1);
  });

  it('valida novamente no clique final e salva o primeiro passo antes de avançar', () => {
    const source = readFileSync(
      new URL('../src/lib/components/OnboardingWizard.svelte', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(/async function finalizar\(\)[\s\S]*?const validation = validate\(\)/);
    expect(source).toMatch(/async function avancar\(\)[\s\S]*?await saveStep\(step\)[\s\S]*?step \+= 1/);
  });

  it('mantém os tetos curtos de espera do tracking no fim do onboarding', () => {
    const source = readFileSync(
      new URL('../src/lib/components/OnboardingWizard.svelte', import.meta.url),
      'utf8',
    );

    // gtag: no máximo 10 tentativas de 150ms = 1500ms de teto.
    expect(source).toMatch(/waitForGtag\(\{\s*attempts:\s*10,\s*intervalMs:\s*150\s*\}\)/);

    // Google Ads: espera o event_callback real, com teto de 1s, só quando o
    // gtag carregou — nunca o tempo fixo de 2s antigo.
    expect(source).toMatch(/timeoutMs:\s*gtagReady\s*\?\s*1000\s*:\s*undefined/);
    expect(source).not.toMatch(/waitForGtag\(\)/);
  });

  it('troca pro estado de chegada assim que o trial responde OK, sem navegar sozinho', () => {
    const source = readFileSync(
      new URL('../src/lib/components/OnboardingWizard.svelte', import.meta.url),
      'utf8',
    );

    // finalizar() vira arrived=true e dispara o tracking em segundo plano —
    // nunca faz window.location.href sozinho.
    const finalizarBody = source.slice(
      source.indexOf('async function finalizar()'),
      source.indexOf('async function irParaPrimeiraVenda'),
    );
    expect(finalizarBody).toMatch(/arrived = true/);
    expect(finalizarBody).toMatch(/trackingPromise = runBackgroundTracking\(trialPayload\)/);
    expect(finalizarBody).not.toMatch(/window\.location\.href/);

    // runBackgroundTracking não roda o tracking de novo quando o trial já
    // existia (alreadyExists) — mesma regra de antes, só que fora do finalizar.
    expect(source).toMatch(/async function runBackgroundTracking\(trialPayload\) \{\s*if \(trialPayload\?\.alreadyExists\) return;/);
  });

  it('os cliques do estado de chegada esperam o tracking com teto de 1000ms antes de navegar pro /app', () => {
    const source = readFileSync(
      new URL('../src/lib/components/OnboardingWizard.svelte', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(/new Promise\(\(resolve\) => setTimeout\(resolve, 1000\)\)/);

    const primeiraVendaBody = source.slice(
      source.indexOf('async function irParaPrimeiraVenda'),
      source.indexOf('async function pedirAjudaWhatsApp'),
    );
    expect(primeiraVendaBody).toMatch(/await waitForBackgroundTracking\(\)/);
    expect(primeiraVendaBody).toMatch(/window\.location\.href = '\/app'/);

    const whatsappBody = source.slice(
      source.indexOf('async function pedirAjudaWhatsApp'),
      source.indexOf('</script>'),
    );
    expect(whatsappBody).toMatch(/window\.open\(helpHref, '_blank', 'noopener,noreferrer'\)/);
    expect(whatsappBody).toMatch(/await waitForBackgroundTracking\(\)/);
    expect(whatsappBody).toMatch(/window\.location\.href = '\/app'/);
  });
});

describe('computeOnboardingDotsState', () => {
  it('passo 1: bolinha atual (contorno) seguida de futuro', () => {
    expect(computeOnboardingDotsState({ step: 1, totalSteps: 2 })).toEqual(['current', 'future']);
  });

  it('passo 2: concluído seguido de atual (contorno)', () => {
    expect(computeOnboardingDotsState({ step: 2, totalSteps: 2 })).toEqual(['completed', 'current']);
  });

  it('chegada: as duas bolinhas concluídas, independente do step', () => {
    expect(computeOnboardingDotsState({ step: 2, totalSteps: 2, arrived: true })).toEqual(['completed', 'completed']);
  });
});

describe('WhatsApp de ajuda no estado de chegada', () => {
  it('monta a mensagem exata com o nome da loja interpolado', () => {
    expect(buildOnboardingWhatsAppHelpMessage('Loja da Ana')).toBe(
      'Oi! Acabei de criar a conta da Loja da Ana e quero ajuda pra cadastrar os produtos.',
    );
  });

  it('monta o link wa.me com o texto codificado', () => {
    const href = buildOnboardingWhatsAppHelpHref('Loja da Ana');
    expect(href).toBe(
      'https://wa.me/5514991537503?text=' +
        encodeURIComponent('Oi! Acabei de criar a conta da Loja da Ana e quero ajuda pra cadastrar os produtos.'),
    );
    // Confere que o texto foi de fato URL-encoded (espaços viram %20, não '+').
    expect(href).toContain('%20');
    expect(href).not.toContain(' ');
  });
});
