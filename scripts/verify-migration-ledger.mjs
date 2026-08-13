import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cutoff = '20260813091000';
const baselineDir = join(root, 'supabase', 'baselines', cutoff);
const manifestPath = join(baselineDir, 'manifest.json');
const classificationPath = join(baselineDir, 'legacy-classification.json');
const observedLocal = new Set([
  'account_deletion_fiado_2026_08_09.sql',
  'admin_get_total_sales_value_2026_07_27.sql',
  'mesas_payment_item_allocation_2026_08_03.sql',
  'zelomenu_category_suggestions_2026_07_22.sql',
  'zelomenu_modifier_produto_vinculado_2026_07_22.sql',
  'zelomenu_modifier_quantidade_opcao_2026_07_22.sql',
]);
const markerVersions = new Set(['047', '20260805143653', '20260807134325']);

const args = process.argv.slice(2);
const update = args.includes('--update');
const remoteIndex = args.indexOf('--remote-dir');
const remoteDir = remoteIndex >= 0 ? resolve(args[remoteIndex + 1] ?? '') : null;

function fail(message) {
  throw new Error(message);
}

function relativePath(file) {
  return relative(root, file).replaceAll('\\', '/');
}

function raw(file) {
  return readFileSync(file);
}

function text(file) {
  return readFileSync(file, 'utf8');
}

