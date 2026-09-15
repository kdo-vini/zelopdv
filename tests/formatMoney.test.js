import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyNumber } from '../src/lib/formatMoney.js';

describe('formatMoney — formatação pt-BR para exibição', () => {
  it('formata valores com milhar e vírgula decimal', () => {
    expect(formatMoney(1234.56)).toBe('R$ 1.234,56');
    expect(formatMoney(0)).toBe('R$ 0,00');
    expect(formatMoney(25)).toBe('R$ 25,00');
  });

  it('valor inválido cai para R$ 0,00', () => {
    expect(formatMoney(NaN)).toBe('R$ 0,00');
    expect(formatMoney(undefined)).toBe('R$ 0,00');
    expect(formatMoney(null)).toBe('R$ 0,00');
    expect(formatMoney('abc')).toBe('R$ 0,00');
  });

  it('não usa espaço não separável (U+00A0) entre "R$" e o número', () => {
    expect(formatMoney(10)).not.toMatch(/ /);
  });
});

describe('formatMoneyNumber — mesma formatação sem o prefixo "R$"', () => {
  it('formata o número puro', () => {
    expect(formatMoneyNumber(1234.56)).toBe('1.234,56');
    expect(formatMoneyNumber(0)).toBe('0,00');
  });

  it('valor inválido cai para 0,00', () => {
    expect(formatMoneyNumber(NaN)).toBe('0,00');
    expect(formatMoneyNumber(undefined)).toBe('0,00');
  });
});
