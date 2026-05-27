import { describe, expect, it, beforeEach } from 'vitest';

import {
  buildRateLimitKey,
  consumeRateLimit,
  normalizeEmail,
  resetRateLimitStoreForTests,
} from '../src/lib/server/rateLimit.js';

beforeEach(() => {
  resetRateLimitStoreForTests();
});

describe('server/rateLimit', () => {
  it('normaliza email e compoe chaves previsiveis', () => {
    expect(normalizeEmail('  Teste@Email.COM ')).toBe('teste@email.com');
    expect(buildRateLimitKey('auth', 'login', 'email', 'Teste@Email.COM')).toBe('auth:login:email:teste@email.com');
  });

  it('bloqueia quando excede o limite dentro da janela', () => {
    const now = 1_000;
    const config = { key: 'auth:login:ip:1.2.3.4', limit: 2, windowMs: 60_000 };

    expect(consumeRateLimit({ ...config, now }).ok).toBe(true);
    expect(consumeRateLimit({ ...config, now: now + 1 }).ok).toBe(true);

    const blocked = consumeRateLimit({ ...config, now: now + 2 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('reinicia a contagem apos a expiracao da janela', () => {
    const config = { key: 'auth:signup:ip:1.2.3.4', limit: 1, windowMs: 1_000 };

    expect(consumeRateLimit({ ...config, now: 0 }).ok).toBe(true);
    expect(consumeRateLimit({ ...config, now: 100 }).ok).toBe(false);
    expect(consumeRateLimit({ ...config, now: 1_100 }).ok).toBe(true);
  });
});
