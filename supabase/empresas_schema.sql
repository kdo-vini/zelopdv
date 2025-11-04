-- Empresas e membros (RLS + RPC)
-- Execute no Supabase SQL Editor (ajuste nomes se necessário)

-- 1) Tabelas
create table if not exists public.empresas (
  id serial primary key,
  id_owner uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cnpj text,
  created_at timestamptz not null default now()
);

create table if not exists public.empresa_usuarios (
  id_empresa integer not null references public.empresas(id) on delete cascade,
  id_usuario uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','atendente')),
  created_at timestamptz not null default now(),
  primary key (id_empresa, id_usuario)
);

-- 2) RLS
alter table public.empresas enable row level security;
alter table public.empresa_usuarios enable row level security;

-- recria políticas de forma idempotente (DROP IF EXISTS + CREATE)
drop policy if exists empresas_select on public.empresas;
create policy empresas_select
on public.empresas for select
using (
  id_owner = auth.uid() or exists (
    select 1 from public.empresa_usuarios eu
    where eu.id_empresa = empresas.id and eu.id_usuario = auth.uid()
  )
);

-- Empresas: INSERT apenas para quem cria como owner
drop policy if exists empresas_insert on public.empresas;
create policy empresas_insert
on public.empresas for insert
with check (id_owner = auth.uid());

-- Empresas: UPDATE/DELETE apenas admin (ou owner)
drop policy if exists empresas_update on public.empresas;
create policy empresas_update
on public.empresas for update
using (
  id_owner = auth.uid() or exists (
    select 1 from public.empresa_usuarios eu
    where eu.id_empresa = empresas.id and eu.id_usuario = auth.uid() and eu.role = 'admin'
  )
)
with check (
  id_owner = auth.uid() or exists (
    select 1 from public.empresa_usuarios eu
    where eu.id_empresa = empresas.id and eu.id_usuario = auth.uid() and eu.role = 'admin'
  )
);

drop policy if exists empresas_delete on public.empresas;
create policy empresas_delete
on public.empresas for delete
using (
  id_owner = auth.uid() or exists (
    select 1 from public.empresa_usuarios eu
    where eu.id_empresa = empresas.id and eu.id_usuario = auth.uid() and eu.role = 'admin'
  )
);

-- Empresa_Usuarios: SELECT para membros da empresa
drop policy if exists empresa_usuarios_select on public.empresa_usuarios;
create policy empresa_usuarios_select
on public.empresa_usuarios for select
using (
  exists (
    select 1 from public.empresa_usuarios eu2
    where eu2.id_empresa = empresa_usuarios.id_empresa and eu2.id_usuario = auth.uid()
  )
);

-- Empresa_Usuarios: INSERT/DELETE/UPDATE apenas admin da empresa
drop policy if exists empresa_usuarios_insert on public.empresa_usuarios;
create policy empresa_usuarios_insert
on public.empresa_usuarios for insert
with check (
  exists (
    select 1 from public.empresa_usuarios eu2
    where eu2.id_empresa = empresa_usuarios.id_empresa and eu2.id_usuario = auth.uid() and eu2.role = 'admin'
  ) or exists (
    -- também permitir que o owner faça a primeira inclusão
    select 1 from public.empresas e
    where e.id = empresa_usuarios.id_empresa and e.id_owner = auth.uid()
  )
);

drop policy if exists empresa_usuarios_update on public.empresa_usuarios;
create policy empresa_usuarios_update
on public.empresa_usuarios for update
using (
  exists (
    select 1 from public.empresa_usuarios eu2
    where eu2.id_empresa = empresa_usuarios.id_empresa and eu2.id_usuario = auth.uid() and eu2.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.empresa_usuarios eu2
    where eu2.id_empresa = empresa_usuarios.id_empresa and eu2.id_usuario = auth.uid() and eu2.role = 'admin'
  )
);

drop policy if exists empresa_usuarios_delete on public.empresa_usuarios;
create policy empresa_usuarios_delete
on public.empresa_usuarios for delete
using (
  exists (
    select 1 from public.empresa_usuarios eu2
    where eu2.id_empresa = empresa_usuarios.id_empresa and eu2.id_usuario = auth.uid() and eu2.role = 'admin'
  )
);

-- 3) RPC: adicionar membro por e-mail (security definer)
-- Resolve e-mail -> id de usuário na tabela auth.users e insere como membro
create or replace function public.add_empresa_membro_por_email(
  p_id_empresa int,
  p_email text,
  p_role text default 'atendente'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_is_admin boolean;
begin
  -- Confere se quem chama é admin (ou owner) da empresa
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

  -- Busca usuário por e-mail (em auth.users)
  select u.id into v_user from auth.users u where lower(u.email) = lower(p_email);
  if v_user is null then
    raise exception 'Usuário não encontrado para o e-mail informado';
  end if;

  -- Insere ou atualiza papel
  insert into public.empresa_usuarios(id_empresa, id_usuario, role)
  values (p_id_empresa, v_user, p_role)
  on conflict (id_empresa, id_usuario) do update set role = excluded.role;
end;
$$;

-- Permissão para todos os usuários autenticados executarem a função
revoke all on function public.add_empresa_membro_por_email(int, text, text) from public;
grant execute on function public.add_empresa_membro_por_email(int, text, text) to anon, authenticated;
