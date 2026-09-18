import { describe, it, expect } from 'vitest';
import { operationalProfileOk, billingProfileOk, buildPayload, isValidImage } from '../src/lib/profileUtils.js';

// 2026-09-15: `requiredOk` foi partido em dois contratos. Ele exigia CPF/CNPJ e
// largura de bobina pra deixar alguem ABRIR O CAIXA — era o muro que segurava
// 26% dos cadastros. Ver docs/projects/onboarding-dois-passos.md.
describe('profileUtils.operationalProfileOk', () => {
  it('exige apenas nome e contato pra operar', () => {
    expect(operationalProfileOk({ nome_exibicao: 'A', contato: '11999999999' })).toBe(true);
    expect(operationalProfileOk({ nome_exibicao: '', contato: '11999999999' })).toBe(false);
    expect(operationalProfileOk({ nome_exibicao: 'A', contato: '' })).toBe(false);
  });

  it('nao exige CPF nem largura de bobina', () => {
    // O caso que o muro antigo barrava: quer vender, ainda nao tem CPF cadastrado.
    expect(operationalProfileOk({ nome_exibicao: 'Lanchonete do Joao', contato: '11999999999', documento: null })).toBe(true);
    expect(operationalProfileOk({ nome_exibicao: 'A', contato: '11999999999', largura_bobina: 'pdf' })).toBe(true);
  });

  it('checa contato por presenca, nao por validade', () => {
    // Apertar aqui expulsaria pro wizard toda conta existente cujo telefone
    // nao normaliza. A validacao forte vive na entrada, no wizard.
    expect(operationalProfileOk({ nome_exibicao: 'A', contato: '2' })).toBe(true);
  });
});

describe('profileUtils.billingProfileOk', () => {
  it('exige CPF ou CNPJ valido', () => {
    expect(billingProfileOk({ documento: '52998224725' })).toBe(true);
    expect(billingProfileOk({ documento: '' })).toBe(false);
    expect(billingProfileOk({ documento: '11111111111' })).toBe(false);
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

  it('stores phone contacts in canonical WhatsApp format when possible', () => {
    const payload = buildPayload({
      userId: 'u1',
      nome_exibicao: 'Loja',
      documento: '52998224725',
      contato: '+55 11 99999-9999',
      largura_bobina: '80mm',
    });

    expect(payload.contato).toBe('5511999999999');
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
