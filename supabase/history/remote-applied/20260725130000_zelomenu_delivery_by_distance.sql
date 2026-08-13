-- ZeloMenu Delivery by Distance
--
-- Replaces bairro-based delivery pricing with distance-based zoning.
-- Adds structured address columns to empresa_perfil so the store's
-- delivery origin can be geocoded and compared against the client's
-- address via OSRM route distance.
--
-- Migration order:
--   1. empresa_perfil — store address columns
--   2. zelomenu_delivery_ranges — per-company distance/price faixas
--   3. zelomenu_delivery_cep_cache — CEP → address (ViaCEP)
--   4. zelomenu_delivery_geocoding_cache — address → lat/lng
--   5. zelomenu_delivery_distance_cache — origin→destination route
--   6. zelomenu_cart_sessions — extended fulfillment snapshot

-- ─── 1. Store address on empresa_perfil ───────────────────────────────────────────

alter table public.empresa_perfil
  add column if not exists delivery_postal_code text,
  add column if not exists delivery_number text,
  add column if not exists delivery_complement text,
  add column if not exists delivery_street text,
  add column if not exists delivery_neighborhood text,
  add column if not exists delivery_city text,
  add column if not exists delivery_state text,
  add column if not exists delivery_latitude double precision,
  add column if not exists delivery_longitude double precision,
  add column if not exists delivery_location_version bigint not null default 0;
comment on column public.empresa_perfil.delivery_postal_code is 'ZeloMenu: CEP do endereço de retirada/entrega da loja';
comment on column public.empresa_perfil.delivery_number is 'ZeloMenu: número do endereço da loja';
comment on column public.empresa_perfil.delivery_complement is 'ZeloMenu: complemento opcional';
comment on column public.empresa_perfil.delivery_street is 'ZeloMenu: logradouro (preenchido via CEP)';
comment on column public.empresa_perfil.delivery_neighborhood is 'ZeloMenu: bairro (preenchido via CEP, apenas informativo)';
comment on column public.empresa_perfil.delivery_city is 'ZeloMenu: cidade (preenchido via CEP)';
comment on column public.empresa_perfil.delivery_state is 'ZeloMenu: estado/UF (preenchido via CEP)';
comment on column public.empresa_perfil.delivery_latitude is 'ZeloMenu: latitude geocodificada da loja';
comment on column public.empresa_perfil.delivery_longitude is 'ZeloMenu: longitude geocodificada da loja';
comment on column public.empresa_perfil.delivery_location_version is 'ZeloMenu: incrementado quando as coordenadas da loja mudam, para invalidar caches de rota';
-- ─── 2. Delivery ranges (faixas) ────────────────────────────────────────────────

create table if not exists public.zelomenu_delivery_ranges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresa_perfil(id) on delete cascade,
  max_distance_m integer not null check (max_distance_m > 0),
  delivery_price numeric(10,2) not null check (delivery_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_company_max_distance unique (company_id, max_distance_m)
);
create index if not exists idx_zelomenu_delivery_ranges_company
  on public.zelomenu_delivery_ranges(company_id);
comment on table public.zelomenu_delivery_ranges is 'ZeloMenu: faixas de distância para cálculo de frete por empresa';
comment on column public.zelomenu_delivery_ranges.max_distance_m is 'Distância máxima da faixa em metros. A primeira faixa que atender a distância da rota será aplicada.';
comment on column public.zelomenu_delivery_ranges.delivery_price is 'Valor do frete para esta faixa';
alter table public.zelomenu_delivery_ranges enable row level security;
-- ─── 3. CEP cache ───────────────────────────────────────────────────────────────

