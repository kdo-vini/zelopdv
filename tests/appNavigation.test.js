import { describe, expect, it } from 'vitest';
import {
  appNavigationSections,
  getActiveNavigationItem,
  getActiveNavigationSectionId,
  getVisibleNavigationSections,
  isNavigationItemActive,
} from '../src/lib/navigation/appNavigation.js';

const ownerContext = (addonFlags = {}) => ({
  accessLoaded: true,
  addonFlags,
  isSubUser: false,
  permissions: {},
});

function section(id, context = ownerContext()) {
  return getVisibleNavigationSections(context).find((candidate) => candidate.id === id);
}

describe('app navigation configuration', () => {
  it('exposes exactly the five requested mobile sections in order', () => {
    expect(appNavigationSections.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'pdv', label: 'PDV' },
      { id: 'gestao', label: 'Gestão' },
      { id: 'financeiro', label: 'Financeiro' },
      { id: 'outros', label: 'Outros' },
      { id: 'perfil', label: 'Perfil' },
    ]);
  });

  it('keeps a basic ZeloPDV owner limited to Frente de Caixa in PDV', () => {
    expect(section('pdv').items.map((item) => item.label)).toEqual(['Frente de Caixa']);
  });

  it('reveals contracted PDV modules through the existing entitlement flags', () => {
    expect(section('pdv', ownerContext({ mesas: true })).items.map((item) => item.label)).toEqual([
      'Frente de Caixa',
      'Mesas',
    ]);

    expect(section('pdv', ownerContext({ orderingReview: true, kitchenQueue: true })).items.map((item) => item.label)).toEqual([
      'Frente de Caixa',
      'Pedidos',
      'Cozinha',
    ]);
  });

  it('preserves sub-user permissions and hides unauthorized financial pages', () => {
    const context = {
      accessLoaded: true,
      addonFlags: {},
      isSubUser: true,
      permissions: {
        'pdv.acessar': true,
        'caixa.ver': true,
        'fiado.visualizar': false,
        'despesas.visualizar': false,
        'relatorios.ver': false,
      },
    };

    expect(section('financeiro', context).items.map((item) => item.label)).toEqual(['Fechar Caixa']);
    expect(section('gestao', context).items.some((item) => item.id === 'zelinho-gerente')).toBe(false);
    expect(section('outros', context).items.some((item) => item.label === 'Extensões')).toBe(false);
  });

  it('shows Zelinho Gerente to sub-users with the existing reports permission', () => {
    const context = {
      accessLoaded: true,
      addonFlags: {},
      isSubUser: true,
      permissions: { 'relatorios.ver': true },
    };
    expect(section('gestao', context).items.find((item) => item.id === 'zelinho-gerente')).toMatchObject({
      requiredPermission: 'relatorios.ver',
    });
  });

  it('keeps support inside Outros and the Zelinho badge dynamic', () => {
    expect(section('outros').items.at(-1)).toMatchObject({ label: 'Suporte', action: 'support' });
    const zelinho = section('gestao').items.find((item) => item.id === 'zelinho-gerente');
    expect(zelinho.badge).toBe('gerente');
    expect(zelinho).not.toHaveProperty('badgeCount');
  });

  it('places Relatórios in Financeiro for desktop and mobile consumers', () => {
    expect(section('financeiro').items.find((item) => item.id === 'relatorios')).toMatchObject({
      href: '/relatorios',
      requiredPermission: 'relatorios.ver',
    });
    expect(section('outros').items.some((item) => item.id === 'relatorios')).toBe(false);
  });
});

describe('active navigation resolution', () => {
  it.each([
    ['/app', 'pdv', 'frente-caixa'],
    ['/app/mesas/12', 'pdv', 'mesas'],
    ['/app/pedidos/cozinha', 'pdv', 'cozinha'],
    ['/gestao/produtos/123/editar', 'gestao', 'produtos'],
    ['/gestao/nova-rota', 'gestao', null],
    ['/gestao/despesas/2026-07', 'financeiro', 'despesas'],
    ['/relatorios/vendas', 'financeiro', 'relatorios'],
    ['/perfil', 'perfil', 'meu-perfil'],
    ['/assinatura', 'perfil', null],
  ])('maps %s to one section and the most specific item', (pathname, sectionId, itemId) => {
    expect(getActiveNavigationSectionId(pathname)).toBe(sectionId);
    expect(getActiveNavigationItem(pathname)?.id || null).toBe(itemId);
  });

  it('never marks Pedidos and Cozinha active together', () => {
    const pdvItems = appNavigationSections.find((candidate) => candidate.id === 'pdv').items;
    const active = pdvItems.filter((item) => isNavigationItemActive(item, '/app/pedidos/cozinha/123'));
    expect(active.map((item) => item.id)).toEqual(['cozinha']);
  });
});
