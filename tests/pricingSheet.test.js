import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARGEM_DESEJADA,
  STATUS_LABELS,
  computeRow,
  formatCurrencyInput,
  formatMarkup,
  formatPercent,
  parseCurrencyInput,
  summarize,
} from '../src/lib/tools/pricingSheet.js';

describe('computeRow', () => {
  it('custo 10, venda 25, meta 60% → na meta (CMV 40%, margem 60%)', () => {
    const row = computeRow({ custo: 10, venda: 25, margemDesejada: 60 });
    expect(row).toEqual({
      lucro: 15,
      margem: 60,
      cmv: 40,
      markup: 2.5,
      sugerido: 25,
      diferenca: 0,
      status: 'ok',
      meta: 60,
    });
  });

  it('subir o custo para 12 → abaixo da meta, sugerido 30', () => {
    const row = computeRow({ custo: 12, venda: 25, margemDesejada: 60 });
    expect(row.margem).toBe(52);
    expect(row.cmv).toBe(48);
    expect(row.lucro).toBe(13);
    expect(row.markup).toBe(2.08);
    expect(row.sugerido).toBe(30);
    expect(row.diferenca).toBe(5);
    expect(row.status).toBe('abaixo');
  });

  it('sem margemDesejada usa o padrão de 60%', () => {
    const row = computeRow({ custo: 12, venda: 25 });
    expect(row.meta).toBe(DEFAULT_MARGEM_DESEJADA);
    expect(row.status).toBe('abaixo');
  });

  it('custo 0 é um custo válido (item gratuito), não "faltando"', () => {
    const row = computeRow({ custo: 0, venda: 10, margemDesejada: 60 });
    expect(row.lucro).toBe(10);
    expect(row.margem).toBe(100);
    expect(row.cmv).toBe(0);
    expect(row.markup).toBeNull();
    expect(row.sugerido).toBe(0);
    expect(row.diferenca).toBe(-10);
    expect(row.status).toBe('ok');
  });

  it('venda 0 é inválida: status incompleto mesmo com custo presente', () => {
    const row = computeRow({ custo: 5, venda: 0, margemDesejada: 60 });
    expect(row.margem).toBeNull();
    expect(row.cmv).toBeNull();
    expect(row.lucro).toBe(-5);
    expect(row.sugerido).toBe(12.5);
    expect(row.diferenca).toBe(12.5);
    expect(row.status).toBe('incompleto');
  });

  it('custo ausente (null) → tudo que depende de custo fica null', () => {
    const row = computeRow({ custo: null, venda: 20, margemDesejada: 60 });
    expect(row.lucro).toBeNull();
    expect(row.margem).toBeNull();
    expect(row.cmv).toBeNull();
    expect(row.markup).toBeNull();
    expect(row.sugerido).toBeNull();
    expect(row.diferenca).toBeNull();
    expect(row.status).toBe('incompleto');
  });

  it('venda ausente (undefined) → sugerido ainda calcula a partir do custo', () => {
    const row = computeRow({ custo: 10, venda: undefined, margemDesejada: 60 });
    expect(row.lucro).toBeNull();
    expect(row.margem).toBeNull();
    expect(row.cmv).toBeNull();
    expect(row.markup).toBeNull();
    expect(row.sugerido).toBe(25);
    expect(row.diferenca).toBeNull();
    expect(row.status).toBe('incompleto');
  });

  it('meta 0%: qualquer margem positiva já está "ok"', () => {
    const row = computeRow({ custo: 10, venda: 15, margemDesejada: 0 });
    expect(row.meta).toBe(0);
    expect(row.margem).toBe(33.3);
    expect(row.sugerido).toBe(10);
    expect(row.status).toBe('ok');
  });

  it('meta 0%: margem negativa continua prejuízo mesmo com meta baixa', () => {
    const row = computeRow({ custo: 15, venda: 10, margemDesejada: 0 });
    expect(row.margem).toBe(-50);
    expect(row.status).toBe('prejuizo');
  });

  it('meta 99%: margem igual à meta é "ok" (limite inclusivo)', () => {
    const row = computeRow({ custo: 10, venda: 1000, margemDesejada: 99 });
    expect(row.margem).toBe(99);
    expect(row.sugerido).toBe(1000);
    expect(row.status).toBe('ok');
  });

  it('meta 99%: margem um pouco abaixo fica "abaixo"', () => {
    const row = computeRow({ custo: 10, venda: 900, margemDesejada: 99 });
    expect(row.margem).toBe(98.9);
    expect(row.sugerido).toBe(1000);
    expect(row.diferenca).toBe(100);
    expect(row.status).toBe('abaixo');
  });

  it('arredonda margem, CMV, markup e sugerido com casas corretas', () => {
    const row = computeRow({ custo: 7, venda: 23, margemDesejada: 60 });
    expect(row.margem).toBe(69.6);
    expect(row.cmv).toBe(30.4);
    expect(row.lucro).toBe(16);
    expect(row.markup).toBe(3.29);
    expect(row.sugerido).toBe(17.5);
    expect(row.diferenca).toBe(-5.5);
    expect(row.status).toBe('ok');
  });

  it('margem <= 0 é sempre prejuízo, mesmo com meta alta', () => {
    const row = computeRow({ custo: 20, venda: 15, margemDesejada: 60 });
    expect(row.margem).toBe(-33.3);
    expect(row.status).toBe('prejuizo');
  });
});

