import { describe, expect, it } from 'vitest';
import { parsePrecoInput } from '../src/lib/parsePrecoInput.js';

describe('parsePrecoInput — parser puro do campo de preço do ModalNovoProduto', () => {
  it('vazio, espaço, null e undefined são "empty" (não erro por si só)', () => {
    for (const raw of ['', '   ', null, undefined]) {
      const result = parsePrecoInput(raw);
      expect(result.ok).toBe(false);
      expect(result.empty).toBe(true);
      expect(result.value).toBe(null);
    }
  });

  it('aceita vírgula como separador decimal', () => {
    expect(parsePrecoInput('25,00')).toEqual({ ok: true, empty: false, value: 25 });
    expect(parsePrecoInput('1,5')).toEqual({ ok: true, empty: false, value: 1.5 });
  });

  it('aceita ponto como separador decimal', () => {
    expect(parsePrecoInput('25.00')).toEqual({ ok: true, empty: false, value: 25 });
    expect(parsePrecoInput('0.99')).toEqual({ ok: true, empty: false, value: 0.99 });
  });

  it('aceita inteiro sem separador', () => {
    expect(parsePrecoInput('25')).toEqual({ ok: true, empty: false, value: 25 });
    expect(parsePrecoInput('0')).toEqual({ ok: true, empty: false, value: 0 });
  });

  it('texto inválido não é "empty", é erro de parse', () => {
    for (const raw of ['abc', '25,999', '-5', '5-', '..', '1,2,3', 'R$ 25']) {
      const result = parsePrecoInput(raw);
      expect(result.ok).toBe(false);
      expect(result.empty).toBe(false);
      expect(result.value).toBe(null);
    }
  });

  it('espaços nas pontas são ignorados', () => {
    expect(parsePrecoInput('  25,50  ')).toEqual({ ok: true, empty: false, value: 25.5 });
  });
});
