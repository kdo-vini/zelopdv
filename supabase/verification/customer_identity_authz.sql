-- Transactional runtime verification for customer identity resolution.
-- Every fixture row is rolled back. The repeated service calls exercise the
-- advisory-lock/idempotency boundary. The companion
-- scripts/verify-customer-identity-concurrency.mjs opens two independent
-- sessions and is the true concurrent race probe.

begin;

create temporary table customer_identity_fixture (
  owner_a uuid not null,
  owner_b uuid not null,
  employee_id uuid not null,
  no_cap_id uuid not null,
  allowed_id uuid not null,
  no_cap_role_id uuid not null,
  allowed_role_id uuid not null,
  first_person_id uuid,
  second_person_id uuid,
  other_tenant_person_id uuid,
  employee_person_id uuid not null
) on commit drop;

insert into customer_identity_fixture (
  owner_a, owner_b, employee_id, no_cap_id, allowed_id,
  no_cap_role_id, allowed_role_id, employee_person_id
)
values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
);

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select actor_id,
       'codex-customer-identity-' || actor_id::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from customer_identity_fixture f
 cross join lateral (
   values (f.owner_a), (f.owner_b), (f.employee_id), (f.no_cap_id), (f.allowed_id)
 ) actors(actor_id);

insert into public.access_roles (id, owner_user_id, name, permissions)
select no_cap_role_id, owner_a, 'Codex customer no cap', '{"pessoas.visualizar":true}'::jsonb
  from customer_identity_fixture
union all
select allowed_role_id, owner_a, 'Codex customer allowed', '{"pessoas.gerenciar":true}'::jsonb
  from customer_identity_fixture;

insert into public.access_users (
  owner_user_id, auth_user_id, email, role_id, status
)
select owner_a, no_cap_id, 'codex-customer-no-cap@invalid.local', no_cap_role_id, 'active'
  from customer_identity_fixture
union all
select owner_a, allowed_id, 'codex-customer-allowed@invalid.local', allowed_role_id, 'active'
  from customer_identity_fixture;

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
  if has_table_privilege('anon', 'public.pessoa_identities', 'select') then
    raise exception 'anon can select pessoa_identities';
  end if;
  if not exists (
    select 1
      from pg_proc
     where oid = 'public.ensure_customer_from_whatsapp(uuid,text,text)'::regprocedure
       and array_to_string(proconfig, ',') like '%search_path=public, pg_temp%'
  ) then
    raise exception 'ensure_customer_from_whatsapp search_path is not hardened';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

-- A pre-existing employee phone must never be converted into a customer.
insert into public.pessoas (id, id_usuario, nome, tipo, contato)
select employee_person_id, owner_a, 'Funcionário de teste', 'funcionario', '5511999999999'
  from customer_identity_fixture;

insert into public.pessoa_identities (
  id_usuario, pessoa_id, kind, value_normalized, is_primary, source
)
select owner_a, employee_person_id, 'phone', '5511999999999', true, 'verification'
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

  if exists (
    select 1
      from public.pessoas
     where id = (first_result ->> 'pessoaId')::uuid
       and nome <> 'Cliente WhatsApp'
  ) then
    raise exception 'manual customer name was overwritten';
  end if;

  update customer_identity_fixture
     set first_person_id = (first_result ->> 'pessoaId')::uuid,
         second_person_id = (second_result ->> 'pessoaId')::uuid,
         other_tenant_person_id = (other_tenant_result ->> 'pessoaId')::uuid;
end;
$$;

do $$
begin
  if public.normalize_brazilian_phone('5512345678') <> '555512345678'
     or public.normalize_brazilian_phone('5511987654321') <> '5511987654321'
     or public.normalize_brazilian_phone('+55 11 98765-4321') <> '5511987654321'
     or public.normalize_brazilian_phone('005511987654321') is not null
     or public.normalize_brazilian_phone('123456789012') is not null then
    raise exception 'Brazilian phone normalization contract changed';
  end if;
end;
$$;

do $$
declare
  p_one uuid := gen_random_uuid();
  p_two uuid := gen_random_uuid();
  ambiguous_result jsonb;
begin
  insert into public.pessoas (id, id_usuario, nome, tipo, contato)
  values
    (p_one, (select owner_a from customer_identity_fixture), 'Ambígua 1', 'cliente', '5511777777777'),
    (p_two, (select owner_a from customer_identity_fixture), 'Ambígua 2', 'cliente', '5511777777777');
  ambiguous_result := public.ensure_customer_from_whatsapp(
    (select owner_a from customer_identity_fixture), '5511777777777', 'Observado'
  );
  if ambiguous_result ->> 'status' <> 'conflict'
     or ambiguous_result ->> 'reason' <> 'phone_contact_ambiguous'
     or exists (
       select 1
         from public.pessoa_identities
        where id_usuario = (select owner_a from customer_identity_fixture)
          and value_normalized = '5511777777777'
     ) then
    raise exception 'ambiguous contact was linked: %', ambiguous_result;
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.pessoas (id, id_usuario, nome, tipo, contato, aniversario_ano)
    values (
      gen_random_uuid(), (select owner_a from customer_identity_fixture),
      'Ano inválido', 'cliente', '5511666666666', 2101
    );
    raise exception 'birthday year 2101 was accepted';
  exception when check_violation then null;
  end;
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
  if visible_count <> 2 or leaked_count <> 0 then
    raise exception 'identity RLS is not owner-scoped: visible=%, leaked=%',
      visible_count, leaked_count;
  end if;
end;
$$;

reset role;

-- A role without pessoas.gerenciar cannot insert, update, or delete an
-- identity. These are real RLS probes, not ACL/source assertions.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', (select no_cap_id from customer_identity_fixture)
  )::text,
  true
);

do $$
declare
  mutation_succeeded boolean;
  target_id uuid := (select first_person_id from customer_identity_fixture);
begin
  begin
    insert into public.pessoa_identities (
      id_usuario, pessoa_id, kind, value_normalized, source
    ) values (
      (select owner_a from customer_identity_fixture), target_id,
      'email', 'denied@invalid.local', 'verification'
    );
    raise exception 'no-cap role inserted identity';
  exception when insufficient_privilege or check_violation then null;
  end;

  mutation_succeeded := false;
  update public.pessoa_identities
     set source = 'denied-update'
   where id_usuario = (select owner_a from customer_identity_fixture)
     and pessoa_id = target_id
  returning true into mutation_succeeded;
  if coalesce(mutation_succeeded, false) then
    raise exception 'no-cap role updated identity';
  end if;

  mutation_succeeded := false;
  delete from public.pessoa_identities
   where id_usuario = (select owner_a from customer_identity_fixture)
     and pessoa_id = target_id
  returning true into mutation_succeeded;
  if coalesce(mutation_succeeded, false) then
    raise exception 'no-cap role deleted identity';
  end if;
end;
$$;

reset role;

-- A role with pessoas.gerenciar can perform the same bounded write.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', (select allowed_id from customer_identity_fixture)
  )::text,
  true
);

insert into public.pessoa_identities (
  id_usuario, pessoa_id, kind, value_normalized, source
)
select owner_a, first_person_id, 'email', 'allowed@invalid.local', 'verification'
  from customer_identity_fixture;

do $$
begin
  if not exists (
    select 1
      from public.pessoa_identities
     where value_normalized = 'allowed@invalid.local'
  ) then
    raise exception 'allowed role could not insert identity';
  end if;
end;
$$;

reset role;
rollback;
