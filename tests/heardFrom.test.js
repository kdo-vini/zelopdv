import { describe, expect, it } from 'vitest';
import { HEARD_FROM_OPTIONS, buildHeardFromPayload, isValidHeardFrom } from '../src/lib/attribution/heardFrom.js';

describe('HEARD_FROM_OPTIONS', () => {
  it('tem as opções exigidas com id e label', () => {
    const ids = HEARD_FROM_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      'chatgpt_ia', 'google', 'instagram_tiktok', 'youtube', 'indicacao', 'ifood', 'outro',
    ]);
    for (const option of HEARD_FROM_OPTIONS) {
      expect(option.label).toBeTruthy();
    }
  });
});

describe('isValidHeardFrom', () => {
  it('aceita ids do catálogo', () => {
    expect(isValidHeardFrom('chatgpt_ia')).toBe(true);
    expect(isValidHeardFrom('outro')).toBe(true);
  });

  it('rejeita ids fora do catálogo e entradas inválidas', () => {
    expect(isValidHeardFrom('facebook_ads')).toBe(false);
    expect(isValidHeardFrom('')).toBe(false);
    expect(isValidHeardFrom(null)).toBe(false);
    expect(isValidHeardFrom(undefined)).toBe(false);
    expect(isValidHeardFrom(42)).toBe(false);
  });
});

describe('buildHeardFromPayload', () => {
  it('monta o payload com heard_from e heard_from_at', () => {
    const payload = buildHeardFromPayload('chatgpt_ia', '2026-09-23T12:00:00.000Z');
    expect(payload).toEqual({ heard_from: 'chatgpt_ia', heard_from_at: '2026-09-23T12:00:00.000Z' });
  });

  it('devolve null para id inválido, sem gravar nada', () => {
    expect(buildHeardFromPayload('invalido')).toBeNull();
  });
});
