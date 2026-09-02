import { describe, expect, it } from 'vitest';
import { buildDailyDigestText, isDigestDue } from '../src/lib/server/intelligence/digest.js';

const snapshot = { snapshot_date: '2026-07-11', receita_bruta: 1240, qtd_vendas: 38, ticket_medio: 32.63 };
const signals = [
  { type: 'REVENUE_BELOW_WEEKDAY_AVG', severity: 'attention', evidence: { revenue_today: 1000, delta_pct: -0.2, n_baseline: 4, weekday: 'sextas', baseline_avg: 1250 } },
  { type: 'STOCK_ZERO_WITH_DEMAND', severity: 'critical', evidence: { nome_produto: 'X-Bacon', dias_com_venda_7d: 4, consumo_diario_medio_7d: 2 } },
];

describe('gerente daily digest', () => {
  it('builds a concise deterministic digest with a business name and link', () => {
    const text = buildDailyDigestText(signals, snapshot, { nome_exibicao: 'Lanchonete da Ana' });
    expect(text).toContain('Lanchonete da Ana');
    expect(text).toContain('R$ 1.240,00');
    expect(text).toContain('zelopdv.com.br/gestao/gerente');
    expect(text.length).toBeLessThanOrEqual(800);
  });

  it('filters muted signal types without silencing the daily snapshot', () => {
    const text = buildDailyDigestText(signals, snapshot, {}, { mutedTypes: ['REVENUE_BELOW_WEEKDAY_AVG'] });
    expect(text).not.toContain('R$ 1.000,00');
    expect(text).toContain('X-Bacon');
    expect(text).toContain('38 vendas');
  });

  it('never fragments or duplicates the link when the body lands just over the length cap', () => {
    // Long narratives push total length into the 800-815 range that used to
    // slice through the middle of the link line itself.
    const longSignals = [
      { type: 'REVENUE_BELOW_WEEKDAY_AVG', severity: 'attention', narrative: 'A'.repeat(300) },
      { type: 'STOCK_ZERO_WITH_DEMAND', severity: 'critical', narrative: 'B'.repeat(300) },
    ];
    const text = buildDailyDigestText(longSignals, snapshot, { nome_exibicao: 'Lanchonete da Ana' });

    expect(text.length).toBeLessThanOrEqual(800);
    expect(text.match(/zelopdv\.com\.br\/gestao\/gerente/g)).toHaveLength(1);
    expect(text.endsWith('Veja os números: https://zelopdv.com.br/gestao/gerente')).toBe(true);
  });

  it('is idempotent by local date and rejects prohibited copy', () => {
    expect(isDigestDue(null, '2026-07-12')).toBe(true);
    expect(isDigestDue('2026-07-11', '2026-07-12')).toBe(true);
    expect(isDigestDue('2026-07-12', '2026-07-12')).toBe(false);
    expect(buildDailyDigestText([], snapshot)).not.toMatch(/lucro|margem|vai acabar/i);
  });
});

import { readDigestPrefs, shouldSendDigest } from '../src/lib/server/intelligence/digest.js';

describe('digest scheduling sem hora', () => {
  it('lê enabled e muted_types ignorando qualquer campo hora legado', () => {
    const prefs = readDigestPrefs({ gerente_prefs: { whatsapp: { enabled: true, hora: 'daily' }, muted_types: ['AVG_TICKET_DOWN'] } });
    expect(prefs).toEqual({ enabled: true, mutedTypes: ['AVG_TICKET_DOWN'] });
  });

  it('envia quando habilitado e ainda não enviou hoje', () => {
    expect(shouldSendDigest({ prefs: { enabled: true }, lastSentDate: '2026-09-01', today: '2026-09-02' })).toBe(true);
  });

  it('não envia quando desabilitado ou já enviado hoje', () => {
    expect(shouldSendDigest({ prefs: { enabled: false }, lastSentDate: null, today: '2026-09-02' })).toBe(false);
    expect(shouldSendDigest({ prefs: { enabled: true }, lastSentDate: '2026-09-02', today: '2026-09-02' })).toBe(false);
  });
});
