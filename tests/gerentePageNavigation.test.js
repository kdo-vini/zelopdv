import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const pagePath = new URL('../src/routes/gestao/gerente/+page.svelte', import.meta.url);

describe('gerente page navigation', () => {
  it('linka o resumo semanal e as preferências a partir do briefing', async () => {
    const source = await readFile(pagePath, 'utf8');
    expect(source).toContain('href="/gestao/gerente/semana"');
    expect(source).toContain('href="/gestao/gerente/preferencias"');
  });
});
