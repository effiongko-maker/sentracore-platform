-- Phase 2F live objects check (read-only).
select jsonb_build_object(
  'fm_approvals_exists', to_regclass('public.fm_approvals') is not null,
  'fm_approvals_count', (select case when to_regclass('public.fm_approvals') is null then null else (select count(*)::int from public.fm_approvals) end),
  'activities_count', (select case when to_regclass('public.fm_approval_activities') is null then null else (select count(*)::int from public.fm_approval_activities) end),
  'fm_work_instructions_count', (select count(*)::int from public.fm_work_instructions),
  'fm_work_count', (select count(*)::int from public.fm_work),
  'fm_incidents_count', (select count(*)::int from public.fm_incidents),
  'fm_requests_count', (select count(*)::int from public.fm_requests),
  'rls_approvals', (select relrowsecurity from pg_class where oid = to_regclass('public.fm_approvals')),
  'rls_activities', (select relrowsecurity from pg_class where oid = to_regclass('public.fm_approval_activities')),
  'anon_or_auth_grants', (
    select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('fm_approvals', 'fm_approval_activities')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ),
  'policies', (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('fm_approvals', 'fm_approval_activities')),
  'work_instruction_id_not_null', (
    select is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_approvals' and column_name = 'work_instruction_id'
  ),
  'facility_not_persisted_on_approval', not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_approvals' and column_name in ('facility_id', 'asset_id', 'asset_ref')
  ),
  'wi_approval_ref_dropped', not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work_instructions' and column_name = 'approval_ref'
  ),
  'wi_requires_approval_kept', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_work_instructions' and column_name = 'requires_approval'
  ),
  'one_approval_per_instruction_index', exists (select 1 from pg_indexes where indexname = 'fm_approvals_org_work_instruction_uidx'),
  'mig_2f', exists (select 1 from supabase_migrations.schema_migrations where version = '20260919180000')
) as phase_2f;
