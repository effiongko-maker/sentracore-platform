-- Phase 2C live objects check (read-only).
select jsonb_build_object(
  'fm_requests_exists', to_regclass('public.fm_requests') is not null,
  'fm_requests_count', (select count(*)::int from public.fm_requests),
  'links_exists', to_regclass('public.fm_request_incident_links') is not null,
  'links_count', (select count(*)::int from public.fm_request_incident_links),
  'rls_requests', (select relrowsecurity from pg_class where oid = 'public.fm_requests'::regclass),
  'rls_links', (select relrowsecurity from pg_class where oid = 'public.fm_request_incident_links'::regclass),
  'anon_or_auth_grants', (
    select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('fm_requests', 'fm_request_incident_links')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ),
  'policies', (
    select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('fm_requests', 'fm_request_incident_links')
  ),
  'work_source_request_id', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work'
      and column_name = 'source_request_id'
  ),
  'work_source_request_ref_dropped', not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work'
      and column_name = 'source_request_ref'
  ),
  'work_request_fk', exists (
    select 1 from pg_constraint where conname = 'fm_work_source_request_fk'
  ),
  'fm_work_count', (select count(*)::int from public.fm_work),
  'issues_table_absent', to_regclass('public.fm_issues') is null,
  'mig_2c', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260919120000'
  )
) as phase_2c;