describe('STATUS_LABELS', () => {
  it('cobre os quatro status possíveis', () => {
    expect(STATUS_LABELS).toEqual({
      ok: 'Na meta',
      abaixo: 'Abaixo da meta',
      prejuizo: 'Prejuízo',
      incompleto: 'Falta custo ou preço',
    });
  });
});

describe('summarize', () => {
  it('agrega total, médias (só linhas completas) e contagens por status', () => {
    const rows = [
      { custo: 10, venda: 25, margemDesejada: 60 }, // ok, margem 60, cmv 40
      { custo: 12, venda: 25, margemDesejada: 60 }, // abaixo, margem 52, cmv 48
      { custo: 20, venda: 15, margemDesejada: 60 }, // prejuizo, margem -33.3, cmv 133.3
      { custo: null, venda: 20, margemDesejada: 60 }, // incompleto
    ];

    const summary = summarize(rows);

    expect(summary.total).toBe(4);
    expect(summary.completos).toBe(3);
    expect(summary.margemMedia).toBe(26.2);
    expect(summary.cmvMedio).toBe(73.8);
    expect(summary.abaixoDaMeta).toBe(1);
    expect(summary.emPrejuizo).toBe(1);
  });

  it('lista vazia → tudo zero/null sem quebrar', () => {
    expect(summarize([])).toEqual({
      total: 0,
      completos: 0,
      margemMedia: null,
      cmvMedio: null,
      abaixoDaMeta: 0,
      emPrejuizo: 0,
    });
  });
});

describe('parseCurrencyInput', () => {
  it('trata dígitos digitados como centavos', () => {
    expect(parseCurrencyInput('1234')).toBe(12.34);
    expect(parseCurrencyInput('')).toBe(0);
    expect(parseCurrencyInput('12a34')).toBe(12.34);
    expect(parseCurrencyInput('0')).toBe(0);
  });
});

describe('formatCurrencyInput', () => {
  it('formata em pt-BR sem "R$"', () => {
    expect(formatCurrencyInput(12.34)).toBe('12,34');
    expect(formatCurrencyInput(1234.5)).toBe('1.234,50');
    expect(formatCurrencyInput(null)).toBe('');
    expect(formatCurrencyInput(NaN)).toBe('');
  });
});

describe('formatPercent', () => {
  it('formata percentual em pt-BR, sem casa decimal desnecessária', () => {
    expect(formatPercent(40)).toBe('40%');
    expect(formatPercent(52.5)).toBe('52,5%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatMarkup', () => {
  it('formata markup em pt-BR com "×"', () => {
    expect(formatMarkup(2.5)).toBe('2,5×');
    expect(formatMarkup(2)).toBe('2×');
    expect(formatMarkup(null)).toBe('—');
  });
});