create table if not exists public.zelomenu_delivery_cep_cache (
  postal_code text primary key,
  street text not null,
  neighborhood text not null,
  city text not null,
  state text not null,
  provider text not null default 'viacep',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.zelomenu_delivery_cep_cache is 'ZeloMenu: cache de consultas CEP → endereço (ViaCEP). Compartilhado entre empresas.';
comment on column public.zelomenu_delivery_cep_cache.provider is 'Provedor que forneceu o resultado (viacep, brasilapi, etc.)';
comment on column public.zelomenu_delivery_cep_cache.expires_at is 'Data de expiração do cache (TTL ~30 dias)';
alter table public.zelomenu_delivery_cep_cache enable row level security;
-- ─── 4. Geocoding cache ─────────────────────────────────────────────────────────

create table if not exists public.zelomenu_delivery_geocoding_cache (
  id uuid primary key default gen_random_uuid(),
  postal_code text not null,
  number text not null,
  address_hash text not null,
  latitude double precision not null,
  longitude double precision not null,
  provider text not null default 'nominatim',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_geocoding_hash_provider unique (address_hash, provider)
);
create index if not exists idx_zelomenu_delivery_geocoding_hash
  on public.zelomenu_delivery_geocoding_cache(address_hash);
comment on table public.zelomenu_delivery_geocoding_cache is 'ZeloMenu: cache de geocoding (endereço → coordenadas). HMAC do endereço como chave.';
comment on column public.zelomenu_delivery_geocoding_cache.address_hash is 'HMAC-SHA-256 do endereço normalizado (CEP + número).';
comment on column public.zelomenu_delivery_geocoding_cache.provider is 'Provedor de geocoding (nominatim, google, etc.)';
comment on column public.zelomenu_delivery_geocoding_cache.expires_at is 'Data de expiração (TTL ~30 dias)';
alter table public.zelomenu_delivery_geocoding_cache enable row level security;
-- ─── 5. Route distance cache ────────────────────────────────────────────────────

create table if not exists public.zelomenu_delivery_distance_cache (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresa_perfil(id) on delete cascade,
  destination_address_hash text not null,
  origin_location_version bigint not null,
  latitude double precision not null,
  longitude double precision not null,
  distance_m integer not null check (distance_m > 0),
  geocoding_provider text not null default 'nominatim',
  routing_provider text not null default 'osrm',
  is_stale boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_distance_company_dest_origin unique (company_id, destination_address_hash, origin_location_version)
);
create index if not exists idx_zelomenu_delivery_distance_company
  on public.zelomenu_delivery_distance_cache(company_id);
comment on table public.zelomenu_delivery_distance_cache is 'ZeloMenu: cache de distância de rota entre loja e endereço de destino. Isolado por empresa.';
comment on column public.zelomenu_delivery_distance_cache.origin_location_version is 'Versão das coordenadas da loja no momento do cálculo. Se mudar, caches existentes são invalidados.';
comment on column public.zelomenu_delivery_distance_cache.distance_m is 'Distância da rota em metros (rota de carro, não linha reta).';
comment on column public.zelomenu_delivery_distance_cache.is_stale is 'True quando usado fora do TTL normal mas dentro do limite stale.';
comment on column public.zelomenu_delivery_distance_cache.expires_at is 'Data de expiração normal (não-stale).';
alter table public.zelomenu_delivery_distance_cache enable row level security;
-- ─── 6. Cart sessions — add new delivery detail columns to fulfillment_snapshot ──
-- Note: fulfillment_snapshot is a JSONB column. No DDL change needed — the new
-- shape is handled server-side when reading/writing the snapshot. The legacy
-- fields (deliveryNeighborhood, deliveryFeeToConfirm) remain for backwards
-- compatibility with confirmed orders during rollout.
--
-- The new shape adds:
--   deliveryPostalCode, deliveryNumber, deliveryComplement,
--   deliveryStreet, deliveryCity, deliveryState,
--   deliveryLatitude, deliveryLongitude,
--   deliveryDistanceM, deliveryStatus, deliveryCacheLayer, deliveryQuoteRequestId

-- ─── RLS policies ───────────────────────────────────────────────────────────────
--
-- Service role bypasses RLS, so no "service role only" policy is needed.
-- What IS needed: revoke access from anon and authenticated roles so the
-- tables are only reachable via service_role (backend), not via the anon key.
--
-- zelomenu_delivery_ranges: company-owned, readable by authenticated admin
-- clients (via service_role-backed admin API), but never by public anon key.
-- Cache tables: never exposed to any client — only backend writes/reads them.

alter table public.zelomenu_delivery_ranges enable row level security;
alter table public.zelomenu_delivery_cep_cache enable row level security;
alter table public.zelomenu_delivery_geocoding_cache enable row level security;
alter table public.zelomenu_delivery_distance_cache enable row level security;
-- RLS policies are fully defined in the hardening migration (20260725143000)
-- which replaces these with restrictive policies for all tables.;
