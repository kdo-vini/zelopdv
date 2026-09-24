import { describe, it, expect } from 'vitest';
import { isStaleModuleImportError } from '../src/lib/staleModuleError.js';

describe('isStaleModuleImportError', () => {
  it('detects the Chrome message', () => {
    expect(isStaleModuleImportError(new Error('Failed to fetch dynamically imported module: https://x/y.js'))).toBe(true);
  });

  it('detects the Safari message', () => {
    expect(isStaleModuleImportError(new Error('Importing a module script failed'))).toBe(true);
  });

  it('detects the Firefox message', () => {
    expect(isStaleModuleImportError(new Error('error loading dynamically imported module: https://x/y.js'))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isStaleModuleImportError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isStaleModuleImportError(new Error('TypeError: cannot read property of undefined'))).toBe(false);
  });

  it('handles plain strings', () => {
    expect(isStaleModuleImportError('Failed to fetch dynamically imported module')).toBe(true);
    expect(isStaleModuleImportError('something else')).toBe(false);
  });

  it('handles null and undefined safely', () => {
    expect(isStaleModuleImportError(null)).toBe(false);
    expect(isStaleModuleImportError(undefined)).toBe(false);
  });

  it('handles objects without a message', () => {
    expect(isStaleModuleImportError({})).toBe(false);
    expect(isStaleModuleImportError(42)).toBe(false);
  });
});
