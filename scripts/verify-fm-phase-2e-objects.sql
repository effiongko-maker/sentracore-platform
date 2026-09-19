-- Phase 2E live objects check (read-only).
select jsonb_build_object(
  'fm_work_instructions_exists', to_regclass('public.fm_work_instructions') is not null,
  'fm_work_instructions_count', (select case when to_regclass('public.fm_work_instructions') is null then null else (select count(*)::int from public.fm_work_instructions) end),
  'fm_work_count', (select count(*)::int from public.fm_work),
  'fm_incidents_count', (select count(*)::int from public.fm_incidents),
  'fm_requests_count', (select count(*)::int from public.fm_requests),
  'rls', (select relrowsecurity from pg_class where oid = to_regclass('public.fm_work_instructions')),
  'anon_or_auth_grants', (
    select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'fm_work_instructions'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ),
  'policies', (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'fm_work_instructions'),
  'order_type_not_null', (
    select is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work_instructions' and column_name = 'order_type'
  ),
  'order_type_has_no_default', (
    select column_default is null from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work_instructions' and column_name = 'order_type'
  ),
  'work_id_not_null', (
    select is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work_instructions' and column_name = 'work_id'
  ),
  'incident_work_order_ref_dropped', not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_incidents' and column_name = 'work_order_ref'
  ),
  'separate_job_order_table_absent', to_regclass('public.fm_job_orders') is null,
  'mig_2e', exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260919160000'
  )
) as phase_2e;
