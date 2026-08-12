# access_users RBAC snapshot — 2026-08-12

## Finding verified before the change

Production policy `access_users_owner_or_self` granted `ALL` to the
`authenticated` role with both `USING` and `WITH CHECK` equal to:

```sql
(auth.uid() = owner_user_id) OR (auth.uid() = auth_user_id)
```

An active sub-user could therefore target its own row directly from the
browser and attempt to change `role_id`, `owner_user_id`, or `status`, or
delete the row. The application did not need this write path.

The table also had the pre-existing broad table grants below. They are left
unchanged in this slice because RLS is the effective tenant boundary and the
service-role/server paths rely on the table privileges:

| Grantee | Privileges observed before apply |
| --- | --- |
| `anon` | `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE` |
| `authenticated` | `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE` |
| `service_role` | `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE` |

## Consumer and blast-radius review

### Browser-side reads preserved

- `src/lib/accessControl.js` reads the current user's active row and the
  associated role permissions.
- `src/lib/guards.js` resolves the owner for subscription/add-on checks.
- `src/routes/+layout.svelte` resolves the owner and may call the server
  activation endpoint for legacy invite metadata.
- `src/routes/assinatura/+page.svelte` and
  `src/routes/gestao/extensoes/+page.svelte` detect and redirect sub-users.
- `admin-dashboard/src/routes/users/+page.svelte` reads rows as an active
  super-admin; its mutations use admin RPCs, not direct table writes.

Sub-user reads are covered by `access_users_self_select`; owner reads remain
covered by `access_users_owner`; active super-admin reads remain covered by
the existing `access_users_super_admin_select` policy.

### Server-side/service-role writes preserved

The following paths use `supabaseAdmin` and are not restricted by the new
authenticated policies:

- `/api/access/users` invite/list
- `/api/access/users/[id]` role/status update and removal
- `/api/access/activate` invite activation
- `src/lib/server/accessControl.js` invite/cleanup/context helpers
- cron, referral, product-usage, and admin-dashboard service/admin flows

No browser consumer was found that inserts, updates, or deletes
`access_users` directly. Owners therefore retain the same direct table CRUD
scope as before; sub-users lose only self-row writes.

## Exact forward change

Migration:

```text
supabase/migrations/20260812204706_access_users_self_write_containment.sql
```

It drops `access_users_owner_or_self` and creates:

```sql
create policy access_users_owner
  on public.access_users
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy access_users_self_select
  on public.access_users
  for select to authenticated
  using ((select auth.uid()) = auth_user_id);
```

`access_users_super_admin_select` is unchanged. Table grants are unchanged.
Service-role behavior is unchanged.

The follow-up migration `20260812205010_access_users_owner_guard.sql` adds the
same owner predicate to `USING` and `WITH CHECK`:

```sql
public.get_owner_user_id((select auth.uid())) = (select auth.uid())
```

This is required because a policy expressed only as
`auth.uid() = owner_user_id` would let an active sub-user manufacture a new
row whose `owner_user_id` was their own UUID. The helper resolves active
sub-users to their real owner and prevents that synthetic-owner path.

## Verification matrix

Post-apply results (all fixtures rolled back):

- owner transactional INSERT/UPDATE/DELETE: passou;
- active sub-user self-SELECT e leitura do cargo: passou;
- active sub-user UPDATE/DELETE: nenhuma linha afetada; a linha continuou
  visivel e `active`;
- active sub-user INSERT: rejeitado por `new row violates row-level security`;
- super-admin: 10 linhas cross-tenant visiveis, nenhuma escrita efetiva;
- anon: 0 linhas visiveis;
- service-role: UPDATE transacional passou;
- `npx supabase db push --linked --dry-run`: sem migrations pendentes apos o
  apply.

The post-apply smoke must run transactionally and roll back all fixtures:

| Persona | Expected result |
| --- | --- |
| anon | no table access through RLS |
| owner | existing tenant CRUD remains available |
| active sub-user | own row SELECT works; INSERT/UPDATE/DELETE denied |
| sub-user with any role | role/context reads remain available; no self-write |
| super-admin | existing SELECT visibility remains; no new write path |
| service-role | invite/activation/update/delete continue to work |

## Rollback procedure

Do not edit or rewrite this applied migration. If a rollback is explicitly
approved, create a new forward migration that drops `access_users_owner` and
`access_users_self_select`, then recreates the snapshotted
`access_users_owner_or_self` policy with its original `USING` and `WITH CHECK`
expressions. Re-run the matrix and record the reason before deployment.
