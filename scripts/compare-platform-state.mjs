import { readFileSync } from 'node:fs';

const [actualPath, expectedPath] = process.argv.slice(2);
if (!actualPath || !expectedPath) {
  throw new Error('Usage: node scripts/compare-platform-state.mjs <actual-query.json> <expected.json>');
}

const actualWrapper = JSON.parse(readFileSync(actualPath, 'utf8').replace(/^\uFEFF/, ''));
const actual = actualWrapper.rows?.[0]?.jsonb_build_object;
const expected = JSON.parse(readFileSync(expectedPath, 'utf8').replace(/^\uFEFF/, ''));
if (!actual) throw new Error('Supabase query output did not contain a platform-state row.');

const comparedProperties = [
  'format',
  'cutoff',
  'applied_count',
  'custom_roles',
  'storage_buckets',
  'storage_policies',
  'storage_table_security',
  'realtime_tables',
  'realtime_publication',
  'postgrest_schemas_setting',
];

const differences = comparedProperties.filter(
  (property) => JSON.stringify(actual[property]) !== JSON.stringify(expected[property]),
);
if (differences.length > 0) {
  throw new Error(`Platform-state mismatch: ${differences.join(', ')}`);
}

console.log('Captured platform configuration matches the production snapshot.');
