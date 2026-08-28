import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const caixaPagePath = path.resolve('src/routes/gestao/caixa/+page.svelte');

describe('cash closing payment snapshot contract', () => {
  test('persists the canonical payment breakdown, including vale-refeicao totals', () => {
    const page = fs.readFileSync(caixaPagePath, 'utf8');

    expect(page).toMatch(/import\s*{[\s\S]*?buildPaymentTotalsSnapshot[\s\S]*?}\s*from '\$lib\/finance\/caixa'/);
    expect(page).toContain('totais_pagamento: buildPaymentTotalsSnapshot(resumoPagamentos.totalsByForm)');
  });
});
