-- Transactional runtime verification for customer identity resolution.
-- Every fixture row is rolled back. The repeated service calls exercise the
-- advisory-lock/idempotency boundary; two independent sessions should also
-- be used by operators when measuring lock wait time under load.

begin;

create temporary table customer_identity_fixture (
  owner_a uuid not null,
  owner_b uuid not null,
  employee_id uuid not null,
  first_person_id uuid,
  second_person_id uuid,
  other_tenant_person_id uuid,
  employee_person_id uuid not null
) on commit drop;

insert into customer_identity_fixture (
  owner_a, owner_b, employee_id, employee_person_id
)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select actor_id,
       'codex-customer-identity-' || actor_id::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from customer_identity_fixture f
 cross join lateral (values (f.owner_a), (f.owner_b), (f.employee_id)) actors(actor_id);

-- The migration must expose the function to the server role only.
do $$
begin
  if has_function_privilege(
       'authenticated',
       'public.ensure_customer_from_whatsapp(uuid,text,text)',
       'execute'
     ) then
    raise exception 'authenticated can execute ensure_customer_from_whatsapp';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.ensure_customer_from_whatsapp(uuid,text,text)',
       'execute'
     ) then
    raise exception 'service_role cannot execute ensure_customer_from_whatsapp';
  end if;
  if not exists (
    select 1
      from pg_proc
     where oid = 'public.ensure_customer_from_whatsapp(uuid,text,text)'::regprocedure
       and prosrc like '%pg_advisory_xact_lock%'
  ) then
    raise exception 'ensure_customer_from_whatsapp has no transaction advisory lock';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

-- A pre-existing employee phone must never be converted into a customer.
insert into public.pessoas (id, id_usuario, nome, tipo, contato)
select employee_person_id, owner_a, 'Funcionário de teste', 'funcionario', '5511999999999'
  from customer_identity_fixture;

do $$
declare
  employee_result jsonb;
begin
  employee_result := public.ensure_customer_from_whatsapp(
    (select owner_a from customer_identity_fixture),
    '(11) 99999-9999',
    'Cliente observado'
  );
  if employee_result ->> 'status' <> 'conflict'
     or employee_result ->> 'reason' <> 'phone_belongs_to_employee' then
    raise exception 'employee phone did not conflict: %', employee_result;
  end if;
end;
$$;

do $$
declare
  first_result jsonb;
  second_result jsonb;
  other_tenant_result jsonb;
begin
  first_result := public.ensure_customer_from_whatsapp(
    (select owner_a from customer_identity_fixture),
    '+55 11 98888-7777',
    'Cliente WhatsApp'
  );
  second_result := public.ensure_customer_from_whatsapp(
    (select owner_a from customer_identity_fixture),
    '5511988887777',
    'Nome que não deve substituir'
  );
  other_tenant_result := public.ensure_customer_from_whatsapp(
    (select owner_b from customer_identity_fixture),
    '5511988887778',
    'Outro tenant'
  );

  if first_result ->> 'status' <> 'created'
     or second_result ->> 'status' <> 'linked'
     or first_result ->> 'pessoaId' <> second_result ->> 'pessoaId' then
    raise exception 'same owner/phone was not serialized and linked: first=%, second=%',
      first_result, second_result;
  end if;
  if other_tenant_result ->> 'status' <> 'created'
     or other_tenant_result ->> 'pessoaId' = first_result ->> 'pessoaId' then
    raise exception 'identity leaked across owner tenants: %', other_tenant_result;
  end if;

  update customer_identity_fixture
     set first_person_id = (first_result ->> 'pessoaId')::uuid,
         second_person_id = (second_result ->> 'pessoaId')::uuid,
         other_tenant_person_id = (other_tenant_result ->> 'pessoaId')::uuid;
end;
$$;

do $$
declare
  invalid_result jsonb;
begin
  invalid_result := public.ensure_customer_from_whatsapp(
    (select owner_a from customer_identity_fixture),
    '123',
    'Número inválido'
  );
  if invalid_result <> jsonb_build_object(
       'status', 'invalid',
       'pessoaId', null::uuid,
       'reason', 'owner_or_phone_invalid'
     ) then
    raise exception 'invalid phone contract changed: %', invalid_result;
  end if;
end;
$$;

reset role;

-- Browser identities are tenant-isolated by RLS. The owner may read only its
-- own rows; the other tenant's identity must be invisible.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', (select owner_a from customer_identity_fixture)
  )::text,
  true
);

do $$
declare
  visible_count integer;
  leaked_count integer;
begin
  select count(*) into visible_count
    from public.pessoa_identities
   where id_usuario = (select owner_a from customer_identity_fixture);
  select count(*) into leaked_count
    from public.pessoa_identities
   where id_usuario = (select owner_b from customer_identity_fixture);
  if visible_count <> 1 or leaked_count <> 0 then
    raise exception 'identity RLS is not owner-scoped: visible=%, leaked=%',
      visible_count, leaked_count;
  end if;
end;
$$;

reset role;
rollback;
