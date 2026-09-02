import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const page = new URL('../src/routes/gestao/gerente/preferencias/+page.svelte', import.meta.url);

describe('preferências: Zelinho no WhatsApp', () => {
  it('tem o fluxo de conectar, mostrar código e desvincular', async () => {
    const source = await readFile(page, 'utf8');
    expect(source).toContain("fetch('/api/gerente/pair'");
    expect(source).toContain("fetch('/api/gerente/pair/start'");
    expect(source).toContain("method: 'DELETE'");
    expect(source).toContain('Conectar no WhatsApp');
    expect(source).toContain('Desvincular');
    expect(source).toContain('pairing-code');
  });
});
