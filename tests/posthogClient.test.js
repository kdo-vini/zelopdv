import { describe, expect, it } from 'vitest';
import { isPostHogAllowedPath } from '../src/lib/posthogClient.js';

describe('posthogClient route allowlist', () => {
  it('permite paginas publicas externas do funil', () => {
    expect(isPostHogAllowedPath('/')).toBe(true);
    expect(isPostHogAllowedPath('/para-lanchonetes')).toBe(true);
    expect(isPostHogAllowedPath('/vs-saipos')).toBe(true);
    expect(isPostHogAllowedPath('/blog/como-calcular-lucro-real-lanchonete')).toBe(true);
    expect(isPostHogAllowedPath('/cadastro')).toBe(true);
    expect(isPostHogAllowedPath('/contato')).toBe(true);
  });

  it('bloqueia onboarding, billing, callback OAuth e areas internas', () => {
    expect(isPostHogAllowedPath('/perfil')).toBe(false);
    expect(isPostHogAllowedPath('/assinatura')).toBe(false);
    expect(isPostHogAllowedPath('/auth/callback')).toBe(false);
    expect(isPostHogAllowedPath('/app')).toBe(false);
    expect(isPostHogAllowedPath('/gestao/produtos')).toBe(false);
    expect(isPostHogAllowedPath('/relatorios')).toBe(false);
    expect(isPostHogAllowedPath('/ferramentas/precificacao')).toBe(false);
  });
});
