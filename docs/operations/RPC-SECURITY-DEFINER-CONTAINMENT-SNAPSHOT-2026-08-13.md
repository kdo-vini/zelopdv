# SECURITY DEFINER RPC containment snapshot — 2026-08-13

## Findings independently verified

The linked production schema was queried immediately before the forward-only
migration. Three public SECURITY DEFINER functions were reviewed:

- `public.saldo_caixa(bigint)` had no consumer in `src/`, `admin-dashboard/`,
  `tests/`, `supabase/`, or `docs/`. Its body reads `caixas`, `vendas`,
  `vendas_pagamentos`, and `caixa_movimentacoes` by an arbitrary caixa id,
  without an owner or `auth.uid()` check. The app computes its cash balance
  locally; no browser or server route calls this RPC.
- `public.get_user_id_by_email(text)` had no repository consumer. Its
  SECURITY DEFINER body reads `auth.users` by email and returns a user UUID,
  with no caller authorization check.
- `public.add_empresa_membro_por_email(integer,text,text)` is consumed by the
  browser at `src/routes/gestao/empresas/+page.svelte:114`. Its body enforces
  an authenticated owner/admin check before writing membership, so its
  authenticated execution is preserved. Anonymous execution had no legitimate
  consumer and is removed.

## Exact pre-change production snapshot

All three functions were `SECURITY DEFINER` immediately before migration:

```text
add_empresa_membro_por_email(integer,text,text)
  prosecdef=true
  proconfig={search_path=public}
  proacl={postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}

get_user_id_by_email(text)
  prosecdef=true
  proconfig={search_path=auth, public}
  proacl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}

saldo_caixa(bigint)
  prosecdef=true
  proconfig=NULL
  proacl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

The exact pre-change function definitions returned by `pg_get_functiondef`
were:

```sql
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$function$;
```

```sql
CREATE OR REPLACE FUNCTION public.saldo_caixa(p_id_caixa bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    -- Valor inicial de abertura do caixa
    COALESCE(c.valor_inicial, 0)
    -- Vendas em dinheiro simples (forma_pagamento = 'dinheiro')
    + COALESCE((
        SELECT SUM(
          GREATEST(COALESCE(v.valor_recebido, 0) - COALESCE(v.valor_troco, 0), 0)
        )
        FROM vendas v
        WHERE v.id_caixa = p_id_caixa
          AND v.forma_pagamento = 'dinheiro'
    ), 0)

    -- Dinheiro em vendas com pagamento múltiplo
    + COALESCE((
        SELECT SUM(vp.valor)
        FROM vendas_pagamentos vp
        JOIN vendas v ON vp.id_venda = v.id
        WHERE v.id_caixa = p_id_caixa
          AND vp.forma_pagamento = 'dinheiro'
    ), 0)

    -- Sangrias (saídas do caixa)
    - COALESCE((
        SELECT SUM(m.valor)
        FROM caixa_movimentacoes m
        WHERE m.id_caixa = p_id_caixa
          AND m.tipo = 'sangria'
    ), 0)

    -- Suprimentos (entradas extras)
    + COALESCE((
        SELECT SUM(m.valor)
        FROM caixa_movimentacoes m
        WHERE m.id_caixa = p_id_caixa
          AND m.tipo = 'suprimento'
    ), 0)

  FROM caixas c
  WHERE c.id = p_id_caixa;
$function$;
```

```sql
CREATE OR REPLACE FUNCTION public.add_empresa_membro_por_email(
  p_id_empresa integer,
  p_email text,
  p_role text DEFAULT 'atendente'::text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.empresa_usuarios eu
    where eu.id_empresa = p_id_empresa and eu.id_usuario = auth.uid() and eu.role = 'admin'
  )
  or exists (
    select 1 from public.empresas e
    where e.id = p_id_empresa and e.id_owner = auth.uid()
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(p_email);
  if v_user is null then
    raise exception 'Usuário não encontrado para o e-mail informado';
  end if;

  insert into public.empresa_usuarios(id_empresa, id_usuario, role)
  values (p_id_empresa, v_user, p_role)
  on conflict (id_empresa, id_usuario) do update set role = excluded.role;
end;
$function$;
```

The body is not replaced by this migration and continues to enforce the
existing owner/admin check before membership writes.

Definitions were captured with `pg_get_functiondef` in the production query;
the migration does not replace or alter any function body, signature, or
`search_path`.

## Minimal forward change

`supabase/migrations/20260813033000_rpc_security_definer_containment.sql`:

- revokes `EXECUTE` from `public`, `anon`, and `authenticated` for
  `get_user_id_by_email(text)` and `saldo_caixa(bigint)`;
- restores `EXECUTE` only to `service_role` for those two server-only RPCs;
- revokes only `public`/`anon` execution for
  `add_empresa_membro_por_email(integer,text,text)` and explicitly grants
  `authenticated`/`service_role`, preserving the existing authenticated UI
  flow and its internal owner/admin guard.

No table grants, policies, function definitions, billing logic, sales logic, or
UI files are changed.

## Blast radius

| Principal/flow | `saldo_caixa` / `get_user_id_by_email` | `add_empresa_membro_por_email` |
| --- | --- | --- |
| anon | denied after migration; no repository consumer | denied; no repository consumer |
| authenticated owner | denied; no repository consumer | remains executable; internal owner/admin guard unchanged |
| authenticated subuser | denied; no repository consumer | remains executable but internal guard denies non-admin |
| authenticated super-admin | denied; no repository consumer | remains executable; existing function guard still applies |
| service role | remains executable for trusted server paths | remains executable |

## Verification plan

After applying the migration, verify exact function ACLs plus RPC calls as anon,
owner, subuser, super-admin, and service role. The authenticated owner probe for
the membership RPC uses a nonexistent email and expects the function's existing
`Usuário não encontrado...` error after authorization, so no membership row is
written. All write probes are transactional or use nonexistent targets.

## Post-migration verification

Migration `20260813033000` was applied to the linked production project.

- Exact ACL query returned `saldo_caixa` and `get_user_id_by_email` executable
  only by `postgres`/`service_role`; `add_empresa_membro_por_email` retained
  `authenticated`/`service_role` and no longer listed `anon`.
- `anon` calls to all three functions failed with `42501 permission denied`.
- Owner, subuser, and active super-admin authenticated calls to both
  server-only functions failed with `42501 permission denied`.
- Service-role transaction successfully executed `saldo_caixa(0)` and
  `get_user_id_by_email('kdo.vini@gmail.com')`; the query was read-only and no
  row was changed.
- Authenticated owner, subuser, and super-admin membership probes reached the
  preserved function grant and its existing guard, returning `Acesso negado`
  for the nonexistent company id. Production has zero `empresas` and zero
  `empresa_usuarios`, so a positive owner/admin membership write was not
  available without creating a fixture; no fixture was created.

## Rollback

Restore the exact pre-change execution grants without changing definitions:

```sql
grant execute on function public.add_empresa_membro_por_email(integer,text,text)
  to anon, authenticated, service_role;
grant execute on function public.get_user_id_by_email(text)
  to public, anon, authenticated, service_role;
grant execute on function public.saldo_caixa(bigint)
  to public, anon, authenticated, service_role;
```

Because this migration changes only function ACLs, rollback has no data effect.
