import { describe, expect, it } from 'vitest';
import {
  isPostHogAllowedPath,
  maskPrivatePath,
  sanitizePostHogEvent,
  shouldDropPostHogEvent,
} from '../src/lib/posthogClient.js';

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

describe('posthogClient: evento de negocio em rota privada', () => {
  // Regressao de 2026-09-14: `before_send` derrubava TUDO fora da area publica,
  // entao `trial_auto_started`, `subscription_checkout_started`,
  // `pix_payment_initiated` e os `gerente_*` eram codigo morto silencioso —
  // 180+ dias sem um unico evento chegar ao PostHog.
  it('deixa passar evento nomeado dentro do produto', () => {
    expect(shouldDropPostHogEvent('gerente_briefing_view', '/gestao/gerente')).toBe(false);
    expect(shouldDropPostHogEvent('gerente_whatsapp_optin', '/gestao/gerente/preferencias')).toBe(false);
    expect(shouldDropPostHogEvent('first_sale_completed', '/app')).toBe(false);
  });

  it('deixa passar $identify e $exception fora da area publica', () => {
    expect(shouldDropPostHogEvent('$identify', '/perfil')).toBe(false);
    expect(shouldDropPostHogEvent('$exception', '/app/mesas/12')).toBe(false);
  });

  it('mata superficie de tela em rota privada', () => {
    for (const evento of ['$pageview', '$pageleave', '$autocapture', '$rageclick', '$web_vitals', '$heatmap']) {
      expect(shouldDropPostHogEvent(evento, '/app')).toBe(true);
    }
  });

  it('nao filtra nada na area publica', () => {
    expect(shouldDropPostHogEvent('$pageview', '/')).toBe(false);
    expect(shouldDropPostHogEvent('$autocapture', '/cadastro')).toBe(false);
  });
});

describe('posthogClient: mascara de path privado', () => {
  it('troca id de rota pelo formato, sem query', () => {
    expect(maskPrivatePath('/app/mesas/12/pagamento')).toBe('/app/mesas/:id/pagamento');
    expect(maskPrivatePath('/app/mesas/7f3a4b2c-1d5e-4a6b-8c9d-0e1f2a3b4c5d')).toBe('/app/mesas/:id');
    expect(maskPrivatePath('/assinatura?token=abc123')).toBe('/assinatura');
  });

  it('preserva rota sem identificador', () => {
    expect(maskPrivatePath('/gestao/produtos')).toBe('/gestao/produtos');
    expect(maskPrivatePath('/')).toBe('/');
  });
});

describe('posthogClient: o evento sai, a tela privada nao', () => {
  it('mascara URL e apaga referrer, inclusive em $set/$set_once irmaos', () => {
    // No CaptureResult do posthog-js `$set` e `$set_once` ficam FORA de
    // `properties` — varrer so `properties` deixaria a URL privada vazar.
    const evento = sanitizePostHogEvent({
      event: 'gerente_briefing_view',
      properties: {
        $current_url: 'https://zelopdv.com.br/app/mesas/42?token=abc',
        $referrer: 'https://zelopdv.com.br/gestao/pessoas',
        signal_count: 3,
      },
      $set: { $initial_current_url: 'https://zelopdv.com.br/app/mesas/42' },
      $set_once: { $initial_referring_domain: 'zelopdv.com.br' },
    }, '/app/mesas/42');

    expect(evento).not.toBeNull();
    expect(evento.properties.$current_url).toBe('/app/mesas/:id');
    expect(evento.properties.$referrer).toBeUndefined();
    expect(evento.$set.$initial_current_url).toBe('/app/mesas/:id');
    expect(evento.$set_once.$initial_referring_domain).toBeUndefined();
    // A carga de negocio e o motivo do evento existir: nao se toca nela.
    expect(evento.properties.signal_count).toBe(3);
  });

  it('derruba superficie de tela em rota privada', () => {
    expect(sanitizePostHogEvent({ event: '$autocapture', properties: {} }, '/app')).toBeNull();
  });

  it('na area publica apenas redige query sensivel, sem apagar referrer', () => {
    const evento = sanitizePostHogEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://zelopdv.com.br/cadastro?email=alguem@example.test',
        $referrer: 'https://www.instagram.com/',
      },
    }, '/cadastro');

    // O encoding do marcador varia (URL API no navegador, regex no fallback);
    // o que a assercao protege e o endereco nao sair do aparelho.
    expect(evento.properties.$current_url).not.toContain('alguem@example.test');
    expect(evento.properties.$current_url).toMatch(/email=(\[|%5B)redacted/);
    expect(evento.properties.$referrer).toBe('https://www.instagram.com/');
  });
});
