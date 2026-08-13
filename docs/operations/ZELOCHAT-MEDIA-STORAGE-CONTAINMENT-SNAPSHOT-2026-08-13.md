# ZeloChat media Storage containment — 2026-08-13

## Verified production state before change

The migration-reconciliation capture and a fresh linked catalog query showed:

- `storage.objects` has RLS enabled and grants `SELECT`, `INSERT`, `UPDATE` and
  `DELETE` (among other managed privileges) to `anon`, `authenticated` and
  `service_role`.
- `zelochat-media public read` was permissive, `TO PUBLIC`, for every object in
  the bucket.
- `zelochat-media service insert` and `zelochat-media service delete` were also
  permissive `TO PUBLIC`, despite their names.
- `storage.buckets.public` is `true` for `zelochat-media` and the 25 MB/MIME
  configuration is valid production behavior that must remain unchanged.

The authoritative pre-change definitions and grants are frozen in
`supabase/baselines/20260813091000/platform-state.json` and replayed only in the
disposable baseline at `platform.sql`. The baseline is deliberately not edited
by this fix.

## Reproduction

A unique 1x1 PNG under `authz-probe/<uuid>/` was exercised through the real
Storage API and removed in the same probe:

| Actor | Upload | List own synthetic path | Delete |
| --- | --- | --- | --- |
| anon | allowed | allowed and visible | allowed |
| permanent authenticated test owner | allowed | allowed and visible | allowed |
| service role | allowed | allowed and visible | allowed |

Residual synthetic objects after the probe: `0`.

The test-first transactional verifier
`supabase/verification/zelochat_media_storage_authz.sql` also failed before the
fix with `anon can list zelochat-media objects`. Direct DELETE is intentionally
not tested against `storage.objects`: managed Storage triggers reject direct
deletion for every role, so DELETE authorization is verified via the real API.

## Consumers and blast radius

No ZeloPDV application consumer writes this bucket. Every legitimate ZeloChat
write uses a Supabase client created with `SUPABASE_SERVICE_ROLE_KEY`:

- outbound `/api/send`: upload, public URL, delayed delete;
- inbound webhook: upload and public URL;
- account-deletion sweeper: list/delete company prefixes;
- audio backfill and historical cleanup scripts: service-role upload/delete.

Browser rendering, Whatsmiau, OpenAI and server transcription consume public
object URLs. They do not list the bucket and do not upload/delete with an anon
or authenticated client.

Expected permission change:

| Actor/consumer | After containment |
| --- | --- |
| anon | upload/list/delete denied; public object GET preserved |
| owner | upload/list/delete denied; normal `/api/send` preserved through backend |
| subuser | same as owner |
| external super-admin | same authenticated Storage role; direct write/list denied |
| service role/backend/cron/scripts | upload/list/delete preserved |
| public URL readers | GET preserved because bucket remains public |
| billing, sales/offline, UI and Realtime | no change |

## Smallest fix

Forward-only migration
`20260813092000_zelochat_media_storage_containment.sql`:

1. drops the unnecessary `zelochat-media public read` RLS policy, preventing
   anon/authenticated Storage API listing;
2. recreates INSERT and DELETE policies with `TO service_role`;
3. leaves the bucket, public object delivery, grants shared by other buckets,
   MIME types, size limit and application code unchanged.

The local PG17 bootstrap applied the forward migration after proving the cutoff
baseline still matched production. The post-migration matrix passed for anon,
owner, subuser, external super-admin and service role.

## Production verification required after apply

- [x] Exact policy/actor SQL matrix passed after linked apply.
- [x] Anon and the permanent authenticated test owner: upload denied, service
  object absent from list and delete had no effect.
- [x] Service role: upload/list/delete succeeded.
- [x] GET of the service-created synthetic public URL returned HTTP 200.
- [x] All synthetic objects were removed; residual count `0`.
- [x] Linked migration list aligned through `20260813092000`; dry-run reports
  the remote database up to date.
- [ ] Observe the next natural `/api/send`, inbound upload and scheduled sweeper
  cycles in ZeloChat. Static consumer inspection proves these paths all use the
  same service-role client exercised above; no application redeploy is needed.

## Rollback

Rollback means a new forward migration, never editing the applied containment:

```sql
begin;
drop policy if exists "zelochat-media public read" on storage.objects;
drop policy if exists "zelochat-media service insert" on storage.objects;
drop policy if exists "zelochat-media service delete" on storage.objects;
create policy "zelochat-media public read" on storage.objects
  for select to public using (bucket_id = 'zelochat-media');
create policy "zelochat-media service insert" on storage.objects
  for insert to public with check (bucket_id = 'zelochat-media');
create policy "zelochat-media service delete" on storage.objects
  for delete to public using (bucket_id = 'zelochat-media');
commit;
```

This rollback deliberately restores the verified exposure and is appropriate
only as an emergency compatibility action while investigating an unexpected
consumer.