function normalizeSql(value) {
  return value.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sqlBlankLineSha256(value) {
  const blankLineNormalized = normalizeSql(value)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
  return sha256(Buffer.from(blankLineNormalized, 'utf8'));
}

function fileHashes(file) {
  return {
    raw_sha256: sha256(raw(file)),
    lf_sha256: sha256(Buffer.from(normalizeSql(text(file)), 'utf8')),
    bytes: raw(file).length,
  };
}

function gitBlobOid(file) {
  const rel = relativePath(file);
  return execFileSync('git', ['hash-object', `--path=${rel}`, rel], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function sqlFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function versionOf(name) {
  return name.split('_', 1)[0];
}

function topLevelDml(source) {
  return normalizeSql(source)
    .split('\n')
    .map((line, index) => ({ line: index + 1, sql: line.trim() }))
    .filter(({ sql }) => /^(insert|update|delete|truncate|copy)\b/i.test(sql))
    .map(({ line, sql }) => ({
      line,
      operation: sql.match(/^(insert|update|delete|truncate|copy)\b/i)[1].toLowerCase(),
    }))
    .slice(0, 50);
}

function legacySource(name) {
  if (name.startsWith('verification/')) {
    return join(root, '.ai', 'migrations', name);
  }
  if (observedLocal.has(name)) {
    return join(root, 'supabase', 'history', 'observed-local', name);
  }
  return join(root, '.ai', 'migrations', name);
}

function loadClassifications() {
  const parsed = JSON.parse(text(classificationPath));
  if (parsed.format !== 1 || !Array.isArray(parsed.entries)) {
    fail('Unsupported legacy-classification.json format.');
  }
  if (parsed.entries.length !== 48) {
    fail(`Expected 48 legacy/verifier classifications, found ${parsed.entries.length}.`);
  }
  const names = new Set();
  for (const entry of parsed.entries) {
    if (names.has(entry.name)) fail(`Duplicate classification: ${entry.name}`);
    names.add(entry.name);
    for (const field of ['history', 'state', 'bootstrap', 'evidence']) {
      if (!entry[field] || /unknown|unreviewed/i.test(entry[field])) {
        fail(`Non-terminal ${field} for ${entry.name}.`);
      }
    }
    const file = legacySource(entry.name);
    if (!existsSync(file)) fail(`Classified artifact is missing: ${relativePath(file)}`);
  }
  return parsed.entries;
}

function buildRemoteHistory() {
  if (!remoteDir || !existsSync(remoteDir)) {
    fail('--update requires --remote-dir pointing to a Supabase migration fetch.');
  }
  const files = sqlFiles(remoteDir);
  if (files.length !== 59) fail(`Expected 59 fetched remote migrations, found ${files.length}.`);
  return files.map((name) => {
    const file = join(remoteDir, name);
    const version = versionOf(name);
    const archiveMatches = sqlFiles(join(root, 'supabase', 'history', 'remote-applied'))
      .filter((candidate) => versionOf(candidate) === version);
    return {
      version,
      name,
      ...fileHashes(file),
      sql_blank_line_sha256: sqlBlankLineSha256(text(file)),
      archived_path: archiveMatches.length === 1
        ? `supabase/history/remote-applied/${archiveMatches[0]}`
        : null,
      archive_disposition: version === '20260722170000'
        ? 'hash_only_tenant_data'
        : archiveMatches.length === 1
          ? 'payload_archived'
          : 'archive_not_required_local_canonical',
      top_level_dml: topLevelDml(text(file)),
    };
  });
}

function buildArtifacts(remoteHistory) {
  const remoteByVersion = new Map(remoteHistory.map((entry) => [entry.version, entry]));
  const migrationDir = join(root, 'supabase', 'migrations');
  const canonical = sqlFiles(migrationDir).map((name) => {
    const file = join(migrationDir, name);
    const version = versionOf(name);
    const source = normalizeSql(text(file)).trim();
    const remote = remoteByVersion.get(version);
    if (!remote) fail(`No fetched remote history for ${name}.`);
    const localHashes = fileHashes(file);
    const placeholder = source === '-- placeholder';
    const marker = markerVersions.has(version);
    const exactPayload = localHashes.lf_sha256 === remote.lf_sha256;
    const blankLineEquivalent = sqlBlankLineSha256(text(file)) === remote.sql_blank_line_sha256;
    return {
      artifact_id: `canonical:${version}`,
      path: relativePath(file),
      original_path: relativePath(file),
      source_root: 'supabase/migrations',
      artifact_kind: placeholder
        ? 'history_placeholder'
        : marker
          ? 'remote_marker'
          : 'canonical_migration',
      version,
      ...localHashes,
      sql_blank_line_sha256: sqlBlankLineSha256(text(file)),
      git_blob_oid: gitBlobOid(file),
      history_status: placeholder || marker
        ? version === '20260722170000'
          ? 'remote_payload_hash_only_tenant_data'
          : 'remote_payload_archived'
        : exactPayload
          ? 'remote_payload_exact'
          : blankLineEquivalent
            ? 'remote_payload_blank_line_equivalent'
            : 'remote_version_applied_payload_differs_from_local_file',
      current_state_status: 'present_in_current_baseline',
      bootstrap_disposition: version === '20260722170000'
        ? 'exclude_tenant_data'
        : 'baseline_absorbed',
      remote_links: [{
        version,
        name: remote.name,
        payload_lf_sha256: remote.lf_sha256,
        payload_sql_blank_line_sha256: remote.sql_blank_line_sha256,
        archived_path: remote.archived_path,
        archive_disposition: remote.archive_disposition,
      }],
      superseded_by: [],
      evidence: 'Version is present in linked supabase_migrations history and current production schema was captured at the cutoff.',
      review_status: 'reviewed',
    };
  });

  const legacy = loadClassifications().map((classification) => {
    const file = legacySource(classification.name);
    const verification = classification.name.startsWith('verification/');
    const archived = observedLocal.has(classification.name);
    return {
      artifact_id: `${verification ? 'verification' : 'legacy'}:${classification.name}`,
      path: relativePath(file),
      original_path: `.ai/migrations/${classification.name}`,
      source_root: verification
        ? '.ai/migrations/verification'
        : archived
          ? 'supabase/history/observed-local'
          : '.ai/migrations',
      artifact_kind: verification
        ? classification.name.includes('zelo_order_sub_item')
          ? 'verification_rollback'
          : 'verification_readonly'
        : classification.bootstrap === 'exclude_tenant_data'
          ? 'operational_data_patch'
          : 'legacy_migration',
      version: null,
      ...fileHashes(file),
      git_blob_oid: gitBlobOid(file),
      history_status: classification.history,
      current_state_status: classification.state,
      bootstrap_disposition: classification.bootstrap,
      remote_links: [],
      superseded_by: classification.superseded_by ?? [],
      evidence: classification.evidence,
      review_status: 'reviewed',
    };
  });

  const artifacts = [...canonical, ...legacy];
  if (canonical.length !== 59) fail(`Expected 59 canonical migrations, found ${canonical.length}.`);
  if (artifacts.length !== 107) fail(`Expected 107 classified artifacts, found ${artifacts.length}.`);
  return artifacts;
}

function baselineFile(name) {
  const file = join(baselineDir, name);
  if (!existsSync(file)) fail(`Missing baseline file: ${relativePath(file)}`);
  return { path: relativePath(file), ...fileHashes(file), git_blob_oid: gitBlobOid(file) };
}

function updateManifest() {
  const remoteHistory = buildRemoteHistory();
  const artifacts = buildArtifacts(remoteHistory);
  const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const manifest = {
    format: 1,
    cutoff,
    captured_at: '2026-08-13',
    source_head: sourceHead,
    environment: {
      supabase_cli: '2.109.0',
      postgres: '17.6',
      postgres_image: '17.6.1.031',
      encoding: 'UTF8',
      collate: 'en_US.UTF-8',
      ctype: 'en_US.UTF-8',
      extensions: [
        'pg_cron@1.6.4',
        'pg_net@0.19.5',
        'pg_stat_statements@1.11',
        'pgcrypto@1.3',
        'plpgsql@1.0',
        'supabase_vault@0.3.1',
        'uuid-ossp@1.1',
      ],
    },
    counts: {
      canonical_migrations: 59,
      legacy_sql: 46,
      verification_sql: 2,
      classified_artifacts: 107,
      archived_remote_payloads: 22,
      hash_only_tenant_data_payloads: 1,
      archived_observed_local: 6,
      public_tables: 93,
      public_functions: 68,
      public_views: 4,
      public_policies: 203,
      public_triggers: 15,
      public_rls_tables: 93,
      storage_buckets: 3,
      storage_policies: 14,
      realtime_tables: 2,
      custom_roles: 0,
      cron_jobs_metadata_only: 3,
    },
    baseline_files: [
      baselineFile('schema.sql'),
      baselineFile('platform.sql'),
      baselineFile('applied-versions.txt'),
      baselineFile('legacy-classification.json'),
      baselineFile('platform-state.json'),
      baselineFile('README.md'),
      baselineFile('../../config.toml'),
    ],
    app_owned_schemas: ['public'],
    excluded_managed_schemas: [
      'auth', 'storage', 'realtime', '_realtime', 'supabase_migrations',
      'supabase_functions', 'extensions', 'graphql', 'graphql_public',
      'vault', 'cron', 'net', 'pgsodium', 'pg_catalog', 'information_schema',
    ],
    excluded_data: [
      'Auth users/sessions',
      'business rows',
      'Storage objects',
      'Vault secrets',
      'cron command bodies',
      'sequence current values',
      'statistics and physical identifiers',
    ],
    platform_state: {
      buckets: ['delivery-assets', 'logos', 'zelochat-media'],
      realtime_tables: ['public.zelo_orders', 'public.zelochat_orders'],
      cron_jobs_not_replayed: [
        { name: 'whatsapp-lifecycle-cron-daily', schedule: '0 13 * * *', command_sha256: '4addf69e49959008460ce6cc699633d160a460e5edcf044a7881a5f2fb6ed775' },
        { name: 'onboarding-emails-daily', schedule: '0 9 * * *', command_sha256: '7e27b3a52d259b2d983ed473f9712e9bccc1b060002ce03b683bbc570f4ae195' },
        { name: 'nudge-incomplete-registration', schedule: '0 * * * *', command_sha256: 'e95b0aa870418fb3a04c60226bde412aeb9d59273779c0bc2c4f14acecfd59e4' },
      ],
    },
    remote_history: remoteHistory,
    artifacts,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Updated ${relativePath(manifestPath)} with ${artifacts.length} classified artifacts.`);
}

function verifyManifest() {
  if (!existsSync(manifestPath)) fail('Missing migration reconciliation manifest.');
  const manifest = JSON.parse(text(manifestPath));
  if (manifest.format !== 1 || manifest.cutoff !== cutoff) fail('Unexpected manifest format/cutoff.');
  if (manifest.artifacts?.length !== 107) fail('Manifest must classify exactly 107 artifacts.');
  if (manifest.remote_history?.length !== 59) fail('Manifest must capture exactly 59 remote versions.');
  if (/unknown|unreviewed/i.test(JSON.stringify(manifest.artifacts))) {
    fail('Manifest contains a non-terminal classification.');
  }
  const unexplainedPayloadDiffs = manifest.artifacts.filter(
    (artifact) => artifact.history_status === 'remote_version_applied_payload_differs_from_local_file',
  );
  if (unexplainedPayloadDiffs.length > 0) {
    fail(`Manifest contains ${unexplainedPayloadDiffs.length} unexplained remote/local payload differences.`);
  }

  const applied = normalizeSql(text(join(baselineDir, 'applied-versions.txt')))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const canonical = sqlFiles(join(root, 'supabase', 'migrations'));
  const canonicalVersions = canonical.map(versionOf);
  const canonicalAtCutoff = canonicalVersions.filter((version) => BigInt(version) <= BigInt(cutoff));
  const forwardVersions = canonicalVersions.filter((version) => BigInt(version) > BigInt(cutoff));
  const remoteVersions = manifest.remote_history.map((entry) => entry.version);
  const remoteNames = manifest.remote_history.map((entry) => entry.name);
  const artifactIds = manifest.artifacts.map((entry) => entry.artifact_id);
  if (new Set(applied).size !== applied.length) fail('applied-versions.txt contains duplicate versions.');
  if (new Set(canonicalVersions).size !== canonicalVersions.length) fail('Canonical migrations contain duplicate versions.');
  if (new Set(remoteVersions).size !== remoteVersions.length) fail('Remote history contains duplicate versions.');
  if (new Set(remoteNames).size !== remoteNames.length) fail('Remote history contains duplicate names.');
  if (new Set(artifactIds).size !== artifactIds.length) fail('Manifest contains duplicate artifact ids.');
  if (JSON.stringify(applied) !== JSON.stringify(canonicalAtCutoff)) {
    fail('applied-versions.txt does not exactly match canonical migrations through the baseline cutoff.');
  }
  if (JSON.stringify(applied) !== JSON.stringify(remoteVersions)) {
    fail('Remote history versions do not exactly match applied-versions.txt.');
  }

  const archivedRemote = manifest.remote_history.filter((entry) => entry.archived_path);
  const hashOnlyTenantData = manifest.remote_history.filter(
    (entry) => entry.archive_disposition === 'hash_only_tenant_data',
  );
  if (archivedRemote.length !== 22 || hashOnlyTenantData.length !== 1) {
    fail('Expected 22 archived remote payloads and one explicit tenant-data hash-only payload.');
  }
  if (hashOnlyTenantData[0].version !== '20260722170000' || hashOnlyTenantData[0].archived_path) {
    fail('Unexpected remote payload selected for tenant-data hash-only handling.');
  }

  const canonicalArtifacts = manifest.artifacts.filter(
    (entry) => entry.source_root === 'supabase/migrations',
  );
  const remoteByVersion = new Map(manifest.remote_history.map((entry) => [entry.version, entry]));
  if (canonicalArtifacts.length !== 59) fail('Manifest must contain 59 canonical migration artifacts.');
  for (const artifact of canonicalArtifacts) {
    if (artifact.remote_links?.length !== 1 || artifact.remote_links[0].version !== artifact.version) {
      fail(`Canonical artifact is not linked to exactly one matching remote version: ${artifact.path}`);
    }
    const link = artifact.remote_links[0];
    const remote = remoteByVersion.get(artifact.version);
    if (!remote
      || link.name !== remote.name
      || link.payload_lf_sha256 !== remote.lf_sha256
      || link.payload_sql_blank_line_sha256 !== remote.sql_blank_line_sha256
      || link.archived_path !== remote.archived_path
      || link.archive_disposition !== remote.archive_disposition) {
      fail(`Canonical artifact remote link differs from remote history: ${artifact.path}`);
    }
    if (artifact.history_status === 'remote_payload_exact'
      && artifact.lf_sha256 !== remote.lf_sha256) {
      fail(`Exact remote payload hash differs: ${artifact.path}`);
    }
    if (artifact.history_status === 'remote_payload_blank_line_equivalent'
      && artifact.sql_blank_line_sha256 !== remote.sql_blank_line_sha256) {
      fail(`Blank-line-equivalent remote payload hash differs: ${artifact.path}`);
    }
    if (artifact.artifact_kind === 'history_placeholder' || artifact.artifact_kind === 'remote_marker') {
      if (artifact.version === '20260722170000') {
        if (link.archived_path || link.archive_disposition !== 'hash_only_tenant_data') {
          fail('Tenant-data placeholder must remain hash-only.');
        }
      } else if (!link.archived_path || link.archive_disposition !== 'payload_archived') {
        fail(`Placeholder/marker has no archived authoritative payload: ${artifact.path}`);
      }
    }
  }

  for (const artifact of manifest.artifacts) {
    const file = join(root, artifact.path);
    if (!existsSync(file)) fail(`Missing classified artifact: ${artifact.path}`);
    const hashes = fileHashes(file);
    if (hashes.lf_sha256 !== artifact.lf_sha256) fail(`Content changed: ${artifact.path}`);
    if (artifact.sql_blank_line_sha256
      && sqlBlankLineSha256(text(file)) !== artifact.sql_blank_line_sha256) {
      fail(`SQL content changed after blank-line normalization: ${artifact.path}`);
    }
    if (gitBlobOid(file) !== artifact.git_blob_oid) fail(`Git-normalized content changed: ${artifact.path}`);
  }
  for (const entry of manifest.baseline_files) {
    const file = join(root, entry.path);
    if (!existsSync(file)) fail(`Missing baseline input: ${entry.path}`);
    if (fileHashes(file).lf_sha256 !== entry.lf_sha256) fail(`Baseline input changed: ${entry.path}`);
    if (gitBlobOid(file) !== entry.git_blob_oid) fail(`Git-normalized baseline input changed: ${entry.path}`);
  }
  for (const remote of manifest.remote_history.filter((entry) => entry.archived_path)) {
    const file = join(root, remote.archived_path);
    if (!existsSync(file)) fail(`Missing archived remote payload: ${remote.archived_path}`);
    if (fileHashes(file).lf_sha256 !== remote.lf_sha256) fail(`Remote archive changed: ${remote.archived_path}`);
  }

  const schema = text(join(baselineDir, 'schema.sql'));
  if (/^\s*(copy\s+.+from\s+stdin|insert\s+into\s+"public"\.)/im.test(schema)) {
    fail('schema.sql appears to contain table data.');
  }
  if (/(eyJ[A-Za-z0-9_-]{10,}\.|whsec_|sk_(live|test)|postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@)/i.test(schema)) {
    fail('schema.sql appears to contain a credential.');
  }

  console.log(
    `Migration ledger verified: 107/107 baseline artifacts, 59/59 remote versions, `
      + `${forwardVersions.length} forward migration(s), no unknown classifications.`,
  );
}

if (update) updateManifest();
else verifyManifest();
