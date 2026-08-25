-- Canonical customer identity foundation.
-- pessoas remains the PDV-owned master record; this migration only adds CRM
-- identity links and the server-side WhatsApp resolution boundary.

begin;

alter table public.pessoas
  add column if not exists aniversario_dia smallint,
  add column if not exists aniversario_mes smallint,
  add column if not exists aniversario_ano smallint,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.pessoas'::regclass
       and conname = 'pessoas_aniversario_dia_mes_check'
  ) then
    alter table public.pessoas
      add constraint pessoas_aniversario_dia_mes_check
      check (
        (aniversario_dia is null and aniversario_mes is null)
        or (
          aniversario_dia between 1 and 31
          and aniversario_mes between 1 and 12
        )
      );
  end if;
end
$$;

create or replace function public.touch_pessoa_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pessoas_set_updated_at on public.pessoas;
create trigger pessoas_set_updated_at
before update on public.pessoas
for each row execute function public.touch_pessoa_updated_at();

create table if not exists public.pessoa_identities (
  id uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  kind text not null,
  value_normalized text not null,
  is_primary boolean not null default false,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pessoa_identities_kind_check check (kind in ('phone', 'email')),
  constraint pessoa_identities_value_check check (length(value_normalized) > 0),
  constraint pessoa_identities_owner_kind_value_unique
    unique (id_usuario, kind, value_normalized)
);

create index if not exists pessoa_identities_owner_kind_idx
  on public.pessoa_identities (id_usuario, kind, value_normalized);

create unique index if not exists pessoa_identities_primary_phone_unique
  on public.pessoa_identities (pessoa_id)
  where kind = 'phone' and is_primary;

create or replace function public.normalize_brazilian_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text;
  v_national text;
begin
  v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_digits = '' then
    return null;
  end if;

  if left(v_digits, 2) = '00' then
    v_digits := substring(v_digits from 3);
  end if;

  if left(v_digits, 2) = '55' then
    v_national := substring(v_digits from 3);
  else
    v_national := v_digits;
  end if;

  -- Brazilian landlines have 10 digits and mobiles have 11. The ninth
  -- digit is part of the canonical value and is deliberately preserved.
  if length(v_national) not in (10, 11) or left(v_national, 1) = '0' then
    return null;
  end if;

  return '55' || v_national;
end;
$$;

-- Preserve existing contato values as identities before the server-side
-- resolver starts creating records. Employee rows win an old duplicate so a
-- WhatsApp number already assigned to staff cannot silently become a client.
insert into public.pessoa_identities (
  id_usuario, pessoa_id, kind, value_normalized, is_primary, source
)
select id_usuario, pessoa_id, 'phone', value_normalized, true, 'migration_backfill'
  from (
    select distinct on (p.id_usuario, public.normalize_brazilian_phone(p.contato))
      p.id_usuario,
      p.id as pessoa_id,
      public.normalize_brazilian_phone(p.contato) as value_normalized
      from public.pessoas p
     where public.normalize_brazilian_phone(p.contato) is not null
     order by p.id_usuario,
              public.normalize_brazilian_phone(p.contato),
              case when p.tipo = 'funcionario' then 0 else 1 end,
              p.created_at,
              p.id
  ) seeded
on conflict (id_usuario, kind, value_normalized) do nothing;

alter table public.pessoa_identities enable row level security;

drop policy if exists pessoa_identities_owner_select on public.pessoa_identities;
create policy pessoa_identities_owner_select
  on public.pessoa_identities
  for select
  to authenticated
  using (public.get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists pessoa_identities_actor_insert on public.pessoa_identities;
create policy pessoa_identities_actor_insert
  on public.pessoa_identities
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
    and exists (
      select 1
        from public.pessoas p
       where p.id = pessoa_id
         and p.id_usuario = pessoa_identities.id_usuario
    )
  );

drop policy if exists pessoa_identities_actor_update on public.pessoa_identities;
create policy pessoa_identities_actor_update
  on public.pessoa_identities
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
    and exists (
      select 1
        from public.pessoas p
       where p.id = pessoa_id
         and p.id_usuario = pessoa_identities.id_usuario
    )
  );

