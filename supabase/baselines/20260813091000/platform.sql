-- Non-secret, application-owned platform configuration at cutoff 20260813091000.
-- Apply only to a disposable local Supabase stack after schema.sql.
-- Managed Storage/Auth data and cron commands are intentionally excluded.

\if :{?zelo_disposable_baseline}
  \if :zelo_disposable_baseline
  \else
    \echo 'Refusing platform restore: zelo_disposable_baseline must be truthy in the disposable local harness.'
    \quit 3
  \endif
\else
  \echo 'Refusing platform restore: set zelo_disposable_baseline=1 in the disposable local harness.'
  \quit 3
\endif

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  ('delivery-assets', 'delivery-assets', true, null, null),
  ('logos', 'logos', true, null, null),
  (
    'zelochat-media',
    'zelochat-media',
    true,
    26214400,
    array[
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'audio/ogg',
      'audio/mpeg',
      'audio/webm',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4'
    ]::text[]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Assets são públicos para leitura" on storage.objects;
create policy "Assets são públicos para leitura"
  on storage.objects
  for select
  to public
  using (bucket_id = 'delivery-assets');

drop policy if exists "Usuários podem deletar seus próprios assets" on storage.objects;
create policy "Usuários podem deletar seus próprios assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'delivery-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuários podem fazer upload de seus assets" on storage.objects;
create policy "Usuários podem fazer upload de seus assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'delivery-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuários podem gerenciar seus próprios assets" on storage.objects;
create policy "Usuários podem gerenciar seus próprios assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'delivery-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_auth_delete_own on storage.objects;
create policy logos_auth_delete_own
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'logos' and owner = auth.uid());

drop policy if exists logos_auth_insert on storage.objects;
create policy logos_auth_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'logos');

drop policy if exists logos_auth_update_own on storage.objects;
create policy logos_auth_update_own
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'logos' and owner = auth.uid())
  with check (bucket_id = 'logos' and owner = auth.uid());

drop policy if exists logos_public_read on storage.objects;
create policy logos_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'logos');

drop policy if exists "zelochat-media public read" on storage.objects;
create policy "zelochat-media public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'zelochat-media');

drop policy if exists "zelochat-media service delete" on storage.objects;
create policy "zelochat-media service delete"
  on storage.objects
  for delete
  to public
  using (bucket_id = 'zelochat-media');

drop policy if exists "zelochat-media service insert" on storage.objects;
create policy "zelochat-media service insert"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'zelochat-media');

drop policy if exists zelomenu_branding_delete on storage.objects;
create policy zelomenu_branding_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'zelomenu-branding'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );

drop policy if exists zelomenu_branding_insert on storage.objects;
create policy zelomenu_branding_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'zelomenu-branding'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );

drop policy if exists zelomenu_branding_select on storage.objects;
create policy zelomenu_branding_select
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'zelomenu-branding'
  );

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Required managed publication supabase_realtime is missing';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'zelo_orders'
  ) then
    alter publication supabase_realtime add table public.zelo_orders;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'zelochat_orders'
  ) then
    alter publication supabase_realtime add table public.zelochat_orders;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and not (
        schemaname = 'public'
        and tablename in ('zelo_orders', 'zelochat_orders')
      )
  ) then
    raise exception 'Unexpected application table is already in supabase_realtime';
  end if;
end;
$$;

commit;
