import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/lib/components/OnboardingChecklist.svelte'),
  'utf8'
);

describe('OnboardingChecklist Fase 4.1', () => {
  it('usa somente o checklist e a copy fechados no plano', () => {
    expect(source).toContain('Terminar de configurar');
    expect(source).toContain('Nada disso trava o caixa. Faça quando sobrar um tempo.');
    expect(source).toContain('buildChecklistState');
    expect(source).not.toContain('Primeiros passos');
    expect(source).not.toContain('Abra o caixa do dia');
    expect(source).not.toContain('Registre a primeira venda');
    expect(source).not.toContain('veja seu relatório');
  });

  it('não reaproveita onboarding_completed para esconder o checklist novo', () => {
    expect(source).not.toContain('onboarding_completed');
  });
});
