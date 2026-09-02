import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

describe('DayStrip', () => {
  it('mostra os quatro números com contexto e não usa hex', async () => {
    const s = await read('src/lib/components/gerente/DayStrip.svelte');
    for (const t of ['Receita de ontem', 'Vendas', 'Ticket médio', 'Recebido em Pix', 'sem referência', 'computeDayStrip']) expect(s).toContain(t);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(s).toContain('tabular-nums');
  });
});

describe('SignalRow', () => {
  it('tem kicker por severidade, números recolhidos, ação rápida e perguntar', async () => {
    const s = await read('src/lib/components/gerente/SignalRow.svelte');
    for (const t of ['Precisa de você', 'Fica de olho', 'Pra saber', '<details', 'Ver os números', 'acaoRapida', 'Perguntar', 'Silenciar esse tipo', 'Silenciado nas preferências', 'onQuickAction']) expect(s).toContain(t);
    expect(s).not.toMatch(/border-(left|top):\s*[2-9]px/);
    expect(s).not.toMatch(/text-transform:\s*uppercase/);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
