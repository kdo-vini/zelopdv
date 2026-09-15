import { describe, expect, it } from 'vitest';
import { deriveLoginRedirectFrom, mapLoginErrorToCode } from '../src/lib/loginTelemetry.js';

describe('deriveLoginRedirectFrom', () => {
  it('devolve null sem query', () => {
    expect(deriveLoginRedirectFrom(new URLSearchParams(''))).toBeNull();
  });

  it('devolve null para input invalido', () => {
    expect(deriveLoginRedirectFrom(null)).toBeNull();
    expect(deriveLoginRedirectFrom(undefined)).toBeNull();
  });

  it('mascara o path de ?redirect= sem expor query nem token', () => {
    const params = new URLSearchParams('?redirect=%2Fapp%2Fmesas%2F7f3a1b2c-1111-2222-3333-444455556666%3Ftoken%3Dsecreto');
    expect(deriveLoginRedirectFrom(params)).toBe('/app/mesas/:id');
  });

  it('aceita redirectTo e next como aliases', () => {
    expect(deriveLoginRedirectFrom(new URLSearchParams('?redirectTo=/gestao/produtos'))).toBe('/gestao/produtos');
    expect(deriveLoginRedirectFrom(new URLSearchParams('?next=/relatorios'))).toBe('/relatorios');
  });

  it('devolve msg prefixado quando nao ha redirect', () => {
    expect(deriveLoginRedirectFrom(new URLSearchParams('?msg=session_expired'))).toBe('msg:session_expired');
    expect(deriveLoginRedirectFrom(new URLSearchParams('?msg=deletion_scheduled'))).toBe('msg:deletion_scheduled');
  });

  it('prioriza redirect sobre msg quando os dois existem', () => {
    expect(deriveLoginRedirectFrom(new URLSearchParams('?redirect=/app&msg=session_expired'))).toBe('/app');
  });
});

describe('mapLoginErrorToCode', () => {
  it('sem erro devolve unknown', () => {
    expect(mapLoginErrorToCode()).toBe('unknown');
    expect(mapLoginErrorToCode({})).toBe('unknown');
  });

  it('reconhece rate limit por status ou por code, mesmo com mensagem generica', () => {
    expect(mapLoginErrorToCode({ status: 429, message: 'Muitas tentativas. Aguarde um instante e tente novamente.' })).toBe('rate_limited');
    expect(mapLoginErrorToCode({ code: 'rate_limited', message: 'algo qualquer' })).toBe('rate_limited');
  });

  it('reconhece credenciais invalidas do supabase', () => {
    expect(mapLoginErrorToCode({ message: 'Invalid login credentials' })).toBe('invalid_credentials');
    expect(mapLoginErrorToCode({ message: 'invalid login credentials' })).toBe('invalid_credentials');
  });

  it('reconhece email nao confirmado', () => {
    expect(mapLoginErrorToCode({ message: 'Email not confirmed' })).toBe('email_not_confirmed');
  });

  it('reconhece falha de rede em variantes de browser distintas', () => {
    expect(mapLoginErrorToCode({ message: 'Failed to fetch' })).toBe('network');
    expect(mapLoginErrorToCode({ message: 'Load failed' })).toBe('network');
    expect(mapLoginErrorToCode({ message: 'NetworkError when attempting to fetch resource.' })).toBe('network');
    expect(mapLoginErrorToCode({ message: 'The operation timed out.' })).toBe('network');
  });

  it('cai em unknown para mensagem nao mapeada', () => {
    expect(mapLoginErrorToCode({ message: 'Configuração do Supabase ausente.' })).toBe('unknown');
  });
});
