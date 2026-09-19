# Supabase migration-history reconciliation — 2026-09-19

This record documents the history repair that cleared the Supabase connector
error `Remote migration versions not found in local migrations directory`.
It does not rewrite already-applied DDL and it does not claim a clean
fresh-environment bootstrap for the remote-only marker set.

## Symptom

The linked project had 50 applied versions without matching files under
`supabase/migrations/`, and 26 local files whose version ids never landed in
`supabase_migrations.schema_migrations` (mostly the same changes applied under
a different timestamp via MCP / dashboard / `db query --file`).

`npm run verify:migrations` stayed green because the ledger only freezes the
baseline inventory; the connector compares remote history to the local
directory and failed hard.

## Actions

1. **Renamed 25 local files** so their version prefix matches the remote
   applied id when `schema_migrations.name` matched the local slug (example:
   `20260919131000_ifood_verify_delivery_code.sql` →
   `20260919132439_ifood_verify_delivery_code.sql`). SQL content was not
   edited.
2. **Added 25 no-op `*_remote_snapshot.sql` markers** for remote-only versions
   with no recoverable local SQL under that id (CRM gates, Bem Servido catalog
   one-offs, conversation outbound stream, iFood split stock/sales helpers,
   etc.). Same pattern as
   `docs/operations/MIGRATION-HISTORY-RECONCILIATION-2026-08-12.md`.
3. **`supabase migration repair --status applied 20260911110000`** after
   verifying `public.zelomenu_modifier_components` and
   `zelomenu_modifier_option_products.id_componente` already exist. No SQL was
   re-executed.

## Result

```text
remote_only 0
local_only 0
synced 158
```

CLI / connector history is aligned. Reconstructing authoritative SQL for the
25 marker versions remains deferred bootstrap debt.
