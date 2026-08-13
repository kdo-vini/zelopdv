# Access audit logs tenant guard snapshot — 2026-08-13

## Finding independently verified

Production revalidation confirmed that an authenticated subuser could insert
an audit row with `operator_user_id = auth.uid()` while choosing an unrelated
`owner_user_id`. The permanent active subuser
`3f9060ca-446c-4299-a8c4-256aa195ed80` belongs to owner
`5efac306-25b4-4858-b94c-50fb42699a52`; before this change, a transactional
insert attributed to the separate tenant owner
`d5625be9-abef-4371-a8e7-e915220aec42` succeeded and was rolled back.

This is an audit-integrity/tenant-boundary bypass: it does not grant access to
the protected business rows, but it lets a client forge history under another
tenant. The same production probe also confirmed that a subuser can write a
legitimate event under its actual owner.

## Exact pre-change snapshot

Relation state:

```text
public.access_audit_logs
  relrowsecurity=true
  relforcerowsecurity=false
  ACL={postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
       authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
```

The table has 513 existing rows. Foreign keys remain the existing
`owner_user_id -> auth.users(id) ON DELETE CASCADE` and
`operator_user_id -> auth.users(id) ON DELETE SET NULL`.

Policy before the change:

```sql
access_audit_logs_insert | INSERT | {authenticated}
WITH CHECK ((auth.uid() = owner_user_id) OR (auth.uid() = operator_user_id))
```

The SELECT policy is unchanged:

```sql
access_audit_logs_owner_select | SELECT | {authenticated}
USING (auth.uid() = owner_user_id)
```

Table privileges are unchanged and remain broad for compatibility; RLS is the
effective client boundary. `anon` has no matching policy, while service-role
bypasses RLS.

## Consumers and blast radius

### Browser-side consumer

`src/lib/accessControl.js:logAuditAction` is the only browser helper that
writes this table. It is called by the Fichário, Estoque, Despesas, PDV Caixa
and Mesas flows after a successful operation, and only when `isSubUser` is
true. The helper already passes the resolved `ownerUserId` and the current
session user as `operator_user_id`.

### Server-side/service-role consumers

`src/lib/server/accessControl.js` writes login and access-management events
with `supabaseAdmin`; these writes bypass the authenticated policy and keep
their existing behavior. E2E cleanup also uses service-role. No function,
grant, table, or read policy is changed.

### Intentionally preserved behavior

- Same-tenant subuser audit inserts remain allowed.
- Owner SELECT of its own audit history remains unchanged.
- No browser INSERT/SELECT is granted to anonymous users by this change.
- Existing rows and foreign-key deletion behavior remain unchanged.

## Minimal forward change

Migration `20260813041000_access_audit_logs_tenant_guard.sql` alters only the
existing INSERT policy:

```sql
WITH CHECK (
  operator_user_id = auth.uid()
  AND owner_user_id = get_owner_user_id(auth.uid())
)
```

This binds both the actor and the resolved tenant. `get_owner_user_id` is the
existing stable SECURITY DEFINER helper; its definition and privileges are not
changed.

## Verification matrix

Post-apply probes are transactional and leave no rows behind:

| Principal | Expected INSERT | Expected SELECT |
| --- | --- | --- |
| anon | denied by RLS | denied by RLS |
| owner | existing owner behavior unchanged | own tenant rows |
| subuser, same owner | allowed when operator and owner are coherent | existing SELECT policy returns no owner rows (0 in fixture) |
| subuser, forged owner | denied by RLS | no cross-tenant rows |
| active super-admin | existing transactional behavior unchanged | existing SELECT policy returns no tenant rows (0 in fixture) |
| service-role | existing trusted write preserved | all 513 rows visible (RLS bypass preserved) |

Observed post-apply SELECT counts in the permanent fixture: owner 87 rows,
subuser 0, active super-admin 0, service-role 513. The subuser's browser role
only writes audit events; the server-side login helper reads them with
service-role.

## Rollback procedure

Create a new forward migration only if rollback is explicitly approved:

```sql
alter policy access_audit_logs_insert
  on public.access_audit_logs
  with check ((auth.uid() = owner_user_id) OR (auth.uid() = operator_user_id));
```

Do not rewrite the applied migration and do not modify existing rows.
