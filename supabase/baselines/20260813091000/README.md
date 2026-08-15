# Production baseline — 20260813091000

This is the application-schema baseline captured from production after migration
`20260813091000`. It exists outside `supabase/migrations` and therefore cannot
be pushed by the normal migration command.

> Cutoff note: two migrations were applied after this capture,
> `20260814200000` and `20260814210000`. A new capture is due.

## Safety contract

- The 59 already-applied migration files remain unchanged.
- `schema.sql` and `platform.sql` refuse execution with a non-zero exit unless
  the disposable harness provides a truthy `zelo_disposable_baseline` in
  `psql`; the committed harness always sets it to `1`.
- `supabase/config.toml` enables migration replay since 2026-08-14, by decision
  of the repository owner, so `supabase db push --linked` is the normal way to
  ship a migration. The verifier no longer depends on that flag being `false`:
  it requires the flag to be declared, and forces `enabled = true` in its own
  disposable copy after loading the baseline and repairing history locally.
- The guarantee the harness actually owns is unchanged and is the one that
  matters: it rejects linked/remote database options and only ever replays
  against the fixed loopback URL. Always run `supabase db push --dry-run`
  first; it lists the exact pending versions.
- The verifier rejects linked/remote database options and accepts only the
  fixed loopback database URL.
- The baseline contains no Auth users, business rows, Storage objects, secrets,
  sequence values or physical/statistics metadata.
- Historical SQL under `supabase/history` is reference-only and is never
  replayed.

Do not run either baseline SQL file manually. Use:

```powershell
npm run verify:migrations
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-supabase-baseline.ps1
```

## Contents

- `schema.sql`: `public` schema, including ACLs, default privileges, RLS,
  policies, functions, triggers, views and indexes.
- `platform.sql`: non-secret bucket configuration, custom Storage policies and
  application Realtime publication membership.
- `platform-state.json`: canonical production snapshot used for comparison.
- `applied-versions.txt`: the exact 59-version remote ledger at the cutoff.
- `legacy-classification.json`: terminal lifecycle classification for the 46
  legacy SQL artifacts and two verifiers.
- `manifest.json`: SHA-256/Git hashes, remote-history links and the full 107-row
  inventory.

## Verification result (2026-08-13)

- 107/107 SQL artifacts classified; no `unknown` or `unreviewed` state.
- 59/59 linked migration versions aligned.
- 22 authoritative remote payloads archived without rewriting their applied
  local marker files. The remaining tenant-specific data patch is represented
  only by its version and cryptographic hashes, so customer identifiers and
  catalog values are not introduced into Git.
- 31 additional canonical files differ from the fetched representation only in
  blank lines; their independent blank-line-normalized
  hashes are recorded and verified. No unexplained payload difference remains.
- Disposable Supabase PostgreSQL 17.6 restore succeeded.
- Normalized production → local `public` dump: zero diff; SHA-256
  `5ecce9ddb351dd48b0d8e31b9975c0670f84a79682b05b1ca8b87f3e268b4a83`.
- Three buckets, 14 custom Storage policies and two Realtime tables: zero diff.
- Local and linked migration dry-runs: no pending migration.

The local managed runtime ships `pg_net 0.20.3`, while production currently
reports `0.19.5`; all application-owned schema/security and captured platform
configuration still compare equal. Managed extension internals remain an
explicit environment precondition, not application baseline content.

Database lint reproduces two pre-existing findings in both the captured schema
and production lineage: the temp-table reference in `criar_venda_completa` and
the inferred record type in `save_zelomenu_delivery_settings`. They were not
changed during reconciliation because this delivery must preserve production
behavior. They remain tracked findings, not a hidden green check.

The platform snapshot is fidelity evidence, not a security approval. In
particular, production currently contains `TO PUBLIC` INSERT/DELETE policies on
the `zelochat-media` bucket. Their effective anon/auth behavior depends on the
managed `storage.objects` grants captured alongside RLS state and must be
revalidated as a separate security-containment candidate. The baseline must not
silently change that existing state.

## Rollback

This reconciliation changes no production object or migration history. Rollback
is a normal Git revert of the baseline, history archive, verifier scripts and
configuration. Never run `migration repair --linked` as rollback.
