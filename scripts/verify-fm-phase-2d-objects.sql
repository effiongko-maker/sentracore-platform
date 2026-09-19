-- Phase 2D live objects check (read-only).
select jsonb_build_object(
  'fm_incidents_exists', to_regclass('public.fm_incidents') is not null,
  'fm_incidents_count', (select case when to_regclass('public.fm_incidents') is null then null else (select count(*)::int from public.fm_incidents) end),
  'fm_requests_count', (select count(*)::int from public.fm_requests),
  'fm_work_count', (select count(*)::int from public.fm_work),
  'rls_incidents', (select relrowsecurity from pg_class where oid = to_regclass('public.fm_incidents')),
  'anon_or_auth_grants', (
    select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'fm_incidents'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ),
  'policies', (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'fm_incidents'),
  'work_incident_id', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work' and column_name = 'incident_id'
  ),
  'work_incident_ref_dropped', not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work' and column_name = 'incident_ref'
  ),
  'work_incident_fk', exists (select 1 from pg_constraint where conname = 'fm_work_incident_fk'),
  'bridge_dropped', to_regclass('public.fm_request_incident_links') is null,
  'issues_table_absent', to_regclass('public.fm_issues') is null,
  'mig_2d', exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260919140000'
  )
) as phase_2d;
