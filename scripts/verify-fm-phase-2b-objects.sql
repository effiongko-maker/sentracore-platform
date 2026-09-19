-- Phase 2B live objects check (read-only).
select jsonb_build_object(
  'fm_work_exists', to_regclass('public.fm_work') is not null,
  'fm_work_count', (
    select case
      when to_regclass('public.fm_work') is null then null
      else (select count(*)::int from public.fm_work)
    end
  ),
  'rls', (
    select relrowsecurity from pg_class where oid = 'public.fm_work'::regclass
  ),
  'mig_2b', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260918220000'
  ),
  'mig_2b_integrity', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260918221000'
  ),
  'facilities', (select count(*)::int from public.fm_facilities),
  'assignments', (select count(*)::int from public.fm_facility_assignments)
) as phase_2b;
