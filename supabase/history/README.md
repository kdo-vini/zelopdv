# Historical SQL references

This directory is evidence for migration reconciliation. Nothing below this
directory is executable migration input, and bootstrap tooling must never run
these files.

- `remote-applied/` contains 22 authoritative payloads fetched from
  `supabase_migrations.schema_migrations` for versions represented locally by
  placeholders or reference markers. Version `20260722170000` is deliberately
  hash-only in the manifest because its payload contains a real tenant id and
  catalog data; those values are not introduced into Git.
- `observed-local/` preserves the six SQL artifacts that existed only in the
  original worktree. Their lifecycle and successor are recorded in the
  migration ledger; a file here is not evidence that it should be replayed.

Applied files under `supabase/migrations/` remain byte-for-byte immutable.
Current bootstrap state comes from `supabase/baselines/`, not from this archive.

## Shared ZeloChat CRM stream

The CRM relationship layer is owned by ZeloChat but runs in this shared
database. Its canonical migration files live in `supabase/migrations/` with
the remote timestamps `20260826110656` through `20260826110930`, matching the
already-applied entries in `supabase_migrations.schema_migrations`. Keep the
ZeloChat `048`–`059` payloads semantically identical and never replay them as a
second migration under a different version.
