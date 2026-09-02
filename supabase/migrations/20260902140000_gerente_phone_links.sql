-- supabase/migrations/20260902140000_gerente_phone_links.sql
-- Vínculo verificado entre o telefone do dono e a empresa, para o canal WhatsApp
-- do Zelinho Gerente. Só o servidor lê e escreve; o dono consulta via /api/gerente/pair.

create table if not exists public.gerente_phone_links (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  phone_normalized text not null unique,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint gerente_phone_links_phone_format check (phone_normalized ~ '^55[0-9]{10,11}$')
);

create table if not exists public.gerente_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint gerente_pairing_codes_hash_format check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint gerente_pairing_codes_expiry check (expires_at > created_at)
);

create index if not exists gerente_pairing_codes_live_idx
  on public.gerente_pairing_codes (code_hash)
  where consumed_at is null;

create index if not exists gerente_pairing_codes_owner_idx
  on public.gerente_pairing_codes (owner_user_id, created_at desc);

alter table public.gerente_phone_links enable row level security;
alter table public.gerente_pairing_codes enable row level security;

revoke all on table public.gerente_phone_links from public, anon, authenticated;
revoke all on table public.gerente_pairing_codes from public, anon, authenticated;
grant all on table public.gerente_phone_links to service_role;
grant all on table public.gerente_pairing_codes to service_role;

comment on table public.gerente_phone_links is
  'Telefone verificado do dono para falar com o Zelinho Gerente pelo WhatsApp. Formato 55 + DDD + número.';
comment on table public.gerente_pairing_codes is
  'Códigos de 6 dígitos (apenas SHA-256) com validade de 10 minutos para vincular o telefone do dono.';
