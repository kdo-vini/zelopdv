import { describe, expect, it } from 'vitest';
import { requiresAdminPin, shouldPromptPinSetup } from '../src/lib/adminPinPrompt.js';

describe('admin PIN setup prompt', () => {
  it('does not prompt when the PIN status is unavailable', () => {
    expect(shouldPromptPinSetup(null, '/gestao/fichario')).toBe(false);
    expect(shouldPromptPinSetup(undefined, '/gestao/fichario')).toBe(false);
  });

  it('prompts only when the API confirms an unset PIN for an owner', () => {
    expect(shouldPromptPinSetup({ enabled: true, configured: true, canSet: true }, '/gestao/fichario')).toBe(false);
    expect(shouldPromptPinSetup({ enabled: true, configured: false, canSet: true }, '/gestao/fichario')).toBe(true);
    expect(shouldPromptPinSetup({ enabled: false, configured: false, canSet: true }, '/gestao/fichario')).toBe(false);
    expect(shouldPromptPinSetup({ enabled: true, configured: false, canSet: false }, '/gestao/fichario')).toBe(false);
    expect(shouldPromptPinSetup({ enabled: true, configured: false, canSet: true }, '/perfil')).toBe(false);
  });

  it('requires the lock only for an active and configured PIN', () => {
    expect(requiresAdminPin({ enabled: true, configured: true })).toBe(true);
    expect(requiresAdminPin({ enabled: false, configured: true })).toBe(false);
    expect(requiresAdminPin({ enabled: true, configured: false })).toBe(false);
    expect(requiresAdminPin(null)).toBe(false);
  });
});
