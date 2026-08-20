import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve('src/routes/gestao/fichario/+page.svelte'), 'utf8');
const desktopWorkspace = page.slice(
  page.indexOf('/* ── Fichário workspace (desktop) ── */'),
  page.indexOf('/* ── Laptop payment layout ── */')
);

describe('Fichário desktop people list', () => {
  it('keeps short lists at their content height instead of stretching their rows', () => {
    const peopleListRule = desktopWorkspace.match(
      /\.fichario-layout \.people-list\s*\{([\s\S]*?)\n\s*\}/
    )?.[1] || '';

    expect(peopleListRule).toMatch(/align-content:\s*start/);
  });
});
