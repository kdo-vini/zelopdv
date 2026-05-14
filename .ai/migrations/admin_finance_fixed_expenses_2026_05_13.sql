-- Admin finance fixed expenses
-- Shared list of recurring fixed-cost items for the internal admin dashboard.
-- Items are global and persistent across browsers, but are not tracked by month.
-- 2026-05-13

begin;

create table if not exists public.admin_finance_fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(trim(label)) > 0),
  amount numeric(12,2) not null check (amount >= 0),
  created_by uuid references public.super_admins(id) on delete set null,
  updated_by uuid references public.super_admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_finance_fixed_expenses is
  'Shared fixed-expense items used by the internal admin financial dashboard.';

comment on column public.admin_finance_fixed_expenses.amount is
  'Recurring fixed amount for the expense item. Not tied to any specific month.';

alter table public.admin_finance_fixed_expenses enable row level security;

grant select, insert, update, delete on public.admin_finance_fixed_expenses to authenticated;

drop policy if exists "admin_finance_fixed_expenses_select" on public.admin_finance_fixed_expenses;
create policy "admin_finance_fixed_expenses_select"
  on public.admin_finance_fixed_expenses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = auth.uid()
        and sa.is_active = true
    )
  );

drop policy if exists "admin_finance_fixed_expenses_insert" on public.admin_finance_fixed_expenses;
create policy "admin_finance_fixed_expenses_insert"
  on public.admin_finance_fixed_expenses
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = auth.uid()
        and sa.is_active = true
    )
  );

drop policy if exists "admin_finance_fixed_expenses_update" on public.admin_finance_fixed_expenses;
create policy "admin_finance_fixed_expenses_update"
  on public.admin_finance_fixed_expenses
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = auth.uid()
        and sa.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = auth.uid()
        and sa.is_active = true
    )
  );

drop policy if exists "admin_finance_fixed_expenses_delete" on public.admin_finance_fixed_expenses;
create policy "admin_finance_fixed_expenses_delete"
  on public.admin_finance_fixed_expenses
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.super_admins sa
      where sa.user_id = auth.uid()
        and sa.is_active = true
    )
  );

commit;
