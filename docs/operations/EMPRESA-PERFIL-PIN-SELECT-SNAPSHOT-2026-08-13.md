# Snapshot — empresa_perfil.pin_admin (2026-08-13)

## Finding revalidated before the change

`empresa_perfil` is tenant-scoped by RLS, but the client roles had a table
`SELECT` grant for every column. The browser could therefore request the
owner's `pin_admin` directly, even though the normal PIN flow now uses
`/api/auth/admin-pin` and server-side comparison.

The production probe used the permanent owner and subuser fixtures and did not
print the PIN value. Before the migration, the owner, the active subuser, the
active super-admin, and `service_role` each saw one profile row with a present
PIN of length 6. An anonymous SQL role had a table SELECT grant, but the RLS
policy's owner helper denied the query before returning data.

## Exact pre-change grant snapshot

`pg_class.relacl` for `public.empresa_perfil`:

```text
{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

The relevant privilege checks were:

| Role | Table SELECT | Column `pin_admin` SELECT |
| --- | --- | --- |
| anon | true | true |
| authenticated | true | true |
| service_role | true | true |

## Exact pre-change policy definitions

The migration does not alter any policy or row predicate:

- `select_empresa_perfil` — `authenticated`, `SELECT`,
  `user_id = auth.uid()` or active `super_admins` membership.
- `empresa_perfil_actor_select` — `public`, `SELECT`,
  `get_owner_user_id(auth.uid()) = user_id` or active `super_admins`
  membership.
- `insert_own_empresa_perfil` — `public`, `INSERT`, `auth.uid() = user_id`.
- `update_own_empresa_perfil` — `public`, `UPDATE`, owner in both `USING` and
  `WITH CHECK`.
- `delete_own_empresa_perfil` — `public`, `DELETE`, `auth.uid() = user_id`.
- `modify_empresa_perfil` — `authenticated`, `ALL`, active super-admin in
  both `USING` and `WITH CHECK`.

## Consumers and blast radius

Browser consumers found in the repository:

- `/app` had two `select('*')` calls. They were narrowed to the receipt,
  price-table, and payment-platform columns actually used by the POS.
- `/app/pedidos` had one `select('*')` call. It was narrowed to `id`,
  `nome_exibicao`, and `razao_social`, which are the only fields used there.
- Other browser reads already request explicit columns and remain compatible.

The only browser PIN consumer is the server endpoint
`/api/auth/admin-pin`, which uses `supabaseAdmin`; it is not affected by the
client-column restriction. Server routes, cron jobs, and admin operations use
service-role or explicit non-PIN fields. No public storefront consumer reads
this table directly.

The forward-only migration `20260813060000_empresa_perfil_pin_select_containment.sql`:

1. revokes table-level `SELECT` from `anon` and `authenticated`;
2. grants `authenticated` column-level `SELECT` for every current profile
   column except `pin_admin`;
3. leaves row policies, writes, `service_role`, owners, subusers, and
   super-admin membership unchanged.

The result is that normal profile data keeps its previous behavior, while a
client request for `pin_admin` is rejected by PostgreSQL. Anonymous table
reads are no longer possible and no repository consumer depended on them.

## Post-apply authorization matrix

The matrix was run against the permanent owner profile and its permanent
subuser fixture, with write probes inside transactions that were rolled back.
It checked row visibility for safe columns, `pin_admin` column privilege, and
the existing owner/super-admin predicates:

| Actor | Safe profile row | `pin_admin` SELECT | Expected behavior |
| --- | ---: | ---: | --- |
| Owner | 1 | false | retains profile reads; PIN stays server-only |
| Regular authenticated user | 0 outside tenant | false | no cross-tenant row |
| Subuser | 1 inside tenant | false | retains safe profile fields only |
| Super-admin | 1 | false | retains safe admin-visible profile fields |
| Anonymous | denied/no rows | false | no table SELECT |
| `service_role` | 1 | true | unchanged server/admin path |

Observed privilege results after applying the migration were:

```text
anon table SELECT=false; authenticated table SELECT=false
anon pin_admin SELECT=false; authenticated pin_admin SELECT=false
service_role table SELECT=true; service_role pin_admin SELECT=true
post-apply relacl={postgres=arwdDxtm/postgres,anon=awdDxtm/postgres,authenticated=awdDxtm/postgres,service_role=arwdDxtm/postgres}
```

An explicit `SELECT pin_admin` as the permanent subuser failed with PostgreSQL
`42501 permission denied for table empresa_perfil`. The safe-column grant check
returned no missing columns, and the migration list plus dry-run both reported
the remote database up to date.

The application test suite also checks that the two affected browser calls do
not regress to `select('*')`. The fresh full run passed 101 test files and 627
tests; `svelte-check` passed with 0 errors and 95 existing warnings.

## Rollback procedure

Do not rewrite the applied migration. If production validation shows an
unexpected legitimate consumer, create a new forward migration after the
incident review. The minimal SQL rollback for this permission change is:

```sql
revoke select on table public.empresa_perfil from authenticated;
grant select on table public.empresa_perfil to anon, authenticated;
```

This restores the pre-change table SELECT behavior while leaving all policy
definitions and non-SELECT grants untouched. Reapply the application commit
only if a rollback is intentionally chosen; restoring the wildcard queries is
not required for the safe-column path.
