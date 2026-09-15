import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ONBOARDING_TOTAL_STEPS,
  buildOnboardingStepPayload,
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

    // Redirecionamento final: teto de no máximo 800ms, só quando algo foi
    // rastreado — nunca os 2000ms fixos antigos.
    expect(source).toMatch(/setTimeout\(\(\) => \{ window\.location\.href = '\/gestao'; \}, didTrackTrial \? 800 : 0\)/);
    expect(source).not.toMatch(/didTrackTrial \? 2000 : 0/);
  });
});
