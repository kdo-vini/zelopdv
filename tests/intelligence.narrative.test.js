import { describe, expect, it, vi } from 'vitest';
import { generateNarratives, templateNarrative } from '../src/lib/server/intelligence/narrative.js';

const types = [
  'REVENUE_BELOW_WEEKDAY_AVG', 'REVENUE_ABOVE_WEEKDAY_AVG', 'AVG_TICKET_DOWN',
  'PRODUCT_SALES_DROP', 'TOP_PRODUCT_CONCENTRATION', 'PAYMENT_MIX_SHIFT',
  'FIADO_ISSUED_SHARE_HIGH', 'CASH_DIFFERENCE_RECURRING', 'STOCK_COVERAGE_LOW',
  'STOCK_ZERO_WITH_DEMAND', 'CAIXA_LEFT_OPEN',
];
const evidence = {
  revenue_today: 100, delta_pct: -0.2, n_baseline: 4, weekday: 'terças', baseline_avg: 125,
  ticket_today: 10, ticket_baseline: 12.5, delta_ticket_pct: -0.2, qtd_today: 10,
  nome_produto: 'X-Bacon', qty_last7: 3, baseline_avg_7d: 5, share_pct: 0.6,
  revenue_product_30d: 600, revenue_total_30d: 1000, forma: 'pix', share_previous: 0.2,
  share_recent: 0.4, shift_pp: 0.2, fiado_issued_30d: 200, revenue_30d: 1000,
  n_with_difference: 4, n_closures_checked: 5, sum_differences: 50, estoque_atual: 2,
  coverage_days: 1.5, consumo_diario_medio: 1.3, dias_com_venda_7d: 3,
  consumo_diario_medio_7d: 1.2, horas_aberto: 18, data_abertura: '2026-07-11',
};

describe('intelligence narratives', () => {
  it('has a deterministic template for every engine signal without prohibited copy', () => {
    for (const type of types) {
      const narrative = templateNarrative({ type, evidence });
      expect(narrative.length).toBeGreaterThan(20);
      expect(narrative).not.toMatch(/lucro|margem|vai acabar/i);
    }
  });

  it('formats payment method IDs humanely in the payment-mix narrative', () => {
    const narrative = templateNarrative({
      type: 'PAYMENT_MIX_SHIFT',
      evidence: { ...evidence, forma: 'vale_refeicao' },
    });

    expect(narrative).toContain('Vale-Refeição');
    expect(narrative).not.toContain('vale_refeicao');
  });

  it('uses templates when LLM is disabled', async () => {
    const create = vi.fn();
    const result = await generateNarratives([{ type: types[0], evidence }], {}, { openai: { chat: { completions: { create } } }, enabled: false });
    expect(create).not.toHaveBeenCalled();
    expect(result.narratives[0].narrative_source).toBe('template');
  });

  it('uses LLM narratives only for a valid response', async () => {
    const openai = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ narratives: ['As vendas ficaram em R$ 100,00.'] }) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) } } };
    const result = await generateNarratives([{ type: types[0], severity: 'attention', evidence }], { nome_exibicao: 'Zelo' }, { openai, enabled: true });
    expect(result.narratives[0]).toEqual({ narrative: 'As vendas ficaram em R$ 100,00.', narrative_source: 'llm' });
    expect(result.usage.prompt_tokens).toBe(10);
  });

  it('falls back for malformed LLM output', async () => {
    const openai = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{}' } }] }) } } };
    const result = await generateNarratives([{ type: types[0], evidence }], {}, { openai, enabled: true });
    expect(result.narratives[0].narrative_source).toBe('template');
  });
});
