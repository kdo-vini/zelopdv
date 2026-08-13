-- Read-only capture of application-relevant Supabase platform configuration.
-- This deliberately excludes Auth users, Storage objects, secrets and managed-schema DDL.

select jsonb_build_object(
  'format', 1,
  'cutoff', (
    select max(version)
    from supabase_migrations.schema_migrations
  ),
  'applied_count', (
    select count(*)
    from supabase_migrations.schema_migrations
  ),
  'server_version', current_setting('server_version'),
  'server_version_num', current_setting('server_version_num'),
  'database_encoding', pg_encoding_to_char(d.encoding),
  'database_collate', d.datcollate,
  'database_ctype', d.datctype,
  'extensions', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'name', e.extname,
        'version', e.extversion,
        'schema', n.nspname
      )
      order by e.extname
    )
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
  ), '[]'::jsonb),
  'custom_roles', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'name', rolname,
        'superuser', rolsuper,
        'inherit', rolinherit,
        'create_role', rolcreaterole,
        'create_db', rolcreatedb,
        'can_login', rolcanlogin,
        'replication', rolreplication,
        'bypass_rls', rolbypassrls
      )
      order by rolname
    )
    from pg_roles
    where rolname !~ '^(pg_|supabase_)'
      and rolname not in (
        'postgres', 'anon', 'authenticated', 'service_role', 'authenticator',
        'dashboard_user', 'pgbouncer', 'cli_login_postgres'
      )
  ), '[]'::jsonb),
  'storage_buckets', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'public', public,
        'file_size_limit', file_size_limit,
        'allowed_mime_types', allowed_mime_types,
        'avif_autodetection', avif_autodetection,
        'type', type
      )
      order by id
    )
    from storage.buckets
  ), '[]'::jsonb),
  'storage_policies', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'table', c.relname,
        'name', p.polname,
        'permissive', p.polpermissive,
        'command', p.polcmd,
        'roles', (
          select jsonb_agg(
            case when role_oid = 0 then 'PUBLIC'
                 else pg_get_userbyid(role_oid)
            end
            order by case when role_oid = 0 then 'PUBLIC'
                          else pg_get_userbyid(role_oid)
                     end
          )
          from unnest(p.polroles) role_oid
        ),
        'using', pg_get_expr(p.polqual, p.polrelid, false),
        'with_check', pg_get_expr(p.polwithcheck, p.polrelid, false)
      )
      order by c.relname, p.polname
    )
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
  ), '[]'::jsonb),
  'storage_table_security', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'table', c.relname,
        'rls_enabled', c.relrowsecurity,
        'force_rls', c.relforcerowsecurity,
        'grants', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'grantee', grant_row.grantee,
              'privileges', grant_row.privileges,
              'grantable_privileges', grant_row.grantable_privileges
            )
            order by grant_row.grantee
          )
          from (
            select
              case when acl.grantee = 0 then 'PUBLIC'
                   else pg_get_userbyid(acl.grantee)
              end as grantee,
              jsonb_agg(acl.privilege_type order by acl.privilege_type) as privileges,
              coalesce(
                jsonb_agg(acl.privilege_type order by acl.privilege_type)
                  filter (where acl.is_grantable),
                '[]'::jsonb
              ) as grantable_privileges
            from aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
            where acl.grantee = 0
               or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated', 'service_role')
            group by case when acl.grantee = 0 then 'PUBLIC'
                          else pg_get_userbyid(acl.grantee)
                     end
          ) grant_row
        ), '[]'::jsonb)
      )
      order by c.relname
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname in ('buckets', 'objects')
      and c.relkind in ('r', 'p')
  ), '[]'::jsonb),
  'realtime_tables', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'publication', pubname,
        'schema', schemaname,
        'table', tablename,
        'columns', attnames,
        'row_filter', rowfilter
      )
      order by pubname, schemaname, tablename
    )
    from pg_publication_tables
    where pubname = 'supabase_realtime'
  ), '[]'::jsonb),
  'realtime_publication', coalesce((
    select jsonb_build_object(
      'all_tables', puballtables,
      'insert', pubinsert,
      'update', pubupdate,
      'delete', pubdelete,
      'truncate', pubtruncate,
      'via_partition_root', pubviaroot
    )
    from pg_publication
    where pubname = 'supabase_realtime'
  ), '{}'::jsonb),
  'postgrest_schemas_setting', current_setting('pgrst.db_schemas', true)
)
from pg_database d
where d.datname = current_database();
