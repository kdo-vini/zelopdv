import { describe, it, expect } from 'vitest';
import { formatLarguraBobinaLabel, buildChecklistState } from '../src/lib/onboardingChecklist.js';

// Fase 4.1 do onboarding em dois passos: CPF/CNPJ, logo e bobina saem do
// wizard e passam a morar no checklist do /gestao, que nunca bloqueia o
// caixa. Ver docs/projects/onboarding-dois-passos.md.

const VALID_CPF = '52998224725';

describe('onboardingChecklist.formatLarguraBobinaLabel', () => {
  it('formata o default como "80 mm"', () => {
    expect(formatLarguraBobinaLabel('80mm')).toBe('80 mm');
    expect(formatLarguraBobinaLabel('')).toBe('80 mm');
    expect(formatLarguraBobinaLabel(null)).toBe('80 mm');
  });

  it('formata 58mm como "58 mm", aceitando variações de grafia', () => {
    expect(formatLarguraBobinaLabel('58mm')).toBe('58 mm');
    expect(formatLarguraBobinaLabel('58 mm')).toBe('58 mm');
    expect(formatLarguraBobinaLabel('58')).toBe('58 mm');
  });
});

describe('onboardingChecklist.buildChecklistState', () => {
  it('o default de bobina já conta como configuração válida', () => {
    const state = buildChecklistState({
      hasProdutos: false,
      documento: '',
      logoUrl: '',
      larguraBobina: '80mm',
    });

    expect(state.doneCount).toBe(1);
    expect(state.totalSteps).toBe(4);
    expect(state.allDone).toBe(false);
    expect(state.items).toHaveLength(4);
  });

  it('conta os quatro itens da copy fechada', () => {
    const state = buildChecklistState({
      hasProdutos: true,
      documento: VALID_CPF,
      logoUrl: 'https://cdn.example/logo.png',
      larguraBobina: '80mm',
    });

    expect(state.doneCount).toBe(4);
    expect(state.totalSteps).toBe(4);
    expect(state.allDone).toBe(true);
  });

  it('documento invalido ou vazio nao conta como feito', () => {
    const state = buildChecklistState({
      hasProdutos: true,
      documento: '11111111111', // CPF com todos os dígitos iguais: inválido
      logoUrl: 'https://cdn.example/logo.png',
      larguraBobina: '80mm',
    });

    expect(state.items.find((i) => i.key === 'documento').done).toBe(false);
    expect(state.allDone).toBe(false);
  });

  it('a bobina é um item normal, sem semântica informativa inventada', () => {
    const state = buildChecklistState({
      hasProdutos: false,
      documento: '',
      logoUrl: '',
      larguraBobina: '58mm',
    });

    const bobina = state.items.find((i) => i.key === 'bobina');
    expect(bobina).not.toHaveProperty('kind');
    expect(bobina.done).toBe(true);
    expect(bobina.label).toBe('Largura da bobina — hoje em 58 mm');
    expect(state.totalSteps).toBe(4);
  });

  it('itens levam para os destinos certos', () => {
    const state = buildChecklistState({
      hasProdutos: false,
      documento: '',
      logoUrl: '',
      larguraBobina: '80mm',
    });

    expect(state.items.find((i) => i.key === 'produto').href).toBe('/gestao/produtos');
    expect(state.items.find((i) => i.key === 'documento').href).toBe('/perfil#documento');
    expect(state.items.find((i) => i.key === 'logo').href).toBe('/perfil#logo');
    expect(state.items.find((i) => i.key === 'bobina').href).toBe('/perfil#largura-bobina');
  });
});
