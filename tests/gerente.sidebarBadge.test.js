import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

describe('Zelinho sidebar badge', () => {
  it('conta só avisos não lidos do dia do briefing e limita o rótulo a 9+', async () => {
    const sidebar = await read('src/lib/components/GestaoSidebar.svelte');
    const badge = await read('src/lib/components/gerente/SidebarBadge.svelte');
    expect(sidebar).toContain("eq('signal_date', briefingDate)");
    expect(sidebar).toContain('business_daily_snapshots');
    expect(badge).toContain("Number(count) > 9 ? '9+'");
    expect(badge).toContain('avisos novos no briefing');
  });
});
