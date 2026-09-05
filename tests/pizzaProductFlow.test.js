import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/routes/gestao/produtos/+page.svelte'), 'utf8');

describe('pizza product authoring entry point', () => {
  it('keeps one product creation flow and configures pizza through complements', () => {
    expect(source).not.toContain('Nova pizza montável');
    expect(source).not.toContain('Tipo de produto');
    expect(source).not.toContain('abrirModalPizza');
    expect(source).toContain('Complementos e opções');
    expect(source).toContain('on:pizza');
    expect(source).not.toContain('buildPizzaDraftProduct');
  });
});
