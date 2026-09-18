select jsonb_build_object(
  'table', exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'fm_facility_assignments'
  ),
  'rls', (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'fm_facility_assignments'
  ),
  'policies', (
    select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'fm_facility_assignments'
  ),
  'active_unique', exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'fm_facility_assignments_active_uidx'
  ),
  'ops_view_allowed', public.platform_iam_is_allowed_platform_capability('ops.view'),
  'admin_override_allowed', public.platform_iam_is_allowed_platform_capability('platform.admin_override'),
  'anon_select', has_table_privilege('anon', 'public.fm_facility_assignments', 'SELECT'),
  'authenticated_select', has_table_privilege('authenticated', 'public.fm_facility_assignments', 'SELECT'),
  'service_select', has_table_privilege('service_role', 'public.fm_facility_assignments', 'SELECT'),
  'location_children', jsonb_build_object(
    'buildings', (select count(*)::int from public.fm_buildings),
    'floors', (select count(*)::int from public.fm_floors),
    'rooms', (select count(*)::int from public.fm_rooms),
    'departments', (select count(*)::int from public.fm_departments)
  )
) as verify;
