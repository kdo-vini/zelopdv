import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

describe('gerente page redesign', () => {
  it('usa saudação, faixa do dia, abas e links de navegação', async () => {
    const page = await read('src/routes/gestao/gerente/+page.svelte');
    for (const t of ['buildGreeting', 'computeDayStrip', '<DayStrip', 'role="tablist"', 'Ações do Zelinho', 'Histórico', 'href="/gestao/gerente/semana"', 'href="/gestao/gerente/preferencias"', 'openAssistantWithMessage', 'onQuickAction']) expect(page).toContain(t);
    expect(page).not.toContain('tracking-[0.2em]');
    expect(page).toContain("select('snapshot_date, receita_bruta, receita_realizada, qtd_vendas, ticket_medio, metrics, computed_at')");
  });

  it('briefing e histórico usam SignalRow e não têm cartão aninhado', async () => {
    const briefing = await read('src/lib/components/gerente/ZelinhoBriefing.svelte');
    const feed = await read('src/lib/components/gerente/SignalFeed.svelte');
    expect(briefing).toContain('SignalRow');
    expect(briefing).not.toContain('SignalCard');
    expect(briefing).not.toContain('DaySnapshotSummary');
    expect(briefing).not.toMatch(/border-top:\s*2px/);
    expect(briefing).toContain('O que pede sua atenção');
    expect(feed).toContain('SignalRow');
    expect(feed).not.toContain('SignalCard');
  });

  it('a store abre o painel com uma mensagem pré-preenchida', async () => {
    const store = await read('src/lib/stores/assistant.js');
    expect(store).toContain('export const prefillMessage');
    expect(store).toContain('export function openAssistantWithMessage');
  });
});
