import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve('supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

function executableSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

describe('catalog visibility separation', () => {
  it('does not derive either channel from ocultar_no_pdv in executable migrations', () => {
    const sourceColumn = '(?:[a-z_][a-z0-9_]*\\.)?ocultar_no_pdv';
    const targetColumn = '(?:[a-z_][a-z0-9_]*\\.)?(?:visivel_online|pausado_manualmente)';
    const forbiddenAssignments = [
      new RegExp(`${targetColumn}\\s*=\\s*(?:coalesce\\s*\\(\\s*)?${sourceColumn}`, 'i'),
      new RegExp(`${sourceColumn}\\s*=\\s*(?:coalesce\\s*\\(\\s*)?${targetColumn}`, 'i'),
    ];

    const offenders = migrationFiles.flatMap((file) => {
      const sql = executableSql(readFileSync(resolve(migrationsDir, file), 'utf8'));
      return forbiddenAssignments.some((pattern) => pattern.test(sql)) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('keeps the contract migration data-free', () => {
    const migration = executableSql(readFileSync(
      resolve(migrationsDir, '20260824134536_catalog_visibility_separation_guard.sql'),
      'utf8',
    ));

    expect(migration).toMatch(/comment\s+on\s+column\s+public\.produtos\.ocultar_no_pdv/i);
    expect(migration).toMatch(/comment\s+on\s+column\s+public\.zelomenu_product_publications\.visivel_online/i);
    expect(migration).not.toMatch(/\b(update|insert|delete)\b/i);
  });
});
