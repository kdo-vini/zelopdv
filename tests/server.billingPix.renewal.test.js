import { describe, expect, it } from 'vitest';
import {
  validatePixCustomerProfile,
  buildPixDescription,
  buildRenewalPixWhatsAppMessage,
  PIX_EXPIRATION_SECONDS,
} from '../src/lib/server/billingPix.js';

describe('validatePixCustomerProfile', () => {
  it('ok com perfil completo e normaliza taxId/phone', () => {
    const r = validatePixCustomerProfile({
      nome_exibicao: 'Loja Teste',
      documento: '529.982.247-25',
      contato: '(11) 99999-9999',
    });
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Loja Teste');
    expect(r.taxId).toBe('52998224725');
    expect(r.phone).toBe('5511999999999');
  });

  it('missing_fields quando falta documento', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: null, contato: '11999999999' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_fields');
  });

  it('invalid_tax_id quando CPF invalido', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: '11111111111', contato: '11999999999' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_tax_id');
  });

  it('invalid_phone quando telefone invalido', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: '52998224725', contato: '123' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_phone');
  });

  it('missing_fields quando perfil null', () => {
    expect(validatePixCustomerProfile(null).code).toBe('missing_fields');
  });
});

describe('buildPixDescription', () => {
  it('usa nome do plano e limita a 37 chars', () => {
    const d = buildPixDescription('pdv');
    expect(d).toContain('ZeloPDV');
    expect(d.length).toBeLessThanOrEqual(37);
  });
  it('fallback Zelo para plano desconhecido', () => {
    expect(buildPixDescription('xxx')).toContain('Zelo');
  });
});

describe('buildRenewalPixWhatsAppMessage', () => {
  it('inclui nome, valor formatado, plano e brCode, sem emoji', () => {
    const msg = buildRenewalPixWhatsAppMessage({
      nome: 'João Silva',
      planName: 'ZeloPDV',
      amountCents: 5900,
      brCode: '00020101-BRCODE-XYZ',
    });
    expect(msg).toContain('João');
    expect(msg).toContain('ZeloPDV');
    expect(msg).toContain('59,00');
    expect(msg).toContain('00020101-BRCODE-XYZ');
    // sem emoji: só ASCII + acentos latinos
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(msg)).toBe(false);
  });
});

describe('PIX_EXPIRATION_SECONDS', () => {
  it('vale 3600', () => {
    expect(PIX_EXPIRATION_SECONDS).toBe(3600);
  });
});
