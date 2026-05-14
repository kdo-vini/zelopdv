-- Cleanup obsolete admin finance settings singleton
-- Replaced by public.admin_finance_fixed_expenses on 2026-05-13.

begin;

drop table if exists public.admin_finance_settings;

commit;
