import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

it('keeps optional offline setup in Profile instead of a permanent operational button', () => {
  const status = read('../src/lib/components/OfflineStatus.svelte');
  const profile = read('../src/routes/perfil/+page.svelte');
  expect(status).not.toContain('class="offline-entry"');
  expect(profile).toContain("import OfflineCenter from '$lib/components/OfflineCenter.svelte'");
  expect(profile).toContain('Operação offline');
  expect(profile).toContain('Configurar neste aparelho');
});
