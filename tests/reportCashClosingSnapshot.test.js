import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const reportsPagePath = path.resolve('src/routes/relatorios/+page.svelte');

describe('cash-closing report query contract', () => {
  test('loads the payment snapshot without dropping legacy closing totals', () => {
    const page = fs.readFileSync(reportsPagePath, 'utf8');
    const select = page.match(/\.from\('caixa_fechamentos'\)\s*\.select\('([^']+)'\)/)?.[1] || '';

    expect(select).toContain('totais_pagamento');
    expect(select).toContain('total_dinheiro');
    expect(select).toContain('total_cartao');
    expect(select).toContain('total_pix');
    expect(select).toContain('total_geral');
  });
});
