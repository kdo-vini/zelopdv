import { describe, it, expect } from 'vitest';
import { requiredOk, buildPayload, isValidImage } from '../src/lib/profileUtils.js';

describe('profileUtils.requiredOk', () => {
  it('returns false when any required field is missing', () => {
    expect(requiredOk({ nome_exibicao: '', documento: '1', contato: '2', largura_bobina: '80mm' })).toBe(false);
    expect(requiredOk({ nome_exibicao: 'A', documento: '', contato: '2', largura_bobina: '80mm' })).toBe(false);
    expect(requiredOk({ nome_exibicao: 'A', documento: '1', contato: '', largura_bobina: '80mm' })).toBe(false);
    expect(requiredOk({ nome_exibicao: 'A', documento: '1', contato: '2', largura_bobina: '70mm' })).toBe(false);
  });
  it('returns true when all required fields are valid', () => {
    expect(requiredOk({ nome_exibicao: 'A', documento: '1', contato: '2', largura_bobina: '80mm' })).toBe(true);
    expect(requiredOk({ nome_exibicao: 'A', documento: '1', contato: '2', largura_bobina: '58mm' })).toBe(true);
  });
});

describe('profileUtils.buildPayload', () => {
  it('builds payload with defaults and trims values', () => {
    const now = Date.now;
    Date.now = () => 0; // deterministic updated_at
    const payload = buildPayload({
      userId: 'u1',
      nome_exibicao: ' A ',
      documento: ' 123 ',
      contato: ' mail ',
      inscricao_estadual: '',
      endereco: ' ',
      rodape_recibo: '',
      largura_bobina: '80mm',
      logo_url: '',
      pendingLogoUrl: 'http://example/logo.png'
    });
    expect(payload).toMatchObject({
      user_id: 'u1',
      nome_exibicao: 'A',
      documento: '123',
      contato: 'mail',
      inscricao_estadual: null,
      endereco: null,
      rodape_recibo: 'Obrigado pela preferência!',
      largura_bobina: '80mm',
      logo_url: 'http://example/logo.png'
    });
    expect(typeof payload.updated_at).toBe('string');
    Date.now = now;
  });
});

describe('profileUtils.isValidImage', () => {
  it('accepts image types within size limit', () => {
    const file = { type: 'image/png', size: 200_000 };
    expect(isValidImage(file)).toBe(true);
  });
  it('rejects non-image types', () => {
    const file = { type: 'text/plain', size: 10 };
    expect(isValidImage(file)).toBe(false);
  });
  it('rejects overly large files', () => {
    const file = { type: 'image/jpeg', size: 3 * 1024 * 1024 };
    expect(isValidImage(file)).toBe(false);
  });
});
