import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/posthogClient', () => ({ capturePostHogEvent: vi.fn() }));

const { observeSectionViews, SECTION_VIEWED_EVENT } = await import('../src/lib/marketing/sectionViews.js');

let observers = [];

class FakeObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = new Set();
    observers.push(this);
  }
  observe(el) { this.targets.add(el); }
  unobserve(el) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); }
  fire(el, isIntersecting = true) { this.callback([{ target: el, isIntersecting }]); }
}

function makeSection(name) {
  return { getAttribute: (attr) => (attr === 'data-track-section' ? name : null) };
}

function makeRoot(sections) {
  return { querySelectorAll: () => sections };
}

beforeEach(() => {
  observers = [];
  globalThis.IntersectionObserver = FakeObserver;
});

afterEach(() => {
  delete globalThis.IntersectionObserver;
});

describe('observeSectionViews', () => {
  it('dispara uma vez por seção com ordem e total', () => {
    const hero = makeSection('hero');
    const pricing = makeSection('pricing');
    const capture = vi.fn();
    observeSectionViews(makeRoot([hero, pricing]), { page: 'home', capture });

    const [observer] = observers;
    observer.fire(pricing);
    observer.fire(pricing);
    observer.fire(hero, false);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(SECTION_VIEWED_EVENT, {
      section: 'pricing',
      order: 2,
      total_sections: 2,
      page: 'home',
    });
    expect(observer.targets.has(pricing)).toBe(false);
  });

  it('é inofensivo sem IntersectionObserver ou sem seções', () => {
    const capture = vi.fn();
    expect(typeof observeSectionViews(makeRoot([]), { capture })).toBe('function');
    delete globalThis.IntersectionObserver;
    expect(typeof observeSectionViews(makeRoot([makeSection('hero')]), { capture })).toBe('function');
    expect(capture).not.toHaveBeenCalled();
  });
});
