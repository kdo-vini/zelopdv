create table if not exists public.admin_company_metric_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  include_in_metrics boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_company_metric_settings enable row level security;

create policy "admin_company_metric_settings_select"
  on public.admin_company_metric_settings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = (select auth.uid())
        and sa.is_active = true
    )
  );

create policy "admin_company_metric_settings_insert"
  on public.admin_company_metric_settings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = (select auth.uid())
        and sa.is_active = true
    )
  );

create policy "admin_company_metric_settings_update"
  on public.admin_company_metric_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = (select auth.uid())
        and sa.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = (select auth.uid())
        and sa.is_active = true
    )
  );

create policy "admin_company_metric_settings_delete"
  on public.admin_company_metric_settings
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = (select auth.uid())
        and sa.is_active = true
    )
  );

grant select, insert, update, delete on public.admin_company_metric_settings to authenticated;
revoke all on public.admin_company_metric_settings from anon;

insert into public.admin_company_metric_settings (user_id, include_in_metrics)
select id, false
from auth.users
where id in (
  'd5625be9-abef-4371-a8e7-e915220aec42'::uuid,
  '4aaab75b-d701-4e97-902f-8a891ec3951a'::uuid
)
on conflict (user_id) do update
set include_in_metrics = false,
    updated_at = timezone('utc', now());
