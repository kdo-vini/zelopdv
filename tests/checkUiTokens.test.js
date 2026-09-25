import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function runWith(migrated) {
  const dir = mkdtempSync(join(tmpdir(), 'ui-tokens-'));
  const config = join(dir, 'config.json');
  writeFileSync(config, JSON.stringify({ migrated }));
  return spawnSync(process.execPath, ['scripts/check-ui-tokens.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, UI_MIGRATED_CONFIG: config },
  });
}

describe('check:ui design-system guard', () => {
  it('passes files that only use semantic tokens (HTML entities are not colours)', () => {
    const result = runWith(['tests/fixtures/ui-tokens/Clean.svelte']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1 migrated file(s) clean');
  });

  it('flags palette classes, raw white/black, hex and colour functions, but honours ui-allow', () => {
    const result = runWith(['tests/fixtures/ui-tokens/Dirty.svelte']);
    expect(result.status).toBe(1);
    for (const hit of ['bg-slate-800', 'text-sky-400', 'border-red-500/40', 'text-white', '#0EA5E9', 'rgba(']) {
      expect(result.stderr).toContain(hit);
    }
    expect(result.stderr).not.toContain('#fff');
    expect(result.stderr).toContain('6 raw colour/type value(s)');
  });

  it('flags literal type (font-family, font: with a size, text-[Npx], font-mono) but accepts roles and var()', () => {
    const result = runWith(['tests/fixtures/ui-tokens/DirtyType.svelte']);
    expect(result.status).toBe(1);
    for (const rule of ['[text-arbitrary]', '[font-mono]', '[font-family]', '[font-literal]']) {
      expect(result.stderr).toContain(rule);
    }
    expect(result.stderr).toContain('4 raw colour/type value(s)');
    expect(result.stderr).not.toContain('--type-title');
    expect(result.stderr).not.toContain('monospace');
  });

  it('keeps the real migrated list clean', () => {
    const result = spawnSync(process.execPath, ['scripts/check-ui-tokens.mjs'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
