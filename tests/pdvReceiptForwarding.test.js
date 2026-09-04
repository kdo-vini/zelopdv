import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdvPage = fs.readFileSync(path.join(repoRoot, 'src/routes/app/+page.svelte'), 'utf8');
const printAdapter = pdvPage.slice(
  pdvPage.indexOf('async function imprimirReciboVenda'),
  pdvPage.indexOf('\n  // ── Impressão de movimentação', pdvPage.indexOf('async function imprimirReciboVenda')),
);

describe('PDV sale receipt adapter', () => {
  it('forwards the discount from checkout state to printVenda', () => {
    expect(printAdapter).toMatch(/async function imprimirReciboVenda\(\{[^}]*\bdesconto\b/s);
    expect(printAdapter).toMatch(/venda:\s*\{[^}]*\bdesconto\b/s);
  });
});
