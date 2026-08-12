# Supabase migration-history reconciliation — 2026-08-12

This record documents the minimum history repair required to publish the
security-containment and webhook-reliability migrations. It is not a rewrite
of an already-applied migration and it does not claim that the repository is a
reproducible bootstrap for the historical schema.

## Remote/local comparison before repair

The linked project contained three applied versions without local files:

| Version | Remote name | Local action |
| --- | --- | --- |
| `047` | `media_bucket_size_limit` | Added a no-op history marker; original DDL remains a separate reconstruction task. |
| `20260805143653` | `zelomenu_canonical_public_order_hotfix` | Added a no-op history marker; original DDL remains a separate reconstruction task. |
| `20260807134325` | `catalog_canonical_products` | Added a no-op history marker; original DDL remains a separate reconstruction task. |

The following local files were already represented in the production schema,
but were absent from the remote history table:

| Version | Verification before repair |
| --- | --- |
| `20260415000000` | `public.email_onboarding_logs` exists with RLS enabled and no policies. |
| `20260803164855` | `public.comanda_pagamento_itens`, its two trigger functions, four owner-scoped policies, indexes, and related payment columns exist. |
| `20260803170000` | Owner-scoped INSERT policies for comanda payments, sales, sale items, and sale payments exist. |
| `20260804143959` | `public.admin_company_metric_settings`, four super-admin policies, and the two seeded exclusion rows exist. |

The CLI dry-run after adding the three markers listed only the two intended
pending migrations:

```text
20260812150000_p0_security_containment.sql
20260812165936_webhook_reliability_pix_atomicity.sql
```

## Metadata operation performed

Using the authenticated Supabase CLI, the four verified local versions were
registered as `applied` in `supabase_migrations.schema_migrations`:

```text
20260415000000 20260803164855 20260803170000 20260804143959
```

No historical SQL was executed, data was changed, or production business
behavior was modified by this repair. The three remote-only versions were not
removed or replayed.

## Follow-up deliberately deferred

The original SQL for the three remote-only versions must be reconstructed from
the authoritative production schema before this repository can claim a clean
fresh-environment bootstrap. That is the separate migration-reconciliation
workstream; this release only makes the CLI history safe enough to apply the
two reviewed forward-only migrations.
