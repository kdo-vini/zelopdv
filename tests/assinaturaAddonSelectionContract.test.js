import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve('src/routes/assinatura/+page.svelte'), 'utf8');

describe('assinatura add-on selection contract', () => {
  // O bug original: um bloco reativo zerava o boolean do add-on quando o plano
  // escolhido não o vendia, e nada o restaurava ao voltar. pdv+ZeloMenu (R$99)
  // -> bundle -> pdv terminava em R$59 com o módulo desmarcado em silêncio.
  it('never resets the add-on booleans from a reactive block', () => {
    expect(page).not.toMatch(/\$:\s*if\s*\(!selectedPlanAllows\w+\s*&&\s*\w+AddonOn\)/);
    expect(page).toContain('resolveSelection');
    expect(page).toMatch(/let desiredAddons = \{/);
  });

  it('sends the resolved selection to both payment endpoints', () => {
    const bodies = page.match(/addons: \{ \.\.\.effectiveAddons \}/g) || [];
    expect(bodies.length).toBeGreaterThanOrEqual(4); // 2 requests + 2 analytics
    expect(page).not.toMatch(/addons: \{\s*mesas: mesasAddonOn/);
  });

  it('prices the plan cards with the current add-on selection', () => {
    expect(page).toContain('R$ {planCardPrice(planId)}');
    expect(page).not.toContain('<div class="plan-price">R$ {PLANS[planId].price}');
  });

  it('warns and asks for confirmation before dropping an active module', () => {
    expect(page).toContain('lostEntitlements');
    expect(page).toContain('confirmEntitlementRemoval');
    expect(page).toMatch(/assinar\(\)[\s\S]{0,120}confirmEntitlementRemoval/);
    expect(page).toMatch(/gerarPix\([\s\S]{0,200}confirmEntitlementRemoval/);
  });

  it('offers a one-tap way back to the package the customer already had', () => {
    expect(page).toContain('restoreActivePackage');
    expect(page).toContain('Continuar com este pacote');
  });
});
