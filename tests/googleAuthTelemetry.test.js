import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/lib/components/GoogleAuthButton.svelte'),
  'utf8'
);

describe('GoogleAuthButton login telemetry', () => {
  it('emite login_failed com código sanitizado somente na tela de login', () => {
    expect(source).toContain("capturePostHogEvent('login_failed'");
    expect(source).toContain("method: 'google'");
    expect(source).toContain('error_code: mapLoginErrorToCode(err)');
    expect(source).toMatch(/if \(isLoginSurface\) \{\s*void capturePostHogEvent\('login_failed'/);
  });
});