drop policy if exists pessoa_identities_actor_delete on public.pessoa_identities;
create policy pessoa_identities_actor_delete
  on public.pessoa_identities
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('pessoas.gerenciar', id_usuario)
  );

revoke all on table public.pessoa_identities from anon;
grant select, insert, update, delete on table public.pessoa_identities to authenticated;
grant all on table public.pessoa_identities to service_role;

create or replace function public.ensure_customer_from_whatsapp(
  p_owner_user_id uuid,
  p_phone text,
  p_observed_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_observed_name text := nullif(trim(coalesce(p_observed_name, '')), '');
  v_pessoa_id uuid;
  v_pessoa_nome text;
  v_pessoa_tipo text;
begin
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'Esta operação é restrita ao serviço.' using errcode = '42501';
  end if;

  v_phone := public.normalize_brazilian_phone(p_phone);
  if p_owner_user_id is null or v_phone is null then
    return jsonb_build_object(
      'status', 'invalid',
      'pessoaId', null::uuid,
      'reason', 'owner_or_phone_invalid'
    );
  end if;

  -- All callers for one tenant/phone wait on the same transaction lock before
  -- reading or creating a person. This closes the check-then-insert race.
  perform pg_advisory_xact_lock(
    hashtextextended(p_owner_user_id::text || ':' || v_phone, 0)
  );

  select pi.pessoa_id, p.nome, p.tipo
    into v_pessoa_id, v_pessoa_nome, v_pessoa_tipo
    from public.pessoa_identities pi
    join public.pessoas p
      on p.id = pi.pessoa_id
     and p.id_usuario = pi.id_usuario
   where pi.id_usuario = p_owner_user_id
     and pi.kind = 'phone'
     and pi.value_normalized = v_phone
   for update of pi, p;

  if not found then
    -- The fallback keeps old contato-only rows linkable if a deployment was
    -- interrupted after the table creation but before its backfill.
    select p.id, p.nome, p.tipo
      into v_pessoa_id, v_pessoa_nome, v_pessoa_tipo
      from public.pessoas p
     where p.id_usuario = p_owner_user_id
       and public.normalize_brazilian_phone(p.contato) = v_phone
     order by case when p.tipo = 'funcionario' then 0 else 1 end,
              p.created_at,
              p.id
     limit 1
     for update;

    if found then
      insert into public.pessoa_identities (
        id_usuario, pessoa_id, kind, value_normalized, is_primary, source
      ) values (
        p_owner_user_id, v_pessoa_id, 'phone', v_phone, true, 'whatsapp'
      ) on conflict (id_usuario, kind, value_normalized) do nothing;
    end if;
  end if;

  if found then
    if v_pessoa_tipo = 'funcionario' then
      return jsonb_build_object(
        'status', 'conflict',
        'pessoaId', v_pessoa_id,
        'reason', 'phone_belongs_to_employee'
      );
    end if;

    -- Observed WhatsApp names are hints only. A blank name or a name that is
    -- still the phone may be filled; a manually chosen name is never replaced.
    if (nullif(trim(coalesce(v_pessoa_nome, '')), '') is null
        or public.normalize_brazilian_phone(v_pessoa_nome) = v_phone)
       and v_observed_name is not null then
      update public.pessoas
         set nome = v_observed_name
       where id = v_pessoa_id;
    end if;

    return jsonb_build_object(
      'status', 'linked',
      'pessoaId', v_pessoa_id,
      'reason', null::text
    );
  end if;

  if public.normalize_brazilian_phone(v_observed_name) = v_phone then
    v_observed_name := null;
  end if;

  insert into public.pessoas (id_usuario, nome, tipo, contato)
  values (
    p_owner_user_id,
    coalesce(v_observed_name, v_phone),
    'cliente',
    v_phone
  )
  returning id into v_pessoa_id;

  insert into public.pessoa_identities (
    id_usuario, pessoa_id, kind, value_normalized, is_primary, source
  ) values (
    p_owner_user_id, v_pessoa_id, 'phone', v_phone, true, 'whatsapp'
  );

  return jsonb_build_object(
    'status', 'created',
    'pessoaId', v_pessoa_id,
    'reason', null::text
  );
end;
$$;

revoke all on function public.ensure_customer_from_whatsapp(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_customer_from_whatsapp(uuid, text, text)
  to service_role;

commit;
