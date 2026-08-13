-- ZeloMenu branding images (logo + cover) no bucket "logos".
-- A anon key precisa de INSERT no prefixo zelomenu-branding/ para upload.

do $$ begin
  create policy "zelomenu_branding_select" on storage.objects for select
    to anon
    using (bucket_id = 'logos' and (storage.foldername(name))[1] = 'zelomenu-branding');
exception
  when duplicate_object then null;
end $$;
do $$ begin
  create policy "zelomenu_branding_insert" on storage.objects for insert
    to anon
    with check (bucket_id = 'logos' and (storage.foldername(name))[1] = 'zelomenu-branding');
exception
  when duplicate_object then null;
end $$;
do $$ begin
  create policy "zelomenu_branding_delete" on storage.objects for delete
    to anon
    using (bucket_id = 'logos' and (storage.foldername(name))[1] = 'zelomenu-branding');
exception
  when duplicate_object then null;
end $$;
