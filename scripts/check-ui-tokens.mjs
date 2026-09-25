#!/usr/bin/env node
/**
 * Zelo Design System guard (docs/DESIGN_SYSTEM.md → "Regras de código").
 *
 * Files listed in scripts/ui-migrated.json must style colour only through
 * semantic tokens. This fails on, per line:
 *   - Tailwind palette classes   (bg-slate-800, text-sky-400, border-red-500/40 …)
 *   - raw black/white utilities  (text-white, bg-black/20 …) — use ink/surface tokens
 *   - hex colours and rgb()/rgba()/hsl() literals
 * A line may opt out with a trailing `ui-allow: <reason>` comment (reason required).
 * The list grows every migration phase; phase 6 switches it to the whole of src/.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const config = JSON.parse(readFileSync(resolve(ROOT, process.env.UI_MIGRATED_CONFIG || 'scripts/ui-migrated.json'), 'utf8'));

const RULES = [
  { id: 'tw-palette', re: /\b(?:bg|text|border|ring|from|to|via|divide|placeholder|fill|stroke|outline|shadow|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|sky|blue|cyan|indigo|violet|purple|fuchsia|pink|rose|red|orange|amber|yellow|lime|green|emerald|teal)-\d{2,3}(?:\/\d+)?\b/g, hint: 'use a semantic utility (bg-surface-panel, text-ink-muted, border-line, bg-ok-bg …)' },
  { id: 'tw-black-white', re: /\b(?:bg|text|border|ring|divide|from|to|via|fill|stroke)-(?:white|black)(?:\/\d+)?\b/g, hint: 'use text-ink / bg-surface-* / text-action-fg' },
  { id: 'hex', re: /#[0-9a-fA-F]{3,8}\b/g, hint: 'use a token (var(--…) or a semantic utility)' },
  { id: 'color-fn', re: /\b(?:rgba?|hsla?)\(/g, hint: 'use a token; translucent variants belong in src/themes/' },
];

function expand(pattern) {
  // supports "dir/**" (recursive), "dir/*" (one level) and plain file paths
  if (pattern.endsWith('/**')) return walk(join(ROOT, pattern.slice(0, -3)));
  if (pattern.endsWith('/*')) {
    const dir = join(ROOT, pattern.slice(0, -2));
    return existsSync(dir) ? readdirSync(dir).map((f) => join(dir, f)).filter((f) => statSync(f).isFile()) : [];
  }
  const file = join(ROOT, pattern);
  return existsSync(file) ? [file] : [];
}
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [...new Set(config.migrated.flatMap(expand))].filter((f) => /\.(svelte|css|js|ts)$/.test(f));
const problems = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/ui-allow:\s*\S/.test(line)) return;
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.re)) {
        if (rule.id === 'hex' && /&#|#[0-9]{1,3};/.test(line.slice(Math.max(0, match.index - 2), match.index + match[0].length + 1))) continue; // HTML entities
        problems.push(`${relative(ROOT, file)}:${i + 1}  ${match[0]}  [${rule.id}] ${rule.hint}`);
      }
    }
  });
}

if (problems.length) {
  console.error(`check:ui — ${problems.length} raw colour(s) in migrated files:\n`);
  console.error(problems.join('\n'));
  console.error('\nSee docs/DESIGN_SYSTEM.md → "Regras de código".');
  process.exit(1);
}
console.log(`check:ui — ${files.length} migrated file(s) clean.`);
