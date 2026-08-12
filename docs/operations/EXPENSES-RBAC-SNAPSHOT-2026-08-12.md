# Expenses RBAC snapshot — 2026-08-12

## Verified production state before migration

`public.expenses` had RLS enabled with four policies:

- `expenses_actor_select`: `get_owner_user_id(auth.uid()) = user_id`
- `expenses_actor_insert`: `get_owner_user_id(auth.uid()) = user_id`
- `expenses_actor_update`: the same owner predicate in `USING` and `WITH CHECK`
- `expenses_actor_delete`: `get_owner_user_id(auth.uid()) = user_id`

The policies allowed every authenticated sub-user in the owner tenant to read and mutate expenses,
regardless of the role JSON. Owners were also allowed. The existing role catalogue gives `Gerente`
both `despesas.visualizar` and `despesas.gerenciar`; `Caixa` and `Atendente` do not receive those
permissions by default.

## Intended blast radius

The forward-only migration keeps owner behavior unchanged and retains the existing owner scoping.
For active sub-users, SELECT requires `despesas.visualizar` or `despesas.gerenciar`; INSERT, UPDATE
and DELETE require `despesas.gerenciar`. A custom role with these keys remains compatible. A role
without the keys will receive no rows / no affected rows from the browser Data API, which is the
intended server-side enforcement.

## Rollback

Do not rewrite the applied migration. If product validation requires rollback, create a new migration
that drops the four role-aware policies and recreates the exact owner-only definitions above. This
would intentionally restore the previous broad sub-user behavior and should be treated as a security
rollback, with an explicit approval and a fresh snapshot.

## Post-apply authorization smoke

Using temporary `SET LOCAL ROLE` transactions against the linked production database:

- anon owner claim: `0` visible rows;
- authenticated owner claim: `11` visible rows and an owner insert succeeded, then rolled back;
- authenticated Caixa claim without an expense permission: `0` visible rows and an insert was rejected
  with `new row violates row-level security policy`;
- authenticated Gerente claim with both expense permissions: `11` visible rows and an insert succeeded,
  then rolled back;
- active super-admin claim: `0` rows, matching the pre-existing owner-scoped contract;
- service role: `245` rows, preserving administrative/cron bypass behavior.

No production expense row was created or deleted by these checks.
