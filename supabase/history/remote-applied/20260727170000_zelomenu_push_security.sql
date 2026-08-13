-- ZeloMenu push and branding security hardening.
-- Push subscriptions are written by the Express service-role backend only.
alter table public.zelomenu_push_subscriptions enable row level security;
revoke all on table public.zelomenu_push_subscriptions from anon, authenticated;
alter table public.zelomenu_push_subscriptions
  add column if not exists order_updates boolean not null default true,
  add column if not exists promotions boolean not null default true,
  add column if not exists cart_token text,
  add column if not exists last_order_revision integer,
  add column if not exists last_order_status text;
create index if not exists idx_zelomenu_push_subscriptions_order_updates
  on public.zelomenu_push_subscriptions (order_id, order_updates)
  where order_id is not null and order_updates = true;
-- Public images remain readable, but only the authenticated owner can write
-- or delete objects under their own user-id prefix. Supabase Storage owns
-- storage.objects, so its RLS is managed by the Storage service.

drop policy if exists "zelomenu_branding_select" on storage.objects;
create policy "zelomenu_branding_select" on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'zelomenu-branding'
  );
drop policy if exists "zelomenu_branding_insert" on storage.objects;
create policy "zelomenu_branding_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'zelomenu-branding'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );
drop policy if exists "zelomenu_branding_delete" on storage.objects;
create policy "zelomenu_branding_delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'zelomenu-branding'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );
