-- Transactional authorization regression for list/insert on zelochat-media.
-- DELETE is exercised through the Storage API because managed triggers reject
-- direct storage.objects deletion for every role. All fixture rows roll back.

begin;

insert into storage.objects (bucket_id, name, metadata)
values (
  'zelochat-media',
  'authz-probe/fixture-visible.png',
  '{"mimetype":"image/png"}'::jsonb
);

set local role anon;

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'zelochat-media'
      and name = 'authz-probe/fixture-visible.png'
  ) then
    raise exception 'anon can list zelochat-media objects';
  end if;
end;
$$;

do $$
declare
  insert_was_allowed boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'zelochat-media',
      'authz-probe/anon-insert.png',
      '{"mimetype":"image/png"}'::jsonb
    );
    insert_was_allowed := true;
  exception
    when insufficient_privilege then null;
  end;

  if insert_was_allowed then
    raise exception 'anon can insert zelochat-media objects';
  end if;
end;
$$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  true
);

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'zelochat-media'
      and name = 'authz-probe/fixture-visible.png'
  ) then
    raise exception 'authenticated owner can list zelochat-media objects';
  end if;
end;
$$;

do $$
declare
  insert_was_allowed boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'zelochat-media',
      'authz-probe/authenticated-insert.png',
      '{"mimetype":"image/png"}'::jsonb
    );
    insert_was_allowed := true;
  exception
    when insufficient_privilege then null;
  end;

  if insert_was_allowed then
    raise exception 'authenticated owner can insert zelochat-media objects';
  end if;
end;
$$;

-- Subusers and external super-admins resolve to the same database role for
-- Storage RLS. Distinct claims prove the policy does not accidentally depend
-- on the application actor id.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'zelochat-media'
      and name = 'authz-probe/fixture-visible.png'
  ) then
    raise exception 'authenticated subuser can list zelochat-media objects';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}',
  true
);

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'zelochat-media'
      and name = 'authz-probe/fixture-visible.png'
  ) then
    raise exception 'external super-admin can list zelochat-media objects';
  end if;
end;
$$;

reset role;

set local role service_role;

do $$
begin
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'zelochat-media'
      and name = 'authz-probe/fixture-visible.png'
  ) then
    raise exception 'service_role cannot list zelochat-media objects';
  end if;

  insert into storage.objects (bucket_id, name, metadata)
  values (
    'zelochat-media',
    'authz-probe/service-insert.png',
    '{"mimetype":"image/png"}'::jsonb
  );

end;
$$;

reset role;
rollback;
