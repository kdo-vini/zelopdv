-- Keep the administrative PIN opt-in state explicit and tenant-scoped.
-- The column exists in the current baseline; IF NOT EXISTS keeps this
-- forward-only migration safe for environments that already have it.
alter table public.empresa_perfil
  add column if not exists pin_enabled boolean not null default true;

update public.empresa_perfil
set pin_enabled = true
where pin_enabled is null;

alter table public.empresa_perfil
  alter column pin_enabled set default true,
  alter column pin_enabled set not null;
