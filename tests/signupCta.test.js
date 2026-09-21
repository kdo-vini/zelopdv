import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/posthogClient', () => ({
  capturePostHogEvent: vi.fn(() => Promise.resolve(true)),
}));

import { capturePostHogEvent } from '../src/lib/posthogClient.js';
import { getSignupHref, trackSignupCta } from '../src/lib/marketing/signupCta.js';

function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

describe('signupCta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.localStorage = makeLocalStorageStub();
    global.window = {
      location: {
        hostname: 'zelopdv.com.br',
        pathname: '/',
        search: '?utm_source=ig&utm_medium=social&fbclid=abc',
        origin: 'https://zelopdv.com.br',
      },
    };
    global.document = { referrer: '' };
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.window;
    delete global.document;
  });

  it('trackSignupCta dispara marketing_trial_clicked com placement', () => {
    trackSignupCta('hero');
    expect(capturePostHogEvent).toHaveBeenCalledWith('marketing_trial_clicked', { placement: 'hero' });
  });

  it('getSignupHref preserva first-touch UTM no href', () => {
    const href = getSignupHref();
    expect(href).toContain('/cadastro?');
    expect(href).toContain('utm_source=ig');
    expect(href).toContain('utm_medium=social');
    expect(href).toContain('fbclid=abc');
  });

  it('getSignupHref nao troca first-touch por last-touch', () => {
    getSignupHref(); // grava first-touch ig
    global.window.location.search = '?utm_source=google';
    const href = getSignupHref();
    expect(href).toContain('utm_source=ig');
    expect(href).not.toContain('utm_source=google');
  });

  it('getSignupHref aceita extras sem sobrescrever first-touch', () => {
    getSignupHref();
    const href = getSignupHref({ addon: 'mesas', utm_source: 'hack' });
    expect(href).toContain('utm_source=ig');
    expect(href).toContain('addon=mesas');
  });
});
