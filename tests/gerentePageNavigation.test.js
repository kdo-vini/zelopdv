import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

describe('gerente page redesign', () => {
  it('usa saudação, faixa do dia, abas e links de navegação', async () => {
    const page = await read('src/routes/gestao/gerente/+page.svelte');
    for (const t of ['buildGreeting', 'computeDayStrip', '<DayStrip', '<GerenteTabs', 'openAssistantWithMessage', 'onQuickAction', 'hasZeloMenuAccess', '{menuAtivo}']) expect(page).toContain(t);
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

  it('mostra a bolha do Zelinho no celular só quando o painel está fechado', async () => {
    const page = await read('src/routes/gestao/gerente/+page.svelte');
    expect(page).toContain('Falar com o Zelinho');
    expect(page).toContain('$isOpen === false');
    expect(page).toContain('MessageCircle');
    expect(page).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('compartilha a mesma faixa de abas em semana e preferências', async () => {
    const tabs = await read('src/lib/components/gerente/GerenteTabs.svelte');
    const semana = await read('src/routes/gestao/gerente/semana/+page.svelte');
    const prefs = await read('src/routes/gestao/gerente/preferencias/+page.svelte');
    for (const t of ['Briefing', 'Ações do Zelinho', 'Histórico', 'Resumo semanal', 'Preferências', 'role="tablist"']) {
      expect(tabs).toContain(t);
    }
    expect(semana).toContain('<GerenteTabs active="semana"');
    expect(semana).not.toContain('BackLink');
    expect(prefs).toContain('<GerenteTabs active="preferencias"');
  });

  it('Buttons do Zelinho usam onclick (Svelte 5), não on:click legado', async () => {
    const files = [
      'src/routes/gestao/gerente/semana/+page.svelte',
      'src/routes/gestao/gerente/preferencias/+page.svelte',
      'src/lib/components/gerente/WeekNav.svelte',
    ];
    for (const file of files) {
      const source = await read(file);
      expect(source).not.toMatch(/<Button[^>]*\son:click/);
      expect(source).toMatch(/<Button[^>]*\sonclick=/);
    }
  });

  it('WhatsApp do resumo semanal dispara via API ZeloChat, sem wa.me', async () => {
    const semana = await read('src/routes/gestao/gerente/semana/+page.svelte');
    expect(semana).toContain("/api/gerente/semana/send-whatsapp");
    expect(semana).not.toContain('wa.me');
    expect(semana).not.toContain('navigator.share');
  });

  it('sinais da semana abrem o histórico com hash do dia', async () => {
    const semana = await read('src/routes/gestao/gerente/semana/+page.svelte');
    expect(semana).toContain('/gestao/gerente?aba=historico#${signal.signal_date}');
  });

  it('marca avisos do briefing como lidos ao abrir e zera o badge', async () => {
    const page = await read('src/routes/gestao/gerente/+page.svelte');
    expect(page).toContain('markBriefingSeen');
    expect(page).toContain('unreadCount.set(0)');
    expect(page).toContain('hasUnreadCritical.set(false)');
  });
});
