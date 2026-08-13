-- P0 containment: only the ZeloChat backend may list/write zelochat-media.
-- The bucket stays public so existing public object URLs keep working.

begin;

drop policy if exists "zelochat-media public read" on storage.objects;
drop policy if exists "zelochat-media service insert" on storage.objects;
drop policy if exists "zelochat-media service delete" on storage.objects;

create policy "zelochat-media service insert"
  on storage.objects
  for insert
  to service_role
  with check (bucket_id = 'zelochat-media');

create policy "zelochat-media service delete"
  on storage.objects
  for delete
  to service_role
  using (bucket_id = 'zelochat-media');

commit;
