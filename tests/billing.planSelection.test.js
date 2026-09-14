import { describe, expect, it } from 'vitest';
import {
  entitlementsFromSubscription,
  lostEntitlements,
  resolveEntitlements,
  resolveSelection,
  selectionPrice,
} from '../src/lib/billing/planSelection.js';

describe('resolveSelection', () => {
  it('keeps an add-on the plan sells', () => {
    expect(resolveSelection({ planTier: 'pdv', desired: { menu: true } }))
      .toEqual({ addons: { mesas: false, acessos: false, menu: true }, suppressed: [] });
  });

  it('suppresses instead of erasing what the plan does not sell', () => {
    const { addons, suppressed } = resolveSelection({ planTier: 'bundle', desired: { menu: true } });
    expect(addons.menu).toBe(false);
    expect(suppressed).toEqual(['menu']);
  });

  // Regressão do bug relatado pelo FullBuster Burger: pdv+ZeloMenu (R$99) ->
  // bundle -> pdv voltava a R$59 com o ZeloMenu silenciosamente desmarcado.
  it('restores the add-on when the customer returns to a plan that sells it', () => {
    const desired = { menu: true };
    expect(selectionPrice({ planTier: 'pdv', desired })).toBe(99);
    expect(selectionPrice({ planTier: 'bundle', desired })).toBe(198);
    expect(selectionPrice({ planTier: 'pdv', desired })).toBe(99);
  });

  it('prices mesas the same way across the chat detour', () => {
    const desired = { mesas: true };
    expect(selectionPrice({ planTier: 'pdv', desired })).toBe(89);
    expect(selectionPrice({ planTier: 'chat', desired })).toBe(149);
    expect(selectionPrice({ planTier: 'pdv', desired })).toBe(89);
  });

  it('returns an empty selection for an unknown plan', () => {
    expect(resolveSelection({ planTier: 'nope', desired: { menu: true } }))
      .toEqual({ addons: { mesas: false, acessos: false, menu: false }, suppressed: [] });
    expect(selectionPrice({ planTier: 'nope', desired: { menu: true } })).toBe(0);
  });
});

describe('entitlements', () => {
  it('counts ZeloMenu as kept when the plan already includes it', () => {
    expect(resolveEntitlements('bundle', { menu: false }).menu).toBe(true);
    expect(resolveEntitlements('chat', { menu: false }).menu).toBe(true);
    expect(resolveEntitlements('pdv', { menu: false }).menu).toBe(false);
    expect(resolveEntitlements('pdv', { menu: true }).menu).toBe(true);
  });

  it('ignores add-on flags the plan cannot honour', () => {
    expect(resolveEntitlements('chat', { mesas: true, acessos: true }))
      .toMatchObject({ mesas: false, acessos: false });
  });

  it('reads the persisted subscription row', () => {
    expect(entitlementsFromSubscription({
      plan_tier: 'pdv', has_zelo_menu: true, has_mesas_addon: false, has_acessos_addon: false,
    })).toMatchObject({ pdv: true, menu: true, mesas: false, chat: false });
  });

  it('flags ZeloMenu as lost when a pdv checkout drops the add-on', () => {
    const before = entitlementsFromSubscription({ plan_tier: 'pdv', has_zelo_menu: true });
    const after = resolveEntitlements('pdv', { menu: false });
    expect(lostEntitlements(before, after)).toEqual(['menu']);
  });

  it('does not flag ZeloMenu as lost when moving to a plan that includes it', () => {
    const before = entitlementsFromSubscription({ plan_tier: 'pdv', has_zelo_menu: true });
    const after = resolveEntitlements('bundle', { menu: false });
    expect(lostEntitlements(before, after)).toEqual([]);
  });

  it('flags ZeloPDV as lost when a pdv customer moves to chat-only', () => {
    const before = entitlementsFromSubscription({ plan_tier: 'pdv', has_mesas_addon: true });
    const after = resolveEntitlements('chat', {});
    expect(lostEntitlements(before, after)).toEqual(['pdv', 'mesas']);
  });
});
