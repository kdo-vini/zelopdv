import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pinSetupModal = readFileSync(resolve('src/lib/components/PinSetupModal.svelte'), 'utf8');
const adminLock = readFileSync(resolve('src/lib/components/AdminLock.svelte'), 'utf8');
const reports = readFileSync(resolve('src/routes/relatorios/+page.svelte'), 'utf8');
const expenses = readFileSync(resolve('src/routes/gestao/despesas/+page.svelte'), 'utf8');

describe('optional admin PIN UI contract', () => {
  it('skips setup through the disable action instead of writing 0000', () => {
    expect(pinSetupModal).toMatch(/action:\s*'disable'/);
    expect(pinSetupModal).not.toMatch(/doSavePin\(['"]0000/);
    expect(pinSetupModal).not.toContain('PIN será definido como');
  });

  it('renders protected pages only after a known PIN status', () => {
    expect(adminLock).toMatch(/pinStatus/);
    expect(adminLock).toMatch(/pinStatus\s*===\s*['"]error['"]/);
    expect(reports).toMatch(/pinStatus/);
    expect(expenses).toMatch(/pinStatus/);
  });
});
