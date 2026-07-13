import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  clearScreenContext,
  clearSignalContext,
  contextType,
  closeAssistant,
  isOpen,
  openAssistant,
  openAssistantWithContext,
  openAssistantWithSignal,
  screenContext,
  screenContextMatchesLocation,
} from '../src/lib/stores/assistant.js';

beforeEach(() => {
  isOpen.set(false);
  contextType.set('geral');
  clearSignalContext();
  clearScreenContext();
});

describe('assistant context store', () => {
  it('opens with a normalized screen context and selects its data focus', () => {
    expect(openAssistantWithContext({
      source: 'relatorios',
      title: 'Relatorio de vendas',
      route: '/relatorios',
      contextType: 'vendas',
      entity: { type: 'periodo', id: '2026-07', name: 'Julho' },
    })).toBe(true);

    expect(get(isOpen)).toBe(true);
    expect(get(contextType)).toBe('vendas');
    expect(get(screenContext)).toEqual({
      source: 'relatorios',
      title: 'Relatorio de vendas',
      route: '/relatorios',
      contextType: 'vendas',
      entity: { type: 'periodo', id: '2026-07', name: 'Julho' },
    });
  });

  it('rejects incomplete screen context without opening the assistant', () => {
    expect(openAssistantWithContext({ source: 'relatorios', route: '/relatorios' })).toBe(false);
    expect(get(isOpen)).toBe(false);
    expect(get(screenContext)).toBeNull();
  });

  it('maps a gerente signal to its related data focus and clears it together', () => {
    expect(openAssistantWithSignal({ id: 'signal-1', type: 'STOCK_ZERO_WITH_DEMAND' })).toBe(true);
    expect(get(contextType)).toBe('produtos');
    expect(get(screenContext)).toMatchObject({
      source: 'gerente-sinal',
      contextType: 'produtos',
      entity: { type: 'business_signal', id: 'signal-1' },
    });

    clearSignalContext();
    expect(get(screenContext)).toBeNull();
  });

  it('clears context when the panel closes', () => {
    openAssistantWithContext({
      source: 'relatorios',
      title: 'Relatório',
      route: '/relatorios',
      contextType: 'vendas',
    });

    closeAssistant();
    expect(get(isOpen)).toBe(false);
    expect(get(screenContext)).toBeNull();
  });

  it('opens the rail in the general focus after a previous contextual session', () => {
    openAssistantWithContext({
      source: 'relatorios',
      title: 'Relatorio',
      route: '/relatorios',
      contextType: 'vendas',
    });

    closeAssistant();
    openAssistant();
    expect(get(contextType)).toBe('geral');
  });

  it('matches the full route, including query parameters, for screen context', () => {
    const context = { route: '/gestao/gerente/semana?semana=2026-07-06' };

    expect(screenContextMatchesLocation(context, '/gestao/gerente/semana', '?semana=2026-07-06')).toBe(true);
    expect(screenContextMatchesLocation(context, '/gestao/gerente/semana', '?semana=2026-06-29')).toBe(false);
  });
});
